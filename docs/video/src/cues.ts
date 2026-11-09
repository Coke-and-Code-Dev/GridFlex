// Cue times for sound design. Pure data (no React) so the audio generators can bundle it too.
// Local times are scene-local seconds (same clock the scenes use); G() turns them into global seconds.
// The formulas mirror the constants at the top of each scene file: keep them in step.
import { SCENES, findWord } from "./timeline";

const S = SCENES;
export const G = (id: keyof typeof S, local: number) => S[id].fromSec + local;

const crashArrive = findWord(S.crash, "They") - 0.35;
const crashBlow = findWord(S.crash, "blows") + 0.02;
const planDepot = findWord(S.plan, "turns") - 0.3;

export const CUE = {
  grid: {
    full: S.grid.words[5].start,
    redStart: findWord(S.grid, "marked") - 0.2,
    redEnd: findWord(S.grid, "demand") + 0.9,
    liander: findWord(S.grid, "Liander"),
  },
  queue: {
    bigger: findWord(S.queue, "bigger"),
    stamp: findWord(S.queue, "connection") + 0.25,
    ams: findWord(S.queue, "Amsterdam") - 0.2,
    tokens: findWord(S.queue, "eighty-seven"),
    relief: findWord(S.queue, "twenty-seven") - 0.5,
    meanwhile: findWord(S.queue, "Meanwhile") - 0.2,
    flip: findWord(S.queue, "go") - 0.2,
    barrier: findWord(S.queue, "electric") + 0.6,
  },
  crash: {
    arrive: crashArrive,
    stagger: 0.11,
    arriveDur: 2.0,
    blow: crashBlow,
    parkT: (i: number) => crashArrive + (9 - i) * 0.11 + 2.0,
  },
  reveal: { hit: S.reveal.words[0].start - 0.1, cable: S.reveal.words[7].start },
  plan: {
    post: findWord(S.plan, "postcode"),
    building: findWord(S.plan, "building"),
    fleet: findWord(S.plan, "fleet"),
    builds: findWord(S.plan, "builds"),
    depot: planDepot,
    arriveDur: 1.15,
    depart: findWord(S.plan, "morning") + 0.9,
    dawn: planDepot + 7.1,
    end: S.plan.durationSec,
  },
  stress: {
    one: findWord(S.stress, "one"),
    proves: findWord(S.stress, "proves"),
    so: findWord(S.stress, "So"),
    seen: findWord(S.stress, "seen"),
    often: findWord(S.stress, "often"),
    much: findWord(S.stress, "much"),
    when: findWord(S.stress, "when"),
  },
  human: {
    explains: findWord(S.human, "explains"),
    language: findWord(S.human, "language"),
    approves: findWord(S.human, "approves"),
    rejects: findWord(S.human, "rejects"),
    it: findWord(S.human, "it", 1),
    only: findWord(S.human, "only"),
    nothing: findWord(S.human, "Nothing"),
  },
  close: {
    lets: findWord(S.close, "lets"),
    plan: findWord(S.close, "Plan"),
    stress: findWord(S.close, "Stress-test"),
    explain: findWord(S.close, "Explain"),
  },
};

export const TIMES = {
  grid: [S.grid.fromSec, S.grid.durationSec],
  queue: [S.queue.fromSec, S.queue.durationSec],
  crash: [S.crash.fromSec, S.crash.durationSec],
  reveal: [S.reveal.fromSec, S.reveal.durationSec],
  plan: [S.plan.fromSec, S.plan.durationSec],
  stress: [S.stress.fromSec, S.stress.durationSec],
  human: [S.human.fromSec, S.human.durationSec],
  close: [S.close.fromSec, S.close.durationSec],
};
