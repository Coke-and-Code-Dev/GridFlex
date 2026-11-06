// Shared helpers for the audio generators. Reads the ElevenLabs key from ../.env
// (the repo-root .env is git-ignored). The key is never printed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..");

function loadEnv() {
  const env = {};
  for (const p of [join(ROOT, "..", ".env"), join(ROOT, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    } catch {}
  }
  return env;
}

const env = loadEnv();
export const API_KEY =
  process.env.ELEVENLABS_API_KEY ||
  process.env.ELEVENLABS_API ||
  env.ELEVENLABS_API_KEY ||
  env.ELEVENLABS_API;

if (!API_KEY) {
  console.error("No ElevenLabs key found (ELEVENLABS_API_KEY or ELEVENLABS_API in .env).");
  process.exit(1);
}

export const el = (path, init = {}) =>
  fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", ...(init.headers || {}) },
  });
