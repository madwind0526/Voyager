# Assets: what is in the repository and what to add

The app starts without the optional assets below. Missing characters are skipped in the profile and missing sky pictures fall back to the built-in physical sky.

## In the repository

| Path | What | License |
|---|---|---|
| `public/sounds/` | wind, crickets, forest recordings | CC0 (OpenGameArt, see `CREDITS.txt`) |
| `public/sky/starmap.jpg`, `moon.jpg` | NASA star map and moon | public domain |
| `public/sky/day`, `night`, `aurora` | sky photos picked at random at every dusk and dawn | collected from Pinterest by the author; replace them with your own if you publish or share this project |
| `public/models/people/*.glb` | Quaternius characters (casual, suit, cowboy, viking, ninja, kimono, witch), animated with the clips inside the files | CC0 |
| `public/maps/*.json`, `*.jpg` | built-in maps and card pictures | the author's own |
| `public/maps/added/` | maps you add in the app (json + card jpg) | yours |

## Not in the repository (add them yourself)

1. **More characters** (optional) in `public/models/people/`: rigged humanoid `.glb` files, or [Mixamo](https://www.mixamo.com) FBX characters (Format "FBX Binary", Pose "T-pose"). They are ignored by git. Mixamo rigs use walk clips from `public/models/animations/walk` (FBX Binary, Without Skin, 30 FPS; `Standard Walk.fbx` is the default). Dance clips are not used.
2. **Walk animations** for Mixamo rigs only; the bundled CC0 characters do not need them.
3. **More sky pictures** (optional): put your own sky photos (sky only, no ground) in `public/sky/day`, `night` or `aurora`. Only use pictures you have the right to use. See the README in each folder.

Mixamo content may be used in projects but not redistributed as raw files, so it is never committed.

## Music

The default track is a YouTube playlist set in `src/config.ts` (`DEFAULT_TRACK`). In the settings you can use a URL, a local folder or a playlist file instead. The equalizer only works for file and URL music; YouTube audio cannot be routed through Web Audio.
