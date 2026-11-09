import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import { C } from "./theme";
import { HEAD } from "./fonts";
import { SceneShell } from "./components/Scene";
import { Grid } from "./scenes/Grid";
import { Queue } from "./scenes/Queue";
import { Crash } from "./scenes/Crash";
import { Reveal } from "./scenes/Reveal";
import { Plan } from "./scenes/Plan";
import { Stress } from "./scenes/Stress";
import { Human } from "./scenes/Human";
import { Close } from "./scenes/Close";
import { CrashSfx, HumanSfx, PlanSfx, QueueSfx, RevealSfx } from "./audio";
import { FPS, TOTAL_FRAMES } from "./timeline";

// Music bed and synthesized FX are rendered by audio-gen/synth.mjs against the same cue times.
const MUSIC_VOLUME = 0.34;
const FX_VOLUME = 0.8;

export const GridFlexPitch: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, color: C.text, fontFamily: HEAD }}>
    <SceneShell id="grid" inS={0.01}>
      <Grid />
    </SceneShell>
    <SceneShell id="queue" sfx={<QueueSfx />}>
      <Queue />
    </SceneShell>
    <SceneShell id="crash" sfx={<CrashSfx />}>
      <Crash />
    </SceneShell>
    <SceneShell id="reveal" inS={0.01} sfx={<RevealSfx />}>
      <Reveal />
    </SceneShell>
    <SceneShell id="plan" sfx={<PlanSfx />}>
      <Plan />
    </SceneShell>
    <SceneShell id="stress">
      <Stress />
    </SceneShell>
    <SceneShell id="human" sfx={<HumanSfx />}>
      <Human />
    </SceneShell>
    <SceneShell id="close" outS={1.2}>
      <Close />
    </SceneShell>
    <Audio src={staticFile("audio/music.mp3")} volume={(f) => MUSIC_VOLUME * Math.min(1, (TOTAL_FRAMES - f) / (2 * FPS))} />
    <Audio src={staticFile("audio/fx.mp3")} volume={FX_VOLUME} />
  </AbsoluteFill>
);
