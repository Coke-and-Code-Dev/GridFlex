import React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { FPS, SCENES, type SceneId } from "../timeline";
import { prog, useT } from "../anim";
import { C } from "../theme";
import { MONO } from "../fonts";

/** Cross-dissolve wrapper: fades in over `inS` seconds and out over `outS` at the end of the scene. */
export const Fade: React.FC<{ durationSec: number; inS?: number; outS?: number; children: React.ReactNode }> = ({ durationSec, inS = 0.5, outS = 0.5, children }) => {
  const { t } = useT();
  const a = inS > 0 ? prog(t, 0, inS, (n) => n) : 1;
  const b = outS > 0 ? 1 - prog(t, durationSec - outS, outS, (n) => n) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
};

/** Places a scene on the global timeline together with its voiceover. */
export const SceneShell: React.FC<{ id: SceneId; inS?: number; outS?: number; sfx?: React.ReactNode; children: React.ReactNode }> = ({ id, inS = 0.5, outS = 0.5, sfx, children }) => {
  const s = SCENES[id];
  return (
    <Sequence from={s.from} durationInFrames={s.duration} name={id} premountFor={FPS}>
      <Fade durationSec={s.durationSec} inS={inS} outS={outS}>{children}</Fade>
      <Sequence from={Math.round(s.voOffset * FPS)} name={id + "-voiceover"}>
        <Audio src={staticFile(s.voFile)} volume={1} />
      </Sequence>
      {sfx}
    </Sequence>
  );
};

/** One-shot sound effect at a scene-local time (seconds). */
export const Sfx: React.FC<{ at: number; src: string; volume?: number; rate?: number }> = ({ at, src, volume = 1, rate = 1 }) => (
  <Sequence from={Math.round(at * FPS)} name={"sfx " + src}>
    <Audio src={staticFile(src)} volume={volume} playbackRate={rate} />
  </Sequence>
);

export const Shake: React.FC<{ amp: number; children: React.ReactNode }> = ({ amp, children }) => {
  const { t } = useT();
  const x = amp * (Math.sin(t * 61) + 0.6 * Math.sin(t * 97 + 1));
  const y = amp * (Math.cos(t * 53) + 0.6 * Math.sin(t * 83 + 2));
  return <AbsoluteFill style={{ transform: "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)" }}>{children}</AbsoluteFill>;
};

/** Scales and pans its children around a focal point. */
export const Camera: React.FC<{ zoom: number; cx?: number; cy?: number; children: React.ReactNode }> = ({ zoom, cx = 960, cy = 540, children }) => (
  <AbsoluteFill style={{ transformOrigin: cx + "px " + cy + "px", transform: "scale(" + zoom + ")" }}>{children}</AbsoluteFill>
);

export const SectionTag: React.FC<{ n: string; label: string; x?: number; y?: number }> = ({ n, label, x = 96, y = 126 }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: 5, color: C.mute, textTransform: "uppercase" }}>
    <span style={{ color: C.yellow }}>{n}</span> · {label}
  </div>
);
