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
| `sky.clouds` | 0~1 | 0.5 | 구름 양 (0 = 구름 없음, 1 = 가득) |
| `sky.stars` | 0~1 | 1 | 밤의 별 밝기 |
| `sky.haze` | 0~1 | 0.2 | 대기의 뿌연 정도 (높을수록 하늘이 우윳빛). 안개·먼지·아지랑이가 낀 날은 0.3 이상, 맑고 투명한 날은 0.1 이하. 맵 하나에는 한 가지 느낌만 고른다 |
| `sky.blue` | 0~1 | 0.5 | 낮 하늘의 푸른 정도. `haze`와 따로 움직인다: 푸르면서 먼지 낀 하늘은 blue 0.7 + haze 0.35 |
| `sky.aurora` | 0~1 | 0 | 밤하늘 오로라 세기 (0 = 없음) |
| `sky.nightPhotos` | `night` 또는 `aurora` | `night` | 밤하늘 사진 폴더. 오로라 사진을 쓰려면 `aurora`. 다른 이름은 쓰지 않는다 |
| `horizon.mountains` | 0~1 | 0.5 | 산 높이 (0 = 산 없음, 평평한 지평선). 낮은 언덕 0.3 / 보통 0.5 / 웅장한 산 0.8 |
| `horizon.color` | `#rrggbb` | `#8a9bb5` | **salt, grass, sand만**: 산의 색. 앞쪽 산은 이 색을 어둡게, 먼 산은 안개에 섞여 옅어진다 |
| `horizon.snow` | 0~1 | 0 | **snow만**: 산의 눈 덮임 정도 |
| `horizon.trees` | 0~1 | 0 | **snow만**: 산자락의 침엽수 숲 |
| `ambience.wind` | 0~1 | 0.4 | 바람 소리와 구름·풀의 움직임 (약함 0.2 / 보통 0.4 / 강함 0.8) |
| `ambience.birds` | 0~1 | 0.4 | 낮의 새소리 (거의 없음 0.05 / 가끔 0.2 / 많음 0.6) |
| `ambience.insects` | 0~1 | 0.4 | 밤의 풀벌레 소리 (거의 없음 0 / 조금 0.2 / 가득 0.6). 0.5 이상이면 뚜렷하게 들린다 |

### 땅 종류별 모습

- **salt (소금 호수)**: 얕은 물이 덮인 소금 평원. 하늘과 산이 거울처럼 비친다. 산은 `horizon.color` 색의 겹겹이 푸른 능선. 밝은 낮에는 `horizon.color`를 어둡고 진하게(예 `#2b58c8`) 잡아야 산이 하늘에 묻히지 않는다.
- **grass (초원)**: 바람에 흔들리는 풀밭. 풀 사이에 야생화와 키 큰 갈대가 섞인다. `ground.color`가 풀 색이다(생생한 초록 `#62b02a`, 가을 황금빛 `#c98a22`). 산은 `horizon.color` 색의 안개 낀 언덕.
- **sand (모래 사막)**: 바람이 만든 긴 모래언덕과 잔물결 무늬. 걸으면 발자국이 남는다. `ground.color`가 모래 색이다(황금빛 `#d9a95f`, 붉은 모래 `#c47a45`, 흰 모래 `#e8d8b8`). 풀은 없다. 산은 `horizon.color` 색의 언덕이고, 사막답게 붉은 갈색(`#9a5a3c`)이 잘 어울린다.
- **snow (설원)**: 눈 쌓인 평원. 걸으면 뒤로 발자국이 남고 눈이 가끔 내린다. 산은 눈 덮인 봉우리와 어두운 바위, 산자락의 숲. `horizon.color`는 쓰이지 않는다.

### 알아둘 것

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
- [ ] 표에 없는 키(`id`, `thumb` 등)를 넣지 않았다
