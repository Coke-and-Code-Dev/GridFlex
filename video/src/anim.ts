import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.5, 0, 0.9, 0.4);
export const easeBack = Easing.bezier(0.34, 1.56, 0.64, 1);

/** Scene-local time in seconds. */
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, t: frame / fps };
};

/** 0..1 progress between start and start+dur seconds, eased, clamped. */
export const prog = (t: number, start: number, dur: number, ease: (n: number) => number = easeOut) =>
  interpolate(t, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const map = (v: number, a: number, b: number, c: number, d: number, ease?: (n: number) => number) =>
  interpolate(v, [a, b], [c, d], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

export { rng } from "./rng";

export const fmtClock = (hour: number) => {
  const h24 = ((hour % 24) + 24) % 24;
  const h = Math.floor(h24);
  const m = Math.floor((h24 - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
