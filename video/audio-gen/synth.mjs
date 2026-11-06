// Procedural music bed + synthesized FX (whooshes, risers, ticks, chimes, impacts), all in code.
//   node audio-gen/synth.mjs   ->  public/audio/music.mp3 and public/audio/fx.mp3
// Cue times come from audio-gen/cues.json (node audio-gen/build-cues.mjs), so everything lands on the picture.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { ROOT } from "./lib.mjs";

const SR = 44100;
const { CUE, TIMES } = JSON.parse(readFileSync(join(ROOT, "audio-gen/cues.json"), "utf8"));
const G = (id, local) => TIMES[id][0] + local;
const END = TIMES.close[0] + TIMES.close[1];
const N = Math.ceil((END + 1.5) * SR);

// ---------- helpers ----------
const rngf = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rand = rngf(2026);
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> hz
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const m = (name, oct) => 12 * (oct + 1) + NOTE[name[0]] + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0);
const f = (name, oct) => hz(m(name, oct));

class Bus {
  constructor() { this.l = new Float32Array(N); this.r = new Float32Array(N); }
  add(i, v, pan = 0.5, send = 0) {
    if (i < 0 || i >= N) return;
    const a = pan * Math.PI * 0.5;
    this.l[i] += v * Math.cos(a);
    this.r[i] += v * Math.sin(a);
  }
}
const mkBus = () => new Bus();

