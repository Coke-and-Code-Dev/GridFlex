# GridFlex investor pitch video

A ~115 second pitch built in code with [Remotion](https://www.remotion.dev) (React + TypeScript). It tells the
problem and the solution with an animated depot, and does not show the website. Everything on screen is labelled
**illustrative simulation / synthetic data**; the only real figures are the capacity-map numbers in scenes 1 and 2
(Netbeheer Nederland export of 5 Nov 2026).

## Storyboard

| # | Scene | Narration beat | What you see |
|---|-------|----------------|--------------|
| 1 | `Grid` | The Dutch power grid is full | Dot field turns red: 56% of postcodes nationally, 79% in Liander's area |
| 2 | `Queue` | No bigger connection, 87 requests waiting until 2027, fleets must electrify | 100 kW cable and a "not available" stamp, the Amsterdam (postcode 1021 EG) queue and timeline, diesel vans turning electric |
| 3 | `Crash` | Ten trucks, 178 kW on a 100 kW connection, the fuse blows | Top-down depot at dusk, trucks reverse-in, load spikes, sparks, blackout |
| 4 | `Reveal` | GridFlex fixes that, without a single new cable | Power returns, logo |
| 5 | `Plan` | Inputs, timetable, the night time-lapse | Input cards, Gantt timetable, same depot overnight with trucks taking turns, sunrise and departure |
| 6 | `Stress` | 100 realistic days it has never seen | One day vs 100 day-curves; 97 of 100 within the limit, worst 107 kW at 18:15 |
| 7 | `Human` | Plain-language explanation, a person approves | Typed explanation card, approve/reject, "only recommends" |
| 8 | `Close` | Every depot stuck in the queue | Depots light up, Plan. Stress-test. Explain., logo lock-up and attributions |

The numbers on screen come from a small deterministic simulation in `src/sim.ts` (10 trucks, 11 kW chargers,
33 kWh each, building load 68 kW at 18:00 falling overnight, 5 kW safety margin). It mirrors GridFlex's rule of
charging as many trucks as the headroom allows. The 100 test days and the 3 over-limit days are generated with a
fixed seed so every render is identical.

## Run it

```bash
cd video
npm install
npm run dev          # Remotion Studio (preview), pick the GridFlexPitch composition
```

```bash
npx remotion render src/index.ts GridFlexPitch out/gridflex-pitch.mp4
```

Fonts (Archivo, JetBrains Mono) are fetched from Google Fonts at render time, so the machine needs internet.

## Audio

All audio is committed under `public/` so the video renders without any API key. To regenerate it:

| What | How | Needs |
|------|-----|-------|
| Narration | `node audio-gen/make-vo.mjs [voiceId]` reads `audio-gen/script.json`, writes `public/vo/*.mp3` and word timings to `src/data/vo.json` | ElevenLabs key |
| Realistic sound effects (trucks, plug-in, breaker, ambience) | `node audio-gen/make-sfx.mjs` writes `public/sfx/*.mp3` | ElevenLabs key |
| Music bed + whooshes, risers, ticks, chimes | `node audio-gen/build-cues.mjs` then `node audio-gen/synth.mjs` (pure code, no API) | nothing |

The ElevenLabs key goes in the repo-root `.env` as `ELEVENLABS_API_KEY` (the scripts also accept `ELEVENLABS_API`).
`.env` is git-ignored. The scene timings follow the narration word by word (`src/timeline.ts`), so after
regenerating the narration just re-run `build-cues.mjs` and `synth.mjs`.

The default voice is "Daniel" (`onwK4e9ZLuTAKqWW03F9`). Change the voice by passing another voice id to `make-vo.mjs`.

## Layout

```
src/Pitch.tsx            the composition: scenes, voiceover, music, FX
src/timeline.ts          scene start times, built from the narration timings
src/cues.ts              cue times shared with the audio generators
src/sim.ts               the depot simulation behind every number and chart
src/scenes/              one file per scene
src/components/          depot, trucks, HUD cards, text helpers
audio-gen/               narration, sound-effect and music generators
public/                  logo, narration, sound effects, music
```

## Licences

- Remotion is free for teams of up to 3; larger companies need a licence (`remotion.pro/license`).
- ElevenLabs free-plan output requires attribution and is not licensed for commercial use. Check the plan before
  the video is used outside the hackathon.
- Attributions shown at the end of the video follow idea.md §14: GLASS (CDLA-Permissive-2.0), Netbeheer Nederland
  capaciteitskaart, Liander open data.
