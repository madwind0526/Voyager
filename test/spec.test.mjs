import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateClothes, validateMap } from "../shared/spec.mjs";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));

test("built-in content passes validation", () => {
  for (const f of ["basic", "linen", "coat", "stripe"]) assert.ok(validateClothes(read(`../public/clothes/${f}.json`)).ok, f);
  assert.ok(validateMap(read("../public/maps/salt-desert.json")).ok);
});

test("built-in maps carry the new fields", () => {
  const snow = validateMap(read("../public/maps/snow-north.json")).value;
  assert.equal(snow.ground.kind, "snow");
  assert.equal(snow.sky.aurora, 1);
  assert.equal(snow.horizon.snow, 0.9);
  assert.equal(validateMap({ schema: "voyager.map/1", name: "x", ground: { kind: "lava" } }).ok, false);
  assert.equal(validateMap({ schema: "voyager.map/1", name: "x", sky: { nightPhotos: "../etc" } }).ok, false);
});

test("bad content is rejected", () => {
  const c = read("../public/clothes/coat.json");
  assert.equal(validateClothes({ ...c, top: { color: "red" } }).ok, false);
  assert.equal(validateClothes({ ...c, top: { color: "#ffffff", pattern: "stripe" } }).ok, false); // color2 missing
  assert.equal(validateClothes({ ...c, shoes: { color: "#ffffff", pattern: "plaid", color2: "#000000" } }).ok, false);
  assert.equal(validateClothes({ ...c, schema: "voyager.clothes/1" }).ok, false);
  assert.equal(validateClothes({ ...c, hat: "crown" }).ok, false);
  assert.ok(validateClothes({ ...c, hat: "cap" }).ok);
  assert.equal(validateMap({ schema: "voyager.map/1", name: "x", ground: { color: "red" } }).ok, false);
  assert.equal(validateMap(null).ok, false);
});

// The authoring guide and the sample maps must always be valid, and use only the documented keys.
const ALLOWED = { "": ["schema", "name", "author", "ground", "sky", "horizon", "ambience", "scenery", "view"], scenery: ["trees", "treeColor"], view: ["locked"], ground: ["kind", "color", "reflect", "cracks", "path", "pathColor", "sea"], sky: ["clouds", "stars", "haze", "blue", "aurora", "nightPhotos"], horizon: ["mountains", "color", "snow", "trees", "height", "layout"], ambience: ["wind", "birds", "insects"] };
const onlyKnownKeys = (m) => {
  for (const k of Object.keys(m)) assert.ok(ALLOWED[""].includes(k), `unknown key ${k}`);
  for (const g of ["ground", "sky", "horizon", "ambience", "scenery", "view"]) for (const k of Object.keys(m[g] ?? {})) assert.ok(ALLOWED[g].includes(k), `unknown key ${g}.${k}`);
};

test("sample maps are valid", () => {
  const dir = new URL("../samples/maps/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const m = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
    assert.ok(validateMap(m).ok, f);
    onlyKnownKeys(m);
  }
});

test("the map guide's JSON blocks are valid", () => {
  const md = fs.readFileSync(new URL("../map 제작.md", import.meta.url), "utf8");
  const blocks = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((x) => JSON.parse(x[1]));
  assert.ok(blocks.length >= 5);
  for (const m of blocks) { assert.ok(validateMap(m).ok, m.name); onlyKnownKeys(m); }
});
