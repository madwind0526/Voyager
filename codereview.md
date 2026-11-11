# Voyager 코드 리뷰

- **리뷰 일자:** 2026-11-07 (재리뷰)
- **리뷰 범위:** `src/`, `shared/`, `server/`, `test/`, `index.html`, `studio.html`, `src/style.css`, `vite.config.ts`, `tsconfig.json`
- **방법:** 전체 소스 정독 + `npm test`, `npm run build` 실행 + 의존성(`three`의 Sky/Reflector) 동작 확인
- **검증 결과**
  - `npm test` → 5개 테스트 모두 통과
  - `npm run build` → 타입체크/번들 통과. 단, `world` 청크가 786 KB(gzip 207 KB)로 500 KB 경고 발생
  - 별도 lint/format 스크립트 없음

## 핵심 요약

| 등급 | 건수 | 대표 항목 |
|---|---|---|
| **P1 (높음)** | 3 | S-1 쓰기 API CSRF, S-2 정적 경로 접두사 검사, B-1 내장 맵 로딩 실패 시 앱 정지 |
| **P2 (보통)** | 11 | B-2 커뮤니티 맵 `pickSky` 누락, B-3 EQ 오표시, B-4 설정 복원 미검증, B-5 ring 죽은 코드, P-1~P-4 성능/누수 |
| **P3 (낮음/개선)** | 22 | 견고성(B-8~B-16), 성능 정리(P-5~P-6), 유지보수/접근성(M-1~M-9), 보안 정리(S-4~S-5) |
| **합계** | 36 | 위 항목의 상세는 아래 1~4절, 조치 순서는 6절 |

> 이번 재리뷰는 코드 변경 없이 기존 발견 사항을 재확인하고 등급·건수를 정리한 것입니다. 빌드와 테스트는 위와 같이 모두 통과했습니다.

## 등급 기준

| 등급 | 의미 |
|---|---|
| **P1 (높음)** | 보안, 데이터 손상, 앱이 동작하지 않을 수 있는 문제. 우선 수정 |
| **P2 (보통)** | 특정 조건에서 오동작/오해를 만들거나, 성능·유지보수에 뚜렷한 부담 |
| **P3 (낮음/개선)** | 정리, 접근성, 문서/주석 불일치, 소소한 견고성 |

---

## 1. 보안

### S-1 [P1] 쓰기 API가 CSRF(교차 출처 POST)에 노출됨
`server/index.mjs:138-165`, `server/index.mjs:206-227`, `server/index.mjs:193-204`

`isLocal()`은 `remoteAddress`가 루프백이고 `Host`가 `127.0.0.1/localhost`인지만 확인한다. 사용자가 악성 웹페이지를 열면 브라우저는 그 페이지에서 `http://127.0.0.1:4315`로 요청을 보내며, 이때도 `remoteAddress=127.0.0.1`, `Host: 127.0.0.1:4315`이므로 통과한다. 읽기 응답은 CORS 헤더가 없어 읽을 수 없지만, **쓰기는 simple request로 가능**하다.

- `POST /api/community/{clothes|maps}`: `content-type: text/plain`으로 JSON 본문을 보내면 preflight 없이 전송되고, 서버는 `JSON.parse(await readBody(req))`만 하므로 그대로 처리한다(`server/index.mjs:216-224`).
- `POST /api/maps/save`, `POST /api/maps/picture`: 동일하게 `Content-Type`을 검사하지 않는다(`server/index.mjs:138-163`).
- 결과: 임의의 웹사이트가 커뮤니티/추가 맵 파일을 무한히 생성해 디스크를 채울 수 있다(내용은 validator를 통과해야 하지만 파일 수 제한이 없음).

**권장:** 모든 쓰기 엔드포인트에서 `content-type`이 `application/json`인지 확인하고, `Origin`/`Sec-Fetch-Site`를 검사하거나 커스텀 헤더(예: `X-Requested-With`)를 요구해 preflight를 강제한다. `OPTIONS`는 명시적으로 405 처리.

