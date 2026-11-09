import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, easeBack, easeInOut, easeOut, fmtClock, prog, useT } from "../anim";
import { Brand } from "../components/Hud";
import { SectionTag } from "../components/Scene";
import { Backdrop, Mono, WordReveal } from "../components/Text";
import { BAD_DAYS, DAYS, END_H, LIMIT, N_DAYS, SLOTS, SLOT_H, START_H, daysOver, plannedTotalAt, worstPeak } from "../sim";
import { SCENES, findWord } from "../timeline";

const S = SCENES.stress;

const X0 = 230;
const X1 = 1790;
const TOP = 330;
const BOT = 800;
const YMAX = 125;
const hx = (h: number) => X0 + ((h - START_H) / (END_H - START_H)) * (X1 - X0);
const vy = (v: number) => BOT - (clamp(v, 0, YMAX) / YMAX) * (BOT - TOP);

const curvePath = (vals: number[], upTo = SLOTS) => {
  const pts: string[] = [];
  for (let k = 0; k < upTo; k++) {
    const h0 = START_H + k * SLOT_H;
    pts.push(hx(h0).toFixed(1) + "," + vy(vals[k]).toFixed(1), hx(h0 + SLOT_H).toFixed(1) + "," + vy(vals[k]).toFixed(1));
  }
  return "M" + pts.join(" L");
};

const single = Array.from({ length: SLOTS }, (_, k) => plannedTotalAt(START_H + k * SLOT_H));

