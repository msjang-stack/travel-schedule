/* ── 길눈 · 지형 데이터 ──────────────────────────────────────────
   실제 해안선·강·호수·산 능선을 거칠게 따 온 근사 좌표다.
   3D 맵에서 바다와 모래톱, 산을 "실제 있는 방향"에 놓기 위한 용도이며
   측량용이 아니다(수백 m 단위 오차 포함).

   water 항목
     { type:"sea",    ring:[[lat,lng]...], coast:n }  앞 n개가 실제 해안선
     { type:"island", ring:[[lat,lng]...] }           링 바깥이 전부 바다
     { type:"river",  center:[[lat,lng]...], width:m }
     { type:"lake",   ring:[[lat,lng]...] }
   hills 항목
     { lat, lng, r:반경m, h:높이m, name }                               */

const REGION_TERRAIN = {
  /* 서울 — 한강이 도시를 가로지르고 남산이 가운데 솟는다 */
  seoul: {
    water: [{
      type: "river", width: 1000,
      center: [
        [37.578, 126.772], [37.560, 126.822], [37.538, 126.868], [37.523, 126.912],
        [37.517, 126.956], [37.517, 126.998], [37.524, 127.034], [37.531, 127.072],
        [37.542, 127.104], [37.556, 127.140]
      ]
    }],
    hills: [
      { lat: 37.5512, lng: 126.9882, r: 950, h: 250, name: "남산" },
      { lat: 37.5890, lng: 126.9420, r: 1000, h: 270, name: "인왕산" },
      { lat: 37.6350, lng: 126.9800, r: 2400, h: 600, name: "북한산" },
      { lat: 37.4950, lng: 127.0390, r: 900, h: 230, name: "구룡산" }
    ]
  },

  /* 부산 — 남동쪽이 전부 바다, 산복도로의 언덕들 */
  busan: {
    water: [{
      type: "sea", coast: 14,
      ring: [
        [35.335, 129.268], [35.282, 129.252], [35.245, 129.232], [35.206, 129.228],
        [35.190, 129.224], [35.172, 129.205], [35.160, 129.175], [35.153, 129.148],
        [35.150, 129.120], [35.136, 129.104], [35.104, 129.098], [35.070, 129.074],
        [35.072, 129.040], [35.063, 128.992],
        [34.930, 128.960], [34.930, 129.520], [35.420, 129.520], [35.400, 129.300]
      ]
    }],
    hills: [
      { lat: 35.0960, lng: 129.0060, r: 850, h: 240, name: "천마산" },
      { lat: 35.1230, lng: 129.0300, r: 900, h: 300, name: "엄광산" },
      { lat: 35.1650, lng: 129.1150, r: 1000, h: 350, name: "황령산" },
      { lat: 35.2100, lng: 129.1050, r: 1600, h: 520, name: "금정산" },
      { lat: 35.0790, lng: 129.0620, r: 700, h: 300, name: "봉래산(영도)" }
    ]
  },

  /* 제주 — 섬 바깥이 전부 바다, 한가운데 한라산 */
  jeju: {
    water: [{
      type: "island",
      ring: [
        [33.556, 126.798], [33.540, 126.862], [33.512, 126.918], [33.470, 126.940],
        [33.436, 126.930], [33.398, 126.890], [33.352, 126.852], [33.306, 126.808],
        [33.264, 126.700], [33.244, 126.600], [33.240, 126.492], [33.232, 126.420],
        [33.228, 126.330], [33.244, 126.254], [33.292, 126.176], [33.344, 126.158],
        [33.394, 126.222], [33.440, 126.274], [33.480, 126.338], [33.508, 126.428],
        [33.522, 126.530], [33.538, 126.640], [33.552, 126.722]
      ]
    }],
    hills: [
      { lat: 33.3617, lng: 126.5292, r: 7000, h: 1950, name: "한라산" },
      { lat: 33.4587, lng: 126.9425, r: 600, h: 180, name: "성산일출봉" },
      { lat: 33.2390, lng: 126.3130, r: 700, h: 395, name: "산방산" },
      { lat: 33.4000, lng: 126.2680, r: 500, h: 165, name: "비양도" }
    ]
  },

  /* 경주 — 내륙 분지. 보문호와 토함산·남산 */
  gyeongju: {
    water: [
      { type: "lake", ring: ring(35.8415, 129.2835, 900, 700) },
      { type: "lake", ring: ring(35.8347, 129.2265, 170, 120) }
    ],
    hills: [
      { lat: 35.7920, lng: 129.3450, r: 3000, h: 745, name: "토함산" },
      { lat: 35.7850, lng: 129.2300, r: 2400, h: 470, name: "남산" },
      { lat: 35.8700, lng: 129.2200, r: 1500, h: 300, name: "소금강산" }
    ]
  },

  /* 강릉 — 동쪽이 바다, 서쪽은 대관령 능선 */
  gangneung: {
    water: [
      {
        type: "sea", coast: 11,
        ring: [
          [37.945, 128.796], [37.912, 128.818], [37.890, 128.836], [37.862, 128.868],
          [37.832, 128.890], [37.806, 128.912], [37.790, 128.922], [37.772, 128.950],
          [37.758, 128.956], [37.712, 129.014], [37.688, 129.042],
          [37.600, 129.200], [38.000, 129.200]
        ]
      },
      { type: "lake", ring: ring(37.7955, 128.8980, 900, 620) }
    ],
    hills: [
      { lat: 37.6900, lng: 128.7600, r: 4000, h: 860, name: "대관령" },
      { lat: 37.7700, lng: 128.8000, r: 2600, h: 640, name: "제왕산" },
      { lat: 37.8600, lng: 128.7400, r: 3000, h: 700, name: "노인봉 줄기" }
    ]
  },

  /* 전주 — 내륙. 덕진 연못과 전주천, 동쪽의 기린봉 */
  jeonju: {
    water: [
      { type: "lake", ring: ring(35.8442, 127.1194, 300, 240) },
      {
        type: "river", width: 90,
        center: [[35.782, 127.126], [35.800, 127.138], [35.812, 127.148],
                 [35.826, 127.158], [35.842, 127.166]]
      }
    ],
    hills: [
      { lat: 35.8180, lng: 127.1720, r: 900, h: 270, name: "기린봉" },
      { lat: 35.7960, lng: 127.1480, r: 800, h: 300, name: "완산칠봉" },
      { lat: 35.8500, lng: 127.2000, r: 1600, h: 400, name: "모악 줄기" }
    ]
  },

  /* 여수 — 반도와 돌산도, 그 사이 바다 */
  yeosu: {
    water: [{
      type: "island",
      ring: [
        [34.812, 127.628], [34.800, 127.700], [34.782, 127.758], [34.762, 127.804],
        [34.746, 127.796], [34.738, 127.772], [34.730, 127.752], [34.716, 127.742],
        [34.704, 127.760], [34.676, 127.788], [34.640, 127.804], [34.608, 127.812],
        [34.588, 127.800], [34.592, 127.776], [34.620, 127.772], [34.654, 127.756],
        [34.688, 127.736], [34.712, 127.716], [34.734, 127.700], [34.756, 127.664],
        [34.784, 127.630]
      ]
    }],
    hills: [
      { lat: 34.7480, lng: 127.7200, r: 900, h: 280, name: "구봉산" },
      { lat: 34.6900, lng: 127.7740, r: 1200, h: 460, name: "금오산 줄기" },
      { lat: 34.6050, lng: 127.8000, r: 700, h: 320, name: "향일암 뒷산" }
    ]
  },

  /* 속초 — 동쪽 바다, 서쪽 설악의 바위 능선, 가운데 청초호 */
  sokcho: {
    water: [
      {
        type: "sea", coast: 9,
        ring: [
          [38.300, 128.566], [38.262, 128.578], [38.232, 128.592], [38.214, 128.602],
          [38.202, 128.606], [38.188, 128.610], [38.172, 128.616], [38.148, 128.628],
          [38.118, 128.644],
          [38.060, 128.820], [38.340, 128.820]
        ]
      },
      { type: "lake", ring: ring(38.1960, 128.5900, 1300, 900) },
      { type: "lake", ring: ring(38.1700, 128.5600, 800, 600) }
    ],
    hills: [
      { lat: 38.1850, lng: 128.4680, r: 1600, h: 780, name: "울산바위" },
      { lat: 38.1660, lng: 128.4790, r: 1200, h: 640, name: "권금성" },
      { lat: 38.1190, lng: 128.4650, r: 3800, h: 1500, name: "대청봉" },
      { lat: 38.2300, lng: 128.4900, r: 2200, h: 700, name: "신선봉 줄기" }
    ]
  }
};

