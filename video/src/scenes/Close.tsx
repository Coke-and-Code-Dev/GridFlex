import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { easeBack, easeInOut, easeOut, prog, useT } from "../anim";
import { Brand } from "../components/Hud";
import { Backdrop, Mono, WordReveal } from "../components/Text";
import { SCENES, findWord } from "../timeline";

const S = SCENES.close;
const N = 6;

const Depot: React.FC<{ x: number; y: number; on: number; enter: number; i: number; t: number }> = ({ x, y, on, enter, i, t }) => {
  const lit = on > 0.5;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
  return (
    <g transform={"translate(" + x + " " + (y + (1 - enter) * 80) + ")"} opacity={enter}>
      {/* queue tag */}
      <g transform="translate(0 -22)">
        <rect x={-112} y={-62} width={224} height={50} rx={25} fill={lit ? C.green : C.red} />
        <text x={0} y={-27} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={lit ? "#06210f" : "#fff"} letterSpacing={1}>
          {lit ? "✓ CHARGING" : "WAITING #" + (i + 1)}
        </text>
      </g>
      {/* building */}
      <rect x={-112} y={0} width={224} height={150} rx={16} fill={lit ? "#3a3510" : "#20222b"} stroke={lit ? C.yellow : "#3b3e4a"} strokeWidth={lit ? 4 : 3} />
      <rect x={-112} y={0} width={224} height={38} rx={16} fill={lit ? "#4a4414" : "#2a2d38"} />
      {[-76, -22, 32].map((dx) => (
        <rect key={dx} x={dx} y={62} width={44} height={88} rx={6} fill={lit ? C.yellow : "#171920"} opacity={lit ? 0.35 + 0.35 * pulse : 1} />
      ))}
      {lit && <path d="M6 -2 L-12 22 H2 L-4 40 L20 12 H6 L14 -2 Z" fill={C.yellow} transform="translate(0 -6) scale(0.9)" />}
      {/* trucks outside */}
      {[-60, 0, 60].map((dx, k) => (
        <g key={dx} transform={"translate(" + dx + " 184)"}>
          <rect x={-22} y={0} width={44} height={86} rx={9} fill={lit ? C.yellow : "#565a68"} />
          <rect x={-18} y={0} width={36} height={24} rx={8} fill="#1c2430" opacity={0.85} />
          {lit && <path d="M3 34 L-9 54 H0 L-4 72 L10 50 H1 L7 34 Z" fill="#14151b" />}
          {lit && <rect x={-26} y={-6} width={52} height={98} rx={12} fill="none" stroke={C.yellow} strokeWidth={3} opacity={0.35 + 0.4 * ((pulse + k * 0.3) % 1)} />}
        </g>
      ))}
    </g>
  );
};

const IconPlan = () => (
  <svg width={110} height={110} viewBox="0 0 110 110">
    {[0, 1, 2, 3].map((r) => (
      <rect key={r} x={10 + r * 14} y={12 + r * 24} width={52 + (r % 2) * 20} height={16} rx={6} fill={C.yellow} opacity={0.55 + 0.15 * r} />
    ))}
  </svg>
);
const IconStress = () => (
  <svg width={110} height={110} viewBox="0 0 110 110">
    {[0, 1, 2, 3, 4].map((k) => (
      <path key={k} d={"M8 " + (78 - k * 4) + " Q35 " + (34 + k * 6) + " 55 " + (58 - k * 3) + " T102 " + (46 + k * 4)} fill="none" stroke="#fff" strokeWidth={3} opacity={0.35} />
    ))}
    <path d="M8 74 Q35 38 55 58 T102 46" fill="none" stroke={C.yellow} strokeWidth={7} strokeLinecap="round" />
    <line x1={4} x2={106} y1={30} y2={30} stroke={C.red} strokeWidth={4} strokeDasharray="8 6" />
  </svg>
);
const IconExplain = () => (
  <svg width={110} height={110} viewBox="0 0 110 110">
    <path d="M12 16 H98 Q104 16 104 22 V70 Q104 76 98 76 H48 L26 96 V76 H12 Q6 76 6 70 V22 Q6 16 12 16 Z" fill={C.yellow} />
    {[0, 1, 2].map((k) => (
      <rect key={k} x={22} y={30 + k * 14} width={k === 2 ? 38 : 66} height={7} rx={3.5} fill="#14151b" />
    ))}
  </svg>
);

