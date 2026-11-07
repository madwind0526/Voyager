// Builds the stand-alone Android app: a web build without the heavy optional files, copied into the Android project.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });
run("node scripts/make-index.mjs");
run("npm run build");
const out = path.join(root, "app-www");
fs.rmSync(out, { recursive: true, force: true });
// Not needed on the phone: the studio page, person-f.glb (CC BY-NC, must not be shipped in a public APK), Mixamo files, reference pictures, maps added on the PC.
const skip = ["studio.html", "models/people/backup", "models/animations/backup", "maps/grassland", "maps/snow-north", "maps/salt-desert", "maps/added", "models/person-f.glb"].map((p) => path.join(root, "dist", p));
fs.cpSync(path.join(root, "dist"), out, { recursive: true, filter: (src) => !skip.includes(src) && !/\.fbx$/i.test(src) });
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`app-www: ${(size(out) / 1048576).toFixed(1)} MB`);
run("npx cap sync android");
