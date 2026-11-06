import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, easeBack, easeInOut, easeOut, lerp, prog, useT } from "../anim";
import { Brand } from "../components/Hud";
import { SectionTag } from "../components/Scene";
import { Backdrop, Mono } from "../components/Text";
import { SCENES, findWord } from "../timeline";

const S = SCENES.human;

type Seg = { s: string; hl?: boolean };
const LINES: Seg[][] = [
  [{ s: "Your area, " }, { s: "Amsterdam", hl: true }, { s: ", is " }, { s: "red", hl: true }, { s: " for new demand: 87 requests are waiting." }],
  [{ s: "10 chargers", hl: true }, { s: " work in January. The site stays under " }, { s: "100 kW", hl: true }, { s: " on " }, { s: "97 of 100 days", hl: true }, { s: "." }],
  [{ s: "Worst case: " }, { s: "107 kW", hl: true }, { s: " at " }, { s: "18:15", hl: true }, { s: ", in the early evening." }],
];
const TOTAL = LINES.reduce((a, l) => a + l.reduce((b, s) => b + s.s.length, 0), 0);

const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <svg width={60} height={72} viewBox="0 0 60 72" style={{ position: "absolute", left: x, top: y, transform: "scale(" + (1 - 0.12 * press) + ")", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.6))" }}>
    <path d="M6 4 L6 54 L19 42 L28 64 L38 60 L29 39 L47 39 Z" fill="#fff" stroke="#14151b" strokeWidth={4} strokeLinejoin="round" />
  </svg>
);

