import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { DEFAULT_OUTFIT, type Outfit } from "./bodies";
import type { ClothesSpec, Part } from "./types";

// A rigged human (Ready Player Me layout: Hips/Spine/LeftArm/... bones, one mesh per outfit part).
// Poses are procedural: every rotation is defined in the model's rest frame (+x = left, +z = front)
// and converted to a local bone rotation, so it works for any pose the model rests in.

const HEIGHT = 1.72; // meters; real adult proportions come from the model itself
const DEFAULT_SKIN = new THREE.Color("#e8c4a0");
const DEFAULT_ANIMATION = "walk/Standard Walk.fbx";
const animationPromises = new Map<string, Promise<THREE.AnimationClip | undefined>>();

function loadAnimation(file: string) {
  let clip = animationPromises.get(file);
  if (!clip) {
    const url = "/models/animations/" + file.split("/").map(encodeURIComponent).join("/");
    clip = new FBXLoader().loadAsync(url)
      .then((fbx) => fbx.animations.find((animation) => animation.tracks.length > 0))
      .catch(() => undefined);
    animationPromises.set(file, clip);
  }
  return clip;
}

function canonicalBoneName(name: string) {
  return name.replace(/^mixamorig\d*:?/i, "");
}

type Region = "skin" | "hair" | "hat" | "beard" | "top" | "bottom" | "shoes";
const REGION_BY_NODE: [RegExp, Region][] = [
  [/Headwear/i, "hat"], [/Hair$/i, "hair"], [/Beard/i, "beard"], [/Outfit_Top/i, "top"], [/Outfit_Bottom/i, "bottom"],
  [/Footwear/i, "shoes"], [/Head$|Body$/i, "skin"],
];

// Models with named flat-color materials (Quaternius characters): the region comes from the material name.
function regionOfMaterial(name: string, o: Outfit): Region | undefined {
  if (o.top.includes(name)) return "top";
  if (o.bottom.includes(name)) return "bottom";
  return name === "Skin" ? "skin" : name === "Hair" ? "hair" : undefined;
}
// Other rigs name the same bones differently; canonical (Mixamo / Ready Player Me) name -> alternative name.
const BONE_ALIAS: Record<string, string> = {
  Spine: "Abdomen", Spine1: "Torso", LeftShoulder: "ShoulderL", RightShoulder: "ShoulderR",
  LeftArm: "UpperArmL", RightArm: "UpperArmR", LeftForeArm: "LowerArmL", RightForeArm: "LowerArmR",
  LeftHand: "FistL", RightHand: "FistR", LeftUpLeg: "UpperLegL", RightUpLeg: "UpperLegR", LeftLeg: "LowerLegL", RightLeg: "LowerLegR",
};

interface Rest { local: THREE.Quaternion; parentWorld: THREE.Quaternion }
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export type Motion = "clips" | "procedural";

export class Person {
  /** "clips": rigs that carry their own animation clips (Quaternius) play those; "procedural": the built-in code-driven pose. */
  static motion: Motion = "clips";
  readonly group = new THREE.Group(); // faces -z, feet on y = 0
  private model?: THREE.Object3D;
  private bones: Record<string, THREE.Object3D> = {};
  private rest: Record<string, Rest> = {};
  private lower: Record<string, THREE.Quaternion> = {}; // brings the rest-pose arms down to the sides
  private regions: Record<Region, THREE.Mesh[]> = { skin: [], hair: [], hat: [], beard: [], top: [], bottom: [], shoes: [] };
  private meshes: THREE.Mesh[] = [];
  private orig = new Map<THREE.Material, { map: THREE.Texture | null; color: THREE.Color }>();
  private tex = new Map<string, THREE.Texture>();
  private pending?: ClothesSpec;
  private hipsHeight = 0.95;
  private mixer?: THREE.AnimationMixer;
  private walkAction?: THREE.AnimationAction;
  private mixerTime = 0;
  private isMixamoRig = false;
  private animationFile = DEFAULT_ANIMATION;
  private animationRoot?: THREE.Object3D;
  private walkLoadId = 0;
  private ownClips: THREE.AnimationClip[] = [];
  private ownMixer?: THREE.AnimationMixer;
  private ownActs: Record<string, THREE.AnimationAction> = {};
  private ownCur = "";
  private ownTime = 0;

