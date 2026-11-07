import { asset } from "./config";
// The people the player can be. Add a rigged humanoid GLB (Mixamo or Ready Player Me bone names) to
// public/models/people; files found there are offered automatically (see registerPeople).
export interface Outfit { top: string[]; bottom: string[] } // material names that make up the top and the trousers
export interface Body { id: string; name: string; file: string; outfit?: Outfit }

export const DEFAULT_OUTFIT: Outfit = { top: ["Shirt", "Top", "Jacket", "Clothes"], bottom: ["Pants"] };

const person = (file: string): Body => ({
  id: "x:" + file,
  name: file.replace(/\.(glb|fbx)$/i, "").replace(/^[mf]_/i, "").replace(/[_-]+/g, " "),
  file: asset("/models/people/") + encodeURIComponent(file),
});

// Bundled characters, shown in this order; the first is the default.
const builtInBodies: Body[] = [
  person("m_Casual.glb"), person("f_Casual.glb"),
  { id: "rpm-f", name: "Brunette", file: asset("/models/person-f.glb") }, // Ready Player Me, realistic
  person("m_Suit.glb"), person("f_Suit.glb"),
  person("m_Cowboy.glb"), person("f_Kimono.glb"),
  person("m_Viking.glb"), person("f_Witch.glb"),
  person("m_Ninja.glb"),
];
export const BODIES: Body[] = [...builtInBodies];

export const defaultBody = () => BODIES[0].id;

/** Adds the character files found in public/models/people that are not bundled above. */
export function registerPeople(files: string[]) {
  const available = new Set(files);
  const validBuiltIns = builtInBodies.filter((b) => !b.id.startsWith("x:") || available.has(decodeURIComponent(b.file.slice(b.file.lastIndexOf("/") + 1))));
  BODIES.splice(0, BODIES.length, ...(files.length ? files.map(person) : validBuiltIns));
}
