import "@fontsource/orbitron/600.css";
import "./style.css";
import { Coffee, PersonStanding, ArrowUp, Armchair, Check, Folder, Info, Music, SlidersVertical, Clock, Download, FolderOpen, Footprints, Bird, Pause, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Globe, Heart, ListMusic, Mountain, Play, Settings as Cog, Trash2, Upload, User, Users, Volume2, Wind, X } from "lucide";
import { validateMap } from "../shared/spec.mjs";
import { DEFAULT_TRACK, DRAIN_SECONDS, REFILL_SECONDS, SUPPORT_URL } from "./config";
import { EQ_LABELS, EQ_PRESETS, Sound } from "./audio";
import { load, normalize, restore, save } from "./state";
import { dayHour } from "./time";
import type { MapSpec } from "./types";
import type { IconNode } from "lucide";
import { btn, h, ic, swatch } from "./ui";
import { BODIES, registerPeople } from "./bodies";
import { thumb } from "./thumbs";
import { DEFAULT_CLOTHES } from "./catalog";
import { World } from "./world";
import { Capacitor, registerPlugin } from "@capacitor/core";

// Android app only (android/.../FolderMusicPlugin.java): pick a folder of the phone and list every audio file below it.
const FolderMusic = registerPlugin<{ pickFolder(): Promise<{ path: string }>; listAudio(o: { path: string }): Promise<{ files: string[] }> }>("FolderMusic");
const isApp = Capacitor.isNativePlatform();
const fileUrl = (path: string) => Capacitor.convertFileSrc("file://" + path.split("/").map(encodeURIComponent).join("/"));

const CYCLES = [3, 6, 9, 12, 24];
const ANIMATION_LABELS: Record<string, string> = {
  "standard walk.fbx": "Standard Walk",
  "walking-cat.fbx": "Walking Cat",
  "walking1.fbx": "Walking 1",
  "walking2.fbx": "Walking 2",
};
interface AnimationOption { id: string; file: string }
const RANDOM_ANIMATION = "random"; // setting value: pick a new walk or dance every time the avatar gets up from a forced rest
let animations: { walk: AnimationOption[]; dance: AnimationOption[] } = {
  walk: [{ id: "walk/Standard Walk.fbx", file: "Standard Walk.fbx" }], dance: [],
};
const s = load();
if (!CYCLES.includes(s.cycle)) s.cycle = 24;
const world = new World(document.getElementById("view") as HTMLCanvasElement);
const sound = new Sound();
const hud = document.getElementById("hud")!;
if (import.meta.env.DEV) Object.assign(window, { __sound: sound, __world: world }); // dev-only debugging hooks

let bMaps: MapSpec[] = [];
const allMaps = () => [...bMaps, ...Object.values(s.maps)];
const curMap = () => allMaps().find((x) => x.id === s.mapId) ?? bMaps[0];

async function loadBuiltins() {
  const get = async (p: string) => (await fetch(p)).json();
  // Run built-ins through the validators so defaults are filled in, keeping their ids.
  const norm = async (p: string, v: (x: unknown) => any) => {
    const raw = await get(p), r = v(raw);
    if (!r.ok) throw new Error(`${p}: ${r.error}`);
    return { ...r.value, id: raw.id, ...(raw.thumb ? { thumb: raw.thumb } : {}) };
  };
  // One missing or broken file must not stop the app: skip it, and fall back to a plain salt map if none loads.
  const done = await Promise.allSettled(["salt-desert", "grassland", "snow-north", "forest-path", "moon-shore"].map((n) => norm(`/maps/${n}.json`, validateMap)));
  bMaps = done.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!bMaps.length) bMaps = [{ ...(validateMap({ schema: "voyager.map/1", name: "Salt Desert" }) as any).value, id: "salt-desert" }];
}

function apply() {
  const m = allMaps().find((x) => x.id === s.mapId) ?? bMaps[0];
  world.setBody(s.body);
  world.setClothes(DEFAULT_CLOTHES);
  world.setMap(m);
  if (leavesPrints() !== lastPrints) { lastPrints = leavesPrints(); applyAnimation(); } // moving onto or off such a ground changes which animations are allowed
  sound.setAmbience(m.ambience);
  sound.setVolumes(s.musicVol, s.ambientVol);
  sound.setEq(s.eq, true);
  sound.setCritters(s.critters);
}

