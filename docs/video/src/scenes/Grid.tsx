import React from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, easeInOut, easeOut, prog, rng, useT } from "../anim";
import { Brand } from "../components/Hud";
import { SectionTag } from "../components/Scene";
import { Backdrop, Mono, WordReveal } from "../components/Text";
import { SCENES, findWord } from "../timeline";

const S = SCENES.grid;
const COLS = 30;
const ROWS = 20;
const PITCH = 29;
const FIELD_X = 960;
const FIELD_Y = 190;

// Dots in the "Liander area" blob; the rest are everywhere else.
const inLiander = (c: number, r: number) => c < 10 + 3 * Math.sin(r * 0.55 + 0.4) + (r > 12 ? 2.4 : 0) && r > 1 + 1.5 * Math.cos(c * 0.5);

type Dot = { c: number; r: number; u: number; zone: "L" | "R" };
const buildDots = (): { dots: Dot[]; pL: number; fL: number; fR: number } => {
  const r = rng(11);
  const dots: Dot[] = [];
  for (let rr = 0; rr < ROWS; rr++)
    for (let c = 0; c < COLS; c++) {
      const n = (noise2D("grid", c * 0.2, rr * 0.2) + 1) / 2; // clustered
      dots.push({ c, r: rr, u: clamp(0.62 * n + 0.38 * r(), 0, 0.9999), zone: inLiander(c, rr) ? "L" : "R" });
    }
  // make u uniform within each zone (rank based) so the red share is exact, keeping the cluster order
  for (const zone of ["L", "R"] as const) {
    const members = dots.filter((d) => d.zone === zone).sort((a, b) => a.u - b.u);
    members.forEach((d, k) => { d.u = (k + 0.5) / members.length; });
  }
  const nL = dots.filter((d) => d.zone === "L").length;
  const pL = nL / dots.length;
  const fL = 0.79; // 79% red in Liander's area
  const fR = (0.56 - pL * fL) / (1 - pL); // so that the whole field is 56% red
  return { dots, pL, fL, fR };
};
const FIELD = buildDots();