class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set("lp", 1000, 0.707); }
  set(type, fc, q = 0.707) {
    const w0 = (2 * Math.PI * Math.min(fc, SR * 0.45)) / SR;
    const al = Math.sin(w0) / (2 * q);
    const c = Math.cos(w0);
    let b0, b1, b2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // bandpass
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const S = (x) => x * x * (3 - 2 * x); // smoothstep
const sec = (t) => Math.round(t * SR);

// ---------- instruments ----------
// Detuned saw pad through a moving low-pass; notes = frequencies.
function pad(bus, send, notes, t0, dur, { gain = 0.2, cutoff = 900, mod = 300, attack = 1.0, release = 1.4, lfo = 0.13 } = {}) {
  const i0 = sec(t0);
  const n = sec(dur + release);
  const lpL = new Biquad(), lpR = new Biquad();
  const voices = [];
  for (const fr of notes) for (const [cents, pan] of [[-9, 0.15], [0, 0.5], [9, 0.85]]) voices.push({ fr: fr * Math.pow(2, cents / 1200), pan, ph: rand() });
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    if (k % 32 === 0) {
      const cf = cutoff + mod * Math.sin(2 * Math.PI * lfo * (t + t0));
      lpL.set("lp", cf, 0.6); lpR.set("lp", cf, 0.6);
    }
    const env = S(Math.min(1, t / attack)) * (t < dur ? 1 : S(Math.max(0, 1 - (t - dur) / release)));
    let l = 0, r = 0;
    for (const v of voices) {
      v.ph += v.fr / SR; if (v.ph >= 1) v.ph -= 1;
      const s = 2 * v.ph - 1;
      l += s * Math.cos(v.pan * 1.5708); r += s * Math.sin(v.pan * 1.5708);
    }
    const sc = (gain * env) / (notes.length * 1.8);
    const yl = lpL.p(l) * sc, yr = lpR.p(r) * sc;
    const i = i0 + k;
    if (i >= N) break;
    bus.l[i] += yl; bus.r[i] += yr;
    send.l[i] += yl * 0.6; send.r[i] += yr * 0.6;
  }
}
function bass(bus, fr, t0, dur, gain = 0.4, color = 0) {
  const i0 = sec(t0), n = sec(dur + 0.15);
  let ph = 0;
  const lp = new Biquad();
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += fr / SR; if (ph >= 1) ph -= 1;
    const env = Math.min(1, t / 0.012) * (t < dur ? Math.exp(-t * 0.9) : Math.exp(-dur * 0.9) * Math.max(0, 1 - (t - dur) / 0.15));
    let s = Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph);
    if (color > 0) { if (k % 32 === 0) lp.set("lp", 250 + color * 1500, 0.8); s = s * (1 - color) + lp.p(2 * ph - 1) * color * 1.4; }
    bus.add(i0 + k, s * env * gain, 0.5);
  }
}
function kick(bus, t0, gain = 0.5) {
  const i0 = sec(t0), n = sec(0.35);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += (46 + 110 * Math.exp(-t * 26)) / SR;
    const s = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 8.5) + (k < 90 ? (rand() - 0.5) * 0.5 * (1 - k / 90) : 0);
    bus.add(i0 + k, s * gain, 0.5);
  }
}
function hat(bus, t0, gain = 0.1, open = false, pan = 0.5) {
  const i0 = sec(t0), n = sec(open ? 0.16 : 0.045);
  const hp = new Biquad(); hp.set("hp", 7500, 0.8);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    bus.add(i0 + k, hp.p(rand() * 2 - 1) * Math.exp(-t * (open ? 22 : 90)) * gain, pan);
  }
}
function pluck(bus, send, fr, t0, gain = 0.12, pan = 0.5, bright = 1) {
  const i0 = sec(t0), n = sec(0.55);
  const lp = new Biquad();
  let p1 = 0, p2 = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    if (k % 16 === 0) lp.set("lp", 500 + 3200 * bright * Math.exp(-t * 11), 0.9);
    p1 += fr / SR; if (p1 >= 1) p1 -= 1;
    p2 += (fr * 1.003) / SR; if (p2 >= 1) p2 -= 1;
    const s = lp.p((2 * p1 - 1) * 0.6 + (2 * p2 - 1) * 0.4);
    const v = s * Math.min(1, t / 0.004) * Math.exp(-t * 7.5) * gain;
    bus.add(i0 + k, v, pan);
    send.add(i0 + k, v * 0.8, pan);
  }
}
function bell(bus, send, fr, t0, gain = 0.1, pan = 0.5, decay = 1.7) {
  const i0 = sec(t0), n = sec(decay * 2.2);
  const parts = [[1, 1], [2.01, 0.45], [2.99, 0.25], [4.17, 0.12], [5.43, 0.06]];
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let s = 0;
    for (const [mul, a] of parts) s += Math.sin(2 * Math.PI * fr * mul * t) * a * Math.exp(-t * (1.6 + mul * 0.9) / decay * 1.4);
    const v = s * Math.min(1, t / 0.003) * gain;
    bus.add(i0 + k, v, pan);
    send.add(i0 + k, v * 0.9, pan);
  }
}
function ping(bus, send, fr, t0, gain = 0.08, pan = 0.5) {
  const i0 = sec(t0), n = sec(0.5);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const v = Math.sin(2 * Math.PI * fr * t) * Math.min(1, t / 0.002) * Math.exp(-t * 11) * gain;
    bus.add(i0 + k, v, pan);
    send.add(i0 + k, v * 0.7, pan);
  }
}
function tick(bus, t0, gain = 0.05, fr = 1800, pan = 0.5) {
  const i0 = sec(t0), n = sec(0.03);
  const hp = new Biquad(); hp.set("hp", 2500, 0.9);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    bus.add(i0 + k, (hp.p(rand() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * fr * t) * 0.5) * Math.exp(-t * 160) * gain, pan);
  }
}
function impact(bus, t0, gain = 0.6, len = 1.6) {
  const i0 = sec(t0), n = sec(len);
  let ph = 0;
  const lp = new Biquad();
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += (30 + 85 * Math.exp(-t * 7)) / SR;
    if (k % 16 === 0) lp.set("lp", 4000 * Math.exp(-t * 6) + 200, 0.7);
    const s = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 2.4) + lp.p(rand() * 2 - 1) * 0.5 * Math.exp(-t * 7);
    bus.add(i0 + k, s * gain * Math.min(1, t / 0.002), 0.5);
  }
}
function riser(bus, t0, t1, gain = 0.35, f0 = 250, f1 = 7000) {
  const i0 = sec(t0), n = sec(t1 - t0);
  const bp = new Biquad(), bq = new Biquad();
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const x = k / n;
    if (k % 16 === 0) { const c = f0 * Math.pow(f1 / f0, x); bp.set("bp", c, 1.4); bq.set("bp", c * 1.5, 1.4); }
    ph += (180 + 1400 * x * x) / SR;
    const env = Math.pow(x, 2.2) * gain * (k > n - 200 ? Math.max(0, (n - k) / 200) : 1);
    const s = (bp.p(rand() * 2 - 1) * 2.2 + bq.p(rand() * 2 - 1) * 1.2) * env + Math.sin(2 * Math.PI * ph) * env * 0.25;
    bus.add(i0 + k, s, 0.2 + 0.6 * ((k * 0.0007) % 1));
  }
}
function whoosh(bus, t0, dur = 0.7, gain = 0.25, up = true) {
  const i0 = sec(t0), n = sec(dur);
  const bp = new Biquad();
  for (let k = 0; k < n; k++) {
    const x = k / n;
    const c = up ? 300 * Math.pow(14, x) : 4200 * Math.pow(0.07, x);
    if (k % 16 === 0) bp.set("bp", c, 0.9);
    const env = Math.sin(Math.PI * x) ** 2 * gain;
    const s = bp.p(rand() * 2 - 1) * 2.4 * env;
    bus.add(i0 + k, s, up ? 0.3 + 0.4 * x : 0.7 - 0.4 * x);
  }
}
function chimeUp(bus, send, t0, root = "C", oct = 5, gain = 0.12, spacing = 0.09) {
  const tones = [0, 4, 7, 12, 16].map((s) => hz(m(root, oct) + s));
  tones.forEach((fr, k) => bell(bus, send, fr, t0 + k * spacing, gain, 0.3 + 0.1 * k, 1.5));
}