// Local picks (folder/m3u) last for this session only: browsers cannot keep file handles in localStorage.
let local: string[] = [];
let localLabel = "";
// Source priority: files picked on this device (session only) > folder/list picked in the explorer > URLs > default.
async function applyMusic() {
  if (local.length) return sound.setPlaylist(local, DEFAULT_TRACK);
  if (s.musicPath.startsWith("phone:")) {
    try {
      const { files } = await FolderMusic.listAudio({ path: s.musicPath.slice(6) });
      const sorted = files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (sorted.length) return sound.setPlaylist(sorted.map(fileUrl), DEFAULT_TRACK);
    } catch { /* permission refused or folder gone: fall through to the URL list */ }
  } else if (s.musicPath) {
    try {
      const urls: string[] = await (await fetch(`/api/fs/${s.musicKind === "dir" ? "tracks" : "m3u"}?path=${encodeURIComponent(s.musicPath)}`)).json();
      if (Array.isArray(urls) && urls.length) return sound.setPlaylist(urls, DEFAULT_TRACK);
    } catch { /* server unreachable or folder gone: fall through to the URL list */ }
  }
  sound.setPlaylist(s.playlist, DEFAULT_TRACK);
}
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

// ---------- HUD (all overlaid on the canvas) ----------
let started = false;
let wantWalk = true;
let forced = false; // exhausted: must sit until the bar is full
let stamina = 100;

const stamNum = h("span", "", "100");
const stam = h("div", "stam", ic(Heart), stamNum);
const clock = h("div", "clock", "--:--");
const walkBtn = btn(Footprints, "Walk / sit", () => { if (!forced && sound.musicOn) wantWalk = !wantWalk; }, "main");
const musicBtn = btn(Play, "Play / pause", () => sound.setMusic(!sound.musicOn), "main");
const vol = h("input");
vol.type = "range"; vol.min = "0"; vol.max = "1"; vol.step = "0.05"; vol.value = String(s.musicVol);
vol.setAttribute("aria-label", "Volume");
vol.oninput = () => { s.musicVol = Number(vol.value); save(s); sound.setVolumes(s.musicVol, s.ambientVol); };
// Shuffle toggles on/off; repeat cycles off -> one track -> all tracks.
const shuffleBtn = btn(Shuffle, "Shuffle", () => { s.shuffle = !s.shuffle; save(s); sound.setShuffle(s.shuffle); refreshModes(); });
const repeatBtn = btn(Repeat, "Repeat", () => { s.repeat = s.repeat === "off" ? "one" : s.repeat === "one" ? "all" : "off"; save(s); sound.setRepeat(s.repeat); refreshModes(); });
function refreshModes() {
  shuffleBtn.classList.toggle("dim", !s.shuffle);
  repeatBtn.classList.toggle("dim", s.repeat === "off");
  repeatBtn.replaceChildren(ic(s.repeat === "one" ? Repeat1 : Repeat));
  repeatBtn.title = repeatBtn.ariaLabel = s.repeat === "off" ? "Repeat: off" : s.repeat === "one" ? "Repeat: one track" : "Repeat: all tracks";
  shuffleBtn.title = shuffleBtn.ariaLabel = s.shuffle ? "Shuffle: on" : "Shuffle: off";
}
refreshModes();
sound.shuffle = s.shuffle;
sound.repeat = s.repeat;
const player = h("div", "player", shuffleBtn, btn(SkipBack, "Previous", () => sound.prev()), musicBtn, btn(SkipForward, "Next", () => sound.next()), repeatBtn);
const volBox = h("div", "vol", ic(Volume2), h("div", "vslide", vol));
hud.append(
  stam, clock,
  player,
  h("div", "corner tr", btn(User, "Profile", () => openProfile())),
  h("div", "corner bl", btn(Coffee, "Buy me a coffee", () => window.open(SUPPORT_URL, "_blank", "noopener")), btn(Cog, "Settings", () => openSettings())),
  h("div", "corner br", volBox, walkBtn),
);

