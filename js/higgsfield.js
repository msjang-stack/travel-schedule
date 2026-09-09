/* ── 길눈 · 지역 비주얼 & Higgsfield 연동 훅 ─────────────────
   기본값: 지역별 랜드마크를 표현한 내장 SVG 일러스트.
   Higgsfield(https://higgsfield.ai)에서 이미지를 생성했다면
   HIGGSFIELD_IMAGES에 지역 id → 이미지 URL(또는 로컬 경로)을 넣으면
   카드/배너 아트가 자동으로 교체된다.
   각 지역의 REGIONS[i].artPrompt 가 바로 쓸 수 있는 생성 프롬프트다.
   자세한 절차는 docs/HIGGSFIELD.md 참고.                          */

const HIGGSFIELD_IMAGES = {
  // seoul:     "assets/higgsfield/seoul.jpg",
  // busan:     "assets/higgsfield/busan.jpg",
  // jeju:      "assets/higgsfield/jeju.jpg",
  // gyeongju:  "assets/higgsfield/gyeongju.jpg",
  // gangneung: "assets/higgsfield/gangneung.jpg",
  // jeonju:    "assets/higgsfield/jeonju.jpg",
  // yeosu:     "assets/higgsfield/yeosu.jpg",
  // sokcho:    "assets/higgsfield/sokcho.jpg",
};

