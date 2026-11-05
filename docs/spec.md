# Voyager content standard

Clothes and maps are plain JSON files, validated by `shared/spec.mjs` (the same code runs in the app, the studio and the server). Author them on a PC in `/studio.html` (live preview, open, save, upload); phones can only browse and apply them.

## Clothes — `voyager.clothes/2`

The clothes format below dates from the Ready Player Me character (`public/models/person-f.glb`, not bundled in the repository: CC BY-NC). It is not used by the current profile, which only picks a character. Clothes recolor or pattern its parts; the shape of the clothing itself comes from the model.

```json
{
  "schema": "voyager.clothes/2", "name": "...", "author": "...",
  "skin": "#e8c4a0",
  "top":    { "color": "#27364f", "pattern": "stripe", "color2": "#f2f2ee", "scale": 6 },
  "bottom": { "color": "#4a5262" },
  "shoes":  { "color": "#2f2f33" },
  "beard": false
}
```

| field | meaning |
|---|---|
| `skin` | skin tone, `#rrggbb` (the model's own tone is `#e8c4a0`) |
| `top`, `bottom`, `shoes` | optional parts. Omit one to keep the model's original look |
| `*.color` | base color, `#rrggbb` |
| `*.pattern` | optional: `solid`, `stripe`, `check`, `dot`. A pattern needs `color2` |
| `*.scale` | pattern repeat, 1..12 (default 4) |
| `beard` | `true` to show the model's beard (hidden by default) |
| `hat` | `none`, `cap`, `beanie`, `brim`, `fedora` (the male model's own hat; the others are added parts) |

Characters live in `src/bodies.ts`; `person-f.glb` is a Ready Player Me avatar (CC BY-NC 4.0, non-commercial use only). The female model has its own hair mesh: `hairStyle: "default"` shows it, any other style hides it and adds a procedural one.

To use a different body or outfit shapes, replace `public/models/person-f.glb` with a Ready Player Me style GLB (same bone names: Hips, Spine, LeftArm, LeftUpLeg, ...; meshes named `*Outfit_Top`, `*Outfit_Bottom`, `*Outfit_Footwear`, `*Headwear`, `*Beard`, `*Head`, `*Body`). Create your own free avatar at readyplayer.me. The bundled file is the sample avatar from the three.js examples (MIT repository, avatar by Ready Player Me); check its terms before publishing the app.

## Map — `voyager.map/1`

All fields except `schema` and `name` are optional (0..1 unless noted).

| field | meaning |
|---|---|
| `ground.kind` | `salt` (mirror), `grass` (swaying meadow), `snow` or `sand` (both leave footprints) |
| `sky.aurora` `sky.nightPhotos` | aurora strength 0-1; night picture folder under `public/sky` (default `night`) |
| `horizon.height` | 0.1-0.9: where the horizon sits, as a fraction of the screen height from the bottom (default 0.4) |
| `horizon.layout` | `valley` (high sides, low middle) or `ahead` (one big mountain straight ahead) |
| `ground.pathStyle` | `dirt` or `road` (asphalt with lane lines) |
| `ground.flowers` `ground.flowerColors` | wildflower amount 0-4 and up to 4 colors (grass) |
| `scenery.treeType` | `fir`, `spruce`, `birch` or `broadleaf` |
| `ground.sea` | sand maps: the sea lies to the right of the walking direction, 0-1 (shoreline distance), with foam and swells |
| `ground.path` `ground.pathColor` | a straight path ahead (width 0-1, color) on grass, snow and sand |
| `scenery.trees` `scenery.treeColor` | trees on both sides of the path (density 0-1, leaf color) |
| `view.locked` | `true` fixes the camera: no turning or tilting |
| `horizon.trees` | dark conifer forest at the foot of the mountains 0-1 |
| `horizon.snow` | snow cover on the mountains 0-1 |
| `ground.color` `ground.reflect` `ground.cracks` | salt color, mirror strength, salt-polygon cracks |
| `sky.clouds` `sky.stars` | cloud coverage, star brightness at night |
| `sky.haze` `sky.blue` | atmosphere: haze (more = whiter, milky sky) and blueness |
| `horizon.mountains` `horizon.color` | far ridge height (0 = none) and color. The ridges never get closer. |
| `ambience.wind` `ambience.birds` `ambience.insects` | wind level (also moves clouds), birds (day), insects (night) |

`thumb` (a card picture path) is honored for built-in maps only; other maps show a card made from their own colors. A guide to hand to an LLM (with samples) is in `map 제작.md`; the sample files are in `samples/maps/`. At most 9 maps are kept in the app (built-ins included). Maps added in the app are also saved as files in `public/maps/added/` (with a card `.jpg`); deleting a map in the app only removes it from the list.

A map changes only what is seen and heard; the ground is always flat and walkable in any direction.

## Community API

`GET /api/community/{clothes|maps}` lists items; `POST` the JSON to add one (validated, max 64 KB, no accounts or moderation yet).
