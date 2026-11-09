import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, easeBack, easeInOut, easeOut, fmtClock, map, prog, useT } from "../anim";
import { arrivalPose, departPose, parkedPose } from "../geom";
import { Depot, idleTrucks, type TruckView } from "../components/Depot";
import { Brand, ChartCard, ClockCard, Disclaimer, PowerCard } from "../components/Hud";
import { Camera, SectionTag } from "../components/Scene";
import { Backdrop, Mono, Pill, WordReveal } from "../components/Text";
import { END_H, LIMIT, N_TRUCKS, PLAN, SLOTS, SLOT_H, START_H, baseAtHour, chargerKwAt, peakPlanned, plannedTotalAt, truckAt } from "../sim";
import { SCENES, findWord } from "../timeline";
import { Img, staticFile } from "remotion";

const S = SCENES.plan;

const tPost = findWord(S, "postcode");
const tBuildingW = findWord(S, "building");
const tFleetW = findWord(S, "fleet");
const tBuilds = findWord(S, "builds");
const tTimetable = findWord(S, "timetable");
const tTurns = findWord(S, "turns");
const tQuiet = findWord(S, "quiet");
const tFull = findWord(S, "full");

export const PLAN_T = { depot: tTurns - 0.3 };
const T_DEPOT = tTurns - 0.3; // depot beat starts
const T_ARRIVE_DUR = 1.15;
const T_DEPART = findWord(S, "morning") + 0.9; // trucks start leaving

// Time-lapse: scene seconds -> simulated hour
const HOUR_KEYS: [number, number][] = [
  [T_DEPOT, 17.5],
  [T_DEPOT + 1.2, 18.0],
  [T_DEPOT + 3.3, 24.0],
  [T_DEPOT + 5.5, 27.2],
  [T_DEPOT + 7.1, 29.8],
  [T_DEPOT + 8.7, 31.0],
];
const hourAt = (t: number) => {
  if (t <= HOUR_KEYS[0][0]) return HOUR_KEYS[0][1];
  for (let i = 1; i < HOUR_KEYS.length; i++) {
    if (t <= HOUR_KEYS[i][0]) {
      const [t0, h0] = HOUR_KEYS[i - 1];
      const [t1, h1] = HOUR_KEYS[i];
      return h0 + ((h1 - h0) * (t - t0)) / (t1 - t0);
    }
  }
  return HOUR_KEYS[HOUR_KEYS.length - 1][1];
};

const naiveAt = (h: number) => baseAtHour(h) + (h < 21 ? 110 : 0);
const ticksNight = [18, 21, 24, 27, 30];

// ---------------------------------------------------------------- inputs
const Card: React.FC<{ x: number; y: number; w: number; h: number; p: number; dashed?: boolean; children: React.ReactNode }> = ({ x, y, w, h, p, dashed, children }) => (
  <div
    style={{
      position: "absolute", left: x, top: y + (1 - p) * 70, width: w, height: h, opacity: p, boxSizing: "border-box", padding: 30, borderRadius: 28,
      background: "linear-gradient(180deg, rgba(27,29,37,0.97), rgba(20,21,27,0.97))", border: (dashed ? "2.5px dashed " : "1.5px solid ") + (dashed ? "#5b5e6a" : C.line),
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
    }}
  >
    {children}
  </div>
);

