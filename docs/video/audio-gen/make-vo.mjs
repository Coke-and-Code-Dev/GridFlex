// Generates one voiceover MP3 per scene with word-level timestamps.
//   node audio-gen/make-vo.mjs [voiceId] [only-scene-id]
// Output: public/vo/<id>.mp3 and src/data/vo.json
import { el, ROOT } from "./lib.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const VOICE = process.argv[2] || "onwK4e9ZLuTAKqWW03F9"; // Daniel
const ONLY = process.argv[3];
const scenes = JSON.parse(readFileSync(join(ROOT, "audio-gen/script.json"), "utf8"));
mkdirSync(join(ROOT, "public/vo"), { recursive: true });
const outJson = join(ROOT, "src/data/vo.json");
let result = {};
try { result = JSON.parse(readFileSync(outJson, "utf8")); } catch {}

const mp3Duration = (file) => {
  const r = spawnSync("npx", ["remotion", "ffmpeg", "-i", file], { cwd: ROOT, encoding: "utf8", shell: true });
  const m = (r.stderr + r.stdout).match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

const toWords = (a) => {
  const words = [];
  let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { w: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
};

let chars = 0;
for (const s of scenes) {
  if (ONLY && s.id !== ONLY) continue;
  chars += s.text.length;
  const r = await el(`/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({
      text: s.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, speed: 1.1, use_speaker_boost: true },
    }),
  });
  if (!r.ok) { console.error(s.id, r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const j = await r.json();
  const file = join(ROOT, "public/vo", `${s.id}.mp3`);
  writeFileSync(file, Buffer.from(j.audio_base64, "base64"));
  const words = toWords(j.alignment);
  const duration = mp3Duration(file);
  result[s.id] = { file: `vo/${s.id}.mp3`, duration, words };
  console.log(s.id.padEnd(7), duration.toFixed(2) + "s", words.length + " words");
}
writeFileSync(outJson, JSON.stringify(result, null, 1));
console.log("characters used:", chars);
