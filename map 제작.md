# Voyager 맵 제작 지침서

이 문서를 LLM(ChatGPT, Claude 등)에게 통째로 주고 **"○○ 느낌의 맵을 만들어줘"** 라고 말하면, 앱에 바로 넣을 수 있는 맵(JSON 한 개)이 나옵니다.

---

## 1. LLM에게 (규칙 — 반드시 지킬 것)

너는 Voyager(걷기 명상 앱)의 맵 제작 도우미다. 사용자가 원하는 분위기를 듣고 아래 규칙대로 **맵 JSON 하나**를 만든다.

1. 답은 ` ```json ` 코드 블록 **하나**만 쓴다. 코드 블록 밖에는 한두 줄 설명(이 맵의 분위기, 어울리는 시간대)만 쓴다. 사용자가 답의 형식을 따로 정하면 그것을 따르되, JSON 코드 블록은 하나로 유지한다.
2. 아래 "필드 표"에 있는 키만 쓴다. 다른 키(`id`, `thumb`, 주석 등)는 넣지 않는다. JSON에는 주석을 쓸 수 없다. 표에 "~만"이라고 적힌 필드(예: salt 전용 `reflect`)는 다른 땅 종류에 넣어도 효과가 없으니 **생략한다**.
3. `schema`는 항상 `"voyager.map/1"`, `name`은 영어 40자 이내.
4. 색은 `#rrggbb` 형식(6자리 hex)만 쓴다. 숫자 필드는 0 ~ 1 사이 소수.
5. 땅 종류(`ground.kind`)는 `salt`(소금 호수), `grass`(초원), `snow`(눈), `sand`(모래) 넷 중 하나다. 그 밖의 땅(용암, 바위, 진흙 등)은 지원하지 않으니 가장 가까운 종류와 색으로 표현한다. 사막·모래언덕은 `sand`를 쓴다.
6. 아래 "3. 레시피"와 "5. 샘플"의 값을 출발점으로 삼아 조금씩 바꾼다. 샘플과 동떨어진 극단값은 피한다.
7. 모르는 값은 생략한다(기본값이 들어간다).

## 2. 필드 표

모든 필드는 `schema`, `name` 말고는 생략할 수 있다.

