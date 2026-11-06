// Usage: ENGINE=krea|qwen STEPS=20 REFS="a.jpg;b.jpg" node gen2.mjs "<prompt>" <out.png> [w] [h] [seed]
import { createComfy } from "file:///E:/Claude/VideoStudioOM/server/engine/comfy.mjs";
import { kreaGraph, pickKreaModels, qwenEditGraph, pickQwenEditModels } from "file:///E:/Claude/VideoStudioOM/server/engine/graphs.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [prompt, out, w = "1536", h = "640", seedArg] = process.argv.slice(2);
const engine = process.env.ENGINE ?? "krea";
const steps = Number(process.env.STEPS ?? (engine === "krea" ? 20 : 25));
const seed = seedArg ? Number(seedArg) : Math.floor(Math.random() * 2 ** 31);
const comfy = createComfy("http://127.0.0.1:8188");
mkdirSync(path.dirname(out), { recursive: true });
const opt = async (n, k) => comfy.options(n, k);
let graph;
if (engine === "krea") {
  const models = pickKreaModels({ unets: await opt("UNETLoader", "unet_name"), clips: await opt("CLIPLoader", "clip_name"), vaes: await opt("VAELoader", "vae_name") });
  if (!models) throw new Error("Krea models not found");
  graph = kreaGraph({ prompt, width: Number(w), height: Number(h), steps, seed, models });
} else {
  const models = pickQwenEditModels({ unets: await opt("UNETLoader", "unet_name"), clips: await opt("CLIPLoader", "clip_name"), vaes: await opt("VAELoader", "vae_name") });
  if (!models) throw new Error("Qwen edit models not found");
  const files = [process.env.BLANK, ...(process.env.REFS ?? "").split(";").filter(Boolean)];
  const names = [];
  for (const f of files) names.push(await comfy.upload(f, path.basename(f)));
  graph = qwenEditGraph({ prompt, negative: "", images: names, seed, steps, models });
}
if (process.env.CUT) {
  graph["11"] = { class_type: "BiRefNetRMBG", inputs: { image: ["9", 0], model: process.env.CUT, refine_foreground: true, background: "Alpha", sensitivity: 1.0, mask_blur: 0, mask_offset: 0, invert_output: false, background_color: "#222222" } };
  graph["12"] = { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: "voyager_cut" } };
}
const node = process.env.CUT ? "12" : "10";
const t0 = Date.now();
await comfy.generate(graph, node, out, { timeoutMs: 900_000 });
console.log("done", engine, "steps", steps, "seed", seed, Math.round((Date.now() - t0) / 1000) + "s", out);
