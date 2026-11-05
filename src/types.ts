export interface Part { color: string; pattern?: string; color2?: string; scale?: number }
export interface ClothesSpec {
  schema: string; id?: string; name: string; author: string; skin: string;
  top?: Part; bottom?: Part; shoes?: Part; beard?: boolean;
  hat?: string; // see HATS in shared/spec.mjs
  natural?: { top?: boolean; bottom?: boolean }; // keep a flat-colored model's own color (not saved or shared)
}
export interface MapSpec {
  schema: string; id?: string; name: string; author: string;
  thumb?: string; // card picture; built-in maps only (community maps cannot point at arbitrary URLs)
  ground: { kind: "salt" | "grass" | "snow" | "sand"; color: string; reflect: number; cracks: number; path: number; sea: number; pathColor: string; pathStyle: "dirt" | "road"; flowers: number; flowerColors: string[] };
  sky: { clouds: number; stars: number; haze: number; blue: number; aurora: number; nightPhotos: string };
  horizon: { mountains: number; color: string; snow: number; trees: number; height: number; layout: "valley" | "ahead" };
  scenery: { trees: number; treeColor: string; treeType: "fir" | "spruce" | "birch" | "broadleaf" };
  view: { locked: boolean };
  ambience: { wind: number; birds: number; insects: number };
}