export const Close: React.FC = () => {
  const { t } = useT();
  const tStuck = findWord(S, "stuck");
  const tCannot = findWord(S, "cannot");
  const tLets = findWord(S, "lets");
  const tPlan = findWord(S, "Plan");
  const tStress = findWord(S, "Stress-test");
  const tExplain = findWord(S, "Explain");

  const beat1 = 1 - prog(t, tPlan - 0.5, 0.6, easeInOut);
  const lock = prog(t, tExplain + 1.3, 0.9, easeOut);
  const words3 = 1 - prog(t, tExplain + 1.0, 0.6, easeInOut);

  const depots = Array.from({ length: N }, (_, i) => {
    const enter = prog(t, 0.5 + i * 0.12, 0.7, easeOut);
    const on = prog(t, tLets + 0.3 + i * 0.3, 0.3, (n) => n);
    return { i, enter, on };
  });
  const switched = depots.filter((d) => d.on > 0.5).length;

  const headline1 = t < tLets - 0.3;

  return (
    <AbsoluteFill>
      <Backdrop glow="rgba(255,230,0,0.07)" glowX={50} glowY={50} />
      <Brand x={96} y={62} />

      {/* beat 1 + 2: the queue lights up */}
      <div style={{ position: "absolute", inset: 0, opacity: beat1, transform: "scale(" + (1 - 0.06 * (1 - beat1)) + ")" }}>
        <div style={{ position: "absolute", left: 96, top: 170 }}>
          {headline1 ? (
            <>
              <WordReveal t={t} size={104} words={[{ text: "Every", at: S.words[0].start }, { text: "depot", at: S.words[1].start }, { text: "stuck", at: tStuck }, { text: "in", at: S.words[3].start }, { text: "the", at: S.words[4].start }, { text: "queue.", at: findWord(S, "queue") }]} />
              <WordReveal t={t} size={104} style={{ marginTop: 2 }} words={[{ text: "A fleet", at: S.words[6].start, color: C.red }, { text: "that", at: findWord(S, "that") }, { text: "cannot", at: tCannot, color: C.red }, { text: "go electric.", at: findWord(S, "go"), color: C.red }]} />
            </>
          ) : (
            <>
              <WordReveal t={t} size={104} key="h2a" words={[{ text: "Same", at: tLets - 0.2 }, { text: "connection.", at: tLets }]} />
              <WordReveal t={t} size={104} key="h2b" style={{ marginTop: 2 }} words={[{ text: "More", at: findWord(S, "more"), color: C.yellow }, { text: "trucks.", at: findWord(S, "trucks"), color: C.yellow }]} />
            </>
          )}
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {depots.map((d) => (
            <Depot key={d.i} x={200 + d.i * 300} y={560} on={d.on} enter={d.enter} i={d.i} t={t} />
          ))}
        </svg>
        <div style={{ position: "absolute", left: 96, top: 940, opacity: prog(t, tLets + 0.3, 0.5) }}>
          <Mono size={24} spacing={3} color={C.yellow}>{switched} of {N} depots charging · same grid connection</Mono>
        </div>
      </div>

      {/* beat 3: plan / stress-test / explain */}
      <div style={{ position: "absolute", inset: 0, opacity: words3 * prog(t, tPlan - 0.5, 0.4) }}>
        {[
          { w: "Plan.", at: tPlan, icon: <IconPlan />, sub: "a timetable for every truck" },
          { w: "Stress-test.", at: tStress, icon: <IconStress />, sub: "on 100 realistic days" },
          { w: "Explain.", at: tExplain, icon: <IconExplain />, sub: "in plain language" },
        ].map((c, i) => {
          const p = prog(t, c.at - 0.1, 0.55, easeBack);
          const line = prog(t, c.at + 0.2, 0.6, easeOut);
          return (
            <div key={c.w} style={{ position: "absolute", left: 80 + i * 600, top: 330, width: 560, textAlign: "center", opacity: p, transform: "translateY(" + (1 - p) * 80 + "px) scale(" + (0.8 + 0.2 * p) + ")" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>{c.icon}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 112, letterSpacing: -3, color: C.text, marginTop: 18, lineHeight: 1 }}>{c.w}</div>
              <div style={{ height: 8, width: 380 * line, background: C.yellow, borderRadius: 4, margin: "20px auto 0" }} />
              <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 26, color: C.mute, marginTop: 20, letterSpacing: 1 }}>{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* beat 4: lockup */}
      <div style={{ position: "absolute", inset: 0, opacity: lock }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(800px 560px at 50% 38%, rgba(255,230,0,0.14), transparent 70%)" }} />
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 120 }}>
          <Img src={staticFile("gridflex-mark-hd.png")} style={{ height: 230, width: "auto", transform: "scale(" + (0.85 + 0.15 * lock) + ")" }} />
          <div style={{ marginTop: 14, fontFamily: HEAD, fontWeight: 900, fontSize: 150, letterSpacing: -4 }}>
            GridFlex<span style={{ color: C.yellow }}>.ai</span>
          </div>
          <div style={{ marginTop: 26, fontFamily: HEAD, fontWeight: 800, fontSize: 62, textAlign: "center", lineHeight: 1.12, transform: "translateY(" + (1 - lock) * 24 + "px)" }}>
            Charge more trucks on the connection<br />you <span style={{ color: C.yellow }}>already have.</span>
          </div>
          <div style={{ marginTop: 46, textAlign: "center", opacity: prog(t, tExplain + 2.2, 0.8) }}>
            <Mono size={22} spacing={3} color="#b9bcc9">EY AI Week Hackathon · Amsterdam · November 2026</Mono>
            <div style={{ fontFamily: MONO, fontSize: 18, color: "#767a87", marginTop: 14, letterSpacing: 1 }}>
              Synthetic data and simulation · recommendation only, not a grid-operator approval
            </div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: "#767a87", marginTop: 8, letterSpacing: 1 }}>
              Data: GLASS (CDLA-Permissive-2.0) · Netbeheer Nederland capaciteitskaart · Liander open data
            </div>
          </div>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