### S-2 [P1] 정적 파일 경로 검사가 `startsWith` 접두사 비교라 우회 여지가 있음
`server/index.mjs:242-247`

```js
const inside = file.startsWith(dist) || file.startsWith(pub);
```

경로 구분자를 포함하지 않은 접두사 비교라서, `dist`/`public`과 이름이 같은 접두사를 가진 형제 디렉터리(`dist2`, `public-old` 등)가 생기면 그 안의 파일이 노출된다. 현재 저장소에는 해당 디렉터리가 없어 즉시 악용되지는 않지만, 배포/운영 환경이 바뀌면 위험해지는 전형적인 취약 패턴이다.

**권장:** `path.resolve` 후 `path.relative`로 검사하거나, `file === dist || file.startsWith(dist + path.sep)` 형태로 구분자까지 비교한다.

### S-3 [P2] 쓰기 엔드포인트에 인증/레이트 리밋/용량 상한이 없음
`server/index.mjs:206-227`, `server/index.mjs:137-165`

커뮤니티와 `public/maps/added`는 요청마다 파일을 만든다. `HOST=0.0.0.0`(폰 테스트)일 때는 같은 LAN의 누구나 호출할 수 있고, 문서에도 "no accounts or moderation yet"이라고만 적혀 있다. 단일 파일 크기 제한만 있고 개수/총량 제한은 없다.

**권장:** LAN 노출 모드에서 최소한 쓰기 요청의 `Origin`을 제한하고, 파일 개수/총 용량 상한 또는 간단한 토큰을 둔다.

### S-4 [P3] `KINDS[parts[0]]` 프로토타입 조회
`server/index.mjs:16`, `server/index.mjs:207`

`/api/community/__proto__`, `/api/community/constructor` 같은 경로에서 `Object.prototype` 값이 반환되어 `validate(input)` 호출 시 TypeError → 500이 된다. 즉시 심각한 문제는 아니지만 의도치 않은 키를 허용하지 않도록 `Object.hasOwn(KINDS, parts[0])`로 검사하는 편이 안전하다.

### S-5 [P3] 로컬 음악 탐색기는 임의의 절대 경로를 읽는다
`server/index.mjs:84-112`

`/api/fs/file?p=`는 오디오 확장자면 드라이브 어디든 읽는다. 로컬 전용 기능이라 의도된 설계지만, S-1과 결합하면 교차 사이트에서 미디어 태그로 임의 오디오 파일을 로드시킬 수 있다(내용 탈취는 CORS로 막히지만 존재/재생은 가능). 사용자 홈/음악 폴더 등 허용 루트를 제한할지 검토할 만하다.

---

## 2. 버그 / 동작 정합성

### B-1 [P1] 내장 맵 로딩 실패 시 앱 전체가 멈춤
`src/main.ts:39-44`, `src/main.ts:568`

`loadBuiltins()`는 `Promise.all`로 세 맵 JSON을 받아 검증한다. `.then(...)`에 `.catch`가 없어서, 파일 하나가 없거나 JSON이 깨졌거나 정적 경로가 404면 프로미스가 거부되고 **`requestAnimationFrame(tick)`까지 도달하지 못한다.** 시작 화면은 보이지만 시작 후 월드가 전혀 갱신되지 않는다.

또한 `validateMap(raw)`가 실패하면 `v(raw).value`가 `undefined`가 되어 `{...undefined}`로 id만 있는 객체가 만들어지고, 이후 `apply()`의 `world.setMap(m)`에서 `m.ground` 접근 중 예외가 난다.

**권장:** 맵별 실패를 격리(개별 `try/catch` + 스킵/기본값), `.catch`에서 앱은 계속 실행. `apply()`의 `m`이 없을 때 안전한 기본 맵으로 폴백.

### B-2 [P2] 커뮤니티에서 맵을 받아 적용하면 하늘 사진이 갱신되지 않음
`src/main.ts:492` vs `src/main.ts:250`, `src/main.ts:222`

