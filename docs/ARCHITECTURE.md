# Architecture

## Overview

Voyager is a single-page app (`index.html` + `src/main.ts`) with a PC authoring page (`studio.html` + `src/studio.ts`) and a small Node server. There is no UI framework: the HUD is plain DOM built with `h()` helpers in `src/ui.ts`, icons come from `lucide`.

```
browser                                   server (server/index.mjs)
 main.ts  HUD, modals, stamina loop  ---> /api/settings      saved settings (data/settings.json)
 world.ts three.js scene             ---> /api/maps/*        maps added in the app -> public/maps/added
 avatar.ts person, poses, clothes    ---> /api/sky/<folder>  list of sky pictures
 audio.ts music + ambience           ---> /api/fs/*          local music explorer (loopback only)
 thumbs.ts character pictures        ---> /api/people, /api/animations
 shared/spec.mjs  validators (also used by the server and the tests)
```

## The world (`src/world.ts`)

- The person stays at the origin; the ground scrolls under it (`pos` is the walked distance). Grass, footprints and ground patterns are placed from `pos`, so nothing has to move far from the origin.
- **Sky**: three.js `Sky` (physical, with clouds) by day; a dome shader at night with NASA's star map, the moon, moonlit clouds, meteors and a procedural aurora. Optional sky photos replace both (mirrored sideways so there is no seam).
- **Ground** (`ground.kind`): `salt` is a `Reflector` mirror with polygon cracks; `grass` is a plane plus 170 000 instanced blades (three plant types and wildflowers, wind in the vertex shader); `snow` and `sand` are procedural height-lit planes with footprints. All share one shader (`groundShader`, `uKind`).
- **Mountains**: a height-field range around the camera (`buildRange`), lit by the sun, with rock, snow and forest, fogged by distance. Colors come from the map (`horizon.color`). Maps without mountains (`horizon.mountains = 0`) show a flat horizon.
- Rendering goes through `EffectComposer` (bloom only at night, then `OutputPass` tone mapping). The domes are pre-multiplied because the output pass tone-maps them.
- Shaders must not use `sin()`-based hashes (GPU precision); use the sine-free `hash()`.

## People (`src/avatar.ts`, `src/bodies.ts`)

Rigged humanoids (Ready Player Me or Mixamo bone names, or Quaternius flat-color rigs through `BONE_ALIAS`). Rigs that carry their own clips (the bundled Quaternius characters) play Idle, Walk and SitDown from their files (`Person.motion = "clips"`); the code-driven pose in the model's rest frame (`"procedural"`) remains as the other choice. Mixamo rigs use retargeted Mixamo walk clips when present. `src/thumbs.ts` renders the character pictures with a second offscreen renderer.

## Audio (`src/audio.ts`)

Two `<audio>` elements (one through a 10-band EQ graph, one direct), a YouTube IFrame player, recorded ambience layers (wind, crickets, forest), shuffle and repeat. Gain nodes start at 0 to avoid a start-up click.

## Maps and content

`shared/spec.mjs` validates map and clothes JSON (the same code runs in the app, the studio and the server). The `+` card in settings imports a map file, keeps it in `localStorage` and in the server's `public/maps/added/`, and takes a card picture with `World.snapshot()`. At most 9 maps. See `docs/spec.md` and `map 제작.md`.

## Server

Plain `node:http`. Binds to loopback by default (`HOST=0.0.0.0` for a phone). Settings, saved maps and the local file explorer only answer requests from the computer itself, and the Host header is checked against DNS rebinding.