// ---------- reverb (Schroeder-style, stereo) ----------
function reverb(send) {
  const out = mkBus();
  const mono = new Float32Array(N);
  for (let i = 0; i < N; i++) mono[i] = (send.l[i] + send.r[i]) * 0.5;
  const combs = [0.0297, 0.0371, 0.0411, 0.0437, 0.0533, 0.0613];
  const run = (offsetSamples, target) => {
    const acc = new Float32Array(N);
    for (const d of combs) {
      const len = Math.round(d * SR) + offsetSamples;
      const buf = new Float32Array(len);
      let idx = 0, lpState = 0;
      for (let i = 0; i < N; i++) {
        const y = buf[idx];
        lpState += 0.35 * (y - lpState);
        buf[idx] = mono[i] + lpState * 0.86;
        idx = (idx + 1) % len;
        acc[i] += y * 0.18;
      }
    }
    for (const d of [0.005, 0.0017]) {
      const len = Math.round(d * SR) + offsetSamples;
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < N; i++) {
        const bufOut = buf[idx];
        const v = acc[i] - 0.5 * bufOut;
        buf[idx] = v;
        acc[i] = bufOut + 0.5 * v;
        idx = (idx + 1) % len;
      }
    }
    target.set(acc);
  };
  run(0, out.l);
  run(23, out.r);
  return out;
}

// ---------- the score ----------
const music = mkBus();
const mSend = mkBus();
const fx = mkBus();
const fSend = mkBus();

const BEAT = 0.6; // 100 bpm
const chords = {
  Am: [f("A", 3), f("C", 4), f("E", 4)],
  F: [f("F", 3), f("A", 3), f("C", 4)],
  C: [f("C", 4), f("E", 4), f("G", 4)],
  G: [f("G", 3), f("B", 3), f("D", 4)],
  Cadd9: [f("C", 4), f("E", 4), f("G", 4), f("D", 5)],
};
const roots = { Am: f("A", 1), F: f("F", 1), C: f("C", 2), G: f("G", 1) };
const minorProg = ["Am", "F", "C", "G"];
const majorProg = ["C", "G", "Am", "F"];
const penta = [f("A", 4), f("C", 5), f("D", 5), f("E", 5), f("G", 5), f("A", 5)];
const majPenta = [f("C", 5), f("D", 5), f("E", 5), f("G", 5), f("A", 5), f("C", 6)];

