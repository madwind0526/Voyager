// Usage: node gen.mjs "<prompt>" <out.png> [width] [height] [seed]
import { createComfy } from "file:///E:/Claude/VideoStudioOM/server/engine/comfy.mjs";
import { kreaGraph, pickKreaModels } from "file:///E:/Claude/VideoStudioOM/server/engine/graphs.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [prompt, out, w = "1024", h = "1024", seedArg] = process.argv.slice(2);
const comfy = createComfy("http://127.0.0.1:8188");
const models = pickKreaModels({
  unets: await comfy.options("UNETLoader", "unet_name"),
  clips: await comfy.options("CLIPLoader", "clip_name"),
  vaes: await comfy.options("VAELoader", "vae_name"),
});
if (!models) throw new Error("Krea models not found in ComfyUI");
const seed = seedArg ? Number(seedArg) : Math.floor(Math.random() * 2 ** 31);
mkdirSync(path.dirname(out), { recursive: true });
const graph = kreaGraph({ prompt, width: Number(w), height: Number(h), steps: 8, seed, models });
let node = "10";
if (process.env.CUT) {
  // Remove the background inside ComfyUI so the PNG keeps a real alpha channel.
  graph["11"] = { class_type: "BiRefNetRMBG", inputs: { image: ["9", 0], model: process.env.CUT, refine_foreground: true, background: "Alpha", sensitivity: 1.0, mask_blur: 0, mask_offset: 0, invert_output: false, background_color: "#222222" } };
  graph["12"] = { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: "voyager_cut" } };
  node = "12";
}
await comfy.generate(graph, node, out, { timeoutMs: 600_000 });
console.log("done", out, "seed", seed);
