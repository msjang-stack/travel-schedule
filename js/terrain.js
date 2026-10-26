/* ── 길눈 · 지형 데이터 ──────────────────────────────────────────
   실제 해안선·강·호수·산 능선을 거칠게 따 온 근사 좌표다.
   3D 맵에서 바다와 모래톱, 산을 "실제 있는 방향"에 놓기 위한 용도이며
   측량용이 아니다(수백 m 단위 오차 포함).

   water 항목
     { type:"sea",    ring:[[lat,lng]...], coast:n, holes:[[[lat,lng]...]] }
                                                     앞 n개가 실제 해안선, holes 는 바다 속 섬
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
        [34.450, 128.700], [34.450, 130.300], [35.900, 130.300], [35.700, 129.420]
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
          [37.200, 130.000], [38.400, 130.000]
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
          [37.700, 129.600], [38.800, 129.600]
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
  },

  /* 통영 — 반도와 미륵도가 붙어 있고 사방이 한려수도 */
  tongyeong: {
    water: [{
      type: "island",
      ring: [
        [34.908, 128.392], [34.886, 128.452], [34.864, 128.480], [34.846, 128.474],
        [34.836, 128.462], [34.820, 128.458], [34.800, 128.452], [34.784, 128.428],
        [34.776, 128.398], [34.786, 128.372], [34.806, 128.362], [34.830, 128.368],
        [34.846, 128.386], [34.858, 128.372], [34.878, 128.362], [34.896, 128.374]
      ]
    }],
    hills: [
      { lat: 34.8270, lng: 128.4310, r: 1300, h: 461, name: "미륵산" },
      { lat: 34.8442, lng: 128.4292, r: 420, h: 72, name: "남망산" },
      { lat: 34.8900, lng: 128.4200, r: 1900, h: 650, name: "벽방산" },
      { lat: 34.7950, lng: 128.3900, r: 900, h: 290, name: "달아 능선" }
    ]
  },

  /* 춘천·가평 — 의암호와 소양호, 그 사이를 흐르는 북한강 */
  chuncheon: {
    water: [
      { type: "lake", ring: ring(37.8620, 127.7150, 2400, 3400) },
      { type: "lake", ring: ring(37.9480, 127.8300, 4200, 2600) },
      {
        type: "river", width: 700,
        center: [[37.884, 127.668], [37.848, 127.614], [37.816, 127.566],
                 [37.786, 127.534], [37.752, 127.552], [37.716, 127.586]]
      }
    ],
    hills: [
      { lat: 37.8530, lng: 127.6600, r: 1600, h: 654, name: "삼악산" },
      { lat: 37.9900, lng: 127.8500, r: 2200, h: 779, name: "오봉산" },
      { lat: 37.7400, lng: 127.3900, r: 2600, h: 886, name: "축령산" },
      { lat: 37.7600, lng: 127.4700, r: 1900, h: 632, name: "호명산" },
      { lat: 37.9050, lng: 127.7050, r: 1400, h: 436, name: "대룡산 줄기" }
    ]
  },

  /* 안동 — 낙동강이 하회마을을 휘감고 북쪽에 안동호 */
  andong: {
    water: [
      {
        type: "river", width: 300,
        center: [[36.516, 128.472], [36.534, 128.504], [36.548, 128.528],
                 [36.540, 128.556], [36.548, 128.604], [36.556, 128.666],
                 [36.562, 128.712], [36.570, 128.756], [36.578, 128.800]]
      },
      { type: "lake", ring: ring(36.6050, 128.8200, 5200, 3000) }
    ],
    hills: [
      { lat: 36.5430, lng: 128.5190, r: 420, h: 64, name: "부용대" },
      { lat: 36.5760, lng: 128.7220, r: 1300, h: 250, name: "영남산" },
      { lat: 36.6700, lng: 128.6300, r: 3100, h: 882, name: "학가산" },
      { lat: 36.4650, lng: 128.7820, r: 1500, h: 480, name: "만휴정 뒷산" }
    ]
  },

  /* 포항 — 영일만을 끼고 호미곶 반도가 바다로 뻗는다 */
  pohang: {
    water: [{
      type: "sea", coast: 14,
      ring: [
        [36.236, 129.368], [36.196, 129.384], [36.146, 129.392], [36.112, 129.390],
        [36.082, 129.390], [36.060, 129.383], [36.040, 129.392], [36.022, 129.424],
        [36.010, 129.482], [36.040, 129.544], [36.076, 129.570], [36.032, 129.592],
        [35.990, 129.560], [35.944, 129.546],
        [35.700, 130.400], [36.420, 130.400]
      ]
    }],
    hills: [
      { lat: 36.2600, lng: 129.3300, r: 3200, h: 710, name: "내연산" },
      { lat: 36.0100, lng: 129.3200, r: 2200, h: 482, name: "운제산" },
      { lat: 36.0570, lng: 129.3880, r: 500, h: 100, name: "환호 언덕" },
      { lat: 35.9800, lng: 129.4700, r: 1600, h: 360, name: "호미반도 능선" }
    ]
  },

  /* 인천·강화 — 서쪽이 서해, 그 안에 강화도와 영종도 */
  incheon: {
    water: [{
      type: "sea", coast: 9,
      holes: [
        [[37.796, 126.486], [37.766, 126.562], [37.706, 126.596], [37.646, 126.574],
         [37.594, 126.532], [37.580, 126.458], [37.620, 126.398], [37.682, 126.378],
         [37.744, 126.402]],
        [[37.544, 126.482], [37.522, 126.562], [37.480, 126.584], [37.448, 126.530],
         [37.462, 126.458], [37.512, 126.438]]
      ],
      ring: [
        [37.602, 126.620], [37.560, 126.596], [37.520, 126.602], [37.490, 126.606],
        [37.474, 126.592], [37.464, 126.612], [37.438, 126.622], [37.400, 126.632],
        [37.364, 126.644],
        [37.100, 125.700], [37.980, 125.700]
      ]
    }],
    hills: [
      { lat: 37.6110, lng: 126.4380, r: 2000, h: 472, name: "마니산" },
      { lat: 37.7300, lng: 126.4900, r: 1600, h: 316, name: "고려산" },
      { lat: 37.4730, lng: 126.6200, r: 450, h: 69, name: "자유공원 언덕" },
      { lat: 37.4300, lng: 126.7600, r: 2200, h: 302, name: "소래·관모산" }
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
  /* 통영 */
  dongpirang: "mountain", tongyeong_cable: "mountain", luge: "mountain",
  dalah: "park", dipirang: "park", haejeo: "port", gangguan: "port",
  jungang_ty: "market", seoho: "market", ddungbo: "urban", omisa: "urban",
  /* 춘천·가평 */
  soyang_sky: "water", soyangdam: "water", gongjicheon: "park",
  namiseom: "park", jaraseom: "park", gamjabat: "park", legoland: "park",
  petitefrance: "heritage", achim: "park", railbike: "water",
  /* 안동 */
  hahoe: "heritage", buyongdae: "mountain", mansujeong: "mountain",
  wolyeonggyo: "water", folk: "heritage", hahoe_market: "market",
  /* 포항 */
  spacewalk: "mountain", pohang_canal: "water", homigot: "beach",
  guryongpo: "port", camellia: "port", igari: "beach", yeongildae_cafe: "beach",
  /* 인천·강화 */
  wolmido: "port", gwangseongbo: "heritage", seokmodo: "beach",
  namdaemun: "market", myeongdong_cath: "heritage", orangdae: "beach",
  sodol: "beach", bohemian: "beach", homibando: "beach", yisunsin: "park",
  ty_cafe: "urban", dachi: "port", gapyeong_cafe: "water", nami_food: "port",
  byeongsan: "heritage", dosan: "heritage", kkachi: "urban", iljik: "urban",
  jjimdak: "market", mammoth: "urban", hahoe_cafe: "heritage",
  yeongildae: "beach", jukdo: "market", mulhoe: "beach",
  guryongpo_food: "port", guryongpo_sikdang: "port",
  gaehangjang: "urban", sinpo: "market", potal: "urban", sinseung: "urban",
  jeondeungsa: "heritage", joyang: "urban", ganghwa_market: "market",
  dongmak: "beach", ganghwa_dinner: "urban",
  chinatown: "urban", donghwa: "urban",
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