const blowG = G("crash", CUE.crash.blow);
const revealG = G("reveal", CUE.reveal.hit);
const arriveG = G("crash", CUE.crash.arrive);

// A + B: dark opening, building tension until the fuse blows
function progression(prog, t0, t1, step, opts, withBass = true, bassGain = 0.4) {
  let k = 0;
  for (let t = t0; t < t1 - 0.01; t += step, k++) {
    const name = prog[k % prog.length];
    const d = Math.min(step, t1 - t);
    pad(music, mSend, chords[name], t, d + 0.1, opts);
    if (withBass) bass(music, roots[name], t, d, bassGain);
  }
}
progression(minorProg, 0, blowG, 4.8, { gain: 0.28, cutoff: 520, mod: 160, attack: 1.4, release: 1.8 }, true, 0.34);
// dread: rising brightness + ticking from the queue scene on
for (let t = TIMES.queue[0]; t < blowG - 0.2; t += BEAT / 2) {
  const x = (t - TIMES.queue[0]) / (blowG - TIMES.queue[0]);
  hat(music, t, 0.03 + 0.1 * x * x, false, 0.5 + 0.2 * Math.sin(t * 3));
}
// heartbeat that speeds up through the crash
{
  let t = G("crash", 0.3);
  while (t < blowG - 0.05) {
    const gap = t < arriveG ? BEAT : t < arriveG + 2.8 ? BEAT / 2 : BEAT / 4;
    kick(music, t, 0.28 + 0.18 * Math.min(1, (t - G("crash", 0)) / 10));
    t += gap;
  }
  // pulsing bass in the overload
  for (let t = G("crash", 1.2); t < blowG - 0.05; t += BEAT / 4) {
    const x = (t - G("crash", 1.2)) / (blowG - G("crash", 1.2));
    bass(music, roots.Am, t, 0.11, 0.17 + 0.18 * x, 0.2 + 0.7 * x);
  }
  riser(fx, arriveG + 2.0, blowG, 0.5, 250, 9000);
  riser(fx, blowG - 2.4, blowG, 0.3, 1200, 12000);
}
// the dot field pings red
for (let k = 0; k < 24; k++) {
  const t = G("grid", CUE.grid.redStart + (k / 24) * (CUE.grid.redEnd - CUE.grid.redStart));
  ping(fx, fSend, penta[Math.floor(rand() * penta.length)], t, 0.05 + 0.03 * rand(), rand());
}
impact(fx, G("grid", CUE.grid.full), 0.34, 1.4);
ping(fx, fSend, f("A", 3), G("grid", CUE.grid.liander), 0.1, 0.5);
// queue beats
impact(fx, G("queue", CUE.queue.stamp), 0.3, 0.9);
for (let k = 0; k < 29; k++) tick(fx, G("queue", CUE.queue.tokens + (k / 29) * 1.2), 0.04, 1500 + k * 40, 0.3 + 0.4 * rand());
for (let i = 0; i < 6; i++) ping(fx, fSend, penta[i % penta.length], G("queue", CUE.queue.flip + i * 0.26), 0.09, 0.2 + 0.12 * i);
impact(fx, G("queue", CUE.queue.barrier), 0.28, 1.0);
whoosh(fx, G("queue", CUE.queue.ams - 0.2), 0.6, 0.2, false);
whoosh(fx, G("queue", CUE.queue.meanwhile - 0.2), 0.6, 0.2, false);
whoosh(fx, TIMES.queue[0] - 0.05, 0.7, 0.22, true);
whoosh(fx, TIMES.crash[0] - 0.05, 0.7, 0.2, true);

// blow: impact (the ElevenLabs breaker clip is layered in Remotion) then near-silence
impact(fx, blowG, 0.7, 2.2);