설정의 맵 카드 선택(`mapGrid`)과 직접 추가(`addMap`)는 `apply()` 뒤 `void pickSky()`를 호출하지만, 커뮤니티의 `take()`는 `apply(); capturePicture(it.id);`만 호출한다. 그래서 밤 사진 폴더(`sky.nightPhotos`)가 다른 맵을 받아도 다음 일출/일몰 전까지 이전 사진이 유지된다.

**권장:** `take()`에도 `void pickSky()` 추가.

### B-3 [P2] EQ가 원격 URL 음악에는 적용되지 않는데 UI는 적용되는 것처럼 보임
`src/audio.ts:111-123`, `src/audio.ts:177-178`, `src/main.ts:360`

`playCurrent()`는 `blob:` 또는 same-origin일 때만 `eqEl`(EQ 그래프)을 쓰고, 원격 https URL은 `plainEl`로 보낸다. 그런데 `eqAvailable`은 `!this.yt`만 보므로 원격 mp3 재생 중에도 `true`가 되고, 설정의 안내 문구는 "Does not apply to YouTube music"만 표시한다. 사용자는 EQ가 동작한다고 오해한다.

**권장:** `eqAvailable`을 "현재 소스가 same-origin/blob" 조건으로 계산해 안내 문구를 정확히 하거나, 원격 URL에도 EQ를 적용할 수 있는 경로(프록시/CORS 안내)를 마련.

### B-4 [P2] 서버 설정 복원 후 재검증이 없음
`src/state.ts:59-75`, `src/main.ts:29-30`

`load()`는 `body`와 `cycle`을 검증하지만, 이후 `restore()`가 서버의 `data/settings.json`을 그대로 `Object.assign`한다. 오래된/손상된 설정이면 `s.cycle = 0`(→ `hourNow`에서 0으로 나눔), `s.eq` 길이 불일치(→ EQ 슬라이더 `undefined`), `s.maps`에 필드 누락(→ `mapKey`/`apply` 예외)이 발생할 수 있다.

**권장:** `restore()` 후에도 `load()`와 동일한 정규화/클램프를 수행하거나, 서버 저장 시 스키마 검증을 추가.

### B-5 [P2] 2D 능선(ring) 시스템이 사실상 죽은 코드이며 주석과 모순
`src/world.ts:775-781`, `src/world.ts:857`, `src/world.ts:859-884`

`usesRange()`는 `horizon.mountains > 0`이면 항상 `true`다. 따라서 `r.visible = m.horizon.mountains > 0 && !real`은 **모든 경우 `false`**가 되어 9개의 ring 메시는 절대 보이지 않는다. 그런데 바로 위 주석은 "the 3D range is used for snow-north only", `natural = 0`(2D 능선용)이라 적혀 있어 코드/주석/문서가 서로 다르다.

또한 `newScenery()`는 ring이 보이지 않아도 매번 9개 ring의 정점을 다시 계산하고(`src/world.ts:859-884`), `setMap()`과 `newScenery()`가 둘 다 `buildRange()`를 호출해 하늘 사진이 바뀔 때마다 65k 정점 높이장을 두 번 가까이 재계산한다.

**권장:** 의도가 "모든 맵에 3D range"라면 ring 관련 코드(생성, `ridgeMat`, `ridgeLine`, `pnoise`, `RIDGE_*`, `MEADOW_*`, `natural`)를 삭제하고 주석을 정리. 2D 능선을 유지하려면 `usesRange()` 조건을 바로잡고 불필요한 `buildRange` 중복 호출을 제거.

### B-6 [P2] 커뮤니티 목록 응답을 배열로 검증하지 않음
`src/main.ts:472-476`, `src/main.ts:496`

`fetch("/api/community/maps")`는 HTTP 오류에서도 reject하지 않는다. 서버가 500 JSON(`{error:...}`)을 200이 아닌 상태로 반환하면 `.json()`은 성공하고 `items`에 객체가 들어가, 렌더 시 `for (const it of items ?? [])`에서 TypeError가 난다(모달 렌더 중 예외). `r.ok` 확인 또는 `Array.isArray(items)` 가드 필요.