| 필드 | 값 | 기본값 | 보이는 모습 |
|---|---|---|---|
| `schema` | `"voyager.map/1"` | 필수 | 고정 |
| `name` | 영어 40자 이하 | 필수 | 카드에 표시되는 이름 |
| `author` | 30자 이하 | 없음 | 만든 사람 |
| `ground.kind` | `salt` / `grass` / `snow` / `sand` | `salt` | 땅의 종류. 산의 모습도 종류에 따라 달라진다 (아래 참고) |
| `ground.color` | `#rrggbb` | `#e8f0f4` | 땅 색. salt: 소금 색, grass: 풀 색, snow: 눈 색조, sand: 모래 색 |
| `ground.reflect` | 0~1 | 0.85 | **salt만**: 거울 반사 세기 (높을수록 하늘이 선명하게 비친다) |
| `ground.cracks` | 0~1 | 0.4 | **salt만**: 소금 땅의 갈라진 육각형 무늬 |
| `ground.sea` | 0~1 | 0 | **sand만**: 걷는 방향의 **오른쪽에 바다**가 생긴다 (0 = 없음, 0.5 = 멀리 보이는 바다, 0.9 = 해안선이 바로 옆). 해안선에는 물결과 거품이 일고 왼쪽은 모래사장이다. 폰 화면은 좁아서 0.8 이상이어야 바다가 크게 보인다 |
| `ground.pathStyle` | `dirt` / `gravel` / `road` | `dirt` | 길의 종류. `dirt` 흙길(폭이 들쭉날쭉하고 가장자리에 풀이 번지며 가운데에 풀이 난다), `gravel` 자갈길(`pathColor` `#8f8a80`), `road` 아스팔트 도로(양쪽 흰 선, 가운데 노란 겹선, `ground.path` 1, `pathColor` `#3a3c40`). 자연스러운 풍경에는 `gravel`(가장 자연스럽다)이나 `dirt`를 권한다 |
| `ground.flowers` | 0~4 | 1 | **grass만**: 들꽃의 양 (0 = 없음, 1 = 보통, 3 = 꽃밭) |
| `ground.flowerColors` | `#rrggbb` 목록 (최대 4개) | 여섯 색 섞임 | **grass만**: 들꽃 색. 예: 민들레 노랑과 분홍 `["#ffd21a", "#c25bd6"]` |
| `ground.path` | 0~1 | 0 | **grass, snow, sand 모두 가능**(흙길은 grass에 `pathColor` 갈색): 앞으로 곧게 난 길의 폭 (0 = 길 없음, 0.5 = 보통 오솔길, 1 = 넓은 길). 길은 화면 가운데에서 앞으로 뻗는다 |
| `ground.pathColor` | `#rrggbb` | `#7a6040` | 길의 색 (흙길 갈색, 눈길은 `#cfd8e6`, 모랫길은 땅보다 짙은 모래색) |
| `sky.clouds` | 0~1 | 0.5 | 구름 양 (0 = 구름 없음, 1 = 가득) |
| `sky.stars` | 0~1 | 1 | 밤의 별 밝기 |
| `sky.haze` | 0~1 | 0.2 | 대기의 뿌연 정도 (높을수록 하늘이 우윳빛). 안개·먼지·아지랑이가 낀 날은 0.3 이상, 맑고 투명한 날은 0.1 이하. 맵 하나에는 한 가지 느낌만 고른다 |
| `sky.blue` | 0~1 | 0.5 | 낮 하늘의 푸른 정도. `haze`와 따로 움직인다: 푸르면서 먼지 낀 하늘은 blue 0.7 + haze 0.35 |
| `sky.aurora` | 0~1 | 0 | 밤하늘 오로라 세기 (0 = 없음) |
| `sky.nightPhotos` | `night` 또는 `aurora` | `night` | 밤하늘 사진 폴더. 오로라 사진을 쓰려면 `aurora`. 다른 이름은 쓰지 않는다 |
| `horizon.mountains` | 0~1 | 0.5 | 산 높이 (0 = 산 없음, 평평한 지평선). 낮은 언덕 0.3 / 보통 0.5 / 웅장한 산 0.8 |
| `horizon.height` | 0.1~0.9 | 0.4 | **지평선의 높이**: 화면 아래쪽에서부터 화면 높이의 몇 %에 지평선이 오는가. 0.4 = 아래에서 40% 지점(기본), 0.7 = 70% 지점(땅이 넓게 보임), 0.2 = 20% 지점(하늘이 넓게 보임) |
| `horizon.layout` | `valley` / `ahead` | `valley` | 산의 배치. `valley`는 양옆이 높고 가운데가 낮은 골짜기(기본), `ahead`는 **정면에 큰 산**이 서고 양옆이 낮다. 고정 화면(`view.locked`) 맵에서 길 끝의 산으로 쓴다 |
| `ground.kind` `pebble` | 작은 둥근 자갈이 깔린 바닥. 발자국은 남지 않는다. `ground.sea`를 같이 쓰면 오른쪽에 바다가 생긴다 |
| `sky.picture` | 이 맵 전용 하늘 그림 경로 (`/sky/maps/이름.jpg`). 항상 이 그림이 하늘이 되고, 그림의 아래쪽 끝이 지평선, 위쪽 끝이 55도 위다 |
| `sky.hour` | 0 ~ 24. 하루 중 한 시각에 고정한다 (17.9 = 석양). 없으면 시계를 따라 흐른다 |
| `scenery.treeSide` `scenery.treeFrom` | 사진 나무만 해당. `both`(기본) / `left` / `right` 중 한쪽에만 나무를 세우고, `treeFrom`은 길 중심에서 몇 미터부터 나무가 시작하는지(0 ~ 80) |
| `horizon.fog` | 0 ~ 1 | 0.3 | `horizon.photo` 산의 아랫부분에 끼는 안개의 진하기(0.2 옅게 / 0.4 진하게). 산 바닥이 잘린 듯 보이지 않도록 가장 낮은 부분은 항상 안개로 덮인다. 가까운 산이 어두우면 0.5 정도로 올린다 |
| `horizon.photo` | `forest` / `snow` / `rock` / `blue` / `green` | (없음) | **산을 실제 사진으로** 그린다. 먼 산, 중간 산, 가까운 산이 겹쳐 보이고 먼 산일수록 옅다. `forest` 숲 덮인 산, `snow` 눈 덮인 날카로운 높은 산(높이 차이가 큼), `rock` 메마른 안데스식 바위산과 화산, `blue` 안개 낀 푸른 능선이 먼 곳은 옅은 하늘색에서 가까운 곳은 짙은 남색으로 겹치는 산(소금사막에 어울림), `green` 히말라야처럼 높고 가파르지만 눈 대신 나무로 덮인 산(초원에 어울림). 이 값을 쓰면 `layout`, `color`, `snow`, `trees`는 쓰이지 않고 `mountains`만 산의 크기(0.3 낮게 / 0.7 크게)를 정한다 |
| `horizon.color` | `#rrggbb` | `#8a9bb5` | **salt, grass, sand만** (`mountains`가 0이면 쓰이지 않으니 생략): 산의 색. 앞쪽 산은 이 색을 어둡게, 먼 산은 안개에 섞여 옅어진다 |
| `horizon.snow` | 0~1 | 0 | **snow만**: 산의 눈 덮임 정도 |
| `horizon.trees` | 0~1 | 0 | **snow만**: 산자락의 침엽수 숲 |
| `scenery.trees` | 0~1 | 0 | 길 양옆에 서 있는 나무의 양 (0 = 없음, 0.5 = 듬성듬성, 1 = 빽빽한 숲). 길을 따라 걸으면 계속 나타난다. 땅이 소금 호수이면 쓰지 않는다 |
| `scenery.treeType` | `fir` / `spruce` / `birch` / `broadleaf` / `photo` | `fir` | 나무 종류. `fir` 전나무(층층), `spruce` 키 큰 가문비, `birch` 하얀 줄기의 자작나무(잎 `#9bd04a` 연두), `broadleaf` 둥근 활엽수(잎 `#3f7a3a`), `photo` **실제 사진 나무**(항상 카메라를 향한 판자. `treeColor`는 쓰이지 않는다) |
| `scenery.photoTrees` | 목록: `birch` `spruce` `oak` `pine` | 전부 | `treeType`이 `photo`일 때 쓸 나무 종류. 예: `["birch"]`는 자작나무 숲, `["spruce", "pine"]`은 침엽수 숲. 생략하면 네 종류가 섞인다 |
| `scenery.treeColor` | `#rrggbb` | `#2f5d2a` | 나무 잎 색 (전나무 초록 `#2f6b34`, 가을 단풍 `#b5651d`) |
| `view.locked` | `true` / `false` | `false` | `true`이면 **화면이 고정**된다. 마우스나 손가락으로 돌리거나 위아래로 움직일 수 없고, 항상 앞을 보며 곧게 걷는다. 길 양옆에 나무가 있는 맵처럼 한 방향 풍경에 쓴다 |
| `ambience.wind` | 0~1 | 0.4 | 바람 소리와 구름·풀의 움직임 (약함 0.2 / 보통 0.4 / 강함 0.8) |
| `ambience.birds` | 0~1 | 0.4 | 낮의 새소리 (거의 없음 0.05 / 가끔 0.2 / 많음 0.6) |
| `ambience.insects` | 0~1 | 0.4 | 밤의 풀벌레 소리 (거의 없음 0 / 조금 0.2 / 가득 0.6). 0.5 이상이면 뚜렷하게 들린다 |