/* 내장 SVG 일러스트 — 각 지역의 대표 풍경을 단순한 도형으로 표현 */
const REGION_ART = {
  seoul: `
  <svg viewBox="0 0 320 180" role="img" aria-label="서울 — 남산타워와 궁궐 지붕">
    <defs><linearGradient id="sk-seoul" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b3a67"/><stop offset="0.6" stop-color="#5c6e9e"/><stop offset="1" stop-color="#e8a87c"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-seoul)"/>
    <circle cx="262" cy="38" r="14" fill="#f6e7c1" opacity="0.9"/>
    <path d="M0 118 Q80 78 160 112 T320 104 V180 H0 Z" fill="#31435c"/>
    <rect x="152" y="52" width="7" height="58" fill="#1e2a3a"/>
    <ellipse cx="155.5" cy="52" rx="14" ry="9" fill="#1e2a3a"/>
    <rect x="154" y="24" width="3" height="22" fill="#1e2a3a"/>
    <path d="M0 180 V150 Q40 128 80 146 L88 138 Q120 120 160 140 V180 Z" fill="#22303f"/>
    <path d="M28 156 q34 -22 68 0 l-6 8 q-28 -16 -56 0 Z" fill="#8f3b2d"/>
    <rect x="42" y="160" width="40" height="20" fill="#3a2a20"/>
    <rect x="58" y="166" width="9" height="14" fill="#c99a5b"/>
  </svg>`,
  busan: `
  <svg viewBox="0 0 320 180" role="img" aria-label="부산 — 광안대교의 밤바다">
    <defs><linearGradient id="sk-busan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#101c30"/><stop offset="1" stop-color="#25476b"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-busan)"/>
    <circle cx="52" cy="34" r="11" fill="#f2ead0"/>
    <rect x="0" y="118" width="320" height="62" fill="#0c2338"/>
    <path d="M20 118 Q90 62 160 118 Q230 62 300 118" fill="none" stroke="#f0b45c" stroke-width="3"/>
    <rect x="88" y="84" width="5" height="34" fill="#e8ecef"/>
    <rect x="228" y="84" width="5" height="34" fill="#e8ecef"/>
    <line x1="20" y1="118" x2="300" y2="118" stroke="#dfe6ea" stroke-width="4"/>
    <g fill="#f0b45c">
      <circle cx="60" cy="99" r="1.6"/><circle cx="110" cy="90" r="1.6"/><circle cx="160" cy="117" r="1.6"/>
      <circle cx="210" cy="90" r="1.6"/><circle cx="260" cy="99" r="1.6"/>
    </g>
    <g stroke="#f0b45c" stroke-width="1.4" opacity="0.65">
      <line x1="80" y1="132" x2="80" y2="146"/><line x1="162" y1="136" x2="162" y2="154"/><line x1="244" y1="130" x2="244" y2="144"/>
    </g>
  </svg>`,
  jeju: `
  <svg viewBox="0 0 320 180" role="img" aria-label="제주 — 성산일출봉의 일출">
    <defs><linearGradient id="sk-jeju" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd9a0"/><stop offset="0.55" stop-color="#ffb27a"/><stop offset="1" stop-color="#3f8f8a"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-jeju)"/>
    <circle cx="160" cy="76" r="20" fill="#fff3d6"/>
    <rect x="0" y="112" width="320" height="68" fill="#2e7f7d"/>
    <path d="M178 112 L206 58 Q232 44 258 58 L286 112 Z" fill="#3c5b52"/>
    <path d="M206 58 Q232 50 258 58 L252 70 Q232 62 212 70 Z" fill="#5b7a67"/>
    <path d="M0 180 V150 q30 -12 60 0 q30 12 60 0 V180 Z" fill="#e9c34c" opacity="0.85"/>
    <g fill="#0f3f3e" opacity="0.7">
      <circle cx="60" cy="128" r="2.4"/><circle cx="96" cy="134" r="2.4"/><circle cx="30" cy="136" r="2.4"/>
    </g>
  </svg>`,
  gyeongju: `
  <svg viewBox="0 0 320 180" role="img" aria-label="경주 — 첨성대와 고분">
    <defs><linearGradient id="sk-gj" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2c9c1"/><stop offset="0.6" stop-color="#e8a58f"/><stop offset="1" stop-color="#77655a"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-gj)"/>
    <circle cx="70" cy="46" r="15" fill="#fbe9d2" opacity="0.9"/>
    <ellipse cx="60" cy="182" rx="95" ry="58" fill="#5c7a4e"/>
    <ellipse cx="255" cy="188" rx="110" ry="62" fill="#4c6a42"/>
    <path d="M162 70 q-13 3 -13 16 q0 22 8 34 h-6 v10 h34 v-10 h-6 q8 -12 8 -34 q0 -13 -13 -16 Z" fill="#8a7d6d"/>
    <rect x="146" y="66" width="44" height="6" fill="#8a7d6d"/>
    <rect x="166" y="96" width="8" height="9" fill="#4d4338"/>
  </svg>`,
  gangneung: `
  <svg viewBox="0 0 320 180" role="img" aria-label="강릉 — 동해 일출과 솔숲">
    <defs><linearGradient id="sk-gn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfe3ea"/><stop offset="0.55" stop-color="#f6d9b8"/><stop offset="1" stop-color="#3c6f86"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-gn)"/>
    <circle cx="238" cy="84" r="17" fill="#f6b56a"/>
    <rect x="0" y="100" width="320" height="80" fill="#2f6579"/>
    <path d="M238 100 v40" stroke="#f6b56a" stroke-width="4" opacity="0.5" stroke-dasharray="6 5"/>
    <g fill="#1d3c34">
      <path d="M36 100 l14 -34 l14 34 z"/><rect x="47" y="100" width="5" height="18"/>
      <path d="M78 104 l12 -28 l12 28 z"/><rect x="87" y="104" width="4" height="14"/>
    </g>
    <path d="M120 44 q8 -8 16 0" stroke="#40606b" stroke-width="2.4" fill="none"/>
    <path d="M148 56 q8 -8 16 0" stroke="#40606b" stroke-width="2.4" fill="none"/>
  </svg>`,
  jeonju: `
  <svg viewBox="0 0 320 180" role="img" aria-label="전주 — 한옥마을과 전동성당">
    <defs><linearGradient id="sk-jj" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4cf9a"/><stop offset="0.6" stop-color="#e0a06a"/><stop offset="1" stop-color="#6d4a3a"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-jj)"/>
    <circle cx="248" cy="58" r="17" fill="#5d7f6c"/>
    <rect x="242" y="72" width="12" height="30" fill="#b9876a"/>
    <rect x="236" y="98" width="24" height="18" fill="#c99b76"/>
    <path d="M0 132 q30 -22 60 0 l-4 6 q-26 -16 -52 0 Z" fill="#4a3226"/>
    <path d="M64 140 q34 -26 68 0 l-5 7 q-29 -19 -58 0 Z" fill="#553a2b"/>
    <path d="M140 132 q30 -22 60 0 l-4 6 q-26 -16 -52 0 Z" fill="#4a3226"/>
    <rect x="0" y="138" width="320" height="42" fill="#3c2a1f"/>
    <g fill="#f2b96a">
      <circle cx="46" cy="152" r="3"/><circle cx="120" cy="156" r="3"/><circle cx="196" cy="152" r="3"/><circle cx="268" cy="156" r="3"/>
    </g>
  </svg>`
,
  yeosu: `
  <svg viewBox="0 0 320 180" role="img" aria-label="여수 — 밤바다와 해상케이블카">
    <defs><linearGradient id="sk-ys" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#182447"/><stop offset="1" stop-color="#2c4a72"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-ys)"/>
    <circle cx="272" cy="36" r="12" fill="#f2ead0"/>
    <rect x="0" y="120" width="320" height="60" fill="#0e2740"/>
    <line x1="0" y1="58" x2="320" y2="86" stroke="#9fb4c8" stroke-width="1.6" opacity="0.8"/>
    <g fill="#e8734a">
      <rect x="86" y="64" width="16" height="20" rx="3"/>
      <rect x="196" y="74" width="16" height="20" rx="3"/>
    </g>
    <line x1="94" y1="58" x2="94" y2="66" stroke="#9fb4c8" stroke-width="1.6"/>
    <line x1="204" y1="68" x2="204" y2="76" stroke="#9fb4c8" stroke-width="1.6"/>
    <path d="M20 120 Q60 96 100 120" fill="none" stroke="#f0b45c" stroke-width="2.6"/>
    <path d="M100 120 Q140 96 180 120" fill="none" stroke="#f0b45c" stroke-width="2.6"/>
    <g stroke="#f0b45c" stroke-width="1.3" opacity="0.6">
      <line x1="60" y1="132" x2="60" y2="146"/><line x1="140" y1="136" x2="140" y2="150"/><line x1="236" y1="130" x2="236" y2="142"/>
    </g>
    <circle cx="288" cy="128" r="2" fill="#f0b45c"/><circle cx="264" cy="136" r="2" fill="#f0b45c"/>
  </svg>`,
  sokcho: `
  <svg viewBox="0 0 320 180" role="img" aria-label="속초 — 울산바위와 갯배">
    <defs><linearGradient id="sk-sc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cddce3"/><stop offset="0.55" stop-color="#e9d9c0"/><stop offset="1" stop-color="#37697e"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#sk-sc)"/>
    <g fill="#7d8fa0">
      <path d="M18 96 L44 34 L66 96 Z"/><path d="M58 96 L86 22 L112 96 Z"/><path d="M104 96 L128 40 L150 96 Z"/>
    </g>
    <g fill="#93a5b4">
      <path d="M40 96 L58 52 L74 96 Z"/><path d="M84 96 L102 44 L118 96 Z"/>
    </g>
    <rect x="0" y="96" width="320" height="84" fill="#2d6076"/>
    <rect x="196" y="104" width="76" height="14" rx="3" fill="#8a5a3b"/>
    <rect x="222" y="92" width="10" height="12" fill="#5d3b26"/>
    <line x1="150" y1="111" x2="318" y2="111" stroke="#d8cfb6" stroke-width="1.6" opacity="0.7"/>
    <circle cx="282" cy="44" r="13" fill="#f6dcb0"/>
    <path d="M148 60 q8 -8 16 0" stroke="#4b6b7a" stroke-width="2.2" fill="none"/>
    <path d="M172 50 q8 -8 16 0" stroke="#4b6b7a" stroke-width="2.2" fill="none"/>
  </svg>`
};

/* 지역 아트 HTML — Higgsfield 이미지가 등록돼 있으면 그것을 우선 사용 */
function regionArtHTML(regionId, regionName) {
  const img = HIGGSFIELD_IMAGES[regionId];
  if (img) {
    return `<img src="${img}" alt="${regionName} 대표 풍경 (Higgsfield 생성 이미지)" loading="lazy">`;
  }
  return REGION_ART[regionId] || "";
}