/* 타원형 호수/못을 링으로 */
function ring(lat, lng, rxM, ryM) {
  const pts = [];
  const latAdj = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    pts.push([
      lat + (Math.sin(t) * ryM) / 111320,
      lng + (Math.cos(t) * rxM) / (111320 * latAdj)
    ]);
  }
  return pts;
}

/* ── 장소별 지형 성격 ──
   이름·설명에서 추론하고, 애매한 곳은 PLACE_TERRAIN으로 직접 지정한다.
   beach(모래사장) · port(항·부두) · water(호수/폭포/계곡)
   mountain(산·전망) · park(숲·공원) · market(시장) · heritage(궁·절·한옥)
   urban(그 외 도심)                                                     */
const PLACE_TERRAIN = {
  gwangchigi: "beach", woljeongri: "beach", hyeopjae: "beach",
  haeundae: "beach", gwangalli: "beach", gangmun: "beach", gyeongpo: "beach",
  sokchobeach: "beach", hyangho: "beach", museulmok: "beach",
  huinnyeoul: "port", jagalchi: "port", jumunjin: "port", yeongjin: "port",
  piarc: "port", millac: "port", anmok: "beach", abai: "port",
  gijang_crab: "port", "gijang-crab": "port", choryang: "urban",
  seongsan: "mountain", seopjikoji: "beach", yonggungsa: "port",
  namsan: "mountain", seoulsky: "urban", seoulforest: "park",
  ttukseom: "water", bomun: "water", cheonjiyeon: "water", jeongbang: "water",
  deokjin: "water", donggung: "water", seorak: "mountain", oeongchi: "beach",
  blueline: "beach", gamcheon: "mountain", osulloc: "park",
  hallimpark: "park", wolhwa: "park", haslla: "beach", dolsanpark: "mountain",
  hyangiram: "mountain", odongdo: "port", yeosucable: "port", pocha: "port",
  waveon: "beach", bongpo: "port", yeonggeum: "port", seokguram: "mountain",
  bulguksa: "heritage", gbg: "heritage", gyeonggijeon: "heritage",
  bukchon: "heritage", namsangol: "heritage", ikseon: "heritage",
  daereungwon: "heritage", cheomseongdae: "heritage", omokdae: "heritage",
  jeondong: "heritage", hwangridan: "heritage", jaman: "heritage",
  gwangjang: "market", gukje: "market", nambu: "market", jungang: "market",
  jungangsijang: "market", ojukheon: "heritage", leesunsin: "port"
};

function placeTerrain(p) {
  if (PLACE_TERRAIN[p.id]) return PLACE_TERRAIN[p.id];
  const t = p.name + " " + (p.desc || "");
  if (/해수욕장|해변|백사장|모래/.test(t)) return "beach";
  if (/항\b|부두|선착장|방파제|어시장|포구|해안|바닷가/.test(t)) return "port";
  if (/시장/.test(t)) return "market";
  if (/폭포|호수|호반|연못|계곡|저수지/.test(t)) return "water";
  if (/산|봉|오름|전망대|타워|케이블카|절벽/.test(t)) return "mountain";
  if (/공원|숲|수목원|정원|둘레길|산책로/.test(t)) return "park";
  if (/궁|사찰|암자|한옥|서원|향교|고분|릉|탑|성당|사(?=$)/.test(t)) return "heritage";
  return "urban";
}