### B-7 [P2] 설정 저장 페이로드가 커질 수 있고 실패가 조용함
`src/state.ts:47-57`, `src/main.ts:183-202`, `server/index.mjs:175`

`pictures`는 최대 30개의 200×200 JPEG data URL을 보관하고, 사용자 맵의 `thumb`도 data URL로 `maps`에 중복 저장된다. `save()`는 매 변경마다 전체 설정을 `localStorage`에 쓰고 250 ms 디바운스로 `/api/settings`에 PUT한다. 사진이 쌓이면 저장 실패(localStorage quota)나 서버 1 MB 본문 제한 초과가 나는데 양쪽 모두 `catch`로 조용히 무시되어 **설정이 저장되지 않는 것을 사용자가 알 수 없다.**

**권장:** 사진은 IndexedDB 등 별도 저장소로 분리하거나 `pictures` 상한/압축을 조정. PUT 실패 시 1회 재시도 또는 사용자 알림.

### B-8 [P3] `public/maps/added`의 맵 파일은 앱에서 다시 불러오지 않음
`src/main.ts:181`, `server/index.mjs:137`

추가한 맵은 `localStorage`의 `s.maps`가 진실 원천이고, 파일은 보관용이다. `localStorage`가 지워지면 파일이 남아 있어도 목록에서 사라진다. "파일은 남는다"는 설명과 "다시 불러온다"는 기대가 다를 수 있으니, 복원 기능을 제공하거나 문서에 명확히 적는다.

### B-9 [P3] 의상(clothes) 기능이 절반만 남아 있음
`src/catalog.ts`, `src/avatar.ts:184-235`, `src/studio.ts:78-84`, `server/index.mjs:16` vs `src/main.ts:468-508`

프로젝트 규칙상 의상 선택 UI는 제거되었고 커뮤니티는 맵만 공유하지만, 스튜디오는 여전히 옷을 편집/업로드하고 서버도 `/api/community/clothes`를 받는다. 앱에는 이를 입는 UI가 없어 사용자 입장에서 혼란을 준다. 기능을 완전히 제거하거나, 문서/스튜디오에서 "미지원"임을 명시.

### B-10 [P3] `eqPreset`은 저장만 되고 사용되지 않음
`src/state.ts:23`, `src/main.ts:340`

`commit()`에서 `s.eqPreset`을 갱신하지만 어디에서도 읽지 않는다(프리셋 매칭은 `eqMatch()`가 매번 계산). 삭제하거나 마이그레이션에만 쓰도록 정리.

### B-11 [P3] 추가 맵 파일에 작성자(author)가 누락됨
`src/main.ts:213-214`

`fileBody`를 만든 뒤에 `r.value.author`를 채우므로, `public/maps/added/*.json`에는 이름이 들어가지 않는다. 앱 메모리(`s.maps`)와 파일 내용이 달라진다. author 보정을 `fileBody` 생성 전에 수행.

### B-12 [P3] 캐릭터 변경만으로 맵/눈/발자국 상태가 재설정됨
`src/main.ts:46-56`, `src/main.ts:288`

`apply()`는 body·clothes·map·ambience를 한꺼번에 적용한다. 프로필에서 캐릭터를 바꾸면 `world.setMap()`이 다시 호출되어 3D range 재생성, `snowLeft`/`prints` 초기화, 하늘 사진 재선택 등이 일어난다. `applyBody()`/`applyMap()`으로 분리하면 불필요한 월드 리셋을 막을 수 있다.

### B-13 [P3] `playCurrent`의 `new URL` 예외 가능
`src/audio.ts:113`

`new URL(url, location.href)`가 던질 수 있는 형식(예: `http://[`)이 플레이리스트에 있으면 `playCurrent()`가 예외로 중단된다. URL 파싱을 `try/catch`로 감싸고 실패 트랙은 건너뛰기.

### B-14 [P3] `snapshot()`이 보존되지 않은 드로잉 버퍼에 의존
`src/world.ts:842-855`