  async load(url: string, outfit: Outfit = DEFAULT_OUTFIT) {
    const isFbx = /\.fbx$/i.test(url);
    let model: THREE.Object3D;
    if (isFbx) model = await new FBXLoader().loadAsync(url);
    else {
      const gltf = await new GLTFLoader().loadAsync(url);
      model = gltf.scene;
      this.ownClips = gltf.animations; // Quaternius characters ship with Idle, Walk, SitDown, ...
    }
    model.updateMatrixWorld(true);

    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        if (/^mixamorig\d*:?/i.test(o.name)) this.isMixamoRig = true;
        const name = canonicalBoneName(o.name);
        if (!this.bones[name]) this.bones[name] = o;
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        const matName = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
        const region = REGION_BY_NODE.find(([re]) => re.test(o.name))?.[1] ?? regionOfMaterial(matName, outfit);
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
        for (const m of mats as THREE.MeshStandardMaterial[]) {
          if (isFbx) {
            m.transparent = false;
            m.opacity = 1;
            m.alphaMap = null;
            m.alphaTest = 0;
            m.depthWrite = true;
            m.needsUpdate = true;
          }
          this.orig.set(m, { map: m.map, color: m.color.clone() });
        }
        if (region) this.regions[region].push(mesh);
        this.meshes.push(mesh);
      }
    });

    for (const [canon, alt] of Object.entries(BONE_ALIAS)) if (!this.bones[canon] && this.bones[alt]) this.bones[canon] = this.bones[alt];

    // Rest data, captured before any transform is applied.
    const chain = (o: THREE.Object3D) => {
      const q = new THREE.Quaternion();
      const up: THREE.Object3D[] = [];
      for (let p: THREE.Object3D | null = o; p && p !== model; p = p.parent) up.push(p);
      for (let i = up.length - 1; i >= 0; i--) q.multiply(up[i].quaternion);
      return q;
    };
    for (const [n, b] of Object.entries(this.bones)) {
      this.rest[n] = { local: b.quaternion.clone(), parentWorld: b.parent && b.parent !== model ? chain(b.parent) : new THREE.Quaternion() };
    }
    const pos = (n: string) => this.bones[n].getWorldPosition(new THREE.Vector3());
    for (const side of ["Left", "Right"]) {
      const arm = pos(`${side}Arm`), fore = pos(`${side}ForeArm`);
      const out = Math.sign(arm.x - pos("Hips").x) || 1;
      this.lower[`${side}Arm`] = new THREE.Quaternion().setFromUnitVectors(fore.sub(arm).normalize(), new THREE.Vector3(out * 0.12, -1, 0).normalize());
    }

    // Normalize size and stand the model on the ground.
    const box = new THREE.Box3().setFromObject(model);
    const k = HEIGHT / (box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    model.updateMatrixWorld(true);
    this.hipsHeight = pos("Hips").y;
    const holder = new THREE.Group();
    holder.rotation.y = Math.PI; // the model faces +z; the avatar faces -z
    holder.add(model);
    this.group.add(holder);
    this.model = holder;
    this.animationRoot = model;
    await this.setAnimation(this.animationFile);
    this.pose(0, 0, 0, 0);
    if (this.pending) this.setClothes(this.pending);
  }

  get ready() { return !!this.model; }

  async setAnimation(file: string) {
    if (file === this.animationFile && (this.mixer || !this.model || !this.isMixamoRig)) return;
    this.animationFile = file;
    const loadId = ++this.walkLoadId;
    if (!this.model || !this.animationRoot || !this.isMixamoRig) return;
    let clip = await loadAnimation(file);
    if (!clip && file !== DEFAULT_ANIMATION) clip = await loadAnimation(DEFAULT_ANIMATION);
    if (loadId !== this.walkLoadId) return;
    this.mixer?.stopAllAction();
    if (this.mixer && this.animationRoot) this.mixer.uncacheRoot(this.animationRoot);
    this.mixer = undefined;
    this.walkAction = undefined;
    if (!clip) return;
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf(".");
      if (dot < 0) continue;
      const suffix = track.name.slice(dot);
      const trackBone = canonicalBoneName(track.name.slice(0, dot));
      if (trackBone === "Hips" && suffix === ".position") continue;
      const bone = this.bones[trackBone];
      if (!bone) continue;
      const mapped = track.clone();
      mapped.name = `${bone.name}${suffix}`;
      tracks.push(mapped);
    }
    if (tracks.length < 20) return;
    this.mixer = new THREE.AnimationMixer(this.animationRoot);
    const mappedClip = new THREE.AnimationClip(file.slice(file.lastIndexOf("/") + 1).replace(/\.fbx$/i, ""), clip.duration, tracks);
    this.walkAction = this.mixer.clipAction(mappedClip).setLoop(THREE.LoopRepeat, Infinity);
  }

  // ---- clothes ----
  setClothes(c: ClothesSpec) {
    this.pending = c;
    if (!this.model) return;
    const known = new Set<THREE.Mesh>();
    for (const r of Object.keys(this.regions) as Region[]) {
      for (const mesh of this.regions[r]) {
        known.add(mesh);
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
          const o = this.orig.get(m)!;
          m.map = o.map;
          m.color.copy(o.color);
          if (r === "skin") m.color.setRGB(...(["r", "g", "b"] as const).map((ch) => Math.min(1.6, new THREE.Color(c.skin)[ch] / DEFAULT_SKIN[ch])) as [number, number, number]);
          else if (r === "top" || r === "bottom" || r === "shoes") {
            const part = c[r];
            // Flat-colored models (no textures) keep their own colors until the player picks an outfit.
            const keepOwn = !o.map && (r === "top" || r === "bottom") && c.natural?.[r];
            if (part && !keepOwn) this.paint(m, part);
          }
        }
        const base = r === "beard" ? c.beard === true : r === "hat" ? c.hat === "fedora" : true; // hair: the model's own, always shown
        mesh.visible = base;
      }
    }
    // Eyes, teeth, glasses: hidden while a single part is shown on its own.
    for (const mesh of this.meshes) if (!known.has(mesh)) mesh.visible = true;

  }

  private paint(m: THREE.MeshStandardMaterial, p: Part) {
    m.color.set(p.color);
    m.map = null;
    if (!p.pattern || p.pattern === "solid") return;
    const key = `${p.pattern}|${p.color}|${p.color2}|${p.scale}`;
    let t = this.tex.get(key);
    if (!t) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = p.color; g.fillRect(0, 0, 64, 64);
      g.fillStyle = p.color2!;
      if (p.pattern === "stripe") g.fillRect(0, 0, 64, 32);
      else if (p.pattern === "check") { g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }
      else { g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.fill(); }
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(p.scale ?? 4, p.scale ?? 4);
      this.tex.set(key, t);
    }
    m.color.set("#ffffff");
    m.map = t;
  }

  // ---- animation ----
  // Rotate a bone by `w`, a rotation expressed in the rest frame, relative to its (rest) parent.
  private put(name: string, w: THREE.Quaternion) {
    const b = this.bones[name], r = this.rest[name];
    if (!b || !r) return;
    b.quaternion.copy(r.parentWorld).invert().multiply(w).multiply(r.parentWorld).multiply(r.local);
  }
  private swing(name: string, angle: number, axis = X, extra?: THREE.Quaternion) {
    const w = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    if (extra) w.multiply(extra);
    this.put(name, w);
  }

  // gait: walk phase, amp: walk amount 0..1, sit: 0..1, t: seconds
  pose(gait: number, amp: number, sit: number, t: number) {
    if (!this.model) return;
    if (Person.motion === "clips" && this.ownClips.length && !this.isMixamoRig) { this.poseClips(amp, sit, t); return; }
    if (this.ownCur) { this.ownMixer?.stopAllAction(); this.ownCur = ""; } // back to the code-driven pose
    if (this.mixer && this.walkAction && amp > 0.01 && sit < 0.95) {
      if (!this.walkAction.isRunning()) {
        this.proceduralPose(gait, amp, sit, t);
        this.walkAction.reset().play();
        this.mixerTime = t;
      }
      this.walkAction.enabled = true;
      this.walkAction.setEffectiveWeight(amp);
      this.mixer.update(Math.min(0.1, Math.max(0, t - this.mixerTime)));
      this.mixerTime = t;
      this.setModelHeight(gait, amp, sit);
      return;
    }
    if (this.walkAction?.isRunning()) this.walkAction.stop();
    this.proceduralPose(gait, amp, sit, t);
  }

  // The rig's own clips: Idle when still, Walk while walking, SitDown (held on its last frame) while sitting.
  private poseClips(amp: number, sit: number, t: number) {
    if (!this.ownMixer && this.animationRoot) {
      this.ownMixer = new THREE.AnimationMixer(this.animationRoot);
      const find = (re: RegExp) => this.ownClips.find((c) => re.test(c.name));
      for (const [key, clip] of [["idle", find(/^idle$/i)], ["walk", find(/^walk$/i)], ["sit", find(/^sitdown$/i)]] as const) {
        if (!clip) continue;
        const a = this.ownMixer.clipAction(clip);
        if (key === "sit") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        this.ownActs[key] = a;
      }
    }
    if (!this.ownMixer) return;
    const want = sit > 0.5 && this.ownActs.sit ? "sit" : amp > 0.05 && this.ownActs.walk ? "walk" : "idle";
    if (want !== this.ownCur && this.ownActs[want]) {
      const next = this.ownActs[want];
      next.reset().setEffectiveWeight(1).play();
      if (this.ownCur) this.ownActs[this.ownCur].crossFadeTo(next, 0.3, false);
      this.ownCur = want;
    }
    this.ownMixer.update(Math.min(0.1, Math.max(0, t - this.ownTime)));
    this.ownTime = t;
    if (this.model) this.model.position.y = 0;
  }

  private proceduralPose(gait: number, amp: number, sit: number, t: number) {
    if (!this.model) return;
    const L = (a: number, b: number) => a + (b - a) * sit;
    const s = Math.sin(gait) * amp, c = Math.cos(gait) * amp;
    // Positive x-rotation swings a hanging limb backward; negative swings it forward.
    this.swing("LeftUpLeg", L(-0.5 * s, -2.4));
    this.swing("RightUpLeg", L(0.5 * s, -2.4));
    this.swing("LeftLeg", L(0.05 + 0.9 * Math.max(0, c), 1.25));
    this.swing("RightLeg", L(0.05 + 0.9 * Math.max(0, -c), 1.25));
    this.swing("LeftArm", L(0.45 * s, -0.12), X, this.lower.LeftArm);
    this.swing("RightArm", L(-0.45 * s, -0.12), X, this.lower.RightArm);
    this.swing("LeftForeArm", L(-0.3 - 0.15 * Math.abs(s), -0.5));
    this.swing("RightForeArm", L(-0.3 - 0.15 * Math.abs(s), -0.5));
    const breathe = Math.sin(t * 1.3) * 0.012;
    this.swing("Spine", -0.03 * sit + breathe);
    this.swing("Spine1", 0.1 * s, Y);
    this.swing("Hips", -0.08 * s, Y);
    this.swing("Head", -0.04 * s, Y);
    // Set the pelvis close to the ground with raised knees; walk with a small bob.
    this.setModelHeight(gait, amp, sit);
  }

  private setModelHeight(gait: number, amp: number, sit: number) {
    if (!this.model) return;
    const bob = 0.025 * Math.cos(gait * 2) * amp;
    const seatedY = -(this.hipsHeight - 0.10);
    const bodySit = Math.min(1, sit * 1.6);
    this.model.position.y = bob + (seatedY - bob) * bodySit;
  }
}
