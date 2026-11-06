# Voyager

> Working directory: `E:\Claude\Voyager`

## Project Overview

Zen walking app, mobile-first and portrait-only. A person seen from behind walks forward across a mirror-like salt desert; the sky, sun/moon, clouds, wind, birds and insects change with the time of day. Stamina bar: walk until empty, then sit until refilled. Music always plays (playlist in settings, default track in `src/config.ts`); turning it off sits the avatar down. Menus are icon-only (profile, wardrobe, community, settings). Users make clothes and maps on a PC (`/studio.html`) following `docs/spec.md` and share them through the community.

## Tech Stack

TypeScript + Vite, Three.js (physical Sky with clouds, Reflector mirror ground, ACES tone mapping), rigged GLB person with procedural walk/sit (`src/avatar.ts`), Web Audio synth ambience, YouTube IFrame or `<audio>` music, `lucide` icons, plain Node HTTP server for the community API. No UI framework.

## Structure

- `src/world.ts` scene (sky, ground, mountains, camera) · `src/avatar.ts` person model, clothes, poses · `src/audio.ts` music (YouTube/local/URL) + ambience · `src/main.ts` HUD, sheets, loop · `src/studio.ts` PC authoring
- `shared/spec.mjs` content validators (client + server) · `public/{clothes,maps,models}` built-ins · `docs/spec.md` content standard
- `server/index.mjs` community API (`data/community/`) + serves `dist/`

## Commands

```bash
start.bat          # build, then run on http://127.0.0.1:4315 (frees the port first)
start.bat dev      # API with auto-restart (4315) + Vite dev (5186)
stop.bat           # stop both
npm test           # spec validator tests
npm run build      # typecheck + production build
```

Ports are assigned in `C:\Claude\PORTS.md` (5186 UI, 4315 API). To test on a phone: `set HOST=0.0.0.0` before `start.bat`.

## Rules

- Code comments in English, UI text in Korean (G-01, G-02). UI is icon-first; labels only as aria-label/title.
- Portrait only: manifest + `screen.orientation.lock` + a CSS rotate fallback in `style.css`.

## Memory Bank

`memory-bank/`: read `active-context.md` then `STATE.md` at session start.

## Notes

- Default music is the YouTube playlist in `src/config.ts` (`DEFAULT_TRACK`); a YouTube link in the settings playlist also uses the IFrame player (stops when the phone locks).
- Shaders must not use `sin()`-based hashes (precision loss on GPUs); see `hash()` in `src/world.ts`.
- Ambience is real CC0 recordings in `public/sounds/` (credits in `CREDITS.txt`); never synthesize ambience (electronic beeps were rejected). Night sky is NASA's star map (`public/sky/starmap.jpg`).
- EQ (10 bands, SongYUE2 scale) applies to file/URL/local music only; YouTube audio cannot be routed through Web Audio.
- The profile only picks a character (name, gender, person). There is no hat, hair or outfit choice: each model keeps its own look (`DEFAULT_CLOTHES` in `src/catalog.ts` only tidies the textured Ready Player Me models). Community sharing is for maps only.
- Character pictures in the profile come from `src/thumbs.ts` (a second offscreen renderer).
- Sky pictures: drop images into `public/sky/day` / `public/sky/night` (see the READMEs there); at each dawn/dusk one is picked at random and replaces the built-in sky. No pictures = built-in sky (physical day sky, NASA star map + moon + moonlit clouds at night).
- UI text is English (the owner asked for English presets, map name and messages); only code comments must stay English too.
- Photo scenery: `horizon.photo` draws three overlapping mountain pictures (`public/mountains/<set>-{far,mid,near}.webp`) and `scenery.treeType:"photo"` draws billboard trees (`public/trees/*.webp`), both generated with ComfyUI (see `docs/ASSETS.md`, scripts in `scripts/images/`). `horizon.fog` (0..1, default 0.3) is the mist at the foot of the mountain layers; the lowest meters are always covered. Mountain layers draw after the star and night-sky domes (`renderOrder`), far photo trees only darken with distance (never fade to white haze).
- Built-in maps: salt-desert, grassland, snow-north, forest-path, moon-shore (pebble ground + sea on the right, fixed sunset `sky.hour`, its own sky picture `public/sky/maps/fantasy-moon.jpg` via `sky.picture`, photo trees only on the left via `treeSide`) (list in `loadBuiltins()` in `src/main.ts`, each with a 360x360 card `.jpg`).
- Store material (`store/`): `feature-1024x500.png` and `promo/real-*.png` are made by `scripts/images/feature.py` and `mockup.py` from real app screenshots (`store/gen/`, ignored by git).
- Bodies are listed in `src/bodies.ts`; add a rigged humanoid GLB to `public/models` and one line there to offer it in the profile.
- Dev only: `window.__sound`, `window.__world` (studio) for debugging.
