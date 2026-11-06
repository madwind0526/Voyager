// Builds the Windows installer: a web build without the heavy optional files (copied to desktop-www), then electron-builder.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
run("node scripts/make-index.mjs");
run("npm run build");
const out = path.join(root, "desktop-www");
fs.rmSync(out, { recursive: true, force: true });
// Left out: the studio page, Mixamo files, reference pictures, and person-f.glb (Ready Player Me, CC BY-NC: not for redistribution).
const skip = ["studio.html", "models/people/backup", "models/animations", "models/person-f.glb", "maps/grassland", "maps/snow-north", "maps/salt-desert", "maps/added"].map((p) => path.join(root, "dist", p));
fs.cpSync(path.join(root, "dist"), out, { recursive: true, filter: (src) => !skip.includes(src) && !/\.fbx$/i.test(src) });
run("npx electron-builder --win nsis");
