// Where the ElevenLabs sound effects land. Times are scene-local seconds from cues.ts.
import React from "react";
import { Sfx } from "./components/Scene";
import { CUE } from "./cues";

const OK = (t: number) => t >= 0;

export const CrashSfx: React.FC = () => (
  <>
    {[9, 7, 5, 3, 1].map((i) => (
      <Sfx key={"tp" + i} at={CUE.crash.arrive + (9 - i) * CUE.crash.stagger} src="sfx/truck-pass.mp3" volume={0.2} rate={0.94 + 0.02 * (i % 4)} />
    ))}
    {Array.from({ length: 10 }, (_, i) => (
      <Sfx key={"pl" + i} at={CUE.crash.parkT(i) + 0.1} src="sfx/plug-in.mp3" volume={0.3} rate={0.92 + 0.017 * i} />
    ))}
    {OK(CUE.crash.blow - 4.4) && <Sfx at={CUE.crash.blow - 4.4} src="sfx/surge.mp3" volume={0.5} />}
    <Sfx at={CUE.crash.blow - 0.08} src="sfx/blackout.mp3" volume={0.7} />
  </>
);

export const QueueSfx: React.FC = () => <Sfx at={CUE.queue.stamp} src="sfx/stamp.mp3" volume={0.7} />;

export const RevealSfx: React.FC = () => <Sfx at={CUE.reveal.hit} src="sfx/power-up.mp3" volume={0.5} />;

export const PlanSfx: React.FC = () => {
  const d = CUE.plan.depot;
  return (
    <>
      <Sfx at={CUE.plan.post - 0.1} src="sfx/typing.mp3" volume={0.3} />
      <Sfx at={d - 0.3} src="sfx/night.mp3" volume={0.3} />
      <Sfx at={d + 7.5} src="sfx/night.mp3" volume={0.2} />
      {[9, 6, 3, 0].map((i) => (
        <Sfx key={"tp" + i} at={d + (9 - i) * 0.05 - 0.3} src="sfx/truck-pass.mp3" volume={0.15} rate={0.96 + 0.02 * i} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <Sfx key={"pl" + i} at={d + (9 - i) * 0.05 + CUE.plan.arriveDur + 0.1} src="sfx/plug-in.mp3" volume={0.12} rate={0.94 + 0.014 * i} />
      ))}
      <Sfx at={d + 1.2} src="sfx/charge-hum.mp3" volume={0.22} />
      <Sfx at={d + 6.9} src="sfx/charge-hum.mp3" volume={0.1} />
      <Sfx at={CUE.plan.dawn - 0.3} src="sfx/dawn.mp3" volume={0.4} />
      {[9, 7, 5, 3, 1].map((i) => (
        <Sfx key={"dp" + i} at={CUE.plan.depart + (9 - i) * 0.22} src="sfx/truck-depart.mp3" volume={0.22} rate={0.96 + 0.02 * (i % 3)} />
      ))}
    </>
  );
};

export const HumanSfx: React.FC = () => {
  const clickAt = Math.max(CUE.human.it, CUE.human.rejects + 1.05);
  return (
    <>
      <Sfx at={CUE.human.explains} src="sfx/typing.mp3" volume={0.28} />
      <Sfx at={CUE.human.explains + 1.9} src="sfx/typing.mp3" volume={0.28} rate={1.04} />
      <Sfx at={clickAt} src="sfx/click.mp3" volume={0.6} />
    </>
  );
};
