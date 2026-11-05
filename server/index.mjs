// Community API (clothes and maps as validated JSON files) plus the built app.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { validateClothes, validateMap } from "../shared/spec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4315);
// Bind to loopback by default; set HOST=0.0.0.0 to reach it from a phone on the LAN.
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY = 64 * 1024;
const settingsFile = path.join(ROOT, "data", "settings.json");
const KINDS = { clothes: validateClothes, maps: validateMap };
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".glb": "model/gltf-binary", ".txt": "text/plain",
};
const MAX_ADDED_MAPS = 200; // files in public/maps/added; stops a runaway client from filling the disk

// Writes must come from this app's own pages as JSON. A cross-site form or fetch (which can send text/plain without a
// preflight) is refused; Sec-Fetch-Site is set by the browser and cannot be forged by a web page.
const isTrustedWrite = (req) => {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  return /^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "");
};

// ---- local music explorer (this machine's files; loopback requests only) ----
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
const LIST_RE = /\.(m3u8?|pls)$/i;
const AUDIO_TYPE = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", webm: "audio/webm" };
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const MAX_TRACKS = 5000;
// The Host check also blocks DNS-rebinding pages from reading local files.
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost|\[::1\]):?\d*$/.test(req.headers.host ?? "");
const fileUrl = (p) => "/api/fs/file?p=" + encodeURIComponent(p);

function roots() {
  if (process.platform !== "win32") return [{ name: "/", path: "/" }];
  const out = [];
  for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ":" + String.fromCharCode(92); if (fs.existsSync(d)) out.push({ name: d, path: d }); }
  return out;
}

function listDir(p) {
  if (p === "@roots") return { path: "@roots", parent: "", dirs: roots(), files: [] };
  if (!p) {
    const music = path.join(os.homedir(), "Music");
    p = fs.existsSync(music) ? music : os.homedir();
  }
  p = path.resolve(p);
  const ents = fs.readdirSync(p, { withFileTypes: true });
  const dirs = ents.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort(natural).map((name) => ({ name, path: path.join(p, name) }));
  const files = ents.filter((e) => e.isFile() && (AUDIO_RE.test(e.name) || LIST_RE.test(e.name))).map((e) => e.name).sort(natural)
    .map((name) => ({ name, path: path.join(p, name), kind: LIST_RE.test(name) ? "list" : "audio" }));
  const up = path.dirname(p);
  return { path: p, parent: up === p ? "@roots" : up, dirs, files };
}

function walkTracks(root) {
  const out = [];
  const stack = [path.resolve(root)];
  while (stack.length && out.length < MAX_TRACKS) {
    const d = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; } // unreadable folder: skip
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith(".")) stack.push(full);
      else if (e.isFile() && AUDIO_RE.test(e.name)) out.push(full);
    }
  }
  return out.sort(natural).slice(0, MAX_TRACKS).map(fileUrl);
}

function readPlaylist(file) {
  const base = path.dirname(file);
  const urls = [];
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || /^(\[playlist\]|NumberOfEntries|Version)/i.test(line)) continue;
    line = line.replace(/^File\d+=/i, "");
    if (/^https?:\/\//i.test(line)) urls.push(line);
    else {
      const abs = path.resolve(base, line);
      if (AUDIO_RE.test(abs) && fs.existsSync(abs)) urls.push(fileUrl(abs));
    }
    if (urls.length >= MAX_TRACKS) break;
  }
  return urls;
}

function serveAudio(req, res, p) {
  if (!path.isAbsolute(p) || !AUDIO_RE.test(p) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return send(res, 404, { error: "not found" });
  const size = fs.statSync(p).size;
  const type = AUDIO_TYPE[path.extname(p).slice(1).toLowerCase()] ?? "application/octet-stream";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
  fs.createReadStream(p).pipe(res);
}

function fsApi(req, res, url, parts) {
  if (!isLocal(req)) return send(res, 403, { error: "local only" });
  try {
    const q = url.searchParams.get("path") ?? "";
    if (parts[0] === "list") return send(res, 200, listDir(q));
    if (parts[0] === "tracks") return send(res, 200, walkTracks(q));
    if (parts[0] === "m3u") return send(res, 200, readPlaylist(path.resolve(q)));
    if (parts[0] === "file") return serveAudio(req, res, url.searchParams.get("p") ?? "");
    send(res, 404, { error: "unknown" });
  } catch (e) {
    send(res, 400, { error: String(e.message ?? e) });
  }
}

// Sky pictures: any image dropped into public/sky/day or public/sky/night is picked up (see the READMEs there).
const IMG_RE = /\.(jpe?g|png|webp)$/i;
const skyList = (kind) => {
  if (!/^[a-z0-9_-]{1,24}$/i.test(kind ?? "")) return []; // a plain folder name, never a path
  try {
    return fs.readdirSync(path.join(ROOT, "public", "sky", kind)).filter((f) => IMG_RE.test(f)).sort().map((f) => `/sky/${kind}/` + encodeURIComponent(f));
  } catch { return []; }
};

// Rigged humanoid GLB and FBX files in people are offered in the profile.
const peopleList = () => {
  try { return fs.readdirSync(path.join(ROOT, "public", "models", "people")).filter((f) => /\.(glb|fbx)$/i.test(f)).sort(); } catch { return []; }
};
const animationList = () => {
  const list = (kind) => {
    try { return fs.readdirSync(path.join(ROOT, "public", "models", "animations", kind)).filter((f) => /\.fbx$/i.test(f)).sort().map((file) => ({ id: `${kind}/${file}`, file })); }
    catch { return []; }
  };
  return { walk: list("walk"), dance: list("dance") };
};

// ---- maps the player added: kept as files in public/maps/added (a card picture sits next to each .json) ----
// Removing a map from the app's list never deletes these files.
const addedDir = path.join(ROOT, "public", "maps", "added");
async function addedMapsApi(req, res, action) {
  if (!isLocal(req)) return send(res, 403, { error: "local only" });
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
  if (!isTrustedWrite(req)) return send(res, 403, { error: "untrusted request" });
  let input;
  try { input = JSON.parse(await readBody(req, 1024 * 1024)); } catch { return send(res, 400, { error: "bad json or payload too large" }); }
  fs.mkdirSync(addedDir, { recursive: true });
  if (fs.readdirSync(addedDir).length >= MAX_ADDED_MAPS * 2) return send(res, 507, { error: "too many saved maps" });
  if (action === "save") {
    const r = validateMap(input?.spec);
    if (!r.ok) return send(res, 400, { error: r.error });
    const body = JSON.stringify(r.value, null, 2) + "\n";
    const slug = r.value.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "map";
    // The same content keeps its file; a different map with the same name gets -2, -3, ...
    for (let n = 1; ; n++) {
      const file = n === 1 ? slug : `${slug}-${n}`;
      const full = path.join(addedDir, file + ".json");
      if (!fs.existsSync(full)) fs.writeFileSync(full, body);
      else if (fs.readFileSync(full, "utf8") !== body) continue;
      return send(res, 200, { file });
    }
  }
  if (action === "picture") {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(input?.thumb ?? "");
    if (!m || !/^[a-z0-9-]{1,48}$/.test(input?.file ?? "")) return send(res, 400, { error: "bad picture" });
    fs.writeFileSync(path.join(addedDir, input.file + ".jpg"), Buffer.from(m[1], "base64"));
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: "not found" });
}