`preserveDrawingBuffer: false` 상태에서 `render()` 직후 같은 태스크에서 `drawImage()`로 읽는다. 일반적으로 동작하지만 스펙상 보장이 아니므로, 카드 사진이 간헐적으로 검게 나올 수 있다. `preserveDrawingBuffer`를 켜거나 `readRenderTargetPixels`/오프스크린 렌더 타깃을 사용하는 편이 견고하다.

### B-15 [P3] 낮 하늘 사진 로드 실패 시 이전 사진이 남음
`src/world.ts:806`

야간은 `uPhotoOn`을 끄지만, 낮은 `dayLoaded`를 `false`로 되돌리지 않는다. 이전 낮 사진이 로드된 상태에서 새 사진 로드가 실패하면 `dayDome`이 이전 사진을 계속 표시한다. 실패 콜백에서 `kind === "day"`면 `dayLoaded = false` 처리.

### B-16 [P3] `isYouTube` 부분 문자열 매칭
`src/audio.ts:6-7`

`myyoutube.com` 같은 도메인도 YouTube로 판정되어 IFrame 경로로 빠진다. `URL` 파싱 후 hostname을 검사하는 편이 정확하다.

---

## 3. 성능

### P-1 [P2] 모바일에서 17만 개 잔디 + 블룸 + 반사가 한 번에 돌아감
`src/world.ts:539`, `src/world.ts:529`, `src/world.ts:488`

`makeGrass`는 `N = 170000` 인스턴스를 만들고, salt 맵은 `Reflector` 미러 패스를, 밤에는 `UnrealBloomPass`를 추가로 실행한다. 저사양 폰에서 프레임 저하가 예상된다. 기기 성능/픽셀 비율에 따라 인스턴스 수나 반사 해상도를 낮추는 옵션(품질 단계)을 검토.

### P-2 [P2] 하늘 사진이 바뀔 때마다 무거운 지형 재생성
`src/world.ts:781`, `src/world.ts:861`, `src/world.ts:811`

`setMap()`과 `newScenery()`가 각각 `buildRange()`를 호출하고, `newScenery()`는 보이지 않는 ring 9개도 갱신한다. `newScenery()`는 일출/일몰마다 호출되므로 하루 두 번, 65k 정점 + 6 옥타브 리지드 노이즈를 계산한다. ring 갱신 제거 + `buildRange` 중복 호출 제거로 비용을 크게 줄일 수 있다.

### P-3 [P2] 프레임마다 객체 할당
`src/world.ts:956-1035`, `src/world.ts:692`

`updateSky()`는 매 프레임 `Vector3`, `Color`, `Matrix4`, `NIGHT_HAZE.clone()`과 체인된 `lerp(new Color(...))`를 만든다. `stepPrints()`는 매 프레임 `new THREE.Object3D()`를 생성한다. 모바일 GC 압력을 줄이려면 모듈 스코프 임시 객체를 재사용.

### P-4 [P2] 하늘 사진 텍스처가 교체 시 해제되지 않음
`src/world.ts:786-807`

`setSkyPhoto()`는 호출마다 `new TextureLoader().load()`로 새 텍스처를 만들고 이전 텍스처를 `dispose()`하지 않는다. 주기가 3시간인 설정에서는 하루에도 여러 번 교체되어 GPU 메모리가 누적된다. 이전 텍스처를 보관했다가 교체 성공 시 dispose.

### P-5 [P3] 슬라이더 입력마다 전체 설정 직렬화
`src/main.ts:88`, `src/main.ts:355`, `src/state.ts:47-57`

볼륨/EQ 드래그 중 `save()`가 매 input마다 `JSON.stringify(s)`(사진 포함)를 실행한다. EQ는 `refresh()`까지 매번 호출해 DOM을 재구성한다. localStorage 쓰기만이라도 디바운스하고, 슬라이더는 `change`에서 저장하는 편이 낫다.

### P-6 [P3] 번들 크기 경고
`npm run build` 결과 `world` 청크 786 KB. 의존성 대부분이 three.js이므로 구조상 불가피한 면이 있지만, 스튜디오를 별도 진입점으로 유지하는 현 구조를 활용해 메인에서 스튜디오 관련 코드/아이콘을 더 분리하거나, three 애드온(Reflector, UnrealBloom, Sky, FBXLoader)을 지연 로딩하는 것을 검토.

