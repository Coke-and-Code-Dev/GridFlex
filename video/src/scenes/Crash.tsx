import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, easeInOut, easeOut, fmtClock, map, prog, useT } from "../anim";
import { arrivalPose, bayX } from "../geom";
import { Depot, idleTrucks, type TruckView } from "../components/Depot";
import { Brand, ChartCard, ClockCard, Disclaimer, PowerCard, SIDEBAR } from "../components/Hud";
import { Camera, Shake } from "../components/Scene";
import { CHARGER_KW, LIMIT, N_TRUCKS, baseAtHour } from "../sim";
import { SCENES, findWord } from "../timeline";

const S = SCENES.crash;

// Key moments, taken from the narration timings (scene-local seconds).
const T_ARRIVE = findWord(S, "They") - 0.35; // trucks start rolling in
const ARRIVE_DUR = 2.0;
const STAGGER = 0.11;
const T_BLOW = findWord(S, "blows") + 0.02;
export const CRASH_T = { arrive: T_ARRIVE, blow: T_BLOW };

const PLUG_DUR = 0.28;
const RAMP = 2.5; // soft start of the chargers
const parkT = (i: number) => T_ARRIVE + (N_TRUCKS - 1 - i) * STAGGER + ARRIVE_DUR;
const plugStart = (i: number) => parkT(i) + 0.1;
const plugEnd = (i: number) => plugStart(i) + PLUG_DUR;

const hourAt = (t: number) => (t <= 0.8 ? 17.3 : t <= 7.0 ? map(t, 0.8, 7.0, 17.3, 18.0) : 18.0 + (t - 7.0) * 0.011);
const tAtHour = (h: number) => (h < 18 ? 0.8 + ((h - 17.3) / 0.7) * 6.2 : 7.0 + (h - 18.0) / 0.011);

const powerAt = (t: number) => {
  if (t >= T_BLOW) return 0;
  let kw = baseAtHour(18);
  for (let i = 0; i < N_TRUCKS; i++) kw += CHARGER_KW * easeInOut(prog(t, plugEnd(i), RAMP, (n) => n));
  return kw;
};

export const Crash: React.FC = () => {
  const { t } = useT();
  const hour = hourAt(t);
  const kw = powerAt(t);
  const blown = t >= T_BLOW;
  const sinceBlow = t - T_BLOW;

  const overload = blown ? 0 : clamp((kw - LIMIT) / 30, 0, 1) * (kw > LIMIT ? 1 : 0);
  const warn = !blown && kw > LIMIT;
  // lights flicker out after the blow
  const flicker = [1, 0.2, 0.9, 0.35, 1, 0.7, 1];
  const lightsOut = !blown ? 0 : sinceBlow < 0.5 ? flicker[Math.floor(sinceBlow / 0.075)] ?? 1 : 1;

  const trucks: TruckView[] = idleTrucks().map((v, i) => {
    const start = T_ARRIVE + (N_TRUCKS - 1 - i) * STAGGER;
    const p = (t - start) / ARRIVE_DUR;
    if (p <= 0) return v;
    const plug = prog(t, plugStart(i), PLUG_DUR, (n) => n);
    const charging = t >= plugEnd(i) && !blown;
    return {
      ...v,
      visible: true,
      pose: arrivalPose(i, p),
      mode: charging ? "charging" : "waiting",
      soc: clamp((t - plugEnd(i)) * 0.012, 0, 0.2),
      headlights: p < 1,
      brake: p > 0.82 && p < 1.02,
      plug: blown ? plug : plug,
    };
  });

  // camera: slow push in, harder punch on the blow
  const push = map(t, 0, 12, 1.0, 1.07, easeInOut);
  const punch = blown ? 0.06 * Math.exp(-sinceBlow * 5) : 0;
  const shakeAmp = blown ? 14 * Math.exp(-sinceBlow * 4) : warn ? 1.2 + 6 * overload * overload : 0;

  // HUD
  const hudIn = prog(t, 1.0, 0.9, easeOut);
  const hudDim = blown ? 1 - 0.7 * prog(t, T_BLOW + 0.3, 0.6) : 1;

  // callout on the connection limit
  const limitCallout = prog(t, 0.9, 0.6) * (1 - prog(t, 3.9, 0.5));
  const tripText = prog(t, T_BLOW + 0.9, 0.8);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Shake amp={shakeAmp}>
        <Camera zoom={push + punch} cx={760} cy={430}>
          <Depot
            t={t}
            hour={hour}
            trucks={trucks}
            lightsOut={lightsOut}
            overload={overload}
            sparkT={blown ? sinceBlow : null}
            fuseRing={limitCallout > 0.01 ? prog(t, 0.9, 3.0, (n) => n) : 0}
          />
        </Camera>
      </Shake>

      <Brand label="Ten trucks · one connection" x={96} y={62} />
      <Disclaimer />

      {/* "100 kW connection" callout */}
      <div style={{ position: "absolute", left: 300, top: 400, opacity: limitCallout, transform: "translateY(" + (1 - limitCallout) * 14 + "px)" }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 56, color: C.text, letterSpacing: -1, textShadow: "0 4px 24px rgba(0,0,0,0.8)" }}>
          100 kW <span style={{ color: C.yellow }}>connection limit</span>
        </div>
      </div>

      {/* sidebar */}
      <div style={{ opacity: hudIn * hudDim, transform: "translateX(" + (1 - hudIn) * 90 + "px)" }}>
        <ClockCard hour={hour} />
        <PowerCard kw={kw} baseKw={baseAtHour(18)} status={blown ? "TRIPPED" : undefined} />
        <ChartCard
          y={592}
          h={448}
          nowH={blown ? hourAt(T_BLOW) : hour}
          startH={17.3}
          endH={18.3}
          tickEvery={0.25}
          series={(h) => powerAt(tAtHour(h))}
          title="Load · charge on arrival"
          ticks={[17.5, 18.0, 18.25]}
          tickFmt={(h) => fmtClock(h)}
        />
      </div>

      {/* blackout message */}
      {blown && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: tripText }}>
          <div style={{ textAlign: "center", transform: "translateY(" + (1 - tripText) * 24 + "px)" }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 8, color: C.red }}>CONNECTION OVERLOADED</div>
            <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 168, color: C.text, letterSpacing: -4, lineHeight: 1.05 }}>
              178 kW <span style={{ color: C.mute, fontWeight: 700 }}>on</span> 100
            </div>
          </div>
        </AbsoluteFill>
      )}
      <SfxCrash />
    </AbsoluteFill>
  );
};

const SfxCrash: React.FC = () => null;
export { SIDEBAR, bayX };
