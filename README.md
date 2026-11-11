# Voyager

A mobile-first **music player** with a walking-scenery visualizer. Play a YouTube playlist, local files or URLs with a 10-band equalizer, while a person, seen from behind, walks across a wide, flat world and the sky, sun, moon, clouds, wind and sounds follow the time of day. Walk until the stamina runs out, then sit and rest. Music always plays; turn it off and the person sits down.

- Portrait only, icon-only menus, built for phones (it also runs in a desktop browser).
- Maps: **Salt Desert** (mirror lake under layered blue ridges), **Grassland** (swaying meadow, tall forested peaks), **Snow North** (snowfall, footprints, aurora, snow peaks), **Forest Path** (a gravel path between photo trees that grow and slide past as you walk). You can add your own with a JSON file (see [map 제작.md](map%20제작.md), written so an LLM can create maps for you), up to 9 maps in total.
- Maps can draw the horizon from pictures (`horizon.photo`: three overlapping mountain layers, with `horizon.fog` setting the mist at their foot) and use photo trees (`scenery.treeType: "photo"`). Maps can also fix the camera, put trees and a path on both sides of the walker, set the horizon height, or add a sea to the right of a sandy beach (see the map guide).
- Day and night cycle with a chosen time zone and day length (3 / 6 / 9 / 12 / 24 hours).
- Real ambience recordings (wind, crickets, forest), a music player (YouTube playlist, local files, URLs) with a 10-band equalizer.
- 9 playable characters (Quaternius, CC0) that move with the clips stored in their own files (idle, walk, sit down).

Tech: TypeScript, Vite, three.js, Web Audio, a small Node HTTP server. No UI framework.

## Play in the browser

https://madwind0526.github.io/Voyager/ (built by `.github/workflows/pages.yml` on every push to `main`; in the repository settings, Pages > Source must be "GitHub Actions"). On a phone the Start button goes full screen; in a desktop browser it opens a 650x1200 window. The web version has no server, so settings stay in the browser and the PC-only features are hidden.

## Download (Windows, no setup)

Get `Voyager Setup x.y.z.exe` from the [Releases](https://github.com/madwind0526/Voyager/releases) page and run it; no Node.js or other tools are needed. The installer is not code-signed, so Windows SmartScreen may warn: choose "More info", then "Run anyway". Settings and community files are kept in `%APPDATA%\Voyager`.

To build the installer yourself: `npm run desktop:build` (output in `release/`, bundled web files in `desktop-www/`). Characters under CC BY-NC (`person-f.glb`) and Mixamo files are left out of it.

## Download (Android)

[`store/Voyager.apk`](store/Voyager.apk) is a debug-signed build: allow installing from unknown sources on the phone, then open the file. It runs stand-alone (no server).

## Install

Requirements: Node.js 20 or newer (tested on 24), Windows, macOS or Linux.

```bash
git clone https://github.com/madwind0526/Voyager.git
cd Voyager
npm install
```

Only CC0 and public-domain characters, sounds and star maps are committed, so the app runs right after `npm install`. Other characters (for example Mixamo) can be added locally; see [docs/ASSETS.md](docs/ASSETS.md).

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
3. Icons: profile (top right: your name and character), settings (bottom left), volume and walk/sit (bottom right), music controls (bottom center).
4. **Settings**: time zone, day length, map cards, wind volume and the bird toggle, music source (URL, folder, playlist file), equalizer.
5. **Add a map**: press the dashed **+** card in the map list and choose a `.json` map file. The app takes a picture of the map for its card. The trash icon removes a map from the list; the file stays in `public/maps/added/` (the list itself lives in the browser, so if its data is cleared, add the files again with **+**).
6. **Profile**: name and character. For Mixamo characters the walk animation can be chosen too, with **Random** picking a new one each time the person rests and gets up.

## Android app (stand-alone, no server)

The same app can be packaged as an Android app that runs entirely on the phone (Capacitor). Characters, sounds and sky pictures are bundled; settings and added maps are stored on the phone. Features that need the PC (choosing music folders from the PC, the community list) are hidden.

Requirements: Android Studio (its JDK and SDK), a phone with USB debugging.

```bash
npm run app:build                  # web build without the heavy optional files, then `cap sync`
cd android && gradlew.bat assembleDebug   # Windows; ./gradlew assembleDebug elsewhere
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Set `sdk.dir` in `android/local.properties` (not committed) and `JAVA_HOME` to Android Studio's `jbr` folder. The app icon is the Salt Desert card picture. In the settings, the folder button opens the phone's folder chooser: every audio file below the chosen folder, sub-folders included, is played in order (or shuffled), and the choice is kept after the app is closed (the app asks once for permission to read music). The default music is a YouTube playlist; inside the app's web view it may not play, so choose a music URL in the settings if it stays silent.

## Buy me a coffee

The coffee button sits at the bottom of the profile pop-up. It opens the page set in `src/config.ts` (`SUPPORT_URL`). To make your own page: sign up at https://buymeacoffee.com, create your page (the address looks like `https://buymeacoffee.com/your-name`), then put that address into `SUPPORT_URL` and rebuild.

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

Third-party assets keep their own licenses: the ambience sounds are CC0, the star map and moon are NASA (public domain), the Quaternius characters are CC0, and the sky photos are the author's own collection. Characters and animations from other sources (Mixamo, Ready Player Me) are not included. No license has been chosen for the code yet. Details in [docs/ASSETS.md](docs/ASSETS.md) and `public/sounds/CREDITS.txt`.