const Inputs: React.FC<{ t: number }> = ({ t }) => {
  const pPost = prog(t, tPost - 0.3, 0.7, easeBack);
  const pBld = prog(t, tBuildingW - 0.3, 0.7, easeBack);
  const pFleet = prog(t, tFleetW - 0.3, 0.7, easeBack);
  const pBat = prog(t, tFleetW + 0.4, 0.7, easeBack);
  const conv = prog(t, tBuilds - 0.25, 0.7, easeInOut);
  const typed = "1021 EG";
  const nChars = Math.floor(clamp((t - (tPost - 0.1)) / 0.12, 0, typed.length));
  const W = 392;
  const GAP = 34;
  const X0 = (1920 - (4 * W + 3 * GAP)) / 2;
  const Y0 = 340;
  const cx = (i: number) => X0 + i * (W + GAP);
  // spark of the building's own load
  const pts: string[] = [];
  for (let h = START_H; h <= END_H; h += 0.25) {
    pts.push(((h - START_H) / (END_H - START_H)) * (W - 60) + "," + (150 - (baseAtHour(h) / 80) * 140));
  }
  const spark = "M" + pts.join(" L");
  const sparkReveal = prog(t, tBuildingW, 1.0, easeInOut);
  const nTrucksOn = Math.round(10 * prog(t, tFleetW - 0.2, 1.0, (n) => n));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - conv }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 190, textAlign: "center" }}>
        <WordReveal t={t} align="center" size={92} words={[{ text: "Enter", at: S.words[0].start }, { text: "three", at: S.words[1].start, color: C.yellow }, { text: "things.", at: S.words[2].start, color: C.yellow }]} />
      </div>
      <div style={{ transform: "scale(" + (1 - 0.35 * conv) + ") translateY(" + conv * 40 + "px)", transformOrigin: "50% 55%", position: "absolute", inset: 0 }}>
        {/* postcode */}
        <Card x={cx(0)} y={Y0} w={W} h={430} p={pPost}>
          <Mono size={20}>1 · Postcode</Mono>
          <svg width={92} height={92} viewBox="0 0 92 92" style={{ marginTop: 22 }}>
            <path d="M46 8 C28 8 16 21 16 37 C16 58 46 84 46 84 C46 84 76 58 76 37 C76 21 64 8 46 8 Z" fill={C.yellow} />
            <circle cx={46} cy={37} r={12} fill="#14151b" />
          </svg>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 58, color: C.text, marginTop: 20, letterSpacing: 2, height: 80, whiteSpace: "nowrap" }}>
            {typed.slice(0, nChars)}<span style={{ color: C.yellow, opacity: Math.floor(t * 2.5) % 2 }}>|</span>
          </div>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 32, color: C.mute, marginTop: 6 }}>Amsterdam · Liander</div>
          <div style={{ marginTop: 18 }}><Pill bg={C.red} size={20}>Red for new demand</Pill></div>
        </Card>
        {/* building */}
        <Card x={cx(1)} y={Y0} w={W} h={430} p={pBld}>
          <Mono size={20}>2 · Building</Mono>
          <svg width={W - 60} height={170} style={{ marginTop: 26, overflow: "visible" }}>
            <defs>
              <clipPath id="sparkClip"><rect x={0} y={0} width={(W - 60) * sparkReveal} height={170} /></clipPath>
              <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#8b8f9c" stopOpacity="0.5" />
                <stop offset="1" stopColor="#8b8f9c" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1={0} x2={W - 60} y1={160} y2={160} stroke="#2a2d38" strokeWidth={2} />
            <g clipPath="url(#sparkClip)">
              <path d={spark + " L" + (W - 60) + ",160 L0,160 Z"} fill="url(#sparkFill)" />
              <path d={spark} fill="none" stroke="#c4c7d2" strokeWidth={5} strokeLinejoin="round" />
            </g>
          </svg>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 36, marginTop: 14, lineHeight: 1.1 }}>The building&apos;s own use</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.mute, marginTop: 10 }}>meter data or bill</div>
        </Card>
        {/* fleet */}
        <Card x={cx(2)} y={Y0} w={W} h={430} p={pFleet}>
          <Mono size={20}>3 · Fleet</Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24, width: 300 }}>
            {Array.from({ length: 10 }, (_, i) => {
              const on = i < nTrucksOn;
              return (
                <svg key={i} width={50} height={83} viewBox="0 0 58 96" style={{ opacity: on ? 1 : 0.25, transform: "scale(" + (on ? 1 : 0.8) + ")" }}>
                  <rect x={4} y={26} width={50} height={66} rx={7} fill="#eceef3" />
                  <rect x={6} y={2} width={46} height={30} rx={10} fill="#3a3e4b" />
                  <rect x={13} y={9} width={32} height={11} rx={4} fill="#5f7a99" />
                  <rect x={4} y={30} width={4} height={60} fill={C.yellow} />
                  <rect x={50} y={30} width={4} height={60} fill={C.yellow} />
                </svg>
              );
            })}
          </div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, marginTop: 16, lineHeight: 1.1 }}>10 trucks</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.mute, marginTop: 8, lineHeight: 1.3 }}>electric · 33 kWh each<br />11 kW chargers</div>
        </Card>
        {/* battery (optional) */}
        <Card x={cx(3)} y={Y0} w={W} h={430} p={pBat} dashed>
          <Mono size={20}>Optional · Battery</Mono>
          <svg width={150} height={110} viewBox="0 0 150 110" style={{ marginTop: 30 }}>
            <rect x={6} y={14} width={124} height={82} rx={14} fill="none" stroke="#8d909c" strokeWidth={6} />
            <rect x={132} y={40} width={12} height={30} rx={4} fill="#8d909c" />
            <path d="M74 24 L50 58 H68 L60 88 L98 46 H78 L88 24 Z" fill={C.yellow} />
          </svg>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, marginTop: 20, lineHeight: 1.1 }}>On-site battery</div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: C.mute, marginTop: 8 }}>tested the same way</div>
        </Card>
      </div>
      {/* engine ring while the cards merge */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 380, display: "flex", justifyContent: "center", opacity: conv * (1 - prog(t, tTimetable + 0.5, 0.5)), pointerEvents: "none" }}>
        <svg width={420} height={420} viewBox="0 0 420 420">
          <circle cx={210} cy={210} r={170} fill="none" stroke={C.yellow} strokeWidth={6} strokeDasharray="30 22" transform={"rotate(" + t * 140 + " 210 210)"} />
          <circle cx={210} cy={210} r={120} fill="none" stroke="#fff" strokeWidth={3} opacity={0.5} strokeDasharray="8 14" transform={"rotate(" + -t * 200 + " 210 210)"} />
        </svg>
        <Img src={staticFile("gridflex-mark-hd.png")} style={{ position: "absolute", top: 120, height: 180, width: "auto" }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- timetable
const GX0 = 340;
const GX1 = 1800;
const hx = (h: number) => GX0 + ((h - START_H) / (END_H - START_H)) * (GX1 - GX0);

const Timetable: React.FC<{ t: number }> = ({ t }) => {
  const t0 = tBuilds + 0.1;
  const rowH = 44;
  const rowGap = 9;
  const gy = 300;
  const loadTop = 870;
  const loadH = 150;
  const segs = (i: number) => {
    const out: [number, number][] = [];
    let s = -1;
    for (let k = 0; k <= SLOTS; k++) {
      const a = k < SLOTS && PLAN.active[i][k];
      if (a && s < 0) s = k;
      if (!a && s >= 0) {
        out.push([s, k]);
        s = -1;
      }
    }
    return out;
  };
  const reveal = prog(t, t0 + 0.9, 2.6, easeInOut);
  const yL = (v: number) => loadTop + loadH * (1 - v / 120);
  const base: string[] = [];
  const tot: string[] = [];
  for (let k = 0; k < SLOTS; k++) {
    const h0 = START_H + k * SLOT_H;
    const h1 = h0 + SLOT_H;
    const b = baseAtHour(h0);
    const c = PLAN.chargerKw[k];
    base.push(hx(h0) + "," + yL(b), hx(h1) + "," + yL(b));
    tot.push(hx(h0) + "," + yL(b + c), hx(h1) + "," + yL(b + c));
  }
  const totLine = "M" + tot.join(" L");
  const basePath = "M" + base.join(" L") + " L" + GX1 + "," + yL(0) + " L" + GX0 + "," + yL(0) + " Z";
  const totPath = totLine + " L" + GX1 + "," + yL(0) + " L" + GX0 + "," + yL(0) + " Z";
  const inP = prog(t, t0 - 0.1, 0.6);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: inP * (1 - prog(t, T_DEPOT - 0.1, 0.5)), transform: "scale(" + (1 + 0.06 * prog(t, T_DEPOT - 0.3, 0.6, easeInOut)) + ")" }}>
      <div style={{ position: "absolute", left: 96, top: 170 }}>
        <WordReveal t={t} size={84} words={[{ text: "A", at: tBuilds }, { text: "timetable", at: tTimetable, color: C.yellow }, { text: "for", at: S.words[11].start }, { text: "every", at: S.words[12].start }, { text: "truck.", at: S.words[13].start }]} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="loadClip"><rect x={GX0} y={loadTop - 20} width={(GX1 - GX0) * reveal} height={loadH + 40} /></clipPath>
        </defs>
        {/* axis + grid */}
        {[18, 21, 24, 27, 30].map((h) => (
          <g key={h}>
            <line x1={hx(h)} x2={hx(h)} y1={gy - 16} y2={loadTop + loadH} stroke="#23262f" strokeWidth={2} />
            <text x={hx(h)} y={gy - 28} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.mute}>{fmtClock(h)}</text>
          </g>
        ))}
        {/* rows */}
        {Array.from({ length: N_TRUCKS }, (_, i) => {
          const y = gy + i * (rowH + rowGap);
          const rowT = t0 + 0.2 + i * 0.2;
          const lab = prog(t, rowT - 0.1, 0.3);
          return (
            <g key={i} opacity={lab}>
              <rect x={GX0} y={y} width={GX1 - GX0} height={rowH} rx={10} fill="#16181e" />
              <text x={GX0 - 22} y={y + 31} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={26} fill={C.text}>Truck {String(i + 1).padStart(2, "0")}</text>
              {segs(i).map(([a, b], k) => {
                const x = hx(START_H + a * SLOT_H);
                const w = hx(START_H + b * SLOT_H) - x;
                const grow = prog(t, rowT + k * 0.1, 0.55, easeOut);
                return <rect key={k} x={x} y={y + 4} width={Math.max(0, w * grow - 3)} height={rowH - 8} rx={8} fill={C.yellow} />;
              })}
            </g>
          );
        })}
        {/* stacked load */}
        <g opacity={prog(t, t0 + 0.6, 0.5)}>
          <text x={GX0 - 22} y={loadTop + 30} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={22} fill={C.mute}>SITE LOAD</text>
          <text x={GX0 - 22} y={loadTop + 58} textAnchor="end" fontFamily={MONO} fontWeight={500} fontSize={20} fill={C.dim}>building + chargers</text>
          <g clipPath="url(#loadClip)">
            <path d={totPath} fill={C.yellow} opacity={0.9} />
            <path d={basePath} fill="#6b6f7c" />
            <path d={totLine} fill="none" stroke="#fff" strokeWidth={3} opacity={0.9} />
          </g>
          <line x1={GX0} x2={GX1} y1={yL(LIMIT)} y2={yL(LIMIT)} stroke={C.red} strokeWidth={4} strokeDasharray="16 10" />
          <text x={GX1} y={yL(LIMIT) - 12} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.red}>100 kW limit</text>
        </g>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------- depot night