async function settingsApi(req, res) {
  if (!isLocal(req)) return send(res, 403, { error: "local only" });
  if (req.method === "GET") {
    try { return send(res, 200, JSON.parse(fs.readFileSync(settingsFile, "utf8"))); }
    catch (e) { if (e.code === "ENOENT") return send(res, 200, null); throw e; }
  }
  if (req.method !== "PUT") return send(res, 405, { error: "method not allowed" });
  if (!isTrustedWrite(req)) return send(res, 403, { error: "untrusted request" });
  let input;
  try { input = JSON.parse(await readBody(req, 1024 * 1024)); }
  catch { return send(res, 400, { error: "bad json or payload too large" }); }
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.name !== "string" || input.name.length > 20) {
    return send(res, 400, { error: "invalid settings" });
  }
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const temp = settingsFile + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(input));
  fs.renameSync(temp, settingsFile);
  return send(res, 200, { ok: true });
}

const dir = (kind) => path.join(ROOT, "data", "community", kind);
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > max) { reject(new Error("too large")); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function api(req, res, parts) {
  const validate = Object.hasOwn(KINDS, parts[0]) ? KINDS[parts[0]] : undefined;
  if (!validate) return send(res, 404, { error: "unknown kind" });
  fs.mkdirSync(dir(parts[0]), { recursive: true });
  if (req.method === "GET") {
    const items = fs.readdirSync(dir(parts[0])).filter((f) => f.endsWith(".json")).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir(parts[0]), f), "utf8")); } catch { return null; }
    }).filter(Boolean);
    return send(res, 200, items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  }
  if (req.method === "POST") {
    if (!isTrustedWrite(req)) return send(res, 403, { error: "untrusted request" });
    let input;
    try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "bad json" }, "application/json"); }
    const r = validate(input);
    if (!r.ok) return send(res, 400, { error: r.error });
    const id = crypto.randomBytes(6).toString("hex");
    const item = { ...r.value, id, createdAt: Date.now() };
    fs.writeFileSync(path.join(dir(parts[0]), id + ".json"), JSON.stringify(item));
    return send(res, 201, item);
  }
  send(res, 405, { error: "method not allowed" });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "api" && parts[1] === "people") return send(res, 200, peopleList());
    if (parts[0] === "api" && parts[1] === "animations") return send(res, 200, animationList());
    if (parts[0] === "api" && parts[1] === "settings") return await settingsApi(req, res);
    if (parts[0] === "api" && parts[1] === "maps") return await addedMapsApi(req, res, parts[2]);
    if (parts[0] === "api" && parts[1] === "sky") return send(res, 200, skyList(parts[2]));
    if (parts[0] === "api" && parts[1] === "fs") return fsApi(req, res, url, parts.slice(2));
    if (parts[0] === "api" && parts[1] === "community") return await api(req, res, parts.slice(2));
    // Static files from dist/; the path is resolved and must stay inside it.
    const dist = path.join(ROOT, "dist");
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname);
    let file = path.join(dist, rel);
    const pub = path.join(ROOT, "public");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(pub, rel);
    const within = (root) => file === root || file.startsWith(root + path.sep); // with the separator: "dist2" is not inside "dist"
    const inside = within(dist) || within(pub);
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "not found", "text/plain");
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] ?? "application/octet-stream");
  } catch (e) {
    send(res, 500, { error: String(e.message ?? e) });
  }
}).listen(PORT, HOST, () => console.log(`Voyager API on http://${HOST}:${PORT}`));
