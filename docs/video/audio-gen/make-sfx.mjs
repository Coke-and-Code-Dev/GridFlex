// Realistic sound effects from ElevenLabs text-to-sound-effects.  node audio-gen/make-sfx.mjs [only-name]
import { el, ROOT } from "./lib.mjs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CLIPS = [
  { name: "truck-pass", dur: 3.5, text: "Heavy electric delivery truck driving past at low speed, tyres rolling on asphalt, quiet electric motor whine, ends with a short air brake hiss. No engine roar." },
  { name: "plug-in", dur: 1.2, text: "Heavy-duty electric vehicle charging connector being plugged in, solid mechanical clunk and click, one short electronic confirmation beep." },
  { name: "surge", dur: 4.5, text: "Electrical overload building up, transformer hum rising in pitch and volume with crackling arcs and buzzing, tense, no music." },
  { name: "blackout", dur: 4.0, text: "Loud electrical circuit breaker tripping with a big bang and shower of sparks, then a power-down whine falling away into silence." },
  { name: "power-up", dur: 2.5, text: "Electricity coming back on, lights flicker on, bright rising electronic chime and shimmering electric hum, hopeful." },
  { name: "charge-hum", dur: 6.0, text: "Soft steady electric charging hum of several chargers, gentle low drone with faint electronic pulsing, calm and continuous." },
  { name: "night", dur: 8.0, text: "Quiet night outdoors beside a depot, distant city hum and soft crickets, calm and spacious." },
  { name: "dawn", dur: 6.0, text: "Gentle morning birdsong at dawn, several birds singing, soft and peaceful." },
  { name: "truck-depart", dur: 3.0, text: "Electric truck pulling away slowly, soft rising motor whine and tyres on asphalt." },
  { name: "stamp", dur: 1.0, text: "Heavy rubber stamp thudding down on a wooden desk, one solid thump." },
  { name: "click", dur: 0.6, text: "A single crisp mouse click." },
  { name: "typing", dur: 2.0, text: "Fast soft keyboard typing, a short burst of key presses." },
];

mkdirSync(join(ROOT, "public/sfx"), { recursive: true });
const only = process.argv[2];
for (const c of CLIPS) {
  if (only && c.name !== only) continue;
  const out = join(ROOT, "public/sfx", c.name + ".mp3");
  if (!only && existsSync(out)) { console.log(c.name.padEnd(13), "exists, skipped"); continue; }
  const r = await el("/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    body: JSON.stringify({ text: c.text, duration_seconds: c.dur, prompt_influence: 0.5 }),
  });
  if (!r.ok) { console.error(c.name, r.status, (await r.text()).slice(0, 240)); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(out, buf);
  console.log(c.name.padEnd(13), (buf.length / 1024).toFixed(0) + " KB", "cost:", r.headers.get("character-cost") ?? "n/a");
}
