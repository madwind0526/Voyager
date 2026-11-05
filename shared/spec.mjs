// Shared validators for community content (used by the server and the client).
// Both validators return { ok: true, value } with a normalized copy, or { ok: false, error }.

export const CLOTHES_SCHEMA = "voyager.clothes/2";
export const MAP_SCHEMA = "voyager.map/1";
export const PARTS = ["top", "bottom", "shoes"];
export const PATTERNS = ["solid", "stripe", "check", "dot"];
export const GROUND_KINDS = ["salt", "grass", "snow", "sand"];
export const HATS = ["none", "cap", "beanie", "brim", "fedora"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const unit = (v, d) => (isNum(v) ? clamp(v, 0, 1) : d);
const fail = (error) => ({ ok: false, error });

export function validateClothes(input) {
  if (!input || typeof input !== "object") return fail("not an object");
  if (input.schema !== CLOTHES_SCHEMA) return fail("bad schema");
  const name = text(input.name, 40);
  if (!name) return fail("name required");
  const skin = input.skin ?? "#e8c4a0";
  if (!HEX.test(skin)) return fail("skin must be #rrggbb");
  const value = { schema: CLOTHES_SCHEMA, name, author: text(input.author, 30), skin };
  for (const k of PARTS) {
    const p = input[k];
    if (p === undefined) continue;
    if (!p || !HEX.test(p.color ?? "")) return fail(k + ".color must be #rrggbb");
    const part = { color: p.color };
    if (p.pattern !== undefined) {
      if (!PATTERNS.includes(p.pattern)) return fail(k + ".pattern is invalid");
      if (!HEX.test(p.color2 ?? "")) return fail(k + ".color2 must be #rrggbb");
      part.pattern = p.pattern;
      part.color2 = p.color2;
      part.scale = isNum(p.scale) ? clamp(p.scale, 1, 12) : 4;
    }
    value[k] = part;
  }
  if (input.beard !== undefined) value.beard = input.beard === true;
  if (input.hat !== undefined) {
    if (!HATS.includes(input.hat)) return fail("hat is invalid");
    value.hat = input.hat;
  }
  return { ok: true, value };
}

export function validateMap(input) {
  if (!input || typeof input !== "object") return fail("not an object");
  if (input.schema !== MAP_SCHEMA) return fail("bad schema");
  const name = text(input.name, 40);
  if (!name) return fail("name required");
  const g = input.ground ?? {};
  const s = input.sky ?? {};
  const h = input.horizon ?? {};
  const a = input.ambience ?? {};
  for (const c of [g.color, h.color]) if (c !== undefined && !HEX.test(c)) return fail("bad color");
  if (g.kind !== undefined && !GROUND_KINDS.includes(g.kind)) return fail("ground.kind is invalid");
  if (s.nightPhotos !== undefined && !/^[a-z0-9_-]{1,24}$/.test(s.nightPhotos)) return fail("sky.nightPhotos is invalid");
  return {
    ok: true,
    value: {
      schema: MAP_SCHEMA,
      name,
      author: text(input.author, 30),
      ground: { kind: g.kind ?? "salt", color: g.color ?? "#e8f0f4", reflect: unit(g.reflect, 0.85), cracks: unit(g.cracks, 0.4) },
      sky: { clouds: unit(s.clouds, 0.5), stars: unit(s.stars, 1), haze: unit(s.haze, 0.2), blue: unit(s.blue, 0.5), aurora: unit(s.aurora, 0), nightPhotos: s.nightPhotos ?? "night" },
      horizon: { mountains: unit(h.mountains, 0.5), color: h.color ?? "#8a9bb5", snow: unit(h.snow, 0), trees: unit(h.trees, 0) },
      ambience: { wind: unit(a.wind, 0.4), birds: unit(a.birds, 0.4), insects: unit(a.insects, 0.4) },
    },
  };
}