### 땅 종류별 모습

- **salt (소금 호수)**: 얕은 물이 덮인 소금 평원. 하늘과 산이 거울처럼 비친다. 산은 `horizon.color` 색의 겹겹이 푸른 능선. 밝은 낮에는 `horizon.color`를 어둡고 진하게(예 `#2b58c8`) 잡아야 산이 하늘에 묻히지 않는다.
- **grass (초원)**: 바람에 흔들리는 풀밭. 풀 사이에 야생화와 키 큰 갈대가 섞인다. `ground.color`가 풀 색이다(생생한 초록 `#62b02a`, 가을 황금빛 `#c98a22`). 산은 `horizon.color` 색의 안개 낀 언덕.
- **sand (모래 사막)**: 바람이 만든 긴 모래언덕과 잔물결 무늬. 걸으면 발자국이 남는다. `ground.color`가 모래 색이다(황금빛 `#d9a95f`, 붉은 모래 `#c47a45`, 흰 모래 `#e8d8b8`). 풀은 없다. 산은 `horizon.color` 색의 언덕이고, 사막답게 붉은 갈색(`#9a5a3c`)이 잘 어울린다.
- **snow (설원)**: 눈 쌓인 평원. 걸으면 뒤로 발자국이 남고 눈이 가끔 내린다. 산은 눈 덮인 봉우리와 어두운 바위, 산자락의 숲. `horizon.color`는 쓰이지 않는다.

