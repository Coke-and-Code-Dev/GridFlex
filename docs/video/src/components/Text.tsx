import React from "react";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { easeBack, easeOut, prog } from "../anim";

export type Word = { text: string; at: number; color?: string; weight?: number };

/** Words that rise, unblur and settle at their own start time (seconds, scene-local). */
export const WordReveal: React.FC<{
  t: number;
  words: Word[];
  size: number;
  lineHeight?: number;
  weight?: number;
  gap?: number;
  align?: "left" | "center";
  style?: React.CSSProperties;
}> = ({ t, words, size, lineHeight = 1.04, weight = 900, gap = 0.26, align = "left", style }) => (
  <div style={{ fontFamily: HEAD, fontSize: size, lineHeight, fontWeight: weight, letterSpacing: -size * 0.025, textAlign: align, ...style }}>
    {words.map((w, i) => {
      const p = prog(t, w.at, 0.55, easeOut);
      const pb = prog(t, w.at, 0.45, easeBack);
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            marginRight: size * gap,
            color: w.color ?? C.text,
            fontWeight: w.weight ?? weight,
            opacity: p,
            transform: "translateY(" + (1 - pb) * size * 0.36 + "px)",
            filter: "blur(" + (1 - p) * 14 + "px)",
          }}
        >
          {w.text}
        </span>
      );
    })}
  </div>
);

export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; spacing?: number; style?: React.CSSProperties }> = ({
  children, size = 22, color = C.mute, spacing = 4, style,
}) => (
  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size, letterSpacing: spacing, color, textTransform: "uppercase", whiteSpace: "nowrap", ...style }}>{children}</div>
);

export const Pill: React.FC<{ children: React.ReactNode; bg: string; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, bg, color = "#fff", size = 24, style }) => (
  <div
    style={{
      display: "inline-block", fontFamily: MONO, fontWeight: 700, fontSize: size, letterSpacing: 3, padding: "10px 22px", borderRadius: 999,
      background: bg, color, textTransform: "uppercase", whiteSpace: "nowrap", ...style,
    }}
  >
    {children}
  </div>
);

/** Soft background used by the non-depot scenes. */
export const Backdrop: React.FC<{ glow?: string; glowX?: number; glowY?: number; grid?: boolean }> = ({ glow = "rgba(255,230,0,0.07)", glowX = 70, glowY = 40, grid = true }) => (
  <div style={{ position: "absolute", inset: 0, background: C.bg }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 700px at " + glowX + "% " + glowY + "%, " + glow + ", transparent 70%)" }} />
    {grid && (
      <div
        style={{
          position: "absolute", inset: 0, opacity: 0.55,
          backgroundImage: "linear-gradient(#171920 1px, transparent 1px), linear-gradient(90deg, #171920 1px, transparent 1px)",
          backgroundSize: "70px 70px",
        }}
      />
    )}
  </div>
);
