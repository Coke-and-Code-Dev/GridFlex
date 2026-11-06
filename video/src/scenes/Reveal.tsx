import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C } from "../theme";
import { HEAD } from "../fonts";
import { easeBack, easeOut, prog, rng, useT } from "../anim";
import { Backdrop, WordReveal } from "../components/Text";
import { SCENES } from "../timeline";

const S = SCENES.reveal;

export const Reveal: React.FC = () => {
  const { t } = useT();
  const t0 = S.words[0].start; // "GridFlex"
  const tWithout = S.words[3].start;
  const tCable = S.words[7].start;

  const power = prog(t, t0 - 0.15, 0.9, easeOut);
  const burst = prog(t, t0 - 0.1, 0.9, easeOut);
  const markIn = prog(t, t0, 0.8, easeBack);
  const wordIn = prog(t, t0 + 0.25, 0.7, easeOut);
  const r = rng(3);

  // energy streaks racing outwards along the grid
  const streaks = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + r() * 0.2;
    const speed = 900 + r() * 1400;
    const delay = t0 - 0.1 + r() * 0.5;
    const age = t - delay;
    return { angle, d: age * speed, age, len: 160 + r() * 260 };
  });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, opacity: 0.25 + 0.75 * power }}>
        <Backdrop glow="rgba(255,230,0,0.20)" glowX={50} glowY={42} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="rvGlow">
            <stop offset="0" stopColor={C.yellow} stopOpacity="0.55" />
            <stop offset="1" stopColor={C.yellow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={960} cy={420} r={90 + 700 * burst} fill="url(#rvGlow)" opacity={(1 - burst) * 0.9 + 0.18 * power} />
        {burst > 0 && burst < 1 && <circle cx={960} cy={420} r={60 + 900 * burst} fill="none" stroke={C.yellow} strokeWidth={6} opacity={1 - burst} />}
        {streaks.map((s, i) =>
          s.age > 0 && s.d < 1500 ? (
            <line
              key={i}
              x1={960 + Math.cos(s.angle) * s.d} y1={420 + Math.sin(s.angle) * s.d}
              x2={960 + Math.cos(s.angle) * (s.d + s.len)} y2={420 + Math.sin(s.angle) * (s.d + s.len)}
              stroke={C.yellow} strokeWidth={3} strokeLinecap="round" opacity={Math.max(0, 1 - s.d / 1500) * 0.8}
            />
          ) : null,
        )}
      </svg>

      <AbsoluteFill style={{ alignItems: "center", paddingTop: 130 }}>
        <Img
          src={staticFile("gridflex-mark-hd.png")}
          style={{
            height: 270, width: "auto", opacity: markIn,
            transform: "scale(" + (0.5 + 0.5 * markIn) + ")",
          }}
        />
        <div style={{ marginTop: 22, fontFamily: HEAD, fontWeight: 900, fontSize: 168, letterSpacing: -5, color: C.text, opacity: wordIn, transform: "translateY(" + (1 - wordIn) * 40 + "px)" }}>
          GridFlex<span style={{ color: C.yellow }}>.ai</span>
        </div>
        <div style={{ marginTop: 44 }}>
          <WordReveal
            t={t}
            align="center"
            size={76}
            weight={800}
            words={[
              { text: "Without", at: tWithout },
              { text: "a", at: S.words[4].start },
              { text: "single", at: S.words[5].start },
              { text: "new", at: S.words[6].start, color: C.yellow },
              { text: "cable.", at: tCable, color: C.yellow },
            ]}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