### 길 양옆에 나무가 선 맵 (고정 화면)

`view.locked`를 `true`로 하고 `ground.path`(길)와 `scenery.trees`(나무)를 함께 쓴다. 화면이 고정되므로 사용자는 방향을 바꿀 수 없고 길을 따라 곧게 걷는다. 이때 `horizon.height`로 지평선 위치를 정해 구도를 잡는다(길이 먼 곳까지 보이게 하려면 0.45~0.6, 숲 속 느낌이면 0.35~0.45). 길 위로는 풀이 나지 않는다. 길 끝에 산을 세우려면 `horizon.layout`을 `ahead`로 하고 `horizon.mountains`를 0.8~1로 한다(정면에 큰 산이 보인다).

### 바닷가 맵

`ground.kind`를 `sand`로 하고 `ground.sea`를 0.8~0.9로 한다. 오른쪽에 바다, 왼쪽에 모래사장이 되고, 보통 `view.locked`를 `true`로 해서 해안선을 따라 곧게 걷게 한다. 산은 낮게(0.1~0.2) 두거나 0으로 하고, `horizon.height`는 0.45~0.55가 바다가 잘 보인다.

### 알아둘 것

- 시간대(아침, 노을, 밤)는 앱이 정한다. 맵에서 "황금빛 오후"처럼 하루 중 한 시각을 고를 수는 없다. 비슷한 분위기는 `haze`와 땅 색으로 낸다.

- 시간은 앱이 정한다. 같은 맵이 아침·낮·노을·밤으로 바뀌므로 **한 장면이 아니라 하루 전체**를 생각해 값을 정한다.
- 땅은 항상 평평하다. 길이나 호수 같은 지형은 만들 수 없다.
- 발자국이 남는 땅(snow, sand)에서는 걷기 동작만 나온다.

## 3. 레시피 (이 값에서 시작해서 바꾸기)

| 분위기 | 시작 값 |
|---|---|
| 맑은 거울 호수 | `salt`, `ground.color` `#e8f0f4`, `reflect` 0.88, `clouds` 0.8, `horizon.color` `#2b58c8` |
| 보랏빛 호수 | `salt`, `ground.color` `#f1e6ee`, `reflect` 0.95, `haze` 0.35, `horizon.color` `#5a46b8` |
| 모래 사막 (먼지 낀 날) | `sand`, `ground.color` `#d9a95f`, `horizon.color` `#9a5a3c`, `haze` 0.35, `clouds` 0.15 |
| 모래 사막 (맑고 고요한 날) | `sand`, `ground.color` `#c47a45`, `haze` 0.1, `wind` 0.15, `birds` 0.05, `mountains` 0.35 |
| 사진 숲길 (고정 화면) | `grass`, `ground.path` 0.5, `scenery.trees` 0.8, `scenery.treeType` photo, `horizon.photo` forest, `horizon.mountains` 0.7, `view.locked` true, `horizon.height` 0.45 |
| 숲길 (고정 화면) | `grass`, `ground.path` 0.5, `scenery.trees` 0.8, `view.locked` true, `horizon.height` 0.45, `horizon.mountains` 0.9, `horizon.layout` ahead |
| 바닷가 (오른쪽 바다, 왼쪽 모래) | `sand`, `ground.color` `#e6cf9f`, `ground.sea` 0.9, `view.locked` true, `horizon.height` 0.5, `horizon.mountains` 0.12 |
| 자작나무 꽃밭 | `grass`, `ground.flowers` 3, `ground.flowerColors` 노랑·분홍, `scenery.treeType` birch, `scenery.trees` 0.45, `scenery.treeColor` `#9bd04a` |
| 흙길 / 자갈길 | `grass`, `ground.path` 0.8, `ground.pathStyle` dirt 또는 gravel, `pathColor` `#8a6a45` 또는 `#8f8a80`, `view.locked` true |
| 푸른 여름 초원 | `grass`, `ground.color` `#62b02a`, `horizon.color` `#4f9aa0`, `wind` 0.75 |
| 가을 초원 | `grass`, `ground.color` `#c98a22`, `horizon.color` `#9a5a3c`, `haze` 0.3 |
| 안개 낀 설원 | `snow`, `haze` 0.35, `clouds` 0.7, `horizon.snow` 0.9 |
| 오로라 설원 | `snow`, `sky.aurora` 1, `nightPhotos` `aurora`, `horizon.trees` 1 |

