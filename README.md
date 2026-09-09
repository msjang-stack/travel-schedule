# 길눈 — 국내 여행 동선 플래너

지역·여행 일수·인원 수·인원 구성을 고르면 그 지역의 **명소·맛집·카페를 동선 순서로** 엮은
하루 일정을 만들어 주는 정적 웹앱입니다.

## 기능

1. **지역 선택** — 서울·부산·제주·경주·강릉·전주. 각 지역 카드에 대표 풍경 일러스트
   (Higgsfield 생성 이미지로 교체 가능 — [docs/HIGGSFIELD.md](docs/HIGGSFIELD.md))
2. **조건 선택** — 여행 일수(1~3일), 인원 수, 구성(혼자·친구·연인·가족)
3. **동선 일정** — 권역(zone) 단위로 하루를 묶고, 오전 명소 → 점심 → 오후 → 카페 → 저녁 → 밤
   순서로 최근접 이웃 방식 동선을 구성
4. **장소 팁** — 각 장소의 주차 가능 여부, 티케팅·예약 방법, 웨이팅 요령 정리
5. **이동 UI** — 장소 사이 이동 수단(도보/차량)·예상 소요시간·거리 표시, 하루 동선 SVG 지도

## 실행

빌드 과정 없는 순수 정적 사이트입니다.

```bash
# 아무 정적 서버로 열기
python3 -m http.server 8000
# → http://localhost:8000
```

배포: GitHub Actions 워크플로(`.github/workflows/deploy-pages.yml`)가 푸시 시 GitHub Pages로 자동 배포합니다.
배포 주소: https://msjang-stack.github.io/travel-schedule/

## 구조

```
index.html          앱 골격 (3단계 SPA)
css/style.css       디자인 토큰(라이트/다크) + 레이아웃
js/data.js          지역·장소 데이터 (좌표, 주차/발권/웨이팅 정보)
js/app.js           동선 생성 로직 + 렌더링
js/higgsfield.js    지역 SVG 아트 + Higgsfield 이미지 연동 훅
docs/HIGGSFIELD.md  Higgsfield 이미지 생성·적용 가이드
```

## 데이터 주의

주차·요금·운영시간·웨이팅 정보는 2025년 기준 참고용입니다. 방문 전 공식 채널에서 확인하세요.
이동시간은 직선거리 기반 추정치입니다.