// C: power returns, the groove arrives
impact(fx, revealG, 0.6, 2.0);
riser(fx, revealG - 0.5, revealG, 0.3, 500, 9000);
chimeUp(fx, fSend, revealG + 0.05, "C", 5, 0.14, 0.1);
const planFrom = TIMES.plan[0];
const stressFrom = TIMES.stress[0];
const bar = BEAT * 4;
const depotG = G("plan", CUE.plan.depot);
progression(majorProg, revealG, stressFrom + 0.3, BEAT * 4, { gain: 0.3, cutoff: 1300, mod: 500, attack: 0.5, release: 1.2 }, false);
// groove
for (let t = revealG + 0.9, k = 0; t < stressFrom; t += BEAT, k++) {
  const live = t >= depotG - 0.5 || t < planFrom - 2; // calmer through the inputs and the timetable
  if (live) kick(music, t, 0.34);
  hat(music, t + BEAT / 2, live ? 0.08 : 0.05, k % 4 === 3);
  if (live && k % 4 === 2) hat(music, t + BEAT / 4, 0.04);
}
{
  // rolling bass
  let k = 0;
  for (let t = revealG + 0.9; t < stressFrom; t += BEAT / 2, k++) {
    const bi = Math.floor((t - revealG) / (BEAT * 4)) % 4;
    const live = t >= depotG - 0.5 || t < planFrom - 2;
    if ([0, 3, 4, 6].includes(k % 8) && (live || k % 8 === 0)) bass(music, roots[majorProg[bi]], t, BEAT / 2 - 0.04, live ? 0.3 : 0.22);
  }
  // arpeggio
  let j = 0;
  for (let t = planFrom + 0.3; t < stressFrom; t += BEAT / 4, j++) {
    const bi = Math.floor((t - revealG) / (BEAT * 4)) % 4;
    const ch = chords[majorProg[bi]];
    const order = [0, 1, 2, 1, 2, 1, 0, 1];
    const fr = ch[order[j % 8]] * (j % 16 >= 8 ? 2 : 1);
    pluck(music, mSend, fr, t, t < depotG - 0.5 ? 0.06 : 0.1, 0.3 + 0.4 * ((j % 8) / 8));
  }
}
// sunrise lift at the end of the plan scene
{
  const dawnG = G("plan", CUE.plan.dawn);
  const endG = G("plan", CUE.plan.end);
  riser(fx, dawnG - 0.4, dawnG + 1.6, 0.18, 800, 9000);
  for (let t = dawnG + 0.2, k = 0; t < endG - 0.6; t += BEAT * 0.5, k++) bell(music, mSend, majPenta[k % majPenta.length] * (k % 2 ? 2 : 1), t, 0.05, 0.2 + 0.6 * rand(), 1.2);
  pad(music, mSend, [f("C", 5), f("E", 5), f("G", 5)], dawnG, endG - dawnG + 0.6, { gain: 0.14, cutoff: 2600, mod: 600, attack: 1.2, release: 1.4 });
}
// beat transitions in the plan scene
whoosh(fx, TIMES.plan[0] - 0.05, 0.7, 0.2, true);
whoosh(fx, G("plan", CUE.plan.builds - 0.35), 0.6, 0.2, false);
whoosh(fx, depotG - 0.5, 0.9, 0.3, true);
impact(fx, depotG, 0.25, 1.0);
for (let i = 0; i < 3; i++) ping(fx, fSend, majPenta[i + 1], G("plan", CUE.plan.post + i * 1.1), 0.08, 0.3 + 0.2 * i);

