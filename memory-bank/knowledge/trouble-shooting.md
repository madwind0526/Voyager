# Trouble Shooting

> 발생했던 버그와 해결 방법. 같은 문제를 두 번 겪지 않기 위한 기록.

## GLSL 난수 무늬가 먼 거리에서 사라짐

### 증상

별이나 지면 무늬가 큰 좌표에서 GPU마다 달라지거나 사라진다.

### 원인

`fract(sin(dot(p, ...)) * 43758.0)` 방식은 큰 인자에서 GPU 부동소수점 정밀도를 잃는다.

### 해결

삼각함수를 쓰지 않는 Hoskins 계열 해시를 사용한다. `src/world.ts`의 `hash(vec2)` 구현을 참고한다.

## 오디오 소스 제거가 재생 실패로 처리됨

### 증상

곡을 바꾸거나 YouTube 모드로 전환할 때 "재생 실패" 오류가 발생한다.

### 원인

`HTMLAudioElement.removeAttribute("src")`도 `error` 이벤트를 낸다.

### 해결

오류 처리기에서 현재 재생 요소가 아니거나 `src`가 비어 있으면 무시한다.

## 오실레이터 시작 순간 큰 삐 소리

### 증상

Web Audio 효과음이 시작할 때 큰 소리가 난다.

### 원인

새 `GainNode`의 기본 이득은 1이다.

### 해결

연결하기 전에 `gain.value = 0`으로 설정하고 목표 볼륨까지 부드럽게 올린다.

## YouTube 플레이리스트에서 Invalid video id

### 증상

YouTube 플레이리스트 모드에서 `Invalid video id` 예외가 발생한다.

### 원인

플레이리스트 모드 옵션에 `videoId: undefined` 키를 포함했다.

### 해결

플레이리스트 모드에서는 `videoId` 속성을 생략하고 단일 영상 모드에서만 전달한다.

## 짧은 CSS 선택자 치환이 더 긴 선택자를 망가뜨림

### 증상

`.empty {`를 치환했는데 `.stam.empty {` 규칙까지 먼저 바뀌었다.

### 원인

부분 문자열 치환이 더 긴 선택자 안의 접미부부터 매칭했다.

### 해결

줄 시작을 포함한 고유 선택자 기준으로 수정하거나 구조화된 편집 도구를 사용한다.

## MediaElementSource를 통한 원격 오디오가 무음

### 증상

CORS 헤더가 없는 원격 음악이 EQ 경로에 연결되면 재생은 되지만 소리가 나지 않는다.

### 원인

브라우저가 CORS가 없는 원격 미디어의 Web Audio 출력을 차단한다.

### 해결

동일 출처/Blob 오디오는 EQ 요소로 보내고, 외부 원격 오디오는 직접 재생 요소로 보낸다.

## 야간 눈 지면과 산의 눈이 너무 어두움

### 증상

밤 장면에서 눈 지면과 눈 덮인 산이 거의 검푸르게 보인다.

### 원인

눈 셰이더의 밝기가 태양 기반 `uLight`에만 의존해 밤에는 바닥광이 부족하다.

### 해결

지면 눈 셰이더에 `uNight` 기반의 달빛 바닥광을 더하고, 산의 눈 색에도 야간 최소 밝기를 둔다. 눈의 푸른 음영은 유지한다.

## 화면 로딩 중 시작 버튼을 누르면 오디오 예외

### 증상

초기 음악 목록이 준비되기 전에 시작하면 `undefined.startsWith` 예외가 난다.

### 원인

YouTube API나 재생 목록 설정이 끝나기 전에 `setMusic(true)`가 빈 목록으로 `playCurrent()`를 호출한다.

### 해결

`setMusic`에서 목록이 비어 있으면 재생을 보류한다. 이후 목록 설정 완료 시 기존 `musicOn` 상태에 따라 재생한다.

## 설정 맵 카드가 모바일에서 두 열로 줄바꿈됨

### 증상

설정의 맵 카드가 모바일 화면에서 한 줄에 세 개씩 놓이지 않는다.

### 원인

`.grid:has(.card.square)`와 `.grid:has(.card.mapcard)`의 우선순위가 같고, 정사각 카드 규칙이 뒤에 선언되어 맵 그리드 열 수를 덮는다.

### 해결

맵 전용 그리드 규칙을 정사각 카드 규칙 뒤에 선언하고 세 열을 명시한다. 좁은 화면에서도 카드 폭을 열 너비에 맞추고 간격을 줄인다.

## Missing bundled default after user assets are moved
The body catalogue can still contain a static ID after its file has been moved out of `public/models/people`. Validate a saved body file against the live `/api/people` result, then select the first available custom character or `rpm-f` when the saved file is missing.

## Mixamo walk moves forward and snaps at loop
A Mixamo Standard Walk clip contains a Hips.position Z track that advances about 166 cm during its 1.17-second cycle. If the app also advances the avatar in the world, this doubles motion and causes a backward snap at each loop. Keep the Hips vertical animation, but hold horizontal X/Z at the first key so world movement controls travel.