팁: 산이 너무 크면 `horizon.mountains`를 0.4쯤으로, 산을 없애려면 0으로. 하늘이 심심하면 `clouds`를 올리고, 몽환적인 느낌은 `haze`를 올린다.

## 4. 앱에 넣는 방법

1. LLM이 만든 JSON 코드 블록을 복사해서 `이름.json` 파일로 저장한다(메모장에 붙여넣고 확장자만 `.json`으로).
2. 앱에서 설정(톱니바퀴) → 맵 목록의 **+ 카드**를 누른다.
3. 파일 탐색기가 열리면 저장한 `.json` 파일을 고른다.
4. 맵이 추가되고 바로 적용된다. 잘못된 곳이 있으면 이유가 알림으로 나온다. 그 문장을 LLM에게 보여주고 "고쳐줘"라고 하면 된다.

추가한 맵은 파일로도 `public/maps/added/` 폴더에 저장된다(`이름.json`과 카드 그림 `이름.jpg`). 카드의 휴지통은 앱의 맵 목록에서만 빼는 것이고, 이 폴더의 파일은 지워지지 않는다. 지운 맵은 + 카드로 그 파일을 다시 고르면 된다.

맵은 최대 **9개**(기본 맵 3개 포함)까지 담을 수 있다. 9개가 차면 + 카드가 사라진다. 직접 넣은 맵은 카드의 휴지통 아이콘으로 지울 수 있다(기본 맵은 지울 수 없다). 카드 그림은 따로 준비할 필요가 없다. 맵을 추가하면 앱이 그 맵의 한낮 모습을 직접 찍어서 카드 그림으로 쓴다(이 기기의 브라우저에만 저장된다). 맵을 지워도 그림은 남아서, 같은 맵을 다시 추가하면 그 그림을 그대로 쓴다(최근 30개까지). 찍히기 전 1~2초는 맵 색으로 만든 단순한 카드가 보인다.

## 5. 샘플

`samples/maps/` 폴더에 같은 파일이 들어 있다. 그대로 + 카드로 골라서 써봐도 된다.

### Salt Desert — 푸른 산과 거울 호수

```json
{
  "schema": "voyager.map/1",
  "name": "Salt Desert",
  "author": "Voyager",
  "ground": {
    "color": "#e8f0f4",
    "reflect": 0.88,
    "cracks": 0.35,
    "kind": "salt"
  },
  "sky": {
    "clouds": 0.8,
    "stars": 1,
    "haze": 0.1,
    "blue": 0.65
  },
  "horizon": {
    "mountains": 0.55,
    "color": "#2b58c8"
  },
  "ambience": {
    "wind": 0.4,
    "birds": 0.35,
    "insects": 0.4
  }
}
```

### Grassland — 야생화가 핀 초원

```json
{
  "schema": "voyager.map/1",
  "name": "Grassland",
  "author": "Voyager",
  "ground": {
    "kind": "grass",
    "color": "#62b02a",
    "reflect": 0.03,
    "cracks": 0
  },
  "sky": {
    "clouds": 0.55,
    "stars": 1,
    "haze": 0.12,
    "blue": 0.7
  },
  "horizon": {
    "mountains": 0.75,
    "color": "#4f9aa0",
    "snow": 0
  },
  "ambience": {
    "wind": 0.75,
    "birds": 0.6,
    "insects": 0.5
  }
}
```

### Snow North — 오로라와 눈 덮인 산

```json
{
  "schema": "voyager.map/1",
  "name": "Snow North",
  "author": "Voyager",
  "ground": {
    "kind": "snow",
    "color": "#e8f0fa",
    "reflect": 0.06,
    "cracks": 0
  },
  "sky": {
    "clouds": 0.3,
    "stars": 1,
    "haze": 0.05,
    "blue": 0.8,
    "aurora": 1,
    "nightPhotos": "aurora"
  },
  "horizon": {
    "mountains": 0.8,
    "color": "#8fa3bd",
    "snow": 0.9,
    "trees": 1
  },
  "ambience": {
    "wind": 0.55,
    "birds": 0.05,
    "insects": 0
  }
}
```

