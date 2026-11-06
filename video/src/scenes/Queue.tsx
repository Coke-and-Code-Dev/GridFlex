import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { easeBack, easeInOut, easeOut, prog, useT } from "../anim";
import { Brand } from "../components/Hud";
import { SectionTag } from "../components/Scene";
import { Backdrop, Mono, Pill, WordReveal } from "../components/Text";
import { SCENES, findWord } from "../timeline";

const S = SCENES.queue;

/** Side-view delivery van. `ev` blends the diesel look into the electric one. */
const Van: React.FC<{ x: number; y: number; ev: number; t: number; scale?: number; seed?: number }> = ({ x, y, ev, t, scale = 1, seed = 0 }) => {
  const body = ev > 0.5 ? C.yellow : "#565a68";
  const puffs = [0, 1, 2].map((k) => {
    const ph = (t * 0.9 + k / 3 + seed * 0.13) % 1;
    return { x: -30 - ph * 70, y: -14 - ph * 36, r: 8 + ph * 16, o: (1 - ph) * 0.4 * (1 - ev) };
  });
  return (
    <g transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      {puffs.map((p, k) => (
        <circle key={k} cx={p.x} cy={p.y} r={p.r} fill="#9a9dab" opacity={p.o} />
      ))}
      <ellipse cx={100} cy={72} rx={120} ry={12} fill="#000" opacity={0.35} />
      {/* body */}
      <path d="M0 -62 H128 L158 -26 H198 Q210 -26 210 -14 V44 H0 Z" fill={body} />
      <path d="M134 -52 L156 -30 H182 V-8 H134 Z" fill="#1c2430" opacity={0.92} />
      <rect x={14} y={-46} width={104} height={16} rx={4} fill="rgba(0,0,0,0.14)" />
      {/* ev bolt */}
      <g opacity={ev}>
        <path d="M70 -34 L48 -2 H66 L58 26 L92 -12 H72 L82 -34 Z" fill="#14151b" />
      </g>
      <g opacity={1 - ev}>
        <text x={62} y={16} fontFamily={MONO} fontWeight={700} fontSize={26} fill="#2a2d37" letterSpacing={3}>DIESEL</text>
      </g>
      {/* wheels */}
      {[44, 160].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={46} r={22} fill="#0d0e12" />
          <circle cx={cx} cy={46} r={10} fill="#8d909c" />
        </g>
      ))}
    </g>
  );
};

const Barrier: React.FC<{ x: number; y: number; p: number }> = ({ x, y, p }) => (
  <g transform={"translate(" + x + " " + (y - (1 - p) * 220) + ")"} opacity={p}>
    <rect x={-18} y={0} width={36} height={170} rx={10} fill="#2a2d37" />
    <rect x={-190} y={-14} width={380} height={52} rx={12} fill="#fff" />
    {Array.from({ length: 8 }, (_, i) => (
      <polygon key={i} points={[(-190 + i * 48) + ",-14", (-190 + i * 48 + 24) + ",-14", (-190 + i * 48 + 48) + ",38", (-190 + i * 48 + 24) + ",38"].join(" ")} fill={C.red} />
    ))}
    <rect x={-190} y={-14} width={380} height={52} rx={12} fill="none" stroke="#14151b" strokeWidth={4} />
  </g>
);

