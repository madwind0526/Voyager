// Lists what the server would list (characters, sky pictures, walk clips) into public/app-index.json, so the stand-alone
// phone app, which has no server, can offer the same things. Run by the build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = (dir, re) => { try { return fs.readdirSync(path.join(pub, dir)).filter((f) => re.test(f)).sort(); } catch { return []; } };
const IMG = /\.(jpe?g|png|webp)$/i;
const sky = {};
for (const d of ["day", "night", "aurora"]) sky[d] = files(`sky/${d}`, IMG).map((f) => `/sky/${d}/` + encodeURIComponent(f));
const animations = { walk: [], dance: [] }; // Mixamo clips are not shipped in the app
const index = { people: files("models/people", /\.glb$/i), sky, animations };
fs.writeFileSync(path.join(pub, "app-index.json"), JSON.stringify(index));
console.log(`app-index.json: ${index.people.length} people, ${Object.values(sky).flat().length} sky pictures`);
