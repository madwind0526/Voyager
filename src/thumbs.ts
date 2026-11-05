import * as THREE from "three";
import { Person } from "./avatar";
import { BODIES } from "./bodies";
import type { ClothesSpec } from "./types";

// Renders a look on the person (from behind, slightly turned, as seen in the game) to a small
// transparent PNG. One shared offscreen renderer; requests are queued because they share the models.


let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();
const cam = new THREE.PerspectiveCamera(30, 200 / 300, 0.1, 20);
cam.position.set(0, 0.93, 4.2);
cam.lookAt(0, 0.88, 0);

function rig(id: string) {
  return (async () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b8, 1.6));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
    key.position.set(1.5, 3, 3);
    scene.add(key);
    const person = new Person();
    const body = BODIES.find((b) => b.id === id) ?? BODIES[0];
    await person.load(body.file, body.outfit);
    person.group.rotation.y = -0.55;
    scene.add(person.group); // faces -z, so a camera on +z sees the back
    return { scene, person };
  })();
}

/** PNG data URL of the look; cached by content. */
export function thumb(spec: ClothesSpec, body: string): Promise<string> {
  const key = `${body}|${JSON.stringify(spec)}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const { scene, person } = await rig(body);
    person.setClothes(spec);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(200, 300);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    try {
      renderer.render(scene, cam);
      const url = renderer.domElement.toDataURL("image/png");
      cache.set(key, url);
      return url;
    } finally {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  });
  queue = job.catch(() => {});
  return job;
}
