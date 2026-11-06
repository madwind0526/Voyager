// Usage: node describe.mjs out.json file1 file2 ...   (QwenVL "Ultra Detailed Description" through VideoStudioOM's graph)
import { createComfy } from "file:///E:/Claude/VideoStudioOM/server/engine/comfy.mjs";
import { qwenVlGraph } from "file:///E:/Claude/VideoStudioOM/server/engine/graphs.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";

const [outFile, ...files] = process.argv.slice(2);
const comfy = createComfy("http://127.0.0.1:8188");
const result = {};
for (const file of files) {
  const image = await comfy.upload(file, path.basename(file));
  const entry = await comfy.wait(await comfy.submit(qwenVlGraph({ image, seed: 7, maxTokens: 450 })), { timeoutMs: 600_000 });
  result[path.basename(file)] = String(entry.outputs?.["6"]?.text?.[0] ?? "").trim();
  console.log("described", path.basename(file));
}
writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