export const Plan: React.FC = () => {
  const { t } = useT();
  const hour = hourAt(t);
  const inDepot = t >= T_DEPOT - 0.4;
  const depotIn = prog(t, T_DEPOT - 0.35, 0.7, easeOut);

  const trucks: TruckView[] = idleTrucks().map((v, i) => {
    const start = T_DEPOT + (N_TRUCKS - 1 - i) * 0.05;
    const p = (t - start) / T_ARRIVE_DUR;
    if (p <= 0) return v;
    const departStart = T_DEPART + (N_TRUCKS - 1 - i) * 0.22;
    const dp = (t - departStart) / 2.4;
    if (dp > 0) {
      const st = truckAt(i, END_H);
      return { ...v, visible: true, pose: departPose(i, dp), mode: st.mode, soc: st.soc, headlights: true, brake: false, plug: 1 - prog(t, departStart - 0.05, 0.25, (n) => n) };
    }
    const parked = p >= 1;
    const plugT = start + T_ARRIVE_DUR + 0.1;
    const plug = prog(t, plugT, 0.25, (n) => n);
    const st = truckAt(i, Math.max(hour, 17.99));
    const live = parked && plug > 0.98 && hour >= START_H;
    return {
      ...v,
      visible: true,
      pose: p < 1 ? arrivalPose(i, p) : parkedPose(i),
      mode: live ? st.mode : "waiting",
      soc: live ? st.soc : 0,
      headlights: p < 1 || (hour > 29.7 && st.mode === "done" && false),
      brake: p > 0.8 && p < 1.02,
      plug,
    };
  });

  const kw = baseAtHour(hour) + chargerKwAt(hour);
  const camZoom = map(t, T_DEPOT, T_DEPOT + 9, 1.0, 1.04, easeInOut);
  const resultsIn = prog(t, tFull + 0.2, 0.7, easeOut);
  const peak = Math.round(peakPlanned());
  const sidebarIn = prog(t, T_DEPOT + 0.3, 0.8, easeOut);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* inputs + timetable on a plain backdrop */}
      {!inDepot || depotIn < 1 ? (
        <AbsoluteFill style={{ opacity: 1 - depotIn }}>
          <Backdrop glow="rgba(255,230,0,0.06)" glowX={50} glowY={50} />
          <Brand x={96} y={62} />
          <SectionTag n="02" label="The solution" y={134} />
          <Inputs t={t} />
          <Timetable t={t} />
        </AbsoluteFill>
      ) : null}

      {/* depot night time-lapse */}
      {inDepot && (
        <AbsoluteFill style={{ opacity: depotIn, transform: "scale(" + (1.12 - 0.12 * depotIn) + ")" }}>
          <Camera zoom={camZoom} cx={700} cy={460}>
            <Depot t={t} hour={hour} trucks={trucks} />
          </Camera>
          <Brand x={96} y={62} label="Same depot · scheduled" />
          <Disclaimer />
          <div style={{ opacity: sidebarIn, transform: "translateX(" + (1 - sidebarIn) * 90 + "px)" }}>
            <ClockCard hour={hour} />
            <PowerCard kw={kw} baseKw={baseAtHour(hour)} />
            <ChartCard y={592} h={448} nowH={hour} series={plannedTotalAt} ghost={naiveAt} startH={START_H} endH={END_H} ticks={ticksNight} tickFmt={(h) => fmtClock(h).slice(0, 2) + "h"} title="Site load" subtitle="· · · if charged on arrival" />
          </div>
          {/* key phrase that follows the narration */}
          <div style={{ position: "absolute", left: 66, top: 800, opacity: prog(t, tQuiet - 0.3, 0.6) * (1 - prog(t, tFull - 0.2, 0.5)) }}>
            <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 76, lineHeight: 1.05, color: C.text, textShadow: "0 4px 30px rgba(0,0,0,0.9)" }}>
              Trucks take turns.<br /><span style={{ color: C.yellow }}>The night does the work.</span>
            </div>
          </div>
          {/* results */}
          <div style={{ position: "absolute", left: 66, top: 880, display: "flex", gap: 18, opacity: resultsIn, transform: "translateY(" + (1 - resultsIn) * 40 + "px)" }}>
            {[
              { big: "10 of 10", small: "trucks fully charged", c: C.text },
              { big: peak + " kW", small: "peak · limit 100 kW", c: C.green },
              { big: "0 h", small: "over the limit", c: C.green },
            ].map((s) => (
              <div key={s.small} style={{ background: "rgba(20,21,27,0.94)", border: "1.5px solid " + C.line, borderRadius: 20, padding: "14px 26px" }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 46, color: s.c, lineHeight: 1 }}>{s.big}</div>
                <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 19, color: C.mute, marginTop: 6, letterSpacing: 1 }}>{s.small}</div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
