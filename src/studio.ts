import "./style.css";
import { Download, FolderOpen, Footprints, Mountain, Monitor, Shirt, Upload } from "lucide";
import { validateClothes, validateMap } from "../shared/spec.mjs";
import { dayHour } from "./time";
import { btn, h, ic } from "./ui";
import { World } from "./world";
import type { ClothesSpec, MapSpec } from "./types";

const root = document.getElementById("root")!;

// Authoring is PC-only: a phone just gets an icon.
if (matchMedia("(pointer: coarse)").matches) {
  root.append(h("div", "start", ic(Monitor)));
} else {
  init();
}

async function init() {
  const get = async (p: string) => (await fetch(p)).json();
  const templates = {
    clothes: (validateClothes(await get("/clothes/basic.json")) as any).value,
    map: (validateMap(await get("/maps/salt-desert.json")) as any).value,
  };
  let kind: "clothes" | "map" = "clothes";
  let clothes: ClothesSpec = templates.clothes;
  let map: MapSpec = templates.map;

  const canvas = h("canvas");
  const ta = h("textarea");
  ta.spellcheck = false;
  const msg = h("div", "msg");
  const hour = h("input");
  hour.type = "range"; hour.min = "0"; hour.max = "24"; hour.step = "0.1";
  hour.value = String(dayHour("auto", 24));
  const tabs = h("div", "row");
  const stage = h("div", "stage", canvas);
  stage.style.aspectRatio = "9 / 16";
  const side = h("div", "side", tabs, ta, msg, h("div", "row", hour), h("div", "row"));
  root.append(h("div", "studio-wrap", side, stage));

  const world = new World(canvas);
  world.sitting = false;
  world.walking = true;
  if (import.meta.env.DEV) (window as any).__world = world; // dev-only debugging hook
  world.setMap(map);
  world.setClothes(clothes);

  const show = () => {
    ta.value = JSON.stringify(kind === "clothes" ? clothes : map, null, 2);
    tabs.replaceChildren(
      btn(Shirt, "Clothes", () => { kind = "clothes"; show(); }, kind === "clothes" ? "chip on" : "chip"),
      btn(Mountain, "Map", () => { kind = "map"; show(); }, kind === "map" ? "chip on" : "chip"),
    );
    msg.textContent = "";
  };

  // Live preview: valid JSON is applied at once, errors are shown without touching the scene.
  ta.oninput = () => {
    try {
      const r: any = (kind === "clothes" ? validateClothes : validateMap)(JSON.parse(ta.value));
      if (!r.ok) throw new Error(r.error);
      if (kind === "clothes") world.setClothes((clothes = r.value)); else world.setMap((map = r.value));
      msg.className = "msg"; msg.textContent = "OK";
    } catch (e) {
      msg.className = "msg bad"; msg.textContent = (e as Error).message;
    }
  };

  const file = h("input");
  file.type = "file"; file.accept = ".json";
  file.onchange = async () => { ta.value = await file.files![0].text(); ta.oninput!(new InputEvent("input")); };
  const download = () => {
    const a = h("a");
    a.href = URL.createObjectURL(new Blob([ta.value], { type: "application/json" }));
    a.download = `${kind}.json`;
    a.click();
  };
  const upload = async () => {
    ta.oninput!(new InputEvent("input"));
    if (msg.className.includes("bad")) return;
    const res = await fetch(`/api/community/${kind === "clothes" ? "clothes" : "maps"}`, { method: "POST", headers: { "content-type": "application/json" }, body: ta.value });
    msg.className = res.ok ? "msg" : "msg bad";
    msg.textContent = res.ok ? "OK" : (await res.json()).error;
  };
  side.lastElementChild!.append(
    btn(FolderOpen, "Open", () => file.click(), "chip"),
    btn(Download, "Save", download, "chip"),
    btn(Upload, "Upload", upload, "chip"),
    btn(Footprints, "Walk", () => (world.sitting = !world.sitting), "chip"),
  );

  show();
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    world.update(dt, Number(hour.value));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
