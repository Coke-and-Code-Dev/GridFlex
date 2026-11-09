import vo from "./data/vo.json";
import cfg from "./data/scenes.json";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type VoWord = { w: string; start: number; end: number };
export type SceneId = (typeof cfg.scenes)[number]["id"];

export type SceneInfo = {
  id: SceneId;
  from: number; // frames, global
  duration: number; // frames
  voOffset: number; // seconds from scene start to first word
  voDuration: number; // seconds
  voFile: string;
  words: VoWord[]; // seconds, relative to scene start (offset already added)
  fromSec: number;
  durationSec: number;
};

const build = (): { scenes: Record<string, SceneInfo>; total: number } => {
  let cursorSec = 0;
  const scenes: Record<string, SceneInfo> = {};
  cfg.scenes.forEach((s, i) => {
    const v = (vo as Record<string, { file: string; duration: number; words: VoWord[] }>)[s.id];
    const durationSec = s.offset + v.duration + s.tail;
    const fromSec = i === 0 ? 0 : cursorSec - s.overlap;
    scenes[s.id] = {
      id: s.id as SceneId,
      from: Math.round(fromSec * FPS),
      duration: Math.round(durationSec * FPS),
      voOffset: s.offset,
      voDuration: v.duration,
      voFile: v.file,
      words: v.words.map((w) => ({ w: w.w, start: w.start + s.offset, end: w.end + s.offset })),
      fromSec,
      durationSec,
    };
    cursorSec = fromSec + durationSec;
  });
  return { scenes, total: Math.ceil(cursorSec * FPS) };
};

const built = build();
export const SCENES = built.scenes as Record<SceneId, SceneInfo>;
export const TOTAL_FRAMES = built.total;

/** Start time (seconds, scene-local) of the nth word whose text starts with `prefix`. */
export const wordAt = (scene: SceneInfo, index: number): number => scene.words[index]?.start ?? 0;
export const findWord = (scene: SceneInfo, text: string, nth = 0): number => {
  const hits = scene.words.filter((w) => w.w.toLowerCase().replace(/[^a-z0-9'-]/g, "").startsWith(text.toLowerCase()));
  return (hits[nth] ?? scene.words[0]).start;
};
