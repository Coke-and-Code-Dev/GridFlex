import React, { useId } from "react";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { lerp, map, rng } from "../anim";
import { BAY_COUNT, CHARGER_Y, DEPART_LANE_Y, LANE_Y, NOSE_Y, PARK_Y, TRUCK_L, TRUCK_W, bayX, type Pose } from "../geom";
import { Truck, TruckDefs, type TruckMode } from "./Truck";

export type TruckView = {
  visible: boolean;
  pose: Pose;
  soc: number;
  mode: TruckMode;
  label: string;
  headlights: boolean;
  brake: boolean;
  plug: number; // cable connection progress 0..1
};

export type DepotProps = {
  t: number;
  hour: number; // simulated hour, for the sky tint (17..31)
  trucks: TruckView[];
  lightsOut?: number; // 0..1
  overload?: number; // 0..1
  sparkT?: number | null; // seconds since the fuse burst
  fuseRing?: number; // 0..1 highlight ring around the grid connection
  showSign?: boolean;
};

type RGBA = [number, number, number, number];
const AMBIENT: [number, RGBA][] = [
  [17.0, [255, 150, 70, 0.1]],
  [18.0, [255, 120, 60, 0.12]],
  [18.9, [70, 60, 130, 0.3]],
  [20.2, [10, 20, 62, 0.44]],
  [24.0, [6, 12, 46, 0.52]],
  [28.0, [6, 14, 50, 0.5]],
  [29.6, [30, 52, 104, 0.4]],
  [30.4, [255, 150, 80, 0.2]],
  [31.0, [255, 195, 105, 0.08]],
];
const ambientAt = (h: number): RGBA => {
  if (h <= AMBIENT[0][0]) return AMBIENT[0][1];
  for (let i = 1; i < AMBIENT.length; i++) {
    if (h <= AMBIENT[i][0]) {
      const [h0, a] = AMBIENT[i - 1];
      const [h1, b] = AMBIENT[i];
      const p = (h - h0) / (h1 - h0);
      return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)];
    }
  }
  return AMBIENT[AMBIENT.length - 1][1];
};
/** 0 = daylight, 1 = full night, used for lamps and headlights. */
export const nightness = (h: number) => {
  if (h < 17.5) return 0.15;
  if (h < 19.2) return map(h, 17.5, 19.2, 0.15, 1);
  if (h < 29.6) return 1;
  return map(h, 29.6, 30.9, 1, 0.05);
};

const FUSE = { x: 1170, y: 150 };

const Sparks: React.FC<{ sparkT: number }> = ({ sparkT }) => {
  const r = rng(77);
  const parts = Array.from({ length: 46 }, () => ({
    a: Math.PI * (0.05 + 1.2 * r()) + Math.PI * 0.45,
    v: 220 + r() * 620,
    life: 0.35 + r() * 0.9,
  }));
  return (
    <g>
      {parts.map((p, i) => {
        if (sparkT < 0 || sparkT > p.life) return null;
        const g = 1100;
        const vx = Math.cos(p.a) * p.v;
        const vy = Math.sin(p.a) * p.v;
        const x = FUSE.x + vx * sparkT;
        const y = FUSE.y + vy * sparkT + 0.5 * g * sparkT * sparkT;
        const tp = Math.max(0, sparkT - 0.03);
        const x2 = FUSE.x + vx * tp;
        const y2 = FUSE.y + vy * tp + 0.5 * g * tp * tp;
        const op = 1 - sparkT / p.life;
        return <line key={i} x1={x2} y1={y2} x2={x} y2={y} stroke={i % 3 === 0 ? "#fff" : C.yellow} strokeWidth={3.2} strokeLinecap="round" opacity={op} />;
      })}
    </g>
  );
};