---

## 4. 유지보수성 / 가독성

### M-1 [P3] 사용되지 않는 아이콘 import
`src/main.ts:3`

`Crown`, `Mars`, `Shirt`, `Venus`, `UserRound`, `VolumeX`는 import만 되고 사용되지 않는다. 번들/가독성 측면에서 제거.

### M-2 [P3] HTML `lang="ko"`인데 UI 텍스트는 영어
`index.html:2`, `studio.html:2`

프로젝트 규칙상 UI는 영어다. 스크린 리더의 발음/언어 처리를 위해 `lang="en"`으로 맞추는 것이 좋다.

### M-3 [P3] 모달 접근성
`src/main.ts:157-164`

`role="dialog"`, `aria-modal`, 초기 포커스, 포커스 트랩, `Escape` 닫기가 없다. 배경 클릭으로만 닫힌다. 키보드 사용자에게 불편.

### M-4 [P3] 클릭 가능한 `div` 카드
`src/main.ts:244-258`, `src/main.ts:286-290`

맵/캐릭터 카드는 `div.onclick`이라 키보드 포커스/Enter 동작이 없다. `button`으로 바꾸거나 `tabindex`/`role`/키 핸들러를 추가.

### M-5 [P3] 린트/포맷 부재와 서버 타입 체크 제외
`package.json`, `tsconfig.json`

`npm run build`는 `include: ["src", "shared"]`만 타입체크한다. `server/index.mjs`와 `test/`는 JS 검사 대상이 아니어서 서버 로직 오류가 빌드에서 잡히지 않는다. ESLint/Prettier와 서버에 대한 `checkJs` 또는 JSDoc 타입을 검토.

### M-6 [P3] 초장문 함수와 매직 넘버
`src/world.ts` 전반, 특히 `updateSky`/`buildRange`/`groundShader`

셰이더와 수치 튜닝이 많아 불가피한 측면이 있지만, `0.9599311`, `1.9`, `3.6`, `0.55` 같은 상수에 이름을 붙이면 의도 파악과 조정이 쉬워진다.

### M-7 [P3] 테스트 범위가 validator에 한정됨
`test/spec.test.mjs`

좋은 시작이지만 `time.ts`(시간대/DST/압축), `state.ts`(마이그레이션/복원), `server`(경로 검사, range 파싱, slug 충돌), `audio`(셔플/반복)에 대한 테스트가 없다. 특히 이번 리뷰의 S-2, B-4는 회귀 테스트로 막을 수 있다.

### M-8 [P3] 죽은 CSS/주석
`src/style.css:146-148`, `src/world.ts:775`

`.dots`/`.dot`은 사용처가 없고, `setMap`의 `natural`/ring 관련 주석은 B-5와 함께 정리 필요.

### M-9 [P3] 모듈 전역 셰이더 머티리얼 공유
`src/world.ts:44`, `src/world.ts:160`, `src/world.ts:178`

`nightMat`, `dayMat`, `hazeMat`은 모듈 전역이라 World 인스턴스가 2개 이상이면 상태가 섞인다. 현재는 페이지당 1개라 문제 없지만, 테스트/멀티 뷰 도입 시 주의.

---

## 5. 잘된 점

- **검증 로직 공유:** `shared/spec.mjs`를 클라이언트·서버·스튜디오·테스트가 함께 사용하고, 수치 입력을 `clamp`, 이름을 길이 제한하는 등 방어적이다.
- **보안 기본기:** 로컬 전용 API에 `remoteAddress` + `Host` 검사(DNS 리바인딩 방어), 경로 슬러그/폴더명 정규식, 설정 파일 원자적 쓰기(`.tmp` + rename) 등 기본기가 갖춰져 있다.
- **셰이더 이식성:** GPU 정밀도 문제를 피하려고 `sin()` 기반 해시를 배제한 `hash()` 사용(`src/world.ts:13-21`)이 좋다.
- **구조 분리:** 월드/아바타/오디오/상태/UI가 파일 단위로 잘 나뉘고, 프레임워크 없이 `h()`/`btn()` 헬퍼로 일관된 DOM 구성.
- **리소스 관리 노력:** 아바타/애니메이션 캐시, 스냅샷용 오프스크린 렌더러, 썸네일 큐·캐시 등 반복 비용을 줄이려는 설계가 보인다.
- **접근성 기본:** 아이콘 버튼에 `aria-label`/`title`, `focus-visible` 스타일이 있다.