## Character list includes an unrelated fallback

When `public/models/people/` contains custom character files, keeping the static `rpm-f` Ready Player Me entry adds an unrelated extra tile. Filter `rpm-f` from `BODIES` whenever the custom file list is non-empty. Keep it available when no custom files exist.

## Imported character catalog and audio control panels

The built-in `rpm-f` fallback appeared beside imported characters because the app appended custom files to the static built-in `BODIES` array. Keep the built-in catalog separate and choose the imported list when it is non-empty; use available built-ins as the fallback only when no imported files exist. The playback row and volume control also shared translucent panel styling; remove panel backgrounds while preserving their child buttons and slider.

## Profile and settings differ between app URLs

`localStorage` is scoped to a browser origin, including its host and port. Opening the same app from the Vite port and the production server therefore produced separate profiles. Mirror settings through the local API to an ignored `data/settings.json` file, restore that copy at startup, and keep localStorage as a fallback when the API is unavailable. Locally selected file object URLs remain session-only because the browser does not retain those file grants.

## Walk clips are fixed and leak into the character list

The avatar loaded only a hard-coded Standard Walk clip. Additional `Walking*.fbx` clips in the people folder could also appear as profile characters because the API excluded only two exact filenames. Enumerate walk files separately, exclude them from the people list, add the chosen filename to saved profile settings, and update current and future avatars when it changes. Root position tracks still need to be skipped to keep walking in place. Some clips exported with Skin include large geometry; use Without Skin when re-downloading.

## Dance FBX files are mistaken for character models

When walk-only filename matching is used, dance FBXs such as `Gangnam Style` and `Hip Hop Dancing` can appear in the character picker. Classify walk and dance files into separate animation groups, migrate the persisted selection to a generic `animation` field, and exclude both kinds from the people list. For names without a `Dance`/`Dancing` marker, add an explicit filename rule or use a dedicated animation folder.

## 2026-11-05 — Seated pose floating above ground

- Cause: procedural sit pose used insufficient thigh flexion and placed the pelvis too high, leaving the hip surface visibly unsupported.
- Fix: increase thigh flexion and lower the pelvis target. Keep feet and body geometry close to ground; tune against the deformed skinned mesh in browser.
- Verified selected Ch06 in mobile browser: hip-weighted surface minimum 0.02 m and overall model minimum 0.004 m above ground; `npm run build` passed.

## 2026-11-05 — Main scene did not fill wide windows

- Cause: `#app` had `max-width: 420px`; desktop viewports wider than that left unused space around the app.
- Fix: let `#app` use the full viewport width. `World.resize()` already resizes the renderer and camera on window resize.
- Verified app/canvas bounds at 390×844 and 1280×900, settings open/close, sit toggle, and production build.

## 2026-11-05 — Seated pose final ground measurement

- Final pelvis target puts the hip-weighted surface about 0.009 m above the ground; overall model minimum is about -0.006 m on Ch06. This is a minor ground intersection while bringing the buttocks to the surface.

## 2026-11-05 — Sit transition raised legs before lowering the body

- Cause: while the walk animation mixer was active, `Person.pose()` returned early after setting only the walking bob. The seated pelvis height was applied only after the mixer path ended, producing the apparent levitation and sudden drop.
- Fix: calculate model height through a shared method in both mixer and procedural branches. Advance body descent faster than knee flexion during the transition.
- Verified walk-to-sit trajectory on Ch06 in browser: body root reached seated height before the full knee bend; final hip surface was about 0.009 m above ground. `npm run build` passed.

## 2026-11-05 — App width did not fill the browser window

- Cause: the app width was constrained by its parent/container sizing and the root used percentage width.
- Fix: pin `#app` to the viewport with `position: fixed; inset: 0; width: 100vw; height: 100dvh;`. The existing resize listener updates renderer size and camera aspect.
- Verified app and canvas fill at 390×844, 500×969, and 1280×900. Settings open/close and Walk/Sit toggle still work.

## 2026-11-10 — Default YouTube playlist embed loads inconsistently

- The hard-coded watch URL has `v=1t39vq3LdRs&list=PLCqwmfitbQCY`. When `src/audio.ts` omitted `videoId` in playlist mode, one fresh browser session loaded 163 tracks and Next advanced, while another returned error 2 (`api.invalidparam`), no playlist, and player state -1 even though the app's music switch was on.
- The matching Paradise embed showed the same variation. In a failed Paradise session, adding the watch video's `videoId` to the same `list` loaded and played 163 tracks. The playlist URL is valid; do not infer that error 2 means the whole list is invalid. The precise reason YouTube sometimes accepts the list-only embed remains unknown.
- Fix: pass the watch video's `videoId` alongside `list` when both are present. In a fresh browser session Voyager loaded 163 tracks, advanced to another song, wrapped from the last song to the first under repeat all, and paused/resumed. A single-video URL still played. Electron and Android were not checked.