// D: stress test, tension then resolution
{
  const t0 = stressFrom + 0.4;
  const soG = G("stress", CUE.stress.so);
  const oftenG = G("stress", CUE.stress.often);
  const endG = TIMES.human[0] + 0.2;
  const prog = ["Am", "F", "C", "G"];
  progression(prog, t0, oftenG, 4.2, { gain: 0.22, cutoff: 700, mod: 250, attack: 1.0, release: 1.3 }, true, 0.3);
  // curves appearing: a fast rising tick train, then soft 16th hats
  const nDays = 100;
  const fanStart = soG + 0.1, fanEnd = G("stress", CUE.stress.seen) + 0.2;
  for (let d = 0; d < nDays; d += 2) tick(fx, fanStart + (d / nDays) * (fanEnd - fanStart), 0.032, 900 + d * 12, 0.2 + 0.6 * rand());
  for (let t = soG; t < oftenG - 0.1; t += BEAT / 4) {
    const x = (t - soG) / (oftenG - soG);
    hat(music, t, 0.025 + 0.08 * x, false, 0.5 + 0.3 * Math.sin(t * 5));
  }
  for (let t = soG, j = 0; t < oftenG - 0.1; t += BEAT / 2, j++) pluck(music, mSend, penta[[0, 2, 1, 3, 2, 4][j % 6]], t, 0.05 + 0.05 * Math.min(1, (t - soG) / 3), 0.5);
  for (let t = soG; t < oftenG - 0.2; t += BEAT * 2) kick(music, t, 0.22);
  riser(fx, oftenG - 1.8, oftenG, 0.32, 300, 10000);
  impact(fx, oftenG, 0.4, 1.4);
  chimeUp(fx, fSend, oftenG + 0.03, "C", 5, 0.13, 0.09);
  // resolve to major
  progression(majorProg, oftenG, endG, BEAT * 4, { gain: 0.3, cutoff: 1400, mod: 400, attack: 0.4, release: 1.2 }, true, 0.34);
  for (let t = oftenG + BEAT, k = 0; t < endG; t += BEAT, k++) { kick(music, t, 0.3); hat(music, t + BEAT / 2, 0.07); }
  ping(fx, fSend, f("E", 5), G("stress", CUE.stress.much), 0.12, 0.4);
  ping(fx, fSend, f("G", 5), G("stress", CUE.stress.when), 0.12, 0.6);
  impact(fx, G("stress", CUE.stress.proves), 0.22, 0.9);
  whoosh(fx, TIMES.stress[0] - 0.05, 0.7, 0.2, true);
}

// E: human decision, calm
{
  const t0 = TIMES.human[0] + 0.2;
  const t1 = TIMES.close[0] + 0.2;
  progression(["C", "G", "Am", "F"], t0, t1, BEAT * 4, { gain: 0.22, cutoff: 1000, mod: 250, attack: 0.8, release: 1.4 }, true, 0.26);
  let k = 0;
  for (let t = t0 + 0.5; t < t1 - 0.4; t += BEAT, k++) bell(music, mSend, majPenta[[0, 2, 3, 1, 4, 2, 3, 5][k % 8]], t, 0.07, 0.25 + 0.5 * ((k % 4) / 4), 1.4);
  const clickG = G("human", Math.max(CUE.human.it, CUE.human.rejects + 1.05));
  chimeUp(fx, fSend, clickG + 0.12, "C", 5, 0.14, 0.08);
  whoosh(fx, TIMES.human[0] - 0.05, 0.7, 0.2, true);
  ping(fx, fSend, f("E", 5), G("human", CUE.human.only), 0.1, 0.3);
  ping(fx, fSend, f("G", 5), G("human", CUE.human.nothing), 0.1, 0.7);
}

