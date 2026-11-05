import { BODIES, defaultBody } from "./bodies";
import type { MapSpec } from "./types";

export interface Settings {
  name: string;
  body: string; // id from bodies.ts
  animation: string;
  motion: "clips" | "procedural"; // how rigs that carry their own clips move
  tz: string;
  cycle: number; // hours for one full day-night loop: 24, 12, 8 or 6
  playlist: string[];
  lastSky: Record<string, string>; // the previous sky pictures, so they are not repeated
  critters: boolean; // birds and insects in the ambience
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  musicVol: number;
  ambientVol: number;
  mapId: string;
  maps: Record<string, MapSpec>;
  pictures: Record<string, string>; // card pictures by map content, kept after a map is deleted so adding it again reuses its picture
  musicPath: string; // folder or playlist file chosen in the built-in explorer ("" = none)
  musicKind: "dir" | "list";
  eq: number[]; // 10 bands, -100..100
  eqPreset: string;
}

const KEY = "voyager.settings";
let saveTimer = 0;
const defaults: Settings = {
  name: "", body: "x:m_Casual.glb", animation: "walk/Standard Walk.fbx", motion: "clips", tz: "auto", cycle: 24, playlist: [], lastSky: {}, critters: false, shuffle: true, repeat: "all", musicVol: 0.6, ambientVol: 0.6,
  musicPath: "", musicKind: "dir", eq: Array(10).fill(0), eqPreset: "Flat",
  mapId: "salt-desert", maps: {}, pictures: {},
};

export function load(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
    const s = { ...defaults, ...stored, animation: stored.animation ?? stored.walkAnimation ?? defaults.animation };
    delete (s as Settings & { walkAnimation?: string }).walkAnimation;
    // An unknown id is reset; extra people ("x:") are only known after the list is fetched.
    if (!s.body.startsWith("x:") && !BODIES.some((b) => b.id === s.body)) s.body = defaultBody();
    return s;
  } catch {
    return { ...defaults };
  }
}

export function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings last for this session only */
  }
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }).catch(() => {});
  }, 250);
}

export async function restore(s: Settings) {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) return;
    const stored = await response.json();
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      stored.animation ??= stored.walkAnimation;
      delete stored.walkAnimation;
      Object.assign(s, stored);
      localStorage.setItem(KEY, JSON.stringify(s));
    } else if (localStorage.getItem(KEY)) {
      save(s);
    }
  } catch {
    // Keep the local copy when the settings API is unavailable.
  }
}