export const Depot: React.FC<DepotProps> = ({ t, hour, trucks, lightsOut = 0, overload = 0, sparkT = null, showSign = true, fuseRing = 0 }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const amb = ambientAt(hour);
  const night = nightness(hour);
  const on = 1 - lightsOut;
  const flick = overload > 0 ? 0.55 + 0.45 * Math.sin(t * 38) * Math.sin(t * 17 + 1) : 0;
  const dawn = map(hour, 29.8, 31, 0, 1);
  const bays = Array.from({ length: BAY_COUNT }, (_, i) => i);
  const tint = "rgba(" + amb[0].toFixed(0) + "," + amb[1].toFixed(0) + "," + amb[2].toFixed(0) + "," + amb[3].toFixed(3) + ")";

  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <TruckDefs uid={uid} />
      <defs>
        <linearGradient id={uid + "gGround"} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#181a21" />
          <stop offset="1" stopColor="#101116" />
        </linearGradient>
        <linearGradient id={uid + "gRoof"} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#262933" />
          <stop offset="1" stopColor="#1a1c24" />
        </linearGradient>
        <radialGradient id={uid + "gLamp"}>
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={uid + "gCharge"}>
          <stop offset="0" stopColor={C.yellow} stopOpacity="0.5" />
          <stop offset="1" stopColor={C.yellow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={uid + "gRed"}>
          <stop offset="0" stopColor="#ff3347" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff3347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={uid + "gCone"} x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="#fff2b8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff2b8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={uid + "gWall"} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={uid + "gVig"} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={uid + "gDawn"} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffb25a" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#ff9a4a" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ground */}
      <rect x={0} y={0} width={1920} height={1080} fill={"url(#" + uid + "gGround)"} />
      <g opacity={0.5}>
        {Array.from({ length: 28 }, (_, i) => (
          <line key={"gv" + i} x1={i * 70} x2={i * 70} y1={0} y2={1080} stroke="#1f2129" strokeWidth={1} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <line key={"gh" + i} x1={0} x2={1920} y1={i * 70} y2={i * 70} stroke="#1f2129" strokeWidth={1} />
        ))}
      </g>
      {/* apron + road */}
      <rect x={66} y={300} width={1184} height={440} rx={14} fill="#16181e" />
      <rect x={0} y={742} width={1920} height={290} fill="#0f1014" />
      <line x1={0} x2={1920} y1={742} y2={742} stroke="#2a2c35" strokeWidth={3} />
      <line x1={0} x2={1920} y1={1032} y2={1032} stroke="#2a2c35" strokeWidth={3} />
      <line x1={0} x2={1920} y1={(LANE_Y + DEPART_LANE_Y) / 2 + 4} y2={(LANE_Y + DEPART_LANE_Y) / 2 + 4} stroke="rgba(255,230,0,0.35)" strokeWidth={4} strokeDasharray="40 34" />

      {/* building */}
      <rect x={60} y={40} width={1190} height={232} rx={16} fill={"url(#" + uid + "gRoof)"} stroke="#31343f" strokeWidth={2} />
      {Array.from({ length: 18 }, (_, i) => (
        <line key={i} x1={96 + i * 64} x2={96 + i * 64} y1={52} y2={236} stroke="rgba(255,255,255,0.045)" strokeWidth={2} />
      ))}
      {showSign && (
        <text
          x={730} y={166} textAnchor="middle" fontFamily={HEAD} fontWeight={800} fontSize={52} letterSpacing={12}
          fill={C.yellow} opacity={0.18 + 0.78 * on}
          style={{ filter: "drop-shadow(0 0 " + 18 * on + "px rgba(255,230,0,0.55))" }}
        >
          GRIDFLEX DEPOT
        </text>
      )}
      {/* wall windows */}
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={92 + i * 88} y={252} width={56} height={11} rx={4} fill="#ffd98a" opacity={0.12 + 0.88 * on} />
      ))}
      {/* grid connection box */}
      <g transform={"translate(" + (FUSE.x - 56) + " " + (FUSE.y - 46) + ")"}>
        <rect width={112} height={92} rx={12} fill="#232630" stroke={overload > 0 ? C.red : "#3c404c"} strokeWidth={overload > 0 ? 4 : 2} />
        <path d="M60 18 L38 54 H56 L50 76 L76 38 H58 Z" fill={overload > 0 ? C.red : C.yellow} opacity={0.35 + 0.65 * on} />
      </g>
      {fuseRing > 0 && (
        <circle cx={FUSE.x} cy={FUSE.y} r={60 + 50 * ((fuseRing * 3) % 1)} fill="none" stroke={C.yellow} strokeWidth={4} opacity={Math.min(1, fuseRing * 4) * (1 - ((fuseRing * 3) % 1)) * 0.9} />
      )}
      <text x={FUSE.x} y={FUSE.y + 74} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={15} fill={C.mute} letterSpacing={1}>
        GRID CONNECTION
      </text>

      {/* bay lines */}
      {Array.from({ length: BAY_COUNT + 1 }, (_, i) => (
        <line key={i} x1={bayX(0) - 56 + i * 112} x2={bayX(0) - 56 + i * 112} y1={346} y2={650} stroke="rgba(255,230,0,0.22)" strokeWidth={3} />
      ))}

      {/* chargers + cables */}
      {bays.map((i) => {
        const v = trucks[i];
        const bx = bayX(i);
        const live = v.visible && v.plug > 0.98;
        const mode = v.mode;
        const ledColor = overload > 0 && live ? C.red : mode === "charging" ? C.yellow : mode === "done" ? "#ffffff" : "#4a4d5a";
        const cable = "M " + bx + " " + (CHARGER_Y + 22) + " C " + bx + " " + (CHARGER_Y + 62) + ", " + (bx + 24) + " " + (CHARGER_Y + 52) + ", " + (bx + 22) + " " + (NOSE_Y + 12);
        const dash = -((t * 1.1) % 1);
        return (
          <g key={i}>
            <rect x={bx - 17} y={CHARGER_Y - 22} width={34} height={44} rx={9} fill="#2b2e39" stroke="#3c404c" strokeWidth={2} />
            <circle cx={bx} cy={CHARGER_Y - 8} r={6} fill={ledColor} opacity={(mode === "idle" ? 0.5 : 1) * (0.25 + 0.75 * on)} />
            {v.visible && v.plug > 0.001 && (
              <>
                <path d={cable} pathLength={1} fill="none" stroke="#06070a" strokeWidth={8} strokeLinecap="round" strokeDasharray={v.plug + " 1.01"} />
                {live && (mode === "charging" || (overload > 0 && mode !== "idle")) && (
                  <path
                    d={cable} pathLength={1} fill="none" strokeWidth={3.5} strokeLinecap="round"
                    stroke={overload > 0 ? C.red : C.yellow}
                    strokeDasharray="0.05 0.12" strokeDashoffset={dash}
                    opacity={overload > 0 ? 0.5 + 0.5 * flick : 1}
                  />
                )}
                {live && mode !== "charging" && overload === 0 && (
                  <path d={cable} pathLength={1} fill="none" strokeWidth={2} stroke={mode === "done" ? "#fff" : "#555966"} opacity={0.8} />
                )}
              </>
            )}
          </g>
        );
      })}

      {/* charging rings around trucks */}
      {bays.map((i) => {
        const v = trucks[i];
        if (!v.visible) return null;
        const over = overload > 0 && v.plug > 0.98;
        if (!(v.mode === "charging" || over)) return null;
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        return (
          <rect
            key={i}
            x={v.pose.x - TRUCK_W / 2 - 12} y={v.pose.y - TRUCK_L / 2 - 12} width={TRUCK_W + 24} height={TRUCK_L + 24} rx={22}
            fill="none" stroke={over ? C.red : C.yellow} strokeWidth={3.5} opacity={over ? 0.4 + 0.6 * flick : 0.35 + 0.4 * pulse}
          />
        );
      })}

      {/* trucks */}
      {trucks.map((v, i) =>
        v.visible ? (
          <Truck
            key={i} uid={uid} x={v.pose.x} y={v.pose.y} nose={v.pose.nose} soc={v.soc}
            mode={overload > 0 && v.plug > 0.98 ? "over" : v.mode}
            label={v.label} headlights={v.headlights} brake={v.brake} pulse={(t * 1.4 + i * 0.13) % 1}
          />
        ) : null,
      )}

      {/* sky tint */}
      <rect x={0} y={0} width={1920} height={1080} fill={tint} />
      {/* darkness when the lights go out */}
      <rect x={0} y={0} width={1920} height={1080} fill="#02030a" opacity={lightsOut * 0.88} />

      {/* light layer */}
      <g style={{ mixBlendMode: "screen" }}>
        {[220, 640, 1060, 1480].map((x) => (
          <ellipse key={x} cx={x} cy={800} rx={250} ry={150} fill={"url(#" + uid + "gLamp)"} opacity={night * 0.55 * on} />
        ))}
        <rect x={60} y={262} width={1190} height={90} fill={"url(#" + uid + "gWall)"} opacity={on * (0.55 + 0.4 * night)} />
        {bays.map((i) => {
          const v = trucks[i];
          if (!v.visible || v.mode !== "charging") return null;
          return <ellipse key={i} cx={v.pose.x} cy={v.pose.y} rx={120} ry={190} fill={"url(#" + uid + "gCharge)"} opacity={(0.5 + 0.3 * Math.sin(t * 5 + i)) * on} />;
        })}
        {trucks.map((v, i) =>
          v.visible && v.headlights ? (
            <g key={i} transform={"translate(" + v.pose.x + " " + v.pose.y + ") rotate(" + v.pose.nose + ")"} opacity={0.25 + 0.4 * night}>
              <polygon
                points={
                  [-TRUCK_W / 2 + 6, -TRUCK_L / 2].join(",") + " " +
                  [TRUCK_W / 2 - 6, -TRUCK_L / 2].join(",") + " " +
                  [TRUCK_W / 2 + 90, -TRUCK_L / 2 - 330].join(",") + " " +
                  [-TRUCK_W / 2 - 90, -TRUCK_L / 2 - 330].join(",")
                }
                fill={"url(#" + uid + "gCone)"}
              />
            </g>
          ) : null,
        )}
        {trucks.map((v, i) =>
          v.visible && v.brake ? (
            <g key={i} transform={"translate(" + v.pose.x + " " + v.pose.y + ") rotate(" + v.pose.nose + ")"}>
              <ellipse cx={0} cy={TRUCK_L / 2 + 8} rx={52} ry={26} fill={"url(#" + uid + "gRed)"} opacity={0.55} />
            </g>
          ) : null,
        )}
        <rect x={0} y={0} width={1920} height={1080} fill={"url(#" + uid + "gDawn)"} opacity={dawn} />
        {overload > 0 && (
          <>
            <rect x={0} y={0} width={1920} height={1080} fill="#ff2a3c" opacity={0.1 * overload * flick} />
            <ellipse cx={FUSE.x} cy={FUSE.y} rx={260} ry={200} fill={"url(#" + uid + "gRed)"} opacity={overload * (0.5 + 0.5 * flick)} />
          </>
        )}
        {sparkT !== null && sparkT >= 0 && sparkT < 0.12 && (
          <ellipse cx={FUSE.x} cy={FUSE.y} rx={420} ry={320} fill="#fff" opacity={0.85 * (1 - sparkT / 0.12)} />
        )}
        {sparkT !== null && <Sparks sparkT={sparkT} />}
      </g>

      {/* vignette */}
      <rect x={0} y={0} width={1920} height={1080} fill={"url(#" + uid + "gVig)"} />
    </svg>
  );
};

export const idleTrucks = (): TruckView[] =>
  Array.from({ length: BAY_COUNT }, (_, i) => ({
    visible: false,
    pose: { x: bayX(i), y: PARK_Y, nose: 0, p: 1 },
    soc: 0,
    mode: "idle" as TruckMode,
    label: String(i + 1).padStart(2, "0"),
    headlights: false,
    brake: false,
    plug: 0,
  }));
