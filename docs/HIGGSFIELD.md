# Higgsfield 이미지 연동 가이드

길눈의 지역 카드는 기본적으로 내장 SVG 일러스트를 사용합니다.
Higgsfield(https://higgsfield.ai)에서 생성한 이미지를 넣으면 카드와 배너가 자동으로 교체됩니다.

## 1. 프롬프트로 이미지 생성

각 지역에 맞춰 준비된 프롬프트가 `js/data.js`의 `REGIONS[i].artPrompt`에 들어 있습니다.
브라우저 콘솔에서 한 번에 뽑아볼 수 있습니다.

```js
REGIONS.forEach(r => console.log(`[${r.name}]`, r.artPrompt));
```

Higgsfield(웹 UI 또는 API)에서 위 프롬프트로 16:9 이미지를 생성하세요.
예시 — 서울:

> Cinematic wide shot of Gyeongbokgung Palace with N Seoul Tower on Namsan mountain
> in the background at dusk, traditional Korean palace roof lines in the foreground,
> warm lantern light, indigo blue sky, photorealistic, 16:9

## 2. 이미지 배치

생성한 이미지를 저장소의 `assets/higgsfield/` 폴더에 넣습니다.

```
assets/higgsfield/seoul.jpg
assets/higgsfield/busan.jpg
assets/higgsfield/jeju.jpg
assets/higgsfield/gyeongju.jpg
assets/higgsfield/gangneung.jpg
assets/higgsfield/jeonju.jpg
```

## 3. 매핑 등록

`js/higgsfield.js`의 `HIGGSFIELD_IMAGES`에서 주석을 해제하거나 URL을 등록합니다.

```js
const HIGGSFIELD_IMAGES = {
  seoul: "assets/higgsfield/seoul.jpg",
  busan: "assets/higgsfield/busan.jpg",
  // ...
};
```

원격 URL(CDN 등)도 사용할 수 있습니다. 등록된 지역만 이미지로 교체되고,
나머지는 내장 SVG를 그대로 사용하므로 일부만 먼저 적용해도 됩니다.

## 참고

- Higgsfield API를 사용해 빌드 단계에서 자동 생성하려면, API 키를 코드에 커밋하지 말고
  CI 시크릿으로 관리한 뒤 생성 결과물만 `assets/higgsfield/`에 커밋하는 방식을 권장합니다.
- 이미지가 없는 환경(오프라인, CSP 제한)에서는 자동으로 SVG 일러스트로 동작합니다.
