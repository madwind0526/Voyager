# Patterns

> 검증된 코드 패턴. 복붙 바로 가능한 형태로 유지.

## 리깅 모델 절차 애니메이션

**사용 시점:** 부모 본과 자식 본의 rest 회전을 유지하면서 관절 움직임을 적용할 때.

관절 회전을 rest 월드 프레임 기준으로 계산한 뒤 `inverse(parentRest) * worldRotation * parentRest * localRest`로 로컬 회전을 만든다.

## 모바일 기준 화면을 넓은 브라우저에서 유지

**사용 시점:** 앱 자체가 세로 모바일 화면을 기준으로 하고 데스크톱에서 가로로 확장되면 안 될 때.

앱 컨테이너에 `width: 100%; max-width: 420px; margin-inline: auto`를 적용한다. 휴대폰에서는 가용 폭을 그대로 쓰고 넓은 화면에서는 가운데 정렬한다.

## 눈 덮인 산의 중앙 골짜기와 오목한 발자국

**사용 시점:** Snow North와 Grassland처럼 산이 화면을 감싸야 할 때. Salt Desert에는 적용하지 않는다.

기본 시야 정면 양쪽에 서로 다른 높이의 봉우리를 두고 중앙을 낮춘다. Snow North와 Grassland만 부드러운 다중 주파수 표면, 불규칙한 눈선, 드러난 바위 패치를 사용한다. 발자국은 동심 링 타원 메시의 중심을 낮고 어둡게, 가장자리를 약간 높고 밝게 해 눌린 눈을 표현한다.

## Salt Desert의 다층 능선

**사용 시점:** 야간 산 실루엣에서 겹친 먼 능선이 안개에 묻힐 때.

9개 능선은 그대로 유지한다. Salt Desert에 한해 먼 능선의 안개 혼합을 낮추고 야간 노출을 올려 층을 구별한다. Snow North와 Grassland의 안개 처리는 별도로 유지한다.

## Mixamo FBX walk clips
Mixamo animation exports can prefix track names with a numbered namespace such as `mixamorig9Hips`, while the target character uses `mixamorigHips`. Strip the optional numeric namespace and bind each clip track to the target rig's actual bone name. Only apply the clip to Mixamo-style rigs; retain the existing procedural pose for other skeletons. Keep animation FBX files out of character discovery.