let shownAnimation = "", lastPrints = false;
const leavesPrints = () => ["snow", "sand"].includes((allMaps().find((x) => x.id === s.mapId) ?? bMaps[0])?.ground.kind);
function applyAnimation() {
  // Where the ground keeps footprints (snow, later sand) only walking looks right, so dances are never used there.
  const prints = leavesPrints();
  const pool = (prints ? animations.walk : [...animations.walk, ...animations.dance]).map((o) => o.id);
  let id = s.animation;
  if (id === RANDOM_ANIMATION || !pool.includes(id)) {
    const all = pool.filter((x) => x !== shownAnimation);
    id = (all.length ? all : pool)[Math.floor(Math.random() * (all.length ? all : pool).length)] ?? "walk/Standard Walk.fbx";
  }
  shownAnimation = id;
  world.setAnimation(id);
}

const isSitting = () => !started || !sound.musicOn || forced || !wantWalk;

let dockKey = "";
function refreshButtons() {
  const sitting = isSitting();
  const key = `${sitting}${forced}${sound.musicOn}`;
  if (key === dockKey) return;
  dockKey = key;
  walkBtn.replaceChildren(ic(sitting ? Footprints : Armchair));
  walkBtn.classList.toggle("off", forced || !sound.musicOn);
  musicBtn.replaceChildren(ic(sound.musicOn ? Pause : Play));
}

const startLayer = h("div", "start", btn(Play, "Start", async () => {
  startLayer.remove();
  started = true;
  sound.start();
  sound.setMusic(true);
  if (matchMedia("(pointer: coarse)").matches) {
    try {
      await document.documentElement.requestFullscreen();
      await (screen.orientation as any).lock("portrait");
    } catch {
      /* not supported or refused: the manifest and CSS keep the portrait layout */
    }
  }
}));
hud.append(startLayer);

// ---------- pop-ups ----------
function openModal(build: (render: () => void) => (Node | string)[]) {
  const back = h("div", "modal");
  const close = () => { back.remove(); removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && hud.lastElementChild === back) close(); }; // only the top pop-up closes
  back.onclick = (e) => { if (e.target === back) close(); };
  back.setAttribute("role", "dialog");
  back.setAttribute("aria-modal", "true");
  addEventListener("keydown", onKey);
  const render = () => back.replaceChildren(h("div", "pop", h("div", "row end", btn(X, "Close", close)), ...build(render)));
  hud.append(back);
  render();
}

const mapSwatch = (m: MapSpec) => swatch([m.ground.color], "#bcd6f0");

// Up to 9 maps in total (the built-in ones included); the "+" card disappears when the list is full.
const MAX_MAPS = 9;

/** Give a map without its own picture a card picture: a photo of the map itself, taken once after it is applied. */
/** A stable key for a map's content (name, look and sound; not its id, author or picture). */
function mapKey(m: MapSpec): string {
  const text = JSON.stringify([m.name, m.ground, m.sky, m.horizon, m.ambience]);
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
  return (x >>> 0).toString(36) + text.length.toString(36);
}
const MAX_PICTURES = 30; // old pictures of deleted maps; the oldest go first

const mapFiles = new Map<string, string>(); // map id -> its file name in public/maps/added (this session)
let onPicture: () => void = () => {}; // set by the open settings pop-up so its cards refresh when a picture is ready
function capturePicture(id: string) {
  const m = s.maps[id];
  if (!m || m.thumb) return;
  const kept = s.pictures[mapKey(m)];
  if (kept) { m.thumb = kept; save(s); onPicture(); return; } // this map had a picture before: use it as it is
  // Two frames later the map's sky and ground are drawn; the sky picture may still be loading, which is fine for a card.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      if (s.mapId !== id) return; // another map is on screen now
      m.thumb = world.snapshot();
      const pics = Object.keys(s.pictures);
      if (pics.length >= MAX_PICTURES) delete s.pictures[pics[0]];
      s.pictures[mapKey(m)] = m.thumb;
      save(s);
      const file = mapFiles.get(id);
      if (file) void fetch("/api/maps/picture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file, thumb: m.thumb }) }).catch(() => {});
      onPicture();
    } catch { /* keep the color card */ }
  }));
}

