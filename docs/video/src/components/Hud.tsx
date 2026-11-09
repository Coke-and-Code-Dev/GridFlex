import React, { useId } from "react";
import { Img, staticFile } from "remotion";
import { C } from "../theme";
import { HEAD, MONO } from "../fonts";
import { clamp, fmtClock, map } from "../anim";
import { END_H, LIMIT, START_H } from "../sim";

export const Card: React.FC<{ x: number; y: number; w: number; h: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  x, y, w, h, children, style,
}) => (
  <div
    style={{
      position: "absolute", left: x, top: y, width: w, height: h,
      background: "linear-gradient(180deg, #1b1d25, #14151b)",
      border: "1.5px solid " + C.line, borderRadius: 26, boxSizing: "border-box", padding: 28,
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)", ...style,
    }}
  >
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.mute, style }) => (
  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: 3, color, textTransform: "uppercase", whiteSpace: "nowrap", ...style }}>{children}</div>
);

export const SIDEBAR = { x: 1330, y: 40, w: 550 };

const phaseLabel = (h: number) => {
  if (h < 18.7) return "Evening arrival";
  if (h < 23) return "Evening";
  if (h < 29.3) return "Overnight";
  if (h < 30.4) return "Pre-dawn";
  return "Sunrise";
};

export const ClockCard: React.FC<{ hour: number; y?: number; h?: number; phase?: string }> = ({ hour, y = SIDEBAR.y, h = 226, phase }) => {
  const p = clamp((hour - START_H) / (END_H - START_H), 0, 1);
  return (
    <Card x={SIDEBAR.x} y={y} w={SIDEBAR.w} h={h}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Label>Simulated time</Label>
        <Label color={C.yellow}>{phase ?? phaseLabel(hour)}</Label>
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 118, lineHeight: 1.05, marginTop: 8, color: C.text, letterSpacing: -2 }}>{fmtClock(hour)}</div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: "#262933", marginTop: 6 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: p * 100 + "%", borderRadius: 5, background: "linear-gradient(90deg,#ff9a4a,#5a64c8 40%,#1c2a6a 70%,#ffc26a)" }} />
        <div style={{ position: "absolute", left: "calc(" + p * 100 + "% - 11px)", top: -6, width: 22, height: 22, borderRadius: 11, background: C.text, boxShadow: "0 0 18px rgba(255,255,255,0.6)" }} />
      </div>
    </Card>
  );
};

export const PowerCard: React.FC<{ kw: number; baseKw: number; y?: number; h?: number; status?: string }> = ({ kw, baseKw, y = 290, h = 282, status }) => {
  const max = 200;
  const barW = SIDEBAR.w - 56;
  const over = kw > LIMIT + 0.5;
  const px = (v: number) => (clamp(v, 0, max) / max) * barW;
  const baseW = px(Math.min(baseKw, kw));
  const yellowEnd = px(Math.min(kw, LIMIT));
  const redEnd = px(kw);
  const color = over ? C.red : C.text;
  const pill = status ?? (over ? "OVER LIMIT" : "WITHIN LIMIT");
  return (
    <Card x={SIDEBAR.x} y={y} w={SIDEBAR.w} h={h}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Label>Site power</Label>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: 3, padding: "7px 16px", borderRadius: 999, color: over ? "#fff" : "#06210f", background: over ? C.red : C.green }}>{pill}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 112, lineHeight: 1.05, color, letterSpacing: -3 }}>{Math.round(kw)}</div>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 44, color: C.mute }}>kW</div>
      </div>
      <div style={{ position: "relative", height: 38, marginTop: 14, borderRadius: 10, background: "#252833", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: baseW, background: "#6b6f7c" }}>
          {baseW > 120 && <span style={{ position: "absolute", left: 12, top: 6, fontFamily: MONO, fontWeight: 700, fontSize: 19, color: "#14151b" }}>building</span>}
        </div>
        <div style={{ position: "absolute", left: baseW, top: 0, bottom: 0, width: Math.max(0, yellowEnd - baseW), background: C.yellow }}>
          {yellowEnd - baseW > 120 && <span style={{ position: "absolute", left: 12, top: 6, fontFamily: MONO, fontWeight: 700, fontSize: 19, color: "#14151b" }}>chargers</span>}
        </div>
        {kw > LIMIT && <div style={{ position: "absolute", left: yellowEnd, top: 0, bottom: 0, width: Math.max(0, redEnd - yellowEnd), background: C.red }} />}
      </div>
      <div style={{ position: "relative", height: 40 }}>
        <div style={{ position: "absolute", left: px(LIMIT) - 1.5, top: -52, width: 3, height: 56, background: C.red }} />
        <div style={{ position: "absolute", left: px(LIMIT) - 90, width: 180, textAlign: "center", top: 8, fontFamily: MONO, fontWeight: 700, fontSize: 21, color: C.red, letterSpacing: 1 }}>100 kW limit</div>
      </div>
    </Card>
  );
};

export type ChartProps = {
  w: number;
  h: number;
  startH?: number;
  endH?: number;
  nowH: number;
  yMax?: number;
  series: (h: number) => number;
  ghost?: (h: number) => number;
  step?: number;
  strokeWidth?: number;
  tickEvery?: number;
  ticks?: number[];
  tickFmt?: (h: number) => string;
  showLimitLabel?: boolean;
  xLabelSize?: number;
};

