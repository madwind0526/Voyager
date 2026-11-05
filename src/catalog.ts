import type { ClothesSpec } from "./types";

// Characters are not dressed by the player. Textured models (Ready Player Me) get this plain outfit; flat-colored
// ones (Quaternius) keep their own clothes; the male model keeps its original fedora.
export const DEFAULT_CLOTHES: ClothesSpec = {
  schema: "voyager.clothes/2", id: "default", name: "Default", author: "", skin: "#e8c4a0",
  hat: "fedora",
  top: { color: "#cdd2d6" }, bottom: { color: "#3d4a63" }, shoes: { color: "#2f2f33" },
  natural: { top: true, bottom: true },
};
