# Voyager

A quiet, mobile-first walking app. A person, seen from behind, walks across a wide, flat world while the sky, sun, moon, clouds, wind and sounds follow the time of day. Walk until the stamina runs out, then sit and rest. Music always plays; turn it off and the person sits down.

- Portrait only, icon-only menus, built for phones (it also runs in a desktop browser).
- Maps: **Salt Desert** (mirror lake), **Grassland** (swaying meadow with wildflowers), **Snow North** (snowfall, footprints, aurora). You can add your own with a JSON file (see [map 제작.md](map%20제작.md), written so an LLM can create maps for you), up to 9 maps in total.
- Day and night cycle with a chosen time zone and day length (3 / 6 / 9 / 12 / 24 hours).
- Real ambience recordings (wind, crickets, forest), a music player (YouTube playlist, local files, URLs) with a 10-band equalizer.
- 10 playable characters (Mixamo / Quaternius rigs), walk and dance animations.

Tech: TypeScript, Vite, three.js, Web Audio, a small Node HTTP server. No UI framework.

## Install

Requirements: Node.js 20 or newer (tested on 24), Windows, macOS or Linux.

```bash
git clone https://github.com/madwind0526/Voyager.git
cd Voyager
npm install
```

Some assets are not in the repository (Mixamo characters and animations). The app runs without them; see [docs/ASSETS.md](docs/ASSETS.md) for what to add. The CC0 characters are included in `public/models/people/backup/`: copy the `.glb` files up one folder to use them.

## Run

Windows (recommended):

```bat
start.bat          :: build, then serve on http://127.0.0.1:4315
start.bat dev      :: API with auto-restart (4315) + Vite dev server (5186)
stop.bat           :: stop both
```

`start.bat` frees the ports first and opens a phone-sized app window.

Any OS:

```bash
npm run build && npm start     # http://127.0.0.1:4315
npm run dev:api & npm run dev  # development: API on 4315, UI on 5186
npm test                       # content validator tests
```

To try it on a phone on the same network, set `HOST=0.0.0.0` before starting the server and open `http://<computer-ip>:4315`. The local file explorer and the settings API only answer to the computer itself.

## How to use

1. Press the play button on the start screen.
2. Drag the screen to turn; the person walks where you face. The footprints button (bottom right) toggles walk and sit. When stamina (top left) reaches 0 the person must sit until it is full again.
3. Icons: profile (top right: your name and character), community and settings (bottom left), volume and walk/sit (bottom right), music controls (bottom center).
4. **Settings**: time zone, day length, map cards, wind volume and the bird toggle, music source (URL, folder, playlist file), equalizer.
5. **Add a map**: press the dashed **+** card in the map list and choose a `.json` map file. The app takes a picture of the map for its card. The trash icon removes a map from the list; the file stays in `public/maps/added/`.
6. In the animation setting, **Random** picks a new walk or dance each time the person rests and gets up (only walking on snow or sand, where footprints are left).

## Make your own map

Give [map 제작.md](map%20제작.md) to an LLM and ask for a map ("a foggy blue meadow at dawn"). Save its JSON answer as a `.json` file and add it with the **+** card. Samples are in `samples/maps/`. The field reference is in [docs/spec.md](docs/spec.md).

## Project layout

```
src/            app code: world.ts (scene), avatar.ts (people), audio.ts, main.ts (UI), studio.ts (PC authoring)
shared/         spec.mjs: validators for maps and clothes, used by the app, the studio and the server
server/         index.mjs: static server, settings, local file explorer, saved maps
public/         maps, models, sounds, sky pictures served as is
samples/maps/   example map files
docs/           spec.md (content standard), ASSETS.md, ARCHITECTURE.md
memory-bank/    working notes from the AI-assisted development of this project
test/           validator tests
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ASSETS.md](docs/ASSETS.md), [credits](public/sounds/CREDITS.txt).

## License and credits

Third-party assets keep their own licenses: the ambience sounds are CC0, the star map and moon are NASA (public domain), the Quaternius characters are CC0, and `public/models/person-f.glb` is a Ready Player Me avatar under CC BY-NC 4.0 (non-commercial use only). Mixamo characters and animations are not included; follow Adobe's Mixamo terms when you add them. No license has been chosen for the code yet. Details in [docs/ASSETS.md](docs/ASSETS.md) and `public/sounds/CREDITS.txt`.
