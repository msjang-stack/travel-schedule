/* ── 길눈 · 앱 로직 ─────────────────────────────────────────
   1) 지역 선택 → 2) 조건 선택 → 3) 동선을 고려한 일정 생성    */

const state = {
  regionId: null,
  days: 2,
  people: 2,
  party: "couple",
  variant: 0 // "다시 짜기" 시 후보 순환용
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SLOT_LABEL = {
  am: "오전", lunch: "점심", pm: "오후",
  cafe: "카페 타임", dinner: "저녁", night: "밤"
};
const CAT_LABEL = { spot: "명소", food: "맛집", cafe: "카페" };

/* ── 거리/이동 계산 ── */
function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function travelLeg(a, b, speed) {
  const km = haversineKm(a, b);
  const roadKm = km * 1.35; // 직선거리 → 실제 도로 보정
  if (km <= 1.1) {
    const min = Math.max(3, Math.round((roadKm * 1000) / 67)); // 도보 약 4km/h
    return { mode: "walk", min, km: roadKm };
  }
  const raw = (roadKm * 1000) / speed + 7; // 주차·승하차 여유 7분
  const min = Math.max(10, Math.round(raw / 5) * 5);
  return { mode: "car", min, km: roadKm };
}

/* ── 일정 생성 ── */
function fitScore(p) {
  let s = 0;
  if (p.fit.includes(state.party)) s += 3;
  if (state.party === "family" && p.parking && p.parking.ok === true) s += 1;
  if (state.people >= 5 && p.parking && p.parking.ok === true) s += 1;
  return s;
}

function pick(cands, n, offset) {
  const sorted = [...cands].sort((a, b) => fitScore(b) - fitScore(a));
  if (sorted.length <= n) return sorted;
  const rotated = sorted.map((_, i) => sorted[(i + offset) % sorted.length]);
  return rotated.slice(0, n);
}

function nearestChain(start, items) {
  const rest = [...items], out = [];
  let cur = start;
  while (rest.length) {
    rest.sort((a, b) => haversineKm(cur, a) - haversineKm(cur, b));
    cur = rest.shift();
    out.push(cur);
  }
  return out;
}

function buildDay(region, zoneIdx, variant) {
  const pool = region.places.filter((p) => p.zone === zoneIdx);
  const bySlot = (slot, cat) =>
    pool.filter((p) => p.slot === slot && (!cat || p.cat === cat));

  const ams = pick(bySlot("am"), 2, variant);
  const lunch = pick(bySlot("lunch", "food"), 1, variant);
  const pms = pick(bySlot("pm"), 2, variant);
  const cafes = pick(bySlot("cafe", "cafe"), 1, variant);
  let dinner = pick(bySlot("dinner", "food"), 1, variant);
  if (!dinner.length) {
    const alt = bySlot("lunch", "food").filter((p) => !lunch.includes(p));
    dinner = pick(alt, 1, variant);
  }
  const night = pick(bySlot("night"), 1, variant);

  const seq = [];
  if (ams.length) {
    seq.push(ams[0]);
    if (ams[1]) seq.push(ams[1]);
  }
  seq.push(...lunch);
  const anchor = seq[seq.length - 1] || pms[0] || cafes[0];
  if (anchor) seq.push(...nearestChain(anchor, [...pms, ...cafes]));
  else seq.push(...pms, ...cafes);
  seq.push(...dinner, ...night);

  const items = seq.filter(Boolean);
  const legs = [];
  for (let i = 0; i < items.length - 1; i++) {
    legs.push(travelLeg(items[i], items[i + 1], region.speed));
  }
  return { zone: region.zones[zoneIdx], items, legs };
}

function buildPlan() {
  const region = REGIONS.find((r) => r.id === state.regionId);
  const days = Math.min(state.days, region.maxDays);
  const plan = [];
  for (let d = 0; d < days; d++) {
    /* "다르게 짜기"마다 권역 배치를 회전 — 하루짜리 여행은 다른 권역으로,
       여러 날 여행은 날짜별 순서가 바뀌어 항상 눈에 보이는 변화가 생긴다 */
    const zoneIdx = (d + state.variant) % region.zones.length;
    plan.push(buildDay(region, zoneIdx, state.variant));
  }
  return { region, days, plan };
}

/* ── 렌더: 1단계 지역 ── */
function renderRegions() {
  $("#regionGrid").innerHTML = REGIONS.map((r) => `
    <button class="region-card" data-region="${r.id}" aria-label="${r.name} 선택">
      <span class="region-art">${regionArtHTML(r.id, r.name)}</span>
      <span class="region-body">
        <span class="region-name">${r.name}<span class="en">${r.en}</span></span>
        <span class="region-tag">${r.tagline}</span>
        <span class="region-meta">
          <span>${r.landmark}</span>
          <span>최대 ${r.maxDays}일 코스</span>
        </span>
      </span>
    </button>`).join("");

  $$("#regionGrid .region-card").forEach((el) =>
    el.addEventListener("click", () => selectRegion(el.dataset.region))
  );
}

function selectRegion(regionId) {
  state.regionId = regionId;
  state.variant = 0;
  renderOptions();
  showStep(2);
}

/* 지역 직접 선택 드롭다운: 코스 준비된 지역 + 준비 중 지역 */
function renderRegionFinder() {
  const sel = $("#regionSelect");
  const ready = REGIONS.map((r) =>
    `<option value="${r.id}">${r.name}</option>`).join("");
  const coming = COMING_REGIONS.map((c, i) =>
    `<option value="coming:${i}">${c.name} (준비 중)</option>`).join("");
  sel.innerHTML = `
    <option value="" selected>지역을 직접 선택하기…</option>
    <optgroup label="코스 준비 완료">${ready}</optgroup>
    <optgroup label="준비 중인 지역">${coming}</optgroup>`;

  sel.addEventListener("change", () => {
    const v = sel.value;
    const hint = $("#finderHint");
    if (!v) { hint.hidden = true; return; }
    if (v.startsWith("coming:")) {
      const c = COMING_REGIONS[+v.split(":")[1]];
      const near = REGIONS.find((r) => r.id === c.near);
      hint.innerHTML = `<b>${c.name}</b> 코스는 준비 중이에요. 지금은 가까운
        <button type="button" data-near="${near.id}">${near.name} 코스 보기 →</button> 를 추천해요.`;
      hint.hidden = false;
      hint.querySelector("button").addEventListener("click", () => selectRegion(near.id));
      return;
    }
    hint.hidden = true;
    selectRegion(v);
    sel.value = "";
  });
}

/* ── 렌더: 2단계 조건 ── */
function renderOptions() {
  const r = REGIONS.find((x) => x.id === state.regionId);
  $("#optBanner").innerHTML = `
    <span class="thumb">${regionArtHTML(r.id, r.name)}</span>
    <span><b>${r.name}</b><br><span class="d">${r.tagline}</span></span>`;

  if (state.days > r.maxDays) state.days = r.maxDays;
  $("#dayChips").innerHTML = [1, 2, 3].map((d) => `
    <button class="chip" data-days="${d}" aria-pressed="${state.days === d}"
      ${d > r.maxDays ? "disabled" : ""}>${d}일${d > r.maxDays ? "<small>준비 중</small>" : ""}</button>`).join("");
  $$("#dayChips .chip").forEach((el) =>
    el.addEventListener("click", () => {
      state.days = +el.dataset.days;
      renderOptions();
    })
  );

  $("#peopleNum").textContent = `${state.people}명`;
  $("#peopleMinus").disabled = state.people <= 1;
  $("#peoplePlus").disabled = state.people >= 10;

  $("#partyChips").innerHTML = PARTY_TYPES.map((p) => `
    <button class="chip" data-party="${p.id}" aria-pressed="${state.party === p.id}">
      ${p.label}<small>${p.sub}</small></button>`).join("");
  $$("#partyChips .chip").forEach((el) =>
    el.addEventListener("click", () => {
      state.party = el.dataset.party;
      renderOptions();
    })
  );
}

/* ── 렌더: 3단계 일정 ── */
function tipRows(p) {
  const rows = [];
  if (p.parking) {
    const cls = p.parking.ok === true ? "ok" : p.parking.ok === "hard" ? "warn" : "warn";
    const head = p.parking.ok === true ? "주차 가능" : p.parking.ok === "hard" ? "주차 빠듯" : "주차 불가";
    rows.push(`<div class="tip-row"><span class="tip-key ${cls}">주차</span>
      <span class="tip-val"><b>${head}</b> · ${p.parking.note}</span></div>`);
  }
  if (p.ticket) {
    rows.push(`<div class="tip-row"><span class="tip-key ok">발권</span>
      <span class="tip-val">${p.ticket.note}</span></div>`);
  }
  if (p.wait) {
    rows.push(`<div class="tip-row"><span class="tip-key warn">웨이팅</span>
      <span class="tip-val">${p.wait.note}</span></div>`);
  }
  return rows.length ? `<div class="tips">${rows.join("")}</div>` : "";
}

function moveHTML(leg) {
  const icon = leg.mode === "walk"
    ? `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="2.6" r="1.7"/><path d="M7 5.4 5.2 9l1.5.6L5.4 14h1.7l1.4-4 1.3 1.2V14h1.6v-3.6L9.6 8.6l.6-1.8 1.2 1.4 1.8.5.4-1.4-1.5-.5L10.4 5z"/></svg>`
    : `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 7l1.2-3.2A1.4 1.4 0 0 1 5.5 3h5a1.4 1.4 0 0 1 1.3.8L13 7a1.6 1.6 0 0 1 1.4 1.6V12h-1.6v1.2a.9.9 0 0 1-1.8 0V12H5v1.2a.9.9 0 0 1-1.8 0V12H1.6V8.6A1.6 1.6 0 0 1 3 7zm1.7-.2h6.6l-.9-2.3H5.6zM4 10.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>`;
  const label = leg.mode === "walk" ? "도보" : "차량";
  const dist = leg.km < 1 ? `${Math.round(leg.km * 1000)}m` : `${leg.km.toFixed(1)}km`;
  return `<div class="tl-move" role="listitem">
    <span class="move-mode">${icon}${label}</span>
    <span class="move-time">약 ${leg.min}분</span>
    <span class="move-dist">${dist}</span>
  </div>`;
}

/* 카테고리 글리프 (핀 안의 흰색 아이콘, 중심 0,0 기준) */
const MAP_GLYPH = {
  spot: `<path d="M0,-4.6 L1.4,-1.5 L4.6,-1.2 L2.2,1 L2.9,4.3 L0,2.5 L-2.9,4.3 L-2.2,1 L-4.6,-1.2 L-1.4,-1.5 Z" fill="#fff"/>`,
  food: `<path d="M-2.2,-4.6 V-0.8 M0,-4.6 V-0.8 M2.2,-4.6 V-0.8 M0,-0.8 V4.6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/>`,
  cafe: `<path d="M-3.2,-2.4 h5.4 v3.2 a2.7,2.7 0 0 1 -5.4,0 Z" fill="#fff"/>
         <path d="M2.4,-1.6 h1.2 a1.7,1.7 0 0 1 0,3.4 h-0.9" stroke="#fff" stroke-width="1.3" fill="none"/>`
};

/* 문자열 기반 의사난수 — 지형 블롭 배치를 지역/날짜마다 고정 */
function seededRand(seed) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* Catmull-Rom → 부드러운 베지어 경로 */
function smoothPath(pts) {
  if (pts.length < 3)
    return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)},` +
         `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)},` +
         `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function routeMapSVG(items, legs, seed) {
  if (items.length < 2) return "";
  const lats = items.map((p) => p.lat), lngs = items.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 320, H = 268, pad = 44;
  const latAdj = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanLng = Math.max((maxLng - minLng) * latAdj, 0.004);
  const spanLat = Math.max(maxLat - minLat, 0.004);
  const scale = Math.min((W - pad * 2) / spanLng, (H - pad * 2) / spanLat);
  const ox = (W - spanLng * scale) / 2, oy = (H - spanLat * scale) / 2;
  const pt = (p) => ({
    x: ox + ((p.lng - minLng) * latAdj) * scale,
    y: H - oy - (p.lat - minLat) * scale
  });
  const pts = items.map(pt);

  /* 배경: 지형 블롭 + 격자 */
  const rand = seededRand(seed || items.map((p) => p.id).join(""));
  let terrain = "";
  for (let i = 0; i < 5; i++) {
    const cx = 20 + rand() * (W - 40), cy = 20 + rand() * (H - 40);
    const rx = 34 + rand() * 60, ry = 22 + rand() * 40;
    const rot = Math.round(rand() * 90 - 45);
    terrain += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}"
      transform="rotate(${rot} ${cx.toFixed(0)} ${cy.toFixed(0)})" fill="var(--map-land)"/>`;
  }
  let grid = "";
  for (let x = 40; x < W; x += 56) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  for (let y = 40; y < H; y += 56) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;

  /* 축척바: 위도 1도 ≈ 111.32km → 40~92px 사이의 반올림 눈금 */
  const pxPerKm = scale / 111.32;
  let barKm = [0.5, 1, 2, 5, 10, 20].find((k) => k * pxPerKm >= 40 && k * pxPerKm <= 92);
  if (!barKm) barKm = Math.max(0.5, Math.round(64 / pxPerKm));
  const barPx = barKm * pxPerKm;
  const scaleBar = `
    <g stroke="var(--ink-soft)" stroke-width="1.4">
      <line x1="14" y1="${H - 14}" x2="${(14 + barPx).toFixed(1)}" y2="${H - 14}"/>
      <line x1="14" y1="${H - 18}" x2="14" y2="${H - 10}"/>
      <line x1="${(14 + barPx).toFixed(1)}" y1="${H - 18}" x2="${(14 + barPx).toFixed(1)}" y2="${H - 10}"/>
    </g>
    <text x="${(14 + barPx / 2).toFixed(1)}" y="${H - 20}" text-anchor="middle" class="map-halo"
      font-size="9" fill="var(--ink-soft)">${barKm < 1 ? barKm * 1000 + "m" : barKm + "km"}</text>`;

  /* 나침반 */
  const compass = `
    <g transform="translate(${W - 22},24)">
      <circle r="11" fill="var(--panel)" stroke="var(--map-grid)"/>
      <path d="M0,-7 L2.8,4 L0,1.8 L-2.8,4 Z" fill="var(--accent)"/>
      <text y="-13" text-anchor="middle" font-size="8.5" font-weight="700" fill="var(--ink-soft)">N</text>
    </g>`;

  /* 경로 + 구간 이동시간 라벨 */
  const route = smoothPath(pts);
  let legLabels = "";
  if (legs) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segPx = Math.hypot(b.x - a.x, b.y - a.y);
      if (!legs[i] || segPx < 46) continue;
      legLabels += `<text x="${((a.x + b.x) / 2).toFixed(1)}" y="${((a.y + b.y) / 2 - 5).toFixed(1)}"
        text-anchor="middle" font-size="8.5" font-weight="700" class="map-halo"
        fill="var(--accent)">${legs[i].min}분</text>`;
    }
  }

  /* 핀 마커: 카테고리색 원 + 흰 글리프 + 순번 배지 + 이름 라벨 */
  const nodes = pts.map((p, i) => {
    const it = items[i];
    const above = i % 2 === 0 ? p.y > H * 0.2 : p.y > H * 0.85;
    const name = it.name.length > 9 ? it.name.slice(0, 8) + "…" : it.name;
    const color = `var(--${it.cat})`;
    return `
      <g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        <circle r="11.5" fill="${color}" stroke="var(--panel)" stroke-width="2"/>
        <g>${MAP_GLYPH[it.cat] || MAP_GLYPH.spot}</g>
        <circle cx="9.5" cy="-9.5" r="6.2" fill="var(--panel)" stroke="${color}" stroke-width="1.4"/>
        <text x="9.5" y="-6.7" text-anchor="middle" font-size="8.5" font-weight="700"
          fill="var(--ink)">${i + 1}</text>
        <text y="${above ? -19 : 26}" text-anchor="middle" font-size="9.5" font-weight="500"
          class="map-halo" fill="var(--ink)">${name}</text>
      </g>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="하루 동선 지도">
    <defs><clipPath id="mapclip"><rect width="${W}" height="${H}" rx="10"/></clipPath></defs>
    <g clip-path="url(#mapclip)">
      <rect width="${W}" height="${H}" fill="var(--map-bg)"/>
      ${terrain}
      <g stroke="var(--map-grid)" stroke-width="0.7" opacity="0.55">${grid}</g>
      <path d="${route}" fill="none" stroke="var(--accent)" stroke-width="6" opacity="0.14" stroke-linecap="round"/>
      <path d="${route}" fill="none" stroke="var(--accent)" stroke-width="2.2"
        stroke-dasharray="7 6" stroke-linecap="round" class="route-dash"/>
      ${legLabels}
      ${nodes}
      ${scaleBar}
      ${compass}
    </g>
    <rect width="${W}" height="${H}" rx="10" fill="none" stroke="var(--map-grid)"/>
  </svg>`;
}

function renderPlan() {
  const { region, days, plan } = buildPlan();
  const party = PARTY_TYPES.find((p) => p.id === state.party);

  $("#planTitle").textContent = `${region.name} ${days}일의 동선`;
  $("#planSummary").textContent =
    `${days}일 · ${state.people}명 · ${party.label} 여행 · 이동시간은 주차·승하차 여유를 포함한 추정치`;

  $("#dayTabs").innerHTML = plan.map((d, i) => `
    <button class="day-tab" role="tab" data-day="${i}"
      aria-selected="${i === 0}">Day ${i + 1}</button>`).join("");

  $("#dayPanes").innerHTML = plan.map((day, di) => {
    const totalMove = day.legs.reduce((s, l) => s + l.min, 0);
    const totalKm = day.legs.reduce((s, l) => s + l.km, 0);
    const tl = day.items.map((p, i) => `
      <div class="tl-item" data-cat="${p.cat}" role="listitem">
        <span class="tl-dot">${i + 1}</span>
        <div class="place-card">
          <div class="place-top">
            <span class="slot-label">${SLOT_LABEL[p.slot]}</span>
            <span class="place-name">${p.name}</span>
            <span class="cat-chip ${p.cat}">${CAT_LABEL[p.cat]}</span>
            <span class="stay-chip">약 ${p.stay}분</span>
          </div>
          <p class="place-desc">${p.desc}</p>
          ${tipRows(p)}
        </div>
      </div>
      ${day.legs[i] ? moveHTML(day.legs[i]) : ""}`).join("");

    return `
    <section class="day-pane ${di === 0 ? "show" : ""}" data-day="${di}" role="tabpanel">
      <p class="day-theme"><b>${day.zone.name}</b> — ${day.zone.theme}</p>
      <div class="timeline" role="list">${tl}</div>
      <aside class="route-side">
        <div class="route-map">
          <h3>DAY ${di + 1} 동선 지도</h3>
          ${routeMapSVG(day.items, day.legs, region.id + "-" + di)}
          <div class="map-legend">
            <span><i class="dot spot"></i>명소</span>
            <span><i class="dot food"></i>맛집</span>
            <span><i class="dot cafe"></i>카페</span>
          </div>
        </div>
        <div class="day-stats">
          <div><div class="v">${day.items.length}</div><div class="k">방문 장소</div></div>
          <div><div class="v">${totalMove}분</div><div class="k">총 이동시간</div></div>
          <div><div class="v">${totalKm.toFixed(1)}km</div><div class="k">총 이동거리</div></div>
        </div>
      </aside>
    </section>`;
  }).join("");

  $$("#dayTabs .day-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$("#dayTabs .day-tab").forEach((t) => t.setAttribute("aria-selected", t === tab));
      $$("#dayPanes .day-pane").forEach((p) =>
        p.classList.toggle("show", p.dataset.day === tab.dataset.day));
    })
  );
}

/* ── 스텝 전환 ── */
function showStep(n) {
  $$(".step").forEach((s) => s.classList.toggle("show", +s.dataset.step === n));
  $$(".crumbs [data-crumb]").forEach((c) =>
    c.classList.toggle("on", +c.dataset.crumb === n));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── 초기화 ── */
document.addEventListener("DOMContentLoaded", () => {
  renderRegions();
  renderRegionFinder();

  $("#peopleMinus").addEventListener("click", () => {
    state.people = Math.max(1, state.people - 1);
    renderOptions();
  });
  $("#peoplePlus").addEventListener("click", () => {
    state.people = Math.min(10, state.people + 1);
    renderOptions();
  });

  $("#makePlan").addEventListener("click", () => {
    renderPlan();
    showStep(3);
  });
  $("#backTo1").addEventListener("click", () => showStep(1));
  $("#backTo2").addEventListener("click", () => showStep(2));
  $("#remix").addEventListener("click", () => {
    state.variant += 1;
    renderPlan();
  });

  showStep(1);
});