/** Add a map from JSON text (a pasted LLM answer may be wrapped in a ``` fence). Returns an error message, or "" on success. */
function addMap(text: string): string {
  if (allMaps().length >= MAX_MAPS) return `The list is full (${MAX_MAPS} maps). Delete one first.`;
  let spec: any;
  try { spec = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); } catch { return "This is not valid JSON."; }
  if (JSON.stringify(spec).length > 20000) return "The map file is too large.";
  const r: any = validateMap(spec);
  if (!r.ok) return `Cannot use this map: ${r.error}`;
  const id = "u-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  const fileBody = JSON.stringify({ spec: { ...r.value } }); // the file keeps the map exactly as given, without the name added below
  if (!r.value.author && s.name) r.value.author = s.name;
  s.maps[id] = { ...r.value, id };
  // Keep the map as a file too: deleting it from the list later leaves the file in public/maps/added.
  void fetch("/api/maps/save", { method: "POST", headers: { "content-type": "application/json" }, body: fileBody })
    .then((res) => res.json()).then((x) => { if (x.file) { mapFiles.set(id, x.file); const th = s.maps[id]?.thumb; if (th) void fetch("/api/maps/picture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: x.file, thumb: th }) }).catch(() => {}); } }).catch(() => {});
  s.mapId = id;
  save(s);
  apply();
  void pickSky();
  capturePicture(id);
  return "";
}

/** The "+" card opens the system file dialog; the chosen .json file is added as a map. */
function pickMapFile(done: () => void) {
  const f = h("input") as HTMLInputElement;
  f.type = "file";
  f.accept = ".json,application/json";
  f.onchange = async () => {
    if (!f.files?.[0]) return;
    const e = addMap(await f.files[0].text());
    if (e) alert(e); else { onPicture = done; done(); }
  };
  f.click();
}

function mapGrid(render: () => void) {
  const grid = h("div", "grid");
  for (const m of allMaps()) {
    // A square picture card: the map name sits on a soft shade at the bottom, a tick marks the chosen one.
    const card = h("div", "card square mapcard", h("div", "nm", m.name));
    card.style.backgroundImage = m.thumb ? `url(${m.thumb})` : `linear-gradient(#a9c8ee 0 40%, ${m.horizon.color} 40% 54%, ${m.ground.color} 54%)`; // no picture: sky, hills and ground in the map's own colors
    card.style.backgroundSize = "cover"; // inline: the generic .card.on rules use the background shorthand
    card.style.backgroundPosition = "center";
    card.classList.toggle("on", m.id === s.mapId);
    if (m.id === s.mapId) card.append(h("div", "tick", ic(Check)));
    card.onclick = () => { s.mapId = m.id!; save(s); apply(); void pickSky(); render(); };
    if (s.maps[m.id!]) card.append(btn(Trash2, "Delete", () => { if (m.thumb) s.pictures[mapKey(m)] = m.thumb; /* keep the picture */ delete s.maps[m.id!]; if (s.mapId === m.id) s.mapId = "salt-desert"; save(s); apply(); render(); }, "x"));
    grid.append(card);
  }
  if (allMaps().length < MAX_MAPS) {
    const add = h("div", "card square mapcard add", ic(Plus));
    add.title = add.ariaLabel = "Add a map";
    add.onclick = () => pickMapFile(render);
    grid.append(add);
  }
  return grid;
}

// The people to pick from: each picture is that person.
function openProfile() {
  openModal((render) => {
    const name = h("input");
    name.type = "text";
    name.placeholder = "Name";
    name.maxLength = 20;
    name.value = s.name;
    name.oninput = () => { s.name = name.value; save(s); };
    const animation = h("select");
    animation.setAttribute("aria-label", "Animation");
    animation.append(new Option("Random", RANDOM_ANIMATION));
    for (const [label, files] of [["Walk", animations.walk], ["Dance", animations.dance]] as const) {
      if (!files.length) continue;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const option of files) group.append(new Option(ANIMATION_LABELS[option.file.toLowerCase()] ?? option.file.replace(/\.fbx$/i, "").replace(/[_-]+/g, " "), option.id));
      animation.append(group);
    }
    animation.value = s.animation;
    animation.onchange = () => { s.animation = animation.value; save(s); applyAnimation(); };
    const row = h("div", "opts");
    for (const b of BODIES) {
      const o = h("div", "opt" + (b.id === s.body ? " on" : ""));
      o.title = b.name;
      o.onclick = () => { s.body = b.id; save(s); apply(); render(); };
      thumb(DEFAULT_CLOTHES, b.id).then((url) => { o.style.backgroundImage = `url(${url})`; }).catch(() => o.remove());
      row.append(o);
    }
    return [
      h("div", "row", ic(User), name),
      ...(BODIES.some((b) => /\.fbx$/i.test(b.file)) ? [h("div", "row", h("span", "", "Animation"), animation)] : []), // walk clips only matter for Mixamo (FBX) characters
      h("div", "pick", ic(PersonStanding), row),
    ];
  });
}

// Built-in file explorer backed by the local server (/api/fs): pick a folder (all subfolders play) or a playlist file.
interface FsList { path: string; parent: string; dirs: { name: string; path: string }[]; files: { name: string; path: string; kind: "audio" | "list" }[] }
function openExplorer(kind: "dir" | "list", first: FsList, onPick: (path: string) => void) {
  let data = first;
  let rerender = () => {};
  const go = async (path: string) => {
    try { data = await (await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`)).json(); } catch { /* keep the current folder */ }
    rerender();
  };
  openModal((render) => {
    rerender = render;
    const rows = h("div", "list");
    const row = (icon: typeof Folder, name: string, cls: string, onClick?: () => void) => {
      const r = h("div", "item " + cls, ic(icon), h("div", "t", h("span", "", name)));
      if (onClick) r.onclick = onClick;
      rows.append(r);
    };
    for (const d of data.dirs) row(Folder, d.name, "click", () => void go(d.path));
    for (const f of data.files) {
      if (kind === "list" && f.kind === "list") row(ListMusic, f.name, "click", () => { onPick(f.path); closeTop(); });
      else if (kind === "dir" && f.kind === "audio") row(Music, f.name, "dim"); // shown for context only
    }
    const bar = h("div", "row", btn(ArrowUp, "Up", () => void go(data.parent), "icon"), h("div", "pathbar", data.path === "@roots" ? "PC" : data.path));
    if (kind === "dir" && data.path !== "@roots") bar.append(btn(Check, "Select this folder", () => { onPick(data.path); closeTop(); }, "icon ok"));
    return [bar, rows.children.length ? rows : h("div", "empty", "—")];
  });
}
const closeTop = () => [...hud.querySelectorAll(".modal")].pop()?.remove();

const ZONES = ["Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];

const CUSTOM = "Custom";
const eqMatch = () => Object.entries(EQ_PRESETS).find(([, v]) => v.every((x, i) => x === s.eq[i]))?.[0] ?? CUSTOM;

// 10-band equalizer, same bands and presets as the SongYUE2 studio.
function eqSection() {
  const sel = h("select");
  const bars: HTMLInputElement[] = [];
  const names = () => sel.replaceChildren(...(eqMatch() === CUSTOM ? [new Option(CUSTOM, CUSTOM)] : []), ...Object.keys(EQ_PRESETS).map((n) => new Option(n, n)));
  const refresh = () => { names(); sel.value = eqMatch(); };
  const commit = () => { s.eqPreset = eqMatch(); save(s); sound.setEq(s.eq, true); };
  sel.onchange = () => {
    const p = EQ_PRESETS[sel.value];
    if (!p) return;
    s.eq = [...p];
    commit();
    bars.forEach((r, i) => (r.value = String(s.eq[i])));
    refresh();
  };
  const row = h("div", "eq");
  EQ_LABELS.forEach((lab, i) => {
    const r = h("input");
    r.type = "range"; r.min = "-100"; r.max = "100"; r.step = "1";
    r.value = String(s.eq[i]);
    r.setAttribute("aria-label", lab + " Hz");
    r.oninput = () => { s.eq[i] = Number(r.value); commit(); refresh(); };
    bars.push(r);
    row.append(h("div", "eqbar", h("div", "vslide", r), h("small", "", lab)));
  });
  refresh();
  const note = sound.eqAvailable ? [] : [h("div", "note", ic(Info), "Does not apply to YouTube music")];
  return [h("div", "row", ic(SlidersVertical), sel), row, ...note];
}

function openSettings() {
  openModal((render) => {
    const tz = h("select");
    tz.append(new Option("Auto", "auto"), ...ZONES.map((z) => new Option(z, z)));
    tz.value = s.tz;
    tz.onchange = () => { s.tz = tz.value; save(s); syncClock(); };
    const cyc = h("div", "seg");
    for (const c of CYCLES) {
      const b = h("button", "chip", String(c));
      b.setAttribute("aria-label", `${c}-hour day`);
      b.classList.toggle("on", s.cycle === c);
      b.onclick = () => { s.cycle = c; save(s); syncClock(); render(); };
      cyc.append(b);
    }
    const range = (v: number, set: (n: number) => void) => {
      const r = h("input"); r.type = "range"; r.min = "0"; r.max = "1"; r.step = "0.05"; r.value = String(v);
      r.oninput = () => { set(Number(r.value)); save(s); sound.setVolumes(s.musicVol, s.ambientVol); };
      return r;
    };
    // One line: a text box for URLs (YouTube, mp3, ...), a folder button and a playlist-file button.
    const src = h("input");
    src.type = "text";
    src.placeholder = "https://";
    src.spellcheck = false;
    const shown = () => (local.length ? localLabel : s.musicPath ? s.musicPath.replace(/^phone:/, "Phone: ") || "Phone" : s.playlist.join(" "));
    src.value = shown();
    const picked = () => local.length > 0 || !!s.musicPath;
    src.classList.toggle("picked", picked());
    const setUrls = () => {
      if (picked() && src.value === shown()) return; // label of a picked folder, untouched
      const urls = src.value.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^https?:/i.test(x));
      local.forEach(URL.revokeObjectURL);
      local = [];
      s.musicPath = "";
      s.playlist = urls; // empty: back to the default playlist
      save(s);
      void applyMusic();
      src.classList.remove("picked");
    };
    src.onchange = setUrls;
    src.onkeydown = (e) => { if (e.key === "Enter") src.blur(); };
    src.onpaste = () => setTimeout(() => { setUrls(); src.blur(); }, 0);
    src.onfocus = () => { if (picked()) src.select(); };
    const chosen = () => { src.value = shown(); src.classList.toggle("picked", picked()); void applyMusic(); };
    // Native chooser, used on touch devices and wherever the built-in explorer is not available.
    const nativePick = (kind: "dir" | "list") => {
      const f = h("input"); f.type = "file";
      if (kind === "dir") { (f as any).webkitdirectory = true; f.multiple = true; f.accept = "audio/*"; } else f.accept = ".m3u,.m3u8,.pls";
      f.onchange = async () => {
        if (!f.files?.length) return;
        if (kind === "dir") {
          const rel = (x: File) => x.webkitRelativePath || x.name; // phone file choosers give several files, not a folder
          const files = [...f.files].filter((x) => AUDIO.test(x.name) || x.type.startsWith("audio/")).sort((a, b) => rel(a).localeCompare(rel(b), undefined, { numeric: true }));
          if (!files.length) return alert("No music files found");
          local.forEach(URL.revokeObjectURL);
          local = files.map((x) => URL.createObjectURL(x));
          localLabel = `${files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : files[0].name} · ${files.length}`;
        } else {
          const urls = (await f.files[0].text()).split(/\r?\n/).map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));
          if (!urls.length) return alert("This playlist has no web addresses. Choose a folder instead.");
          local.forEach(URL.revokeObjectURL);
          local = [];
          s.musicPath = "";
          s.playlist = urls;
          save(s);
        }
        chosen();
      };
      f.click();
    };
    const choose = async (kind: "dir" | "list") => {
      if (isApp && kind === "dir") {
        // The whole folder, sub-folders included, stays chosen after the app is closed.
        try {
          const { path } = await FolderMusic.pickFolder();
          local.forEach(URL.revokeObjectURL);
          local = [];
          s.musicPath = "phone:" + path;
          s.musicKind = "phone";
          save(s);
          chosen();
        } catch { /* cancelled */ }
        return;
      }
      if (!matchMedia("(pointer: coarse)").matches) {
        try {
          const r = await fetch(`/api/fs/list?path=${encodeURIComponent(kind === "dir" && s.musicKind === "dir" ? s.musicPath : "")}`);
          if (r.ok) {
            return openExplorer(kind, await r.json(), (path) => {
              local.forEach(URL.revokeObjectURL);
              local = [];
              s.musicPath = path;
              s.musicKind = kind;
              save(s);
              chosen();
            });
          }
        } catch { /* no local server: use the native chooser */ }
      }
      nativePick(kind);
    };
    const music = h("div", "row", ic(ListMusic), src, btn(FolderOpen, "Choose folder", () => void choose("dir"), "icon"), btn(ListMusic, "Playlist file", () => void choose("list"), "icon"));
    return [
      h("div", "row", ic(Globe), tz),
      h("div", "row", ic(Clock), cyc),
      h("div", "row", ic(Mountain)),
      mapGrid(render),
      h("div", "row", ic(Wind), range(s.ambientVol, (n) => (s.ambientVol = n)), (() => {
        const b = btn(Bird, "Birds and insects", () => { s.critters = !s.critters; save(s); sound.setCritters(s.critters); b.classList.toggle("on", s.critters); }, "icon");
        b.classList.toggle("on", s.critters);
        return b;
      })()),
      music,
      ...eqSection(),
    ];
  });
}

// On hold: the community button is not shown for now (the server API stays).
function openCommunity() {
  let items: any[] | null = null;
  let failed = false;
  let rerender = () => {};
  const fetchList = async () => {
    items = null; failed = false; rerender();
    try {
      const res = await fetch("/api/community/maps");
      const body = await res.json();
      if (!res.ok || !Array.isArray(body)) throw new Error("bad list");
      items = body;
    } catch { failed = true; }
    rerender();
  };
  const upload = () => {
    const f = h("input"); f.type = "file"; f.accept = ".json,application/json";
    f.onchange = async () => {
      try {
        const spec = JSON.parse(await f.files![0].text());
        if (!spec.author && s.name) spec.author = s.name;
        const r: any = validateMap(spec);
        if (!r.ok) throw new Error(r.error);
        const res = await fetch("/api/community/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r.value) });
        if (!res.ok) throw new Error(await res.text());
        fetchList();
      } catch (e) { alert("Upload failed: " + (e as Error).message); }
    };
    f.click();
  };
  const take = (it: any) => { if (!s.maps[it.id] && allMaps().length >= MAX_MAPS) { alert(`The list is full (${MAX_MAPS} maps). Delete one first.`); return; } s.maps[it.id] = it; s.mapId = it.id; save(s); apply(); void pickSky(); capturePicture(it.id); rerender(); };
  openModal((render) => {
    rerender = render;
    const rows = h("div", "list");
    for (const it of items ?? []) {
      const date = it.createdAt ? new Date(it.createdAt).toLocaleDateString("en-US") : "";
      rows.append(h("div", "item",
        mapSwatch(it),
        h("div", "t", h("span", "", it.name), h("small", "", `${it.author || "-"} · ${date}`)),
        btn(s.maps[it.id] ? Play : Download, s.maps[it.id] ? "Apply" : "Download", () => take(it)),
      ));
    }
    const body = failed ? h("div", "empty", "Cannot reach the server") : items && !items.length ? h("div", "empty", "—") : rows;
    return [h("div", "row end", btn(Upload, "Upload", upload, "chip")), body];
  });
  fetchList();
}

// ---------- clock + loop ----------
let hourBase = 12, tBase = performance.now();
function syncClock() { hourBase = dayHour(s.tz, s.cycle); tBase = performance.now(); }
// In-app hour (0..24): real time in the chosen zone, compressed when the day is shorter than 24h.
const hourNow = () => (hourBase + ((performance.now() - tBase) / 3600000) * (24 / s.cycle)) % 24;

let last = performance.now(), lastSync = 0, clockText = "";
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (now - lastSync > 60000) { syncClock(); lastSync = now; }

  const sitting = isSitting();
  stamina = Math.min(100, Math.max(0, stamina + (sitting ? 100 / REFILL_SECONDS : -100 / DRAIN_SECONDS) * dt));
  if (stamina <= 0) forced = true;
  if (forced && stamina >= 100) { forced = false; if (s.animation === RANDOM_ANIMATION) applyAnimation(); } // rested: decide the next action at random
  world.sitting = sitting;
  world.walking = !sitting;
  const sn = String(Math.round(stamina));
  if (stamNum.textContent !== sn) stamNum.textContent = sn;
  stam.classList.toggle("empty", forced);

  const hr = (curMap().sky.hour ?? -1) >= 0 ? curMap().sky.hour : hourNow();
  world.update(dt, hr);
  if (world.sunUp !== lastSunUp) { lastSunUp = world.sunUp; void pickSky(); } // dusk or dawn: a new random picture
  sound.setNight(world.night);
  const text = `${String(Math.floor(hr)).padStart(2, "0")}:${String(Math.floor((hr % 1) * 60)).padStart(2, "0")}`;
  if (text !== clockText) clock.textContent = clockText = text;
  refreshButtons();
  requestAnimationFrame(tick);
}

// Sky pictures: every evening (and morning) one picture is drawn at random from a folder under public/sky: "day", and
// "night" or the folder named by the map (the northern map uses "aurora"). A new map also gets new mountain shapes.
const skyLists = new Map<string, string[]>();

// The server lists characters, sky pictures and clips. The stand-alone phone app has no server, so those lists come from
// app-index.json (written at build time) and the server-only controls (PC folders, community) are hidden.
let appIndex: Promise<any> | undefined;
async function listing<T>(api: string, fromIndex: (index: any) => T): Promise<T> {
  try {
    const r = await fetch(api);
    if (r.ok && /json/.test(r.headers.get("content-type") ?? "")) return await r.json();
  } catch { /* no server */ }
  document.documentElement.classList.add("standalone");
  appIndex ??= fetch("/app-index.json").then((r) => r.json());
  return fromIndex(await appIndex);
}
async function skyList(folder: string) {
  if (!skyLists.has(folder)) {
    try { skyLists.set(folder, await listing(`/api/sky/${encodeURIComponent(folder)}`, (i) => i.sky[folder] ?? [])); } catch { skyLists.set(folder, []); } // nothing listed: built-in sky
  }
  return skyLists.get(folder)!;
}
let lastSunUp: boolean | null = null;
// Uniform random integer below n from the browser's cryptographic generator (no fixed or guessable seed).
const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
async function pickSky() {
  const kind = world.sunUp ? "day" : "night";
  const map = curMap();
  if (map.sky.picture) { world.newScenery(); return; } // the map brings its own sky picture
  const folder = kind === "day" ? "day" : map.sky.nightPhotos;
  const list = await skyList(folder);
  let i = list.length ? rnd(list.length) : -1;
  // Never the same picture twice in a row, not even across visits.
  if (list.length > 1 && list[i] === s.lastSky[folder]) i = (i + 1 + rnd(list.length - 1)) % list.length;
  s.lastSky[folder] = list[i] ?? "";
  save(s);
  world.setSkyPhoto(kind, i >= 0 ? list[i] : null);
  world.newScenery();
}

loadBuiltins().then(async () => {
  await restore(s);
  normalize(s);
  if (!CYCLES.includes(s.cycle)) s.cycle = 24;
  if (!allMaps().some((m) => m.id === s.mapId)) s.mapId = bMaps[0].id!;
  try {
    const available = await listing("/api/animations", (i) => i.animations);
    if (Array.isArray(available.walk) && Array.isArray(available.dance)) animations = available;
  } catch { /* use the built-in default */ }
  const animationFiles = [...animations.walk, ...animations.dance];
  const selectedAnimation = s.animation === RANDOM_ANIMATION ? { id: RANDOM_ANIMATION } : animationFiles.find((option) => option.id === s.animation || option.file === s.animation);
  const animationId = selectedAnimation?.id ?? animationFiles.find((option) => option.id === "walk/Standard Walk.fbx")?.id ?? animationFiles[0]?.id ?? "walk/Standard Walk.fbx";
  if (s.animation !== animationId) {
    s.animation = animationId;
    save(s);
  }
  let peopleFiles: string[] = [];
  try { peopleFiles = await listing("/api/people", (i) => i.people); registerPeople(peopleFiles); } catch { /* no server: built-in people only */ }
  const selected = BODIES.find((b) => b.id === s.body);
  const selectedFile = selected?.file.startsWith("/models/people/") ? decodeURIComponent(selected.file.slice("/models/people/".length)) : undefined;
  if (!selected || (selectedFile && !peopleFiles.includes(selectedFile))) {
    s.body = peopleFiles.length ? `x:${peopleFiles[0]}` : "rpm-f";
    save(s);
  }
  world.setMotion(s.motion);
  applyAnimation();
  world.setBody(s.body);
  syncClock();
  apply();
  applyMusic();
  requestAnimationFrame(tick);
});