### Autumn Meadow — 가을 초원

```json
{
  "schema": "voyager.map/1",
  "name": "Autumn Meadow",
  "author": "Voyager",
  "ground": {
    "kind": "grass",
    "color": "#c98a22"
  },
  "sky": {
    "clouds": 0.6,
    "stars": 1,
    "haze": 0.3,
    "blue": 0.55
  },
  "horizon": {
    "mountains": 0.7,
    "color": "#9a5a3c"
  },
  "ambience": {
    "wind": 0.8,
    "birds": 0.5,
    "insects": 0.3
  }
}
```

### Sand Desert — 모래 사막

```json
{
  "schema": "voyager.map/1",
  "name": "Sand Desert",
  "ground": {
    "kind": "sand",
    "color": "#d9a95f"
  },
  "sky": {
    "clouds": 0.15,
    "stars": 1,
    "haze": 0.35,
    "blue": 0.7
  },
  "horizon": {
    "mountains": 0.45,
    "color": "#9a5a3c"
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.2,
    "insects": 0.2
  }
}
```

### Red Dunes — 맑고 고요한 붉은 사막 (이 지침서만 읽은 LLM이 만든 맵)

```json
{
  "schema": "voyager.map/1",
  "name": "Red Dunes",
  "ground": {
    "kind": "sand",
    "color": "#c47a45"
  },
  "sky": {
    "clouds": 0.1,
    "stars": 1,
    "haze": 0.1,
    "blue": 0.7
  },
  "horizon": {
    "mountains": 0.35,
    "color": "#9a5a3c"
  },
  "ambience": {
    "wind": 0.15,
    "birds": 0.05,
    "insects": 0.5
  }
}
```

### Forest Path — 길 양옆에 나무가 있는 고정 화면 맵

```json
{
  "schema": "voyager.map/1",
  "name": "Forest Path",
  "ground": {
    "kind": "grass",
    "color": "#4f8a2a",
    "path": 0.5,
    "pathColor": "#8f8a80",
    "pathStyle": "gravel"
  },
  "sky": {
    "clouds": 0.55,
    "haze": 0.05,
    "blue": 1
  },
  "horizon": {
    "mountains": 0.6,
    "color": "#4f7f8a",
    "height": 0.45,
    "layout": "ahead"
  },
  "scenery": {
    "trees": 0.8,
    "treeColor": "#2f6b34"
  },
  "view": {
    "locked": true
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.6,
    "insects": 0.4
  }
}
```

### Forest Photo — 사진 나무와 겹친 산이 있는 숲길 (고정 화면)

`scenery.treeType`을 `photo`로, `horizon.photo`를 `forest`로 한 예. 나무는 실제 사진이라 걸을 때 커지면서 지나가고, 산은 먼 산·중간 산·가까운 산이 겹쳐 보인다.

```json
{
  "schema": "voyager.map/1",
  "name": "Forest Photo",
  "ground": {
    "kind": "grass",
    "color": "#4f8a2a",
    "path": 0.5,
    "pathColor": "#8f8a80",
    "pathStyle": "gravel"
  },
  "sky": {
    "clouds": 0.55,
    "haze": 0.05,
    "blue": 1
  },
  "horizon": {
    "mountains": 0.7,
    "color": "#4f7f8a",
    "height": 0.45,
    "photo": "forest"
  },
  "scenery": {
    "trees": 0.8,
    "treeType": "photo",
    "photoTrees": ["birch", "spruce", "oak", "pine"]
  },
  "view": {
    "locked": true
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.6,
    "insects": 0.4
  }
}
```

### Beach Walk — 오른쪽 바다와 왼쪽 모래사장 (고정 화면)

```json
{
  "schema": "voyager.map/1",
  "name": "Beach Walk",
  "ground": {
    "kind": "sand",
    "color": "#e6cf9f",
    "sea": 0.9
  },
  "sky": {
    "clouds": 0.45,
    "haze": 0.2,
    "blue": 0.75
  },
  "horizon": {
    "mountains": 0.12,
    "color": "#6a8fa6",
    "height": 0.5
  },
  "view": {
    "locked": true
  },
  "ambience": {
    "wind": 0.5,
    "birds": 0.6,
    "insects": 0.1
  }
}
```

### Birch Meadow — 자작나무 숲과 들꽃 초원

