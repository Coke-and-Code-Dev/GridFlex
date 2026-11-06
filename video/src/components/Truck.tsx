import React from "react";
import { C } from "../theme";
import { MONO } from "../fonts";
import { TRUCK_L, TRUCK_W } from "../geom";

export type TruckMode = "waiting" | "charging" | "paused" | "done" | "over" | "idle";

export type TruckProps = {
  uid: string; // unique prefix for gradient ids (several depots can be mounted at once)
  x: number;
  y: number;
  nose: number; // degrees, 0 = nose up, 90 = nose right
  soc: number; // 0..1
  mode: TruckMode;
  label: string;
  headlights?: boolean;
  brake?: boolean;
  pulse?: number; // 0..1 breathing animation phase for charging
  opacity?: number;
  showBattery?: boolean;
};

const W = TRUCK_W;
const L = TRUCK_L;
const CAB = 66;

export const Truck: React.FC<TruckProps> = ({
  uid, x, y, nose, soc, mode, label, headlights = false, brake = false, pulse = 0, opacity = 1, showBattery = true,
}) => {
  const barW = 34;
  const barH = 108;
  const barY = -L / 2 + CAB + 22;
  const fillColor = mode === "done" ? "#ffffff" : mode === "over" ? C.red : C.yellow;
  const fillH = Math.max(0, Math.min(1, soc)) * (barH - 6);
  const glow = mode === "charging" ? 0.5 + 0.5 * Math.sin(pulse * Math.PI * 2) : mode === "over" ? 1 : 0;
  return (
    <g transform={`translate(${x} ${y}) rotate(${nose})`} opacity={opacity}>
      <g style={{ filter: "drop-shadow(0px 10px 12px rgba(0,0,0,0.55))" }}>
        {/* cargo box */}
        <rect x={-W / 2} y={-L / 2 + CAB - 6} width={W} height={L - CAB + 6} rx={10} fill={"url(#" + uid + "truckBox)"} />
        <rect x={-W / 2 + 4} y={-L / 2 + CAB + 4} width={W - 8} height={L - CAB - 10} rx={7} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={2} />
        {/* roof ribs */}
        {[0.28, 0.5, 0.72].map((f) => (
          <line key={f} x1={-W / 2 + 8} x2={W / 2 - 8} y1={-L / 2 + CAB + (L - CAB) * f} y2={-L / 2 + CAB + (L - CAB) * f} stroke="rgba(0,0,0,0.10)" strokeWidth={2} />
        ))}
        {/* side stripes */}
        <rect x={-W / 2} y={-L / 2 + CAB + 6} width={5} height={L - CAB - 6} fill={C.yellow} opacity={0.9} />
        <rect x={W / 2 - 5} y={-L / 2 + CAB + 6} width={5} height={L - CAB - 6} fill={C.yellow} opacity={0.9} />
        {/* cab */}
        <rect x={-W / 2 + 2} y={-L / 2} width={W - 4} height={CAB} rx={16} fill={"url(#" + uid + "truckCab)"} stroke="rgba(255,255,255,0.22)" strokeWidth={2} />
        <rect x={-W / 2 + 10} y={-L / 2 + 14} width={W - 20} height={24} rx={8} fill={"url(#" + uid + "truckGlass)"} />
        {/* mirrors */}
        <rect x={-W / 2 - 7} y={-L / 2 + 24} width={9} height={16} rx={4} fill="#2a2d37" />
        <rect x={W / 2 - 2} y={-L / 2 + 24} width={9} height={16} rx={4} fill="#2a2d37" />
        {/* headlights */}
        <rect x={-W / 2 + 7} y={-L / 2 - 1} width={15} height={7} rx={3.5} fill={headlights ? "#fff6c9" : "#8d8f98"} />
        <rect x={W / 2 - 22} y={-L / 2 - 1} width={15} height={7} rx={3.5} fill={headlights ? "#fff6c9" : "#8d8f98"} />
        {/* brake lights at the rear */}
        <rect x={-W / 2 + 5} y={L / 2 - 6} width={14} height={6} rx={3} fill={brake ? "#ff2f3f" : "#6a2630"} />
        <rect x={W / 2 - 19} y={L / 2 - 6} width={14} height={6} rx={3} fill={brake ? "#ff2f3f" : "#6a2630"} />
      </g>
      {/* roof battery indicator */}
      {showBattery && (
        <g transform={`translate(0 ${barY + barH / 2})`}>
          <rect x={-barW / 2 - 4} y={-barH / 2 - 4} width={barW + 8} height={barH + 8} rx={10} fill="rgba(12,13,17,0.92)" />
          <rect
            x={-barW / 2} y={-barH / 2} width={barW} height={barH} rx={7}
            fill="rgba(255,255,255,0.06)"
            stroke={mode === "waiting" || mode === "idle" ? "rgba(255,255,255,0.28)" : fillColor}
            strokeWidth={2}
            strokeDasharray={mode === "paused" ? "5 4" : undefined}
          />
          {fillH > 0 && (
            <rect
              x={-barW / 2 + 3} y={barH / 2 - 3 - fillH} width={barW - 6} height={fillH} rx={4}
              fill={fillColor}
              opacity={mode === "charging" ? 0.8 + 0.2 * glow : 1}
            />
          )}
          <text x={0} y={barH / 2 + 30} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill="rgba(12,13,17,0.78)" transform={`rotate(${-nose} 0 ${barH / 2 + 22})`}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

export const TruckDefs: React.FC<{ uid: string }> = ({ uid }) => (
  <defs>
    <linearGradient id={uid + "truckBox"} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#c9ccd6" />
      <stop offset="0.5" stopColor="#f0f1f5" />
      <stop offset="1" stopColor="#c3c6d1" />
    </linearGradient>
    <linearGradient id={uid + "truckCab"} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#3a3e4c" />
      <stop offset="0.5" stopColor="#585d6e" />
      <stop offset="1" stopColor="#3a3e4c" />
    </linearGradient>
    <linearGradient id={uid + "truckGlass"} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#6c88a8" />
      <stop offset="1" stopColor="#27384c" />
    </linearGradient>
  </defs>
);