// F: close, from the queue to the lockup
{
  const t0 = TIMES.close[0];
  const letsG = G("close", CUE.close.lets);
  const planG = G("close", CUE.close.plan);
  const stressG = G("close", CUE.close.stress);
  const explG = G("close", CUE.close.explain);
  const lockG = explG + 1.3;
  progression(["Am", "F"], t0 + 0.2, letsG, 4.0, { gain: 0.24, cutoff: 650, mod: 200, attack: 1.0, release: 1.4 }, true, 0.28);
  progression(majorProg, letsG, lockG, BEAT * 4, { gain: 0.32, cutoff: 1500, mod: 400, attack: 0.4, release: 1.0 }, true, 0.36);
  for (let t = letsG + 0.2, k = 0; t < planG - 0.3; t += BEAT, k++) { kick(music, t, 0.3); hat(music, t + BEAT / 2, 0.07, k % 4 === 3); }
  for (let i = 0; i < 6; i++) {
    const t = letsG + 0.3 + i * 0.3;
    ping(fx, fSend, majPenta[i], t, 0.14, 0.15 + 0.14 * i);
    bell(music, mSend, majPenta[i] / 2, t, 0.06, 0.5, 1.2);
  }
  for (let t = letsG + 0.4, j = 0; t < planG - 0.4; t += BEAT / 4, j++) {
    const bi = Math.floor((t - letsG) / (BEAT * 4)) % 4;
    pluck(music, mSend, chords[majorProg[bi]][[0, 1, 2, 1][j % 4]], t, 0.07, 0.3 + 0.4 * ((j % 4) / 4));
  }
  riser(fx, planG - 1.2, planG, 0.26, 300, 9000);
  whoosh(fx, planG - 0.55, 0.6, 0.22, true);
  for (const [t, ch] of [[planG, "C"], [stressG, "G"], [explG, "Am"]]) {
    impact(fx, t, 0.3, 0.8);
    for (const fr of chords[ch]) pluck(music, mSend, fr, t, 0.2, 0.5, 1.2);
    ping(fx, fSend, ch === "C" ? f("C", 6) : ch === "G" ? f("G", 5) : f("E", 6), t, 0.1, 0.5);
  }
  // lockup: big resolved chord with a long tail
  impact(fx, lockG, 0.55, 2.4);
  chimeUp(fx, fSend, lockG + 0.02, "C", 5, 0.16, 0.12);
  pad(music, mSend, chords.Cadd9, lockG, END - lockG - 1.0, { gain: 0.42, cutoff: 1800, mod: 500, attack: 0.5, release: 2.4 });
  bass(music, f("C", 2), lockG, 6, 0.4);
  for (let t = lockG + 0.5, k = 0; t < END - 2; t += BEAT * 0.5, k++) bell(music, mSend, majPenta[[0, 2, 3, 4, 3, 2][k % 6]] * (k % 12 > 5 ? 2 : 1), t, 0.045, 0.2 + 0.6 * rand(), 1.3);
}

// ---------- mixdown ----------
const mWet = reverb(mSend);
const fWet = reverb(fSend);
const gate = (t) => {
  if (t < blowG) return 1;
  if (t < blowG + 0.02) return 1 - (t - blowG) / 0.02;
  if (t < revealG - 0.04) return 0.0;
  if (t < revealG) return (t - (revealG - 0.04)) / 0.04;
  return 1;
};
const fade = (t) => (t > END - 3.0 ? Math.max(0, 1 - (t - (END - 3.0)) / 3.0) : 1);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = gate(t) * fade(t);
  music.l[i] = (music.l[i] + mWet.l[i] * 0.55) * g;
  music.r[i] = (music.r[i] + mWet.r[i] * 0.55) * g;
  fx.l[i] = (fx.l[i] + fWet.l[i] * 0.5) * (t > END - 1.5 ? fade(t + 1.5) : 1);
  fx.r[i] = (fx.r[i] + fWet.r[i] * 0.5) * (t > END - 1.5 ? fade(t + 1.5) : 1);
}
function normalise(bus, peak) {
  let mx = 0;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(bus.l[i]), Math.abs(bus.r[i]));
  const k = peak / (mx || 1);
  for (let i = 0; i < N; i++) { bus.l[i] *= k; bus.r[i] *= k; }
  return mx;
}
const pm = normalise(music, 0.9);
const pf = normalise(fx, 0.9);

function wav(bus) {
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(bus.l[i] * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(bus.r[i] * 32767))), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const tmp = join(tmpdir(), "gf-synth");
mkdirSync(tmp, { recursive: true });
mkdirSync(join(ROOT, "public/audio"), { recursive: true });
for (const [name, bus] of [["music", music], ["fx", fx]]) {
  const w = join(tmp, name + ".wav");
  writeFileSync(w, wav(bus));
  const r = spawnSync("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", w, "-codec:a", "libmp3lame", "-b:a", "192k", join(ROOT, "public/audio", name + ".mp3")], { cwd: ROOT, shell: true, encoding: "utf8" });
  if (r.status !== 0) console.error(name, "encode failed", r.stderr);
}
rmSync(tmp, { recursive: true, force: true });
console.log("music peak before norm", pm.toFixed(2), "fx peak", pf.toFixed(2), "| length", (N / SR).toFixed(1) + "s");
console.log("blow at", blowG.toFixed(2) + "s, reveal hit at", revealG.toFixed(2) + "s, lockup at", (G("close", CUE.close.explain) + 1.3).toFixed(2) + "s");