---

## 6. 우선순위 체크리스트

1. **S-1** 쓰기 API의 `Content-Type`/`Origin` 검증 추가 (CSRF 차단)
2. **S-2** 정적 파일 경로를 `path.relative` 기반으로 검증
3. **B-1** `loadBuiltins()` 실패 격리 및 안전한 기본 맵 폴백
4. **B-4** `restore()` 이후 설정 재검증/클램프
5. **B-5** ring 죽은 코드 제거 또는 `usesRange()` 수정 + 중복 `buildRange` 제거
6. **B-2** 커뮤니티 맵 적용 시 `pickSky()` 호출
7. **B-3** EQ 지원 여부를 실제 재생 경로와 일치시키기
8. **P-4** 하늘 텍스처 dispose로 GPU 메모리 누수 방지
9. **B-6** 커뮤니티 목록 응답 `Array.isArray` 가드
10. **B-7** 설정 사진 저장소 분리/상한 및 저장 실패 알림
11. **P-1/P-2/P-3** 모바일 품질 단계, 지형 재생성 중복 제거, 프레임 할당 줄이기
12. **M-1~M-5** 미사용 import, `lang`, 모달/카드 접근성, 린트 도입
13. **M-7** 서버 경로/설정 복원/시간 계산 회귀 테스트 추가

---

## 7. 참고: 파일별 빠른 메모

| 파일 | 메모 |
|---|---|
| `src/main.ts` | `loadBuiltins` 실패 처리(B-1), 커뮤니티 `take`의 `pickSky` 누락(B-2), `apply` 분리(B-12), 미사용 import(M-1), 모달/카드 접근성(M-3, M-4) |
| `src/world.ts` | ring 죽은 코드/중복 지형 생성(B-5, P-2), 프레임 할당(P-3), 하늘 텍스처 누수(P-4), `snapshot` 버퍼 의존(B-14) |
| `src/audio.ts` | 원격 URL EQ 미적용 표시(B-3), `new URL` 예외(B-13), `isYouTube` 부분 매칭(B-16) |
| `src/state.ts` | 복원 후 미검증(B-4), 큰 설정 페이로드(B-7), `eqPreset` 미사용(B-10) |
| `src/avatar.ts` | 견고성 양호. 뼈 누락 시 `pos()` 예외로 모델 전체 로드 실패 가능(낮음) |
| `src/studio.ts` | 템플릿 fetch/업로드 실패 처리 부재, 다운로드 URL 미해제(낮음) |
| `server/index.mjs` | CSRF(S-1), 경로 접두사(S-2), 인증/리밋(S-3), 프로토타입 조회(S-4), 이미지 MIME 누락(`.jpg/.png/.webp` → octet-stream) |
| `shared/spec.mjs` | 방어적이고 명시적 필드 구성으로 프로토타입 오염 위험 낮음. `thumb`는 의도적으로 미검증(내장 전용) |
| `index.html` / `studio.html` | `lang="ko"` ↔ 영어 UI(M-2) |
| `test/spec.test.mjs` | validator 테스트 품질 양호, 서버/상태/time 테스트 부족(M-7) |

> 참고: `server/index.mjs:17`의 MIME 표에 이미지 확장자가 없어 `/sky/*.jpg`, `/maps/*.jpg`가 `application/octet-stream`으로 나간다. 현재 브라우저들은 이미지를 스니핑해 표시하지만, 명시적 MIME(`.jpg`, `.jpeg`, `.png`, `.webp`, `.ogg`, `.mp3`)을 추가하는 편이 안전하다.