export const LoadChart: React.FC<ChartProps> = ({
  w, h, startH = START_H, endH = END_H, nowH, yMax = 200, series, ghost, step = 0.04, strokeWidth = 5, tickEvery = 3, ticks: ticksIn, tickFmt, showLimitLabel = true, xLabelSize = 20,
}) => {
  const id = useId().replace(/:/g, "");
  const padL = 62, padR = 14, padT = 14, padB = 40;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  const X = (hh: number) => padL + ((hh - startH) / (endH - startH)) * pw;
  const Y = (v: number) => padT + ph * (1 - clamp(v, 0, yMax) / yMax);
  const end = clamp(nowH, startH, endH);
  const pts: string[] = [];
  for (let hh = startH; hh < end; hh += step) pts.push(X(hh).toFixed(1) + "," + Y(series(hh)).toFixed(1));
  pts.push(X(end).toFixed(1) + "," + Y(series(end)).toFixed(1));
  const line = "M" + pts.join(" L");
  const area = line + " L" + X(end).toFixed(1) + "," + Y(0) + " L" + X(startH).toFixed(1) + "," + Y(0) + " Z";
  let ghostPath = "";
  if (ghost) {
    const gp: string[] = [];
    for (let hh = startH; hh <= endH + 1e-6; hh += step) gp.push(X(hh).toFixed(1) + "," + Y(ghost(hh)).toFixed(1));
    ghostPath = "M" + gp.join(" L");
  }
  const yl = Y(LIMIT);
  const ticks: number[] = ticksIn ?? [];
  if (!ticksIn) for (let hh = startH; hh <= endH + 1e-6; hh += tickEvery) ticks.push(hh);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id={id + "u"}><rect x={0} y={yl} width={w} height={h} /></clipPath>
        <clipPath id={id + "o"}><rect x={0} y={0} width={w} height={yl} /></clipPath>
        <linearGradient id={id + "f"} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={C.yellow} stopOpacity="0.32" />
          <stop offset="1" stopColor={C.yellow} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 100, 200].filter((v) => v <= yMax).map((v) => (
        <g key={v}>
          <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="#2a2d38" strokeWidth={2} />
          <text x={padL - 12} y={Y(v) + 7} textAnchor="end" fontFamily={MONO} fontSize={20} fill={C.mute}>{v}</text>
        </g>
      ))}
      {ticks.map((hh) => (
        <text key={hh} x={X(hh)} y={h - 10} textAnchor="middle" fontFamily={MONO} fontSize={xLabelSize} fill={C.mute}>{tickFmt ? tickFmt(hh) : fmtClock(hh).slice(0, 2) + "h"}</text>
      ))}
      {ghostPath && <path d={ghostPath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={3} strokeDasharray="4 8" />}
      <path d={area} fill={"url(#" + id + "f)"} clipPath={"url(#" + id + "u)"} />
      <path d={line} fill="none" stroke={C.yellow} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" clipPath={"url(#" + id + "u)"} />
      <path d={line} fill="none" stroke={C.red} strokeWidth={strokeWidth + 1} strokeLinejoin="round" strokeLinecap="round" clipPath={"url(#" + id + "o)"} />
      <line x1={padL} x2={w - padR} y1={yl} y2={yl} stroke={C.red} strokeWidth={3} strokeDasharray="14 9" />
      {showLimitLabel && (
        <text x={w - padR - 4} y={yl - 10} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={20} fill={C.red}>limit 100 kW</text>
      )}
      {end > startH + 0.01 && <circle cx={X(end)} cy={Y(series(end))} r={8} fill={series(end) > LIMIT ? C.red : C.yellow} />}
    </svg>
  );
};

export const ChartCard: React.FC<{ y: number; h: number; nowH: number; series: (h: number) => number; ghost?: (h: number) => number; title?: string; startH?: number; endH?: number; tickEvery?: number; ticks?: number[]; tickFmt?: (h: number) => string; subtitle?: string }> = ({
  y, h, nowH, series, ghost, title = "Site load", startH, endH, tickEvery, ticks, tickFmt, subtitle,
}) => (
  <Card x={SIDEBAR.x} y={y} w={SIDEBAR.w} h={h}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <Label>{title}</Label>
      {subtitle && <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 18, color: "#9a9dab", whiteSpace: "nowrap" }}>{subtitle}</div>}
    </div>
    <LoadChart w={SIDEBAR.w - 56} h={h - 28 * 2 - 36} nowH={nowH} series={series} ghost={ghost} startH={startH} endH={endH} tickEvery={tickEvery} ticks={ticks} tickFmt={tickFmt} />
  </Card>
);

export const Brand: React.FC<{ x?: number; y?: number; scale?: number; label?: string }> = ({ x = 96, y = 62, scale = 1, label }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 14 * scale }}>
    <Img src={staticFile("gridflex-mark-hd.png")} style={{ height: 54 * scale, width: "auto" }} />
    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 38 * scale, letterSpacing: -0.5, color: C.text }}>
      GridFlex
    </div>
    {label && <div style={{ fontFamily: MONO, fontSize: 20 * scale, color: C.mute, letterSpacing: 3, marginLeft: 10, textTransform: "uppercase" }}>{label}</div>}
  </div>
);

export const Disclaimer: React.FC<{ text?: string; x?: number; y?: number }> = ({ text = "Illustrative simulation · synthetic data", x = 66, y = 1040 }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: MONO, fontSize: 20, letterSpacing: 3, color: "#7d808c", textTransform: "uppercase" }}>{text}</div>
);

export { map };