```json
{
  "schema": "voyager.map/1",
  "name": "Birch Meadow",
  "ground": {
    "kind": "grass",
    "color": "#6db22f",
    "flowers": 3,
    "flowerColors": [
      "#ffd21a",
      "#ffe45c",
      "#c25bd6"
    ]
  },
  "sky": {
    "clouds": 0.35,
    "haze": 0.12,
    "blue": 0.8
  },
  "horizon": {
    "mountains": 0,
    "height": 0.45
  },
  "scenery": {
    "trees": 0.45,
    "treeColor": "#9bd04a",
    "treeType": "birch"
  },
  "ambience": {
    "wind": 0.35,
    "birds": 0.7,
    "insects": 0.4
  }
}
```

### Dirt Track — 풀밭 사이의 흙길

```json
{
  "schema": "voyager.map/1",
  "name": "Dirt Track",
  "ground": {
    "kind": "grass",
    "color": "#5f9a34",
    "path": 0.8,
    "pathColor": "#8a6a45",
    "pathStyle": "dirt",
    "flowers": 1.5
  },
  "sky": {
    "clouds": 0.4,
    "haze": 0.2,
    "blue": 0.75
  },
  "horizon": {
    "mountains": 0.35,
    "color": "#4f7f8a",
    "height": 0.45
  },
  "scenery": {
    "trees": 0.7,
    "treeColor": "#2f6b34",
    "treeType": "fir"
  },
  "view": {
    "locked": true
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.6,
    "insects": 0.4
  }
}
```

### Gravel Path — 자갈길

```json
{
  "schema": "voyager.map/1",
  "name": "Gravel Path",
  "ground": {
    "kind": "grass",
    "color": "#5f9a34",
    "path": 0.8,
    "pathColor": "#8f8a80",
    "pathStyle": "gravel",
    "flowers": 1.5
  },
  "sky": {
    "clouds": 0.4,
    "haze": 0.2,
    "blue": 0.75
  },
  "horizon": {
    "mountains": 0.35,
    "color": "#4f7f8a",
    "height": 0.45
  },
  "scenery": {
    "trees": 0.7,
    "treeColor": "#2f6b34",
    "treeType": "fir"
  },
  "view": {
    "locked": true
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.6,
    "insects": 0.4
  }
}
```

### Violet Salt Lake — 보랏빛 호수

```json
{
  "schema": "voyager.map/1",
  "name": "Violet Salt Lake",
  "author": "Voyager",
  "ground": {
    "kind": "salt",
    "color": "#f1e6ee",
    "reflect": 0.95,
    "cracks": 0.25
  },
  "sky": {
    "clouds": 0.9,
    "stars": 1,
    "haze": 0.35,
    "blue": 0.4
  },
  "horizon": {
    "mountains": 0.65,
    "color": "#5a46b8"
  },
  "ambience": {
    "wind": 0.3,
    "birds": 0.2,
    "insects": 0.5
  }
}
```

## 6. 사용자가 LLM에게 하는 요청 예시

> 위의 "Voyager 맵 제작 지침서"를 읽고, **새벽안개가 낀 푸른 초원** 맵을 만들어줘. 바람은 약하게, 하늘은 뿌옇게. 이름은 "Dawn Meadow"로.

> 지침서대로 **눈보라 치는 흐린 설원**을 만들어줘. 산은 낮게, 오로라는 없이.

LLM의 답에서 코드 블록만 복사해 `.json` 파일로 저장한 뒤, + 카드로 그 파일을 고른다.

## 7. 제작 체크리스트 (LLM이 답하기 전에 확인)

- [ ] 코드 블록은 하나이고, 안에 JSON 외의 글자(주석, 설명)가 없다
- [ ] `schema`가 `"voyager.map/1"`이다
- [ ] `ground.kind`가 `salt` / `grass` / `snow` / `sand` 중 하나이다
- [ ] 모든 색이 `#rrggbb` 6자리이다
- [ ] 숫자는 0~1이고, `nightPhotos`는 `night` 또는 `aurora`이다
- [ ] `ground.sea`와 `ground.path`는 0~1이고 `ground.sea`는 `sand`에서만 쓴다
- [ ] `horizon.height`는 0.1~0.9, `view.locked`는 `true`/`false`(따옴표 없이)이다
- [ ] 표에 없는 키(`id`, `thumb` 등)를 넣지 않았다
