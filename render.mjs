// Renderiza o comercial em MP4 (H.264 + AAC) quadro a quadro.
//
// Uso: node render.mjs [16x9|9x16|1x1|all] [--cut] [--fps 30] [--pagina arquivo.html --nome prefixo]
// Requer: Playwright (Chromium), ffmpeg e python3 com numpy.
// Saída em comercial/dist/.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.env.NODE_PATH || "", "/opt/node22/lib/node_modules"] }))); }

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const which = ["16x9", "9x16", "1x1", "all"].find((a) => args.includes(a)) || "16x9";
const cut = args.includes("--cut");
const fps = Number(args[args.indexOf("--fps") + 1]) || 30;
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const pagina = opt("--pagina", "comercial.html"); // ex.: dinheiro-na-mesa/index.html
const nome = opt("--nome", "ag-power-comercial");
const DIST = join(HERE, "dist", nome === "ag-power-comercial" ? "" : nome);
mkdirSync(DIST, { recursive: true });
const formats = which === "all" ? ["16x9", "9x16", "1x1"] : [which];
const SIZES = { "16x9": [1920, 1080], "9x16": [1080, 1920], "1x1": [1080, 1080] };

const browser = await chromium.launch();
let audioDone = false;
let tag, audioBase;

for (const f of formats) {
  const [w, h] = SIZES[f];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const url = pathToFileURL(join(HERE, pagina)).href + `?render=1&f=${f}${cut ? "&cut=60" : ""}`;
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => window.COMMERCIAL);

  if (!audioDone) {
    tag = info.CUT ? "60s" : `${Math.round(info.TOTAL)}s`;
    audioBase = join(DIST, `audio-${tag}`);
    const tl = join(DIST, `timeline-${tag}.json`);
    writeFileSync(tl, JSON.stringify(info, null, 2));
    execFileSync("python3", [join(HERE, "audio.py"), tl, audioBase], { stdio: "inherit" });
    audioDone = true;
  }

  const out = join(DIST, `${nome}-${tag}-${f}.mp4`);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-i", audioBase + ".wav",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const frames = Math.round(info.TOTAL * fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.renderAt(t), i / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % (fps * 10) === 0) process.stdout.write(`\r${f} ${tag}: ${(i / fps).toFixed(0)}s / ${info.TOTAL}s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg " + c)))));
  console.log(`\r${f} ${tag}: ok → ${out} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  await page.close();
}
await browser.close();
