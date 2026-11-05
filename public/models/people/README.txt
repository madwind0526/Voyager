People from Mixamo (or any rigged humanoid) go here as .glb or .fbx files; the profile offers them automatically. Animation clips go in `public/models/animations`.

Getting a character from Mixamo (https://www.mixamo.com, free Adobe account):
1. Characters tab -> pick one -> "Download": Format "FBX Binary (.fbx)", Pose "T-pose".
2. Name the file m_Name.fbx or f_Name.fbx to list it only for that gender (no prefix = both), drop it in this folder, reload the app.
   GLB files are also supported.
3. Save walk clips in `public/models/animations/walk` and dance clips in `public/models/animations/dance`. The folder determines the English Walk/Dance group in the profile; filenames can be anything. Download as FBX Binary, Without Skin, 30 FPS.

Notes
- The bones must be Mixamo or Ready Player Me style (mixamorigHips, Hips, ...). Mixamo characters are, so they work as they are.
- Only people whose clothes can be swapped are offered. Mixamo characters are usually one mesh each, so they are left out
  (hats would work, but the outfit would not). A character is offered when its clothes are separate meshes (Ready Player Me
  layout) or flat materials listed in src/bodies.ts.
- Mixamo's terms allow using characters in your own projects, but not redistributing the files on their own:
  keep this folder out of public repositories and downloads.

Bundled here: nine CC0 characters from Quaternius' "Ultimate Animated Characters" (https://quaternius.com):
m_Casual, m_Suit, m_Cowboy, m_Viking, m_Ninja, f_Casual, f_Kimono, f_Suit, f_Witch. Flat-colored shirt, pants and hair can be recolored.