export const Human: React.FC = () => {
  const { t } = useT();
  const tExplains = findWord(S, "explains");
  const tPlain = findWord(S, "language");
  const tPerson = findWord(S, "person");
  const tApproves = findWord(S, "approves");
  const tRejects = findWord(S, "rejects");
  const tIt = findWord(S, "it", 1);
  const tOnly = findWord(S, "only");
  const tNothing = findWord(S, "Nothing");

  const cardA = prog(t, 0.2, 0.7, easeOut);
  const cardB = prog(t, tPerson - 0.6, 0.7, easeOut);
  const typeP = prog(t, tExplains, tPlain - tExplains + 1.2, (n) => n);
  let remaining = Math.floor(typeP * TOTAL);

  // cursor path: rest -> approve -> reject -> approve (click)
  const BX = 1170; // decision card left
  const approve = { x: BX + 150, y: 560 };
  const reject = { x: BX + 150 + 330, y: 560 };
  const rest = { x: BX + 380, y: 760 };
  const c1 = prog(t, tApproves - 0.2, 0.6, easeInOut);
  const c2 = prog(t, tRejects - 0.1, 0.5, easeInOut);
  const c3 = prog(t, tRejects + 0.55, 0.45, easeInOut);
  const px = c1 < 1 ? lerp(rest.x, approve.x, c1) : c2 < 1 ? lerp(approve.x, reject.x, c2) : lerp(reject.x, approve.x, c3);
  const py = c1 < 1 ? lerp(rest.y, approve.y, c1) : c2 < 1 ? lerp(approve.y, reject.y, c2) : lerp(reject.y, approve.y, c3);
  const tClick = Math.max(tIt, tRejects + 1.05);
  const press = t > tClick && t < tClick + 0.18 ? 1 : 0;
  const approved = prog(t, tClick + 0.1, 0.5, easeBack);
  const hoverApprove = c1 > 0.9 && c2 < 0.1 ? 1 : 0;
  const hoverReject = c2 > 0.9 && c3 < 0.1 ? 1 : 0;
  const ripple = prog(t, tClick, 0.7, easeOut);

  const bannerA = prog(t, tOnly - 0.2, 0.6, easeBack);
  const bannerB = prog(t, tNothing - 0.2, 0.6, easeBack);
  const switchOff = prog(t, tNothing + 0.5, 0.4, easeInOut);

  return (
    <AbsoluteFill>
      <Backdrop glow="rgba(61,220,151,0.05)" glowX={65} glowY={45} />
      <Brand x={96} y={62} />
      <SectionTag n="04" label="Explain · decide" y={134} />

      {/* explanation */}
      <div
        style={{
          position: "absolute", left: 96, top: 220, width: 1000, height: 560, boxSizing: "border-box", padding: "34px 44px", borderRadius: 30,
          background: "linear-gradient(180deg, rgba(27,29,37,0.97), rgba(20,21,27,0.97))", border: "1.5px solid " + C.line, boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          opacity: cardA, transform: "translateY(" + (1 - cardA) * 50 + "px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono size={22} color={C.yellow}>Explanation</Mono>
          <Mono size={16} spacing={1} color="#8d909c">describes computed numbers only</Mono>
        </div>
        <div style={{ marginTop: 34, fontFamily: HEAD, fontWeight: 600, fontSize: 45, lineHeight: 1.32, color: "#dfe1e8" }}>
          {LINES.map((line, li) => {
            const spans = line.map((seg, si) => {
              const n = clamp(remaining, 0, seg.s.length);
              remaining -= n;
              return n > 0 ? (
                <span key={si} style={{ color: seg.hl ? C.yellow : undefined, fontWeight: seg.hl ? 800 : 600 }}>{seg.s.slice(0, n)}</span>
              ) : null;
            });
            return <div key={li} style={{ marginBottom: 22, minHeight: 60 }}>{spans}</div>;
          })}
          {typeP < 1 && <span style={{ display: "inline-block", width: 14, height: 44, background: C.yellow, opacity: Math.floor(t * 3) % 2, marginLeft: 4, verticalAlign: "bottom" }} />}
        </div>
      </div>

      {/* decision */}
      <div
        style={{
          position: "absolute", left: BX - 30, top: 220, width: 660, height: 560, boxSizing: "border-box", padding: "34px 40px", borderRadius: 30,
          background: "linear-gradient(180deg, rgba(27,29,37,0.97), rgba(20,21,27,0.97))", border: "1.5px solid " + (approved > 0.5 ? C.green : C.line), boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          opacity: cardB, transform: "translateY(" + (1 - cardB) * 50 + "px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width={64} height={64} viewBox="0 0 64 64">
            <circle cx={32} cy={32} r={30} fill="#262933" />
            <circle cx={32} cy={24} r={11} fill="#cfd1da" />
            <path d="M10 56 Q32 28 54 56 Z" fill="#cfd1da" />
          </svg>
          <div>
            <Mono size={22} color={C.green}>Decision</Mono>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 36, marginTop: 4 }}>The facility manager</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 30, marginTop: 90, marginLeft: -4 }}>
          <div
            style={{
              width: 280, height: 112, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: HEAD, fontWeight: 800, fontSize: 44,
              background: approved > 0.5 ? C.green : "transparent", color: approved > 0.5 ? "#06210f" : C.green, border: "4px solid " + C.green,
              transform: "scale(" + (1 + 0.05 * hoverApprove + 0.06 * approved * (1 - approved)) + ")", boxShadow: hoverApprove || approved > 0.5 ? "0 0 40px rgba(61,220,151,0.35)" : "none",
            }}
          >
            {approved > 0.5 ? "✓ Approved" : "Approve"}
          </div>
          <div
            style={{
              width: 280, height: 112, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: HEAD, fontWeight: 800, fontSize: 44,
              color: C.red, border: "4px solid " + C.red, opacity: approved > 0.5 ? 0.3 : 1, transform: "scale(" + (1 + 0.05 * hoverReject) + ")",
              boxShadow: hoverReject ? "0 0 40px rgba(255,71,87,0.35)" : "none",
            }}
          >
            Reject
          </div>
        </div>
        {ripple > 0 && ripple < 1 && (
          <div style={{ position: "absolute", left: 90 + 140 - 20, top: 170 + 56 + 90 - 20 + 0, width: 40, height: 40, borderRadius: 40, border: "4px solid " + C.green, opacity: 1 - ripple, transform: "scale(" + (1 + ripple * 6) + ")" }} />
        )}
        <div style={{ marginTop: 56, opacity: approved, transform: "translateY(" + (1 - approved) * 20 + "px)", fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: 2, color: C.mute }}>
          RECORDED · EXPORT AS CSV
        </div>
      </div>
      {t > tApproves - 0.6 && <Cursor x={px} y={py} press={press} />}

      {/* only recommends */}
      <div style={{ position: "absolute", left: 96, top: 850, display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ opacity: bannerA, transform: "translateY(" + (1 - bannerA) * 40 + "px)", display: "flex", alignItems: "center", gap: 18, background: "rgba(24,26,33,0.97)", border: "2px solid " + C.yellow, borderRadius: 24, padding: "20px 34px" }}>
          <svg width={52} height={60} viewBox="0 0 52 60">
            <path d="M26 3 L48 12 V30 C48 44 38 54 26 58 C14 54 4 44 4 30 V12 Z" fill="none" stroke={C.yellow} strokeWidth={5} />
            <path d="M15 30 L23 38 L38 21" fill="none" stroke={C.yellow} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 46 }}>GridFlex only <span style={{ color: C.yellow }}>recommends</span></div>
        </div>
        <div style={{ opacity: bannerB, transform: "translateY(" + (1 - bannerB) * 40 + "px)", display: "flex", alignItems: "center", gap: 18, background: "rgba(24,26,33,0.97)", border: "2px solid " + C.line, borderRadius: 24, padding: "20px 34px" }}>
          {/* switch that stays off */}
          <div style={{ width: 96, height: 52, borderRadius: 26, background: switchOff > 0.5 ? "#2a2d38" : C.yellow, position: "relative", border: "3px solid #3b3e4a" }}>
            <div style={{ position: "absolute", top: 5, left: 5 + (1 - switchOff) * 44, width: 36, height: 36, borderRadius: 18, background: "#cfd1da" }} />
          </div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 46 }}>Nothing switches <span style={{ color: C.mute }}>automatically</span></div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 96, top: 1010, fontFamily: MONO, fontSize: 19, letterSpacing: 3, color: "#7d808c", textTransform: "uppercase", opacity: bannerA }}>
        Recommendation only · not a grid-operator approval · illustrative, synthetic data
      </div>
    </AbsoluteFill>
  );
};
