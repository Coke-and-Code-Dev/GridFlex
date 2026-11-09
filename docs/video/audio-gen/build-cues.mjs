// Bundles src/cues.ts with esbuild and dumps the cue times to audio-gen/cues.json
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

const dir = mkdtempSync(join(tmpdir(), "gf-cues-"));
const out = join(dir, "cues.cjs");
execFileSync(process.execPath, [join(ROOT, "node_modules/esbuild/bin/esbuild"), join(ROOT, "src/cues.ts"), "--bundle", "--platform=node", "--format=cjs", "--loader:.json=json", "--outfile=" + out, "--log-level=error"], { stdio: "inherit" });
const m = createRequire(import.meta.url)(out);
const plain = JSON.parse(JSON.stringify({ CUE: m.CUE, TIMES: m.TIMES }, (k, v) => (typeof v === "function" ? undefined : v)));
// functions do not serialise; add the crash parking times explicitly
plain.CUE.crash.park = Array.from({ length: 10 }, (_, i) => m.CUE.crash.parkT(i));
writeFileSync(join(ROOT, "audio-gen/cues.json"), JSON.stringify(plain, null, 1));
rmSync(dir, { recursive: true, force: true });
console.log("cues written; total scenes:", Object.keys(plain.TIMES).length);
console.log("crash blow (global s):", (plain.TIMES.crash[0] + plain.CUE.crash.blow).toFixed(2));