export const Grid: React.FC = () => {
  const { t } = useT();
  const tMarked = findWord(S, "marked") - 0.2;
  const tDemand = findWord(S, "demand") + 0.5;
  const tLiander = findWord(S, "Liander");
  const tTen = findWord(S, "ten");

  const fieldIn = prog(t, 1.4, 1.2, easeOut);
  const redStart = tMarked;
  const redEnd = tDemand + 0.4;

  let redAll = 0;
  let redL = 0;
  let nL = 0;
  const cells = FIELD.dots.map((d, i) => {
    const fz = d.zone === "L" ? FIELD.fL : FIELD.fR;
    const turns = d.u < fz;
    const tTurn = redStart + (d.u / fz) * (redEnd - redStart);
    const age = t - tTurn;
    const isRed = turns && age >= 0;
    if (isRed) redAll++;
    if (d.zone === "L") {
      nL++;
      if (isRed) redL++;
    }
    const enter = clamp((t - 1.3 - (Math.hypot(d.c - COLS / 2, d.r - ROWS / 2) / 20) * 0.9) / 0.5, 0, 1);
    const flash = isRed ? Math.max(0, 1 - age / 0.45) : 0;
    return { d, i, isRed, flash, enter };
  });
  const pctAll = Math.round((redAll / FIELD.dots.length) * 100);
  const pctL = nL > 0 ? Math.round((redL / nL) * 100) : 0;

  const focusL = prog(t, tLiander - 0.2, 0.7, easeInOut);
  const statA = prog(t, tMarked - 0.4, 0.7, easeOut);
  const statB = prog(t, tLiander, 0.7, easeOut);

  // outline of the Liander zone: bounding polygon of the zone's dots (drawn as a soft rect per row run)
  const zoneDots = FIELD.dots.filter((d) => d.zone === "L");

  return (
    <AbsoluteFill>
      <Backdrop glow="rgba(255,71,87,0.10)" glowX={75} glowY={50} />
      <Brand x={96} y={62} />
      <SectionTag n="01" label="The problem" y={134} />

      {/* headline */}
      <div style={{ position: "absolute", left: 96, top: 205 }}>
        <WordReveal
          t={t}
          size={142}
          words={[
            { text: "The", at: S.words[0].start },
            { text: "Dutch", at: S.words[1].start },
          ]}
        />
        <WordReveal
          t={t}
          size={142}
          style={{ marginTop: -4 }}
          words={[
            { text: "power", at: S.words[2].start },
            { text: "grid", at: S.words[3].start },
          ]}
        />
        <WordReveal
          t={t}
          size={142}
          style={{ marginTop: -4 }}
          words={[
            { text: "is", at: S.words[4].start, color: C.yellow },
            { text: "full.", at: S.words[5].start, color: C.yellow },
          ]}
        />
      </div>

      {/* stats */}
      <div style={{ position: "absolute", left: 96, top: 700, opacity: statA, transform: "translateY(" + (1 - statA) * 30 + "px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 124, color: C.red, letterSpacing: -4, lineHeight: 1 }}>{pctAll}%</div>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 38, color: C.text, lineHeight: 1.15, maxWidth: 520 }}>
            of Dutch postcodes are red<br />for new demand
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 96, top: 860, opacity: statB, transform: "translateY(" + (1 - statB) * 30 + "px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 104, color: C.red, letterSpacing: -3, lineHeight: 1 }}>{t >= tTen ? 79 : pctL}%</div>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 38, color: C.text, lineHeight: 1.15 }}>
            in <span style={{ color: C.yellow }}>Liander&apos;s</span> area
          </div>
        </div>
      </div>

      {/* dot field */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="dotGlow">
            <stop offset="0" stopColor={C.red} stopOpacity="0.8" />
            <stop offset="1" stopColor={C.red} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g opacity={fieldIn}>
          {cells.map(({ d, isRed, flash, enter }) => {
            const x = FIELD_X + d.c * PITCH;
            const y = FIELD_Y + d.r * PITCH;
            const dim = d.zone === "R" ? 1 - 0.55 * focusL : 1;
            const s = 1 + 0.55 * flash;
            return (
              <g key={d.c + "-" + d.r} opacity={enter * dim} transform={"translate(" + x + " " + y + ") scale(" + s + ")"}>
                {flash > 0.05 && <circle r={24} fill="url(#dotGlow)" opacity={flash * 0.9} />}
                <rect x={-10} y={-10} width={20} height={20} rx={5} fill={isRed ? C.red : "#2b2e39"} />
              </g>
            );
          })}
        </g>
        {/* Liander highlight: ring around each dot of the zone drawn as a soft hull */}
        <g opacity={focusL}>
          {zoneDots.map((d) => (
            <rect
              key={"z" + d.c + "-" + d.r}
              x={FIELD_X + d.c * PITCH - 14.5} y={FIELD_Y + d.r * PITCH - 14.5} width={29} height={29} rx={7}
              fill="none" stroke={C.yellow} strokeWidth={2} opacity={0.0}
            />
          ))}
          {zoneDots.map((d) => (
            <rect
              key={"zf" + d.c + "-" + d.r}
              x={FIELD_X + d.c * PITCH - 12} y={FIELD_Y + d.r * PITCH - 12} width={24} height={24} rx={6}
              fill="none" stroke={C.yellow} strokeWidth={2.4} opacity={0.85 * focusL}
            />
          ))}
        </g>
      </svg>

      {/* field captions */}
      <div style={{ position: "absolute", left: FIELD_X - 14, top: FIELD_Y + ROWS * PITCH + 18, opacity: fieldIn }}>
        <Mono size={19} spacing={2} color="#9a9dab">
          Each square ≈ 770 postcodes · 462,687 in total · illustrative layout
        </Mono>
      </div>
      <div
        style={{
          position: "absolute", left: FIELD_X + 18, top: FIELD_Y - 56, opacity: focusL,
          fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: 4, color: C.yellow, textTransform: "uppercase",
        }}
      >
        Liander area
      </div>

      {/* source */}
      <div style={{ position: "absolute", left: 96, top: 1032, fontFamily: MONO, fontSize: 19, letterSpacing: 2, color: "#767a87", opacity: statA }}>
        SOURCE · NETBEHEER NEDERLAND CAPACITEITSKAART · EXPORT 5 NOV 2026 · RED FOR NEW DEMAND (OFFTAKE) · INDICATIVE
      </div>
    </AbsoluteFill>
  );
};