export const Queue: React.FC = () => {
  const { t } = useT();
  const tBigger = findWord(S, "bigger");
  const tConn = findWord(S, "connection");
  const tAms = findWord(S, "Amsterdam") - 0.2;
  const tTwentyNine = findWord(S, "eighty-seven");
  const tRelief = findWord(S, "relief");
  const t2032 = findWord(S, "twenty-seven") - 0.5;
  const tMeanwhile = findWord(S, "Meanwhile") - 0.2;
  const tGo = findWord(S, "go");
  const tElectric = findWord(S, "electric");

  // ---- beat A: no bigger connection ----
  const aOut = prog(t, tAms - 0.1, 0.6, easeInOut);
  const aIn = prog(t, 0.1, 0.8, easeOut);
  const ghost = prog(t, tBigger - 0.1, 0.7, easeOut);
  const stamp = prog(t, tConn + 0.25, 0.35, easeBack);
  const stampShake = t > tConn + 0.25 && t < tConn + 0.7 ? Math.sin(t * 90) * 8 * (1 - (t - tConn - 0.25) / 0.45) : 0;
  const ghostFade = 1 - 0.7 * prog(t, tConn + 0.3, 0.4);

  // ---- beat B: 1021 EG, Amsterdam (capacity map, export 5 Nov 2026) ----
  const bIn = prog(t, tAms, 0.8, easeOut);
  const bOut = prog(t, tMeanwhile - 0.1, 0.6, easeInOut);
  const tokensP = prog(t, tTwentyNine, 1.2, (n) => n);
  const nTokens = Math.round(87 * tokensP);
  const sweep = prog(t, tRelief, t2032 - tRelief + 0.6, easeInOut);
  const reliefLabel = prog(t, t2032 + 0.3, 0.6, easeBack);
  const sweepPos = sweep * 0.25; // relief 2027 sits one year into a 2026-2030 axis

  // ---- beat C: fleets electrify, then wait ----
  const cIn = prog(t, tMeanwhile, 0.8, easeOut);
  const nVans = 6;
  const barrierP = prog(t, tElectric + 0.6, 0.6, easeBack);
  const vanLayout = Array.from({ length: nVans }, (_, i) => {
    const flipAt = tGo - 0.2 + i * 0.26;
    const ev = prog(t, flipAt, 0.35, (n) => n);
    const drive = prog(t, tElectric + 0.15 + i * 0.05, 1.6, easeOut);
    const x0 = 140 + i * 270;
    const xEnd = 1190 - (nVans - 1 - i) * 232;
    return { i, ev, x: x0 + (xEnd - x0) * drive, ring: prog(t, flipAt, 0.6, easeOut) };
  });

  const pylonGlow = 0.6 + 0.4 * Math.sin(t * 4);

  return (
    <AbsoluteFill>
      <Backdrop glow="rgba(255,230,0,0.05)" glowX={50} glowY={55} />
      <Brand x={96} y={62} />
      <SectionTag n="01" label="The problem" y={134} />

      {/* ===== beat A ===== */}
      <div style={{ position: "absolute", inset: 0, opacity: aIn * (1 - aOut), transform: "translateX(" + -aOut * 140 + "px)" }}>
        <div style={{ position: "absolute", left: 96, top: 230 }}>
          <WordReveal
            t={t}
            size={118}
            words={[
              { text: "No", at: findWord(S, "no") },
              { text: "bigger", at: tBigger, color: C.yellow },
              { text: "connection.", at: tConn, color: C.yellow },
            ]}
          />
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {/* pylon */}
          <g transform="translate(250 700)">
            <circle cx={0} cy={-40} r={150} fill={C.yellow} opacity={0.06 * pylonGlow} />
            <path d="M-70 120 L0 -150 L70 120 M-44 40 H44 M-24 -40 H24 M-90 -80 H90 M-60 -110 L60 -110" stroke="#cfd1da" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M-70 120 L24 -40 M70 120 L-24 -40 M-44 40 L24 -40 M44 40 L-24 -40" stroke="#8d909c" strokeWidth={4} fill="none" />
            <text x={0} y={190} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.mute} letterSpacing={4}>GRID</text>
          </g>
          {/* depot */}
          <g transform="translate(1560 700)">
            <rect x={-170} y={-100} width={340} height={210} rx={18} fill="#20222b" stroke="#3b3e4a" strokeWidth={3} />
            <rect x={-170} y={-100} width={340} height={46} rx={18} fill="#2a2d38" />
            {[-110, -30, 50].map((dx) => (
              <rect key={dx} x={dx} y={-20} width={70} height={130} rx={8} fill="#171920" stroke="#3b3e4a" strokeWidth={3} />
            ))}
            <path d="M126 -92 L104 -64 H120 L112 -40 L146 -72 H130 L138 -92 Z" fill={C.yellow} />
            <text x={0} y={190} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={C.mute} letterSpacing={4}>YOUR DEPOT</text>
          </g>
          {/* cable */}
          <g>
            <rect x={340} y={684} width={1060} height={30} rx={15} fill="#272a33" />
            <rect x={340} y={684} width={1060 * aIn} height={30} rx={15} fill={C.yellow} opacity={0.95} />
            {Array.from({ length: 14 }, (_, i) => {
              const px = 340 + ((i * 80 + t * 220) % 1060);
              return <rect key={i} x={px} y={690} width={34} height={18} rx={9} fill="#fff" opacity={0.7 * aIn} />;
            })}
          </g>
          {/* ghost "bigger" cable */}
          <g opacity={ghost * ghostFade}>
            <rect x={340} y={640} width={1060} height={118} rx={59} fill="none" stroke={C.red} strokeWidth={5} strokeDasharray="18 14" />
            <text x={870} y={618} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={26} fill={C.red} letterSpacing={4}>BIGGER CONNECTION</text>
          </g>
        </svg>
        {/* 100 kW tag on the cable */}
        <div style={{ position: "absolute", left: 870 - 160, top: 703 - 52, width: 320, textAlign: "center", opacity: aIn }}>
          <div style={{ display: "inline-block", whiteSpace: "nowrap", background: "#14151b", border: "3px solid " + C.yellow, color: C.yellow, fontFamily: MONO, fontWeight: 700, fontSize: 54, padding: "6px 26px", borderRadius: 16 }}>100 kW</div>
        </div>
        {/* denied stamp */}
        <div
          style={{
            position: "absolute", left: 640 + stampShake, top: 800, opacity: stamp, transform: "rotate(-5deg) scale(" + (1.5 - 0.5 * stamp) + ")",
            border: "8px solid " + C.red, color: C.red, fontFamily: HEAD, fontWeight: 900, fontSize: 84, letterSpacing: 6, padding: "6px 34px", borderRadius: 14, background: "rgba(20,21,27,0.8)",
          }}
        >
          NOT AVAILABLE
        </div>
      </div>

      {/* ===== beat B ===== */}
      <div style={{ position: "absolute", inset: 0, opacity: bIn * (1 - bOut), transform: "translateX(" + (1 - bIn) * 160 + "px) translateY(" + -bOut * 90 + "px)" }}>
        <div
          style={{
            position: "absolute", left: 200, top: 215, width: 1520, height: 700, borderRadius: 32, boxSizing: "border-box", padding: "44px 56px",
            background: "linear-gradient(180deg, rgba(27,29,37,0.97), rgba(20,21,27,0.97))", border: "1.5px solid " + C.line, boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            borderLeft: "10px solid " + C.red,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 64, letterSpacing: -1 }}>Amsterdam <span style={{ color: C.mute, fontWeight: 600 }}>· Liander</span></div>
            <Pill bg={C.red} size={28}>Red for new demand</Pill>
          </div>
          <div style={{ display: "flex", gap: 60, marginTop: 40 }}>
            {/* queue */}
            <div style={{ width: 640 }}>
              <Mono size={22}>Requests waiting</Mono>
              <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 4 }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 210, lineHeight: 1, letterSpacing: -8, color: C.text }}>{nTokens}</div>
                <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 40, color: C.mute }}>27.2 MW<br />waiting</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 22, width: 620 }}>
                {Array.from({ length: 87 }, (_, i) => {
                  const on = i < nTokens;
                  return <div key={i} style={{ width: 22, height: 22, borderRadius: 6, background: on ? C.yellow : "#262933", transform: "scale(" + (on ? 1 : 0.7) + ")", opacity: on ? 1 : 0.6 }} />;
                })}
              </div>
            </div>
            {/* timeline */}
            <div style={{ flex: 1, paddingTop: 12 }}>
              <Mono size={22}>Expected relief for this supply area</Mono>
              <div style={{ position: "relative", height: 280, marginTop: 28 }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 130, height: 12, borderRadius: 6, background: "#262933" }} />
                <div style={{ position: "absolute", left: 0, top: 130, height: 12, borderRadius: 6, width: sweepPos * 100 + "%", background: "linear-gradient(90deg," + C.red + "," + C.yellow + ")" }} />
                {[2026, 2027, 2028, 2029, 2030].map((y, i) => (
                  <div key={y} style={{ position: "absolute", left: (i / 4) * 100 + "%", top: 164, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 26, fontWeight: 700, color: i / 4 <= sweepPos + 0.001 ? C.text : "#5b5e6a" }}>{y}</div>
                ))}
                <div style={{ position: "absolute", left: sweepPos * 100 + "%", top: 108, transform: "translateX(-50%)", width: 56, height: 56, borderRadius: 28, background: C.text, boxShadow: "0 0 30px rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>⏳</div>
                <div style={{ position: "absolute", right: 0, top: 0, textAlign: "right", opacity: reliefLabel, transform: "scale(" + (0.85 + 0.15 * reliefLabel) + ")", transformOrigin: "right top" }}>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 150, lineHeight: 1, letterSpacing: -6, color: C.yellow }}>2027</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ position: "absolute", left: 56, bottom: 26, fontFamily: MONO, fontSize: 18, letterSpacing: 1, color: "#767a87" }}>
            NETBEHEER NEDERLAND CAPACITEITSKAART · EXPORT 5 NOV 2026 · INDICATIVE · CHECK WITH YOUR GRID OPERATOR
          </div>
        </div>
      </div>

      {/* ===== beat C ===== */}
      <div style={{ position: "absolute", inset: 0, opacity: cIn }}>
        <div style={{ position: "absolute", left: 96, top: 230 }}>
          <WordReveal t={t} size={104} words={[{ text: "Every", at: tMeanwhile + 0.2 }, { text: "fleet", at: tMeanwhile + 0.35 }, { text: "must", at: tMeanwhile + 0.5 }, { text: "electrify.", at: tGo, color: C.yellow }]} />
          <div style={{ marginTop: 18, opacity: prog(t, tElectric + 0.7, 0.6), transform: "translateY(" + (1 - prog(t, tElectric + 0.7, 0.6)) * 26 + "px)" }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 64, color: C.red }}>The grid isn&apos;t ready.</div>
          </div>
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <rect x={0} y={760} width={1920} height={150} fill="#101116" />
          <line x1={0} x2={1920} y1={835} y2={835} stroke="rgba(255,230,0,0.3)" strokeWidth={4} strokeDasharray="40 34" />
          {vanLayout.map((v) => (
            <g key={v.i}>
              {v.ring > 0 && v.ring < 1 && <circle cx={v.x + 105} cy={730} r={40 + 160 * v.ring} fill="none" stroke={C.yellow} strokeWidth={5} opacity={1 - v.ring} />}
              <Van x={v.x} y={720} ev={v.ev} t={t} seed={v.i} />
            </g>
          ))}
          <Barrier x={1560} y={640} p={barrierP} />
          <g opacity={barrierP}>
            <text x={1560} y={900} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={26} letterSpacing={4} fill={C.red}>WAITING FOR GRID CAPACITY</text>
          </g>
        </svg>
      </div>
    </AbsoluteFill>
  );
};