export const Stress: React.FC = () => {
  const { t } = useT();
  const tOne = findWord(S, "one");
  const tProves = findWord(S, "proves");
  const tSo = findWord(S, "So");
  const tSeen = findWord(S, "seen");
  const tOften = findWord(S, "often");
  const tMuch = findWord(S, "much");
  const tWhen = findWord(S, "when");

  const o = daysOver();
  const worst = worstPeak();
  const bad = BAD_DAYS.map((b) => b.day);
  const worstDay = BAD_DAYS.reduce((a, b) => (b.peak > a.peak ? b : a));

  // beat timings
  const singleDraw = prog(t, 0.6, 1.8, easeInOut);
  const singleVis = (1 - prog(t, tSo - 0.2, 0.5)) * 1;
  const fanStart = tSo + 0.1;
  const fanEnd = tSeen + 0.2;
  const perDay = (fanEnd - fanStart) / N_DAYS;
  const dayShown = Math.max(0, Math.min(N_DAYS, Math.floor((t - fanStart) / perDay)));
  const focus = prog(t, tOften - 0.3, 0.7, easeInOut); // dim the crowd, light up the bad days
  const countP = prog(t, tOften, 1.2, easeOut);
  const shownOk = Math.round((N_DAYS - o) * countP);
  const chipA = prog(t, tOften - 0.1, 0.6, easeBack);
  const chipB = prog(t, tMuch - 0.2, 0.6, easeBack);
  const chipC = prog(t, tWhen - 0.2, 0.6, easeBack);
  const tickCheck = prog(t, tOne + 0.4, 0.4, easeBack);
  const nothing = prog(t, tProves, 0.5, easeOut);

  const title =
    t < tSo - 0.1
      ? [{ text: "One", at: 0.3 }, { text: "made-up", at: 0.45 }, { text: "day.", at: 0.65, color: C.mute }]
      : [{ text: "100", at: tSo, color: C.yellow }, { text: "realistic", at: tSo + 0.15 }, { text: "days.", at: tSo + 0.3 }];

  return (
    <AbsoluteFill>
      <Backdrop glow="rgba(255,230,0,0.05)" glowX={60} glowY={55} />
      <Brand x={96} y={62} />
      <SectionTag n="03" label="Stress-test" y={134} />

      <div style={{ position: "absolute", left: 96, top: 176 }}>
        <WordReveal t={t < tSo - 0.1 ? t : t} size={92} words={title} key={t < tSo - 0.1 ? "a" : "b"} />
      </div>
      {t >= tSo - 0.1 && (
        <div style={{ position: "absolute", right: 96, top: 196, textAlign: "right", opacity: prog(t, tSo + 0.3, 0.5) }}>
          <Mono size={20} spacing={2} color="#9a9dab">Held-out days · not used to build the plan</Mono>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64, color: C.text, marginTop: 6, letterSpacing: -1 }}>
            day {String(Math.max(1, dayShown)).padStart(3, " ")} <span style={{ color: C.dim }}>/ 100</span>
          </div>
        </div>
      )}

      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="stressClip"><rect x={X0} y={TOP - 20} width={(X1 - X0) * singleDraw} height={BOT - TOP + 40} /></clipPath>
          <linearGradient id="bandRed" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.red} stopOpacity="0.28" />
            <stop offset="1" stopColor={C.red} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* axes */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={vy(v)} y2={vy(v)} stroke="#262933" strokeWidth={2} />
            <text x={X0 - 16} y={vy(v) + 8} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.mute}>{v}</text>
          </g>
        ))}
        <text x={X0 - 16} y={TOP - 26} textAnchor="end" fontFamily={MONO} fontSize={20} fill={C.dim}>kW</text>
        {[18, 21, 24, 27, 30].map((h) => (
          <text key={h} x={hx(h)} y={BOT + 44} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.mute}>{fmtClock(h)}</text>
        ))}

        {/* "when" band */}
        <rect x={hx(18)} y={TOP - 10} width={hx(19.25) - hx(18)} height={BOT - TOP + 10} fill="url(#bandRed)" opacity={chipC} />

        {/* beat 1: the single day */}
        <g opacity={singleVis}>
          <g clipPath="url(#stressClip)">
            <path d={curvePath(single)} fill="none" stroke={C.yellow} strokeWidth={7} strokeLinejoin="round" opacity={1 - 0.65 * nothing} />
          </g>
        </g>

        {/* beat 2: the crowd of days */}
        <g>
          {DAYS.map((c, d) => {
            if (d >= dayShown) return null;
            const isBad = bad.includes(d);
            const born = fanStart + d * perDay;
            const a = prog(t, born, 0.18, (n) => n);
            const op = isBad ? 0.9 : 0.2 * (1 - 0.8 * focus) + 0.1 * (1 - focus);
            return (
              <path
                key={d} d={curvePath(c)} fill="none" stroke={isBad ? C.red : "#e6e8f0"} strokeWidth={isBad ? 4 : 2.2}
                strokeLinejoin="round" opacity={a * (isBad ? 0.55 + 0.45 * focus : op)}
              />
            );
          })}
        </g>

        {/* limit */}
        <line x1={X0} x2={X1} y1={vy(LIMIT)} y2={vy(LIMIT)} stroke={C.red} strokeWidth={4} strokeDasharray="18 11" />
        <text x={X1} y={vy(LIMIT) - 14} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={26} fill={C.red}>100 kW limit</text>

        {/* worst-case callout */}
        {chipB > 0.01 && (
          <g opacity={chipB}>
            <circle cx={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2)} cy={vy(worst)} r={14 + 8 * (1 - chipB)} fill="none" stroke="#fff" strokeWidth={4} />
            <line x1={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 60} x2={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 60} y1={vy(LIMIT)} y2={vy(worst)} stroke="#fff" strokeWidth={4} />
            <line x1={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 48} x2={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 72} y1={vy(LIMIT)} y2={vy(LIMIT)} stroke="#fff" strokeWidth={4} />
            <line x1={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 48} x2={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 72} y1={vy(worst)} y2={vy(worst)} stroke="#fff" strokeWidth={4} />
            <text x={hx(START_H + worstDay.slot * SLOT_H + SLOT_H / 2) + 90} y={vy(worst) + 22} fontFamily={MONO} fontWeight={700} fontSize={44} fill="#fff">+7 kW</text>
          </g>
        )}
        {chipC > 0.01 && (
          <text x={hx(18) + 14} y={BOT - 18} fontFamily={MONO} fontWeight={700} fontSize={26} fill={C.red} opacity={chipC}>18:15 →</text>
        )}
      </svg>

      {/* beat 1 pill */}
      {t < tSo + 0.4 && (
        <div style={{ position: "absolute", left: hx(23.2), top: 380, opacity: tickCheck * singleVis }}>
          <div style={{ position: "relative", fontFamily: HEAD, fontWeight: 800, fontSize: 54, color: C.green, padding: "10px 28px", borderRadius: 18, border: "3px solid " + C.green, background: "rgba(20,21,27,0.9)" }}>
            ✓ fits on this day
            <div style={{ position: "absolute", left: 14, right: 14, top: "50%", height: 6, background: C.red, borderRadius: 3, transform: "scaleX(" + nothing + ")", transformOrigin: "left" }} />
          </div>
          <div style={{ marginTop: 20, fontFamily: HEAD, fontWeight: 900, fontSize: 70, color: C.red, opacity: nothing, transform: "translateY(" + (1 - nothing) * 20 + "px)" }}>proves nothing.</div>
        </div>
      )}

      {/* results chips */}
      <div style={{ position: "absolute", left: 96, top: 872, display: "flex", gap: 24 }}>
        {[
          { p: chipA, label: "How often", big: shownOk + " / 100", color: C.green, desc: "days stay within the limit" },
          { p: chipB, label: "By how much", big: Math.round(worst) + " kW", color: C.red, desc: "on the worst day" },
          { p: chipC, label: "And when", big: "18:15", color: C.text, desc: "early evening" },
        ].map((c) => (
          <div key={c.label} style={{ width: 540, boxSizing: "border-box", opacity: c.p, transform: "translateY(" + (1 - c.p) * 36 + "px)", background: "#181a21", border: "1.5px solid " + C.line, borderRadius: 22, padding: "14px 28px" }}>
            <Mono size={18} spacing={3}>{c.label}</Mono>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64, lineHeight: 1.1, color: c.color, whiteSpace: "nowrap" }}>{c.big}</div>
            <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 25, color: C.mute, whiteSpace: "nowrap" }}>{c.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 96, top: 1046, fontFamily: MONO, fontSize: 18, letterSpacing: 3, color: "#7d808c", textTransform: "uppercase" }}>Illustrative simulation · synthetic data</div>
    </AbsoluteFill>
  );
};
