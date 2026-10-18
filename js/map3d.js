/* ── 길눈 · 3D 동선 맵 ───────────────────────────────────────────
   외부 3D 라이브러리 없이 canvas 2D 위에 원근 투영을 직접 구현한다.
   js/terrain.js 의 실제 해안선·강·산 좌표를 깔고, 그 위에 도시를 세운 뒤
   방문 순서대로 카메라가 여행자를 따라간다. 자유 이동도 가능하다.

   좌표계: x 동쪽, y 높이(위), z 남쪽.                                */

const Map3D = (function () {
  "use strict";

  let overlay, canvas, ctx, titleEl, statusEl, cardEl, playBtn, modeBtn,
      speedBtn, barEl, barFill, hintEl, stick, stickKnob;
  let W = 0, H = 0, dpr = 1;
  let raf = 0, lastTs = 0;
  let scene = null, cam = null, tour = null, pal = null;
  let drag = null, pinchDist = 0, dragMoved = 0;
  let keys = Object.create(null), nudge = { x: 0, z: 0 };
  let reduced = false;

  const LIGHT = { x: -0.55, z: -0.84 };

  /* ── 색 ── */
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
  ];

  const LIGHT_PAL = {
    dark: false,
    skyTop: [150, 185, 212], skyBot: [222, 230, 226],
    ridgeFar: [172, 190, 194], ridgeNear: [141, 165, 167],
    ground: [213, 222, 208], road: [198, 205, 201],
    fog: [212, 221, 219],
    sea: [96, 150, 168], seaDeep: [68, 120, 142], foam: [236, 244, 244],
    sand: [226, 214, 184], bank: [186, 199, 170],
    hill: [146, 164, 134], hillHi: [168, 184, 150],
    foliage: [92, 124, 86], foliage2: [118, 146, 96], trunk: [112, 92, 72],
    walls: [[216, 210, 198], [199, 203, 200], [208, 197, 184], [188, 197, 203],
            [218, 202, 186], [205, 206, 196], [194, 188, 180]],
    roofs: [[148, 140, 130], [136, 147, 150], [160, 138, 124], [122, 130, 134]],
    hanok: [[128, 84, 62], [106, 94, 78]], tile: [118, 106, 98],
    awning: [[182, 92, 66], [86, 118, 134], [196, 158, 76], [128, 132, 96]],
    line: [120, 124, 120], lit: [250, 226, 168],
    accent: [44, 93, 143], dim: [150, 162, 170],
    text: [35, 47, 56], halo: [246, 248, 244],
    cat: { spot: [44, 93, 143], food: [179, 80, 44], cafe: [119, 97, 63] }
  };
  const DARK_PAL = {
    dark: true,
    skyTop: [11, 17, 26], skyBot: [31, 43, 57],
    ridgeFar: [30, 42, 55], ridgeNear: [20, 29, 39],
    ground: [21, 28, 35], road: [32, 41, 50],
    fog: [22, 30, 39],
    sea: [22, 44, 62], seaDeep: [14, 30, 44], foam: [96, 134, 152],
    sand: [62, 58, 50], bank: [34, 44, 40],
    hill: [28, 38, 40], hillHi: [38, 50, 50],
    foliage: [26, 44, 38], foliage2: [34, 54, 44], trunk: [44, 38, 32],
    walls: [[56, 67, 78], [49, 60, 73], [62, 69, 78], [46, 57, 69],
            [58, 63, 72], [52, 62, 70], [44, 54, 64]],
    roofs: [[30, 38, 47], [34, 42, 50], [28, 36, 44], [26, 33, 41]],
    hanok: [[74, 50, 40], [62, 56, 48]], tile: [38, 34, 34],
    awning: [[120, 62, 48], [52, 76, 90], [128, 102, 54], [78, 84, 62]],
    line: [64, 76, 88], lit: [255, 206, 128],
    accent: [127, 176, 220], dim: [96, 110, 122],
    text: [230, 232, 227], halo: [18, 24, 31],
    cat: { spot: [127, 176, 220], food: [224, 139, 102], cafe: [194, 168, 120] }
  };

  function pickPalette() {
    const m = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [244, 243, 238])
      .map(Number);
    const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    return lum < 0.45 ? DARK_PAL : LIGHT_PAL;
  }

  /* ── 카메라 ── */
  function norm(v) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }
  function updateCamera() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    cam.eye = {
      x: cam.target.x + cam.dist * cp * Math.sin(cam.yaw),
      y: cam.target.y + cam.dist * sp,
      z: cam.target.z + cam.dist * cp * Math.cos(cam.yaw)
    };
    cam.fwd = norm({
      x: cam.target.x - cam.eye.x, y: cam.target.y - cam.eye.y, z: cam.target.z - cam.eye.z
    });
    cam.right = norm(cross(cam.fwd, { x: 0, y: 1, z: 0 }));
    cam.up = cross(cam.right, cam.fwd);
    cam.f = H / (2 * Math.tan(0.43));
  }
  function toView(p) {
    const dx = p.x - cam.eye.x, dy = p.y - cam.eye.y, dz = p.z - cam.eye.z;
    return {
      x: dx * cam.right.x + dy * cam.right.y + dz * cam.right.z,
      y: dx * cam.up.x + dy * cam.up.y + dz * cam.up.z,
      z: dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z
    };
  }
  const sx = (v) => W / 2 + v.x * cam.f / v.z;
  const sy = (v) => H / 2 - v.y * cam.f / v.z;

  const NEAR = 0.8;
  function clipNear(vs) {
    const out = [];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length];
      const ain = a.z >= NEAR, bin = b.z >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
      }
    }
    return out;
  }
  function poly(pts, fill, stroke) {
    const vs = clipNear(pts.map(toView));
    if (vs.length < 3) return;
    ctx.beginPath();
    for (let i = 0; i < vs.length; i++) {
      const x = sx(vs[i]), y = sy(vs[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  const P = (x, y, z) => ({ x, y, z });
  const flat = (pts, y, fill) => poly(pts.map((p) => P(p.x, y, p.z)), fill, null);

  function fogged(col, dist) {
    const t = Math.min(0.74, Math.max(0, (dist - 60) / 220));
    return rgb(mix(col, pal.fog, t));
  }
  const camDist = (x, z) => Math.hypot(x - cam.eye.x, z - cam.eye.z);

  /* ── 입체 기본형 ── */
  function corners(cx, cz, w, d, rot) {
    const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      .map(([lx, lz]) => ({ x: cx + lx * c - lz * s, z: cz + lx * s + lz * c }));
  }

  function prism(cx, cz, w, d, rot, y0, h, col, opt) {
    const o = opt || {};
    const cs = corners(cx, cz, w, d, rot);
    const dist = camDist(cx, cz);
    if (dist > 260) return;
    const line = o.line === false ? null
      : rgb(mix(pal.line, pal.fog, Math.min(0.85, dist / 250)));
    const y1 = y0 + h;

    poly(cs.map((p) => P(p.x, y1, p.z)), fogged(col, dist), line);

    const faces = [];
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = b.z - a.z, nz = -(b.x - a.x);
      const L = Math.hypot(nx, nz) || 1;
      nx /= L; nz /= L;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      if (nx * (cam.eye.x - mx) + nz * (cam.eye.z - mz) <= 0) continue;
      const k = 0.5 + 0.42 * Math.max(0, nx * LIGHT.x + nz * LIGHT.z) + 0.1;
      faces.push({ a, b, k, mx, mz });
    }
    for (const f of faces) {
      poly([P(f.a.x, y0, f.a.z), P(f.b.x, y0, f.b.z), P(f.b.x, y1, f.b.z), P(f.a.x, y1, f.a.z)],
        fogged(mul(col, f.k), dist), line);
      if (o.floors && h > 7 && dist < 160) floorLines(f, y0, h, dist);
      if (o.balcony && dist < 150) balconyBands(f, y0, h, dist);
    }
    if (o.lit && pal.dark && dist < 160) litWindows(faces, y0, h, o.lit, dist);
    return cs;
  }

  function floorLines(f, y0, h, dist) {
    ctx.strokeStyle = rgb(mix(mix(pal.line, pal.fog, Math.min(0.85, dist / 190)), pal.fog, 0.3));
    ctx.lineWidth = 0.8;
    for (let y = y0 + 3.6; y < y0 + h - 0.8; y += 3.6) {
      const va = toView(P(f.a.x, y, f.a.z)), vb = toView(P(f.b.x, y, f.b.z));
      if (va.z < NEAR || vb.z < NEAR) continue;
      ctx.beginPath();
      ctx.moveTo(sx(va), sy(va));
      ctx.lineTo(sx(vb), sy(vb));
      ctx.stroke();
    }
  }
  function balconyBands(f, y0, h, dist) {
    const c = rgb(mix(mul(pal.ground, 0.9), pal.fog, Math.min(0.8, dist / 210)));
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.2;
    for (let y = y0 + 4.2; y < y0 + h - 1.2; y += 4.2) {
      const va = toView(P(f.a.x, y, f.a.z)), vb = toView(P(f.b.x, y, f.b.z));
      if (va.z < NEAR || vb.z < NEAR) continue;
      ctx.beginPath();
      ctx.moveTo(sx(va), sy(va));
      ctx.lineTo(sx(vb), sy(vb));
      ctx.stroke();
    }
  }
  function litWindows(faces, y0, h, lit, dist) {
    const glow = rgb(mix(pal.lit, pal.fog, Math.min(0.6, dist / 200)));
    for (const f of faces) {
      for (const w of lit) {
        const y = y0 + h * w.v;
        if (y > y0 + h - 1) continue;
        const px = f.a.x + (f.b.x - f.a.x) * w.u, pz = f.a.z + (f.b.z - f.a.z) * w.u;
        const v = toView(P(px, y, pz));
        if (v.z < NEAR) continue;
        const s = Math.max(0.9, cam.f * 0.85 / v.z);
        ctx.fillStyle = glow;
        ctx.fillRect(sx(v) - s / 2, sy(v) - s / 2, s, s * 1.25);
      }
    }
  }

  /* 모임지붕(사각뿔) */
  function roofHip(cs, cx, cz, y0, h, col, over) {
    const dist = camDist(cx, cz);
    const ex = cs.map((p) => {
      const dx = p.x - cx, dz = p.z - cz, L = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / L) * over, z: p.z + (dz / L) * over };
    });
    const apex = P(cx, y0 + h, cz);
    const tris = [];
    for (let i = 0; i < 4; i++) {
      const a = ex[i], b = ex[(i + 1) % 4];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = b.z - a.z, nz = -(b.x - a.x);
      const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const k = 0.52 + 0.46 * Math.max(0, nx * LIGHT.x + nz * LIGHT.z);
      tris.push({ pts: [P(a.x, y0, a.z), P(b.x, y0, b.z), apex], k, d: camDist(mx, mz) });
    }
    tris.sort((p, q) => q.d - p.d);
    for (const t of tris) poly(t.pts, fogged(mul(col, t.k), dist), null);
  }

  /* 박공지붕 */
  function roofGable(cs, cx, cz, y0, h, col, over) {
    const dist = camDist(cx, cz);
    const ex = cs.map((p) => {
      const dx = p.x - cx, dz = p.z - cz, L = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / L) * over, z: p.z + (dz / L) * over };
    });
    const e01 = Math.hypot(ex[1].x - ex[0].x, ex[1].z - ex[0].z);
    const e12 = Math.hypot(ex[2].x - ex[1].x, ex[2].z - ex[1].z);
    let q;
    if (e01 >= e12) q = [ex[0], ex[1], ex[2], ex[3]];
    else q = [ex[1], ex[2], ex[3], ex[0]];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    const rA = mid(q[0], q[3]), rB = mid(q[1], q[2]);
    const yr = y0 + h;
    const parts = [
      { pts: [P(q[0].x, y0, q[0].z), P(q[1].x, y0, q[1].z), P(rB.x, yr, rB.z), P(rA.x, yr, rA.z)],
        c: mid(q[0], q[1]), k: 0.95 },
      { pts: [P(q[3].x, y0, q[3].z), P(rA.x, yr, rA.z), P(rB.x, yr, rB.z), P(q[2].x, y0, q[2].z)],
        c: mid(q[2], q[3]), k: 0.62 },
      { pts: [P(q[0].x, y0, q[0].z), P(rA.x, yr, rA.z), P(q[3].x, y0, q[3].z)],
        c: mid(q[0], q[3]), k: 0.78 },
      { pts: [P(q[1].x, y0, q[1].z), P(q[2].x, y0, q[2].z), P(rB.x, yr, rB.z)],
        c: mid(q[1], q[2]), k: 0.72 }
    ];
    parts.sort((a, b) => camDist(b.c.x, b.c.z) - camDist(a.c.x, a.c.z));
    for (const p of parts) poly(p.pts, fogged(mul(col, p.k), dist), null);
  }

  function cone(cx, cz, r, y0, h, col, seg, rot) {
    const dist = camDist(cx, cz);
    if (dist > 420) return;
    const n = seg || 7, apex = P(cx, y0 + h, cz), base = [];
    for (let i = 0; i < n; i++) {
      const a = (rot || 0) + (i / n) * Math.PI * 2;
      base.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    const tris = [];
    for (let i = 0; i < n; i++) {
      const a = base[i], b = base[(i + 1) % n];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = mx - cx, nz = mz - cz;
      const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      const k = 0.5 + 0.48 * Math.max(0, nx * LIGHT.x + nz * LIGHT.z);
      tris.push({ pts: [P(a.x, y0, a.z), P(b.x, y0, b.z), apex], k, d: camDist(mx, mz) });
    }
    tris.sort((p, q) => q.d - p.d);
    for (const t of tris) poly(t.pts, fogged(mul(col, t.k), dist), null);
  }

  /* ── 지형 유틸 ── */
  function pointInPoly(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, zi = ring[i].z, xj = ring[j].x, zj = ring[j].z;
      if ((zi > z) !== (zj > z) &&
          x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function isWater(x, z) {
    if (!scene || !scene.water) return false;
    for (const w of scene.water) {
      if (w.island) { if (!pointInPoly(x, z, w.ring)) return true; }
      else if (pointInPoly(x, z, w.ring)) return true;
    }
    return false;
  }
  function segDist(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
    let t = L ? ((px - a.x) * dx + (pz - a.z) * dz) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
  }
  /* 산 능선을 반영한 지면 높이 */
  function groundY(x, z) {
    if (!scene || !scene.hills) return 0;
    let y = 0;
    for (const h of scene.hills) {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < h.r) y = Math.max(y, h.h * (1 - d / h.r));
    }
    return y;
  }

  function shoreDist(x, z) {
    let best = Infinity;
    for (const sh of scene.shores) {
      const q = sh.pts;
      for (let i = 0; i < q.length - 1; i++) {
        const d = segDist(x, z, q[i], q[i + 1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  /* ── 장면 구성 ── */
  function buildScene(region, day, dayIndex) {
    const items = day.items, legs = day.legs;
    const lat0 = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng0 = items.reduce((s, p) => s + p.lng, 0) / items.length;
    const latAdj = Math.cos(lat0 * Math.PI / 180), M = 111320;

    const raw = items.map((p) => ({
      x: (p.lng - lng0) * latAdj * M, z: -(p.lat - lat0) * M
    }));
    let ext = 1;
    raw.forEach((p) => { ext = Math.max(ext, Math.abs(p.x), Math.abs(p.z)); });
    const s = 78 / ext;                    /* 월드 단위 / m */
    const geo = (lat, lng) => ({
      x: (lng - lng0) * latAdj * M * s, z: -(lat - lat0) * M * s
    });

    const nodes = raw.map((p, i) => ({
      x: p.x * s, z: p.z * s, item: items[i], terrain: placeTerrain(items[i])
    }));

    /* 실제 지형 */
    const terra = (typeof REGION_TERRAIN !== "undefined" && REGION_TERRAIN[region.id]) || {};
    const water = [], shores = [];
    for (const w of (terra.water || [])) {
      if (w.type === "river") {
        const c = w.center.map(([la, ln]) => geo(la, ln));
        const hw = (w.width / 2) * s;
        const left = [], right = [];
        for (let i = 0; i < c.length; i++) {
          const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
          let dx = b.x - a.x, dz = b.z - a.z;
          const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          left.push({ x: c[i].x - dz * hw, z: c[i].z + dx * hw });
          right.push({ x: c[i].x + dz * hw, z: c[i].z - dx * hw });
        }
        const rightRev = right.slice().reverse();
        water.push({ ring: left.concat(rightRev), kind: "river" });
        shores.push({ pts: left, kind: "river" }, { pts: right, kind: "river" });
      } else if (w.type === "island") {
        const ring = w.ring.map(([la, ln]) => geo(la, ln));
        water.push({ ring, island: true, kind: "sea" });
        shores.push({ pts: ring.concat([ring[0]]), kind: "sea" });
      } else {
        const ring = w.ring.map(([la, ln]) => geo(la, ln));
        water.push({ ring, kind: w.type });
        const n = w.coast || ring.length;
        shores.push({ pts: ring.slice(0, n), kind: w.type });
      }
    }

    const hills = (terra.hills || []).map((h) => {
      const g = geo(h.lat, h.lng);
      return {
        x: g.x, z: g.z, name: h.name,
        r: Math.max(16, Math.min(130, h.r * s)),
        h: 10 + 26 * Math.min(1, Math.sqrt(h.h / 1900))
      };
    }).filter((h) => {
      if (Math.hypot(h.x, h.z) > 760) return false;
      if (h.r > 46) {                       /* 큰 산이 코스를 통째로 덮지 않게 */
        for (const n of nodes) if (Math.hypot(h.x - n.x, h.z - n.z) < h.r * 0.8) return false;
      }
      return true;
    });

    const rand = seededRand(region.id + "|" + dayIndex);

    /* 장소 간격에 맞춰 랜드마크 크기 보정 */
    let minGap = Infinity;
    for (let i = 0; i < nodes.length - 1; i++) {
      minGap = Math.min(minGap, Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));
    }
    const lmk = Math.max(0.5, Math.min(1.1, (isFinite(minGap) ? minGap : 30) / 27));
    const offset = 11.5 * lmk;

    nodes.forEach((n, i) => {
      const a = nodes[i - 1] || n, b = nodes[i + 1] || n;
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      n.lx = n.x - dz * offset;
      n.lz = n.z + dx * offset;
      n.gy = 0; n.lgy = 0;
      n.kind = LANDMARK_BY_TERRAIN[n.terrain] || LANDMARK_BY_CAT[n.item.cat] || ["hall"];
      n.kind = n.kind[Math.floor(rand() * n.kind.length)];
      n.col = (n.kind === "hanok" || n.kind === "pavilion" || n.kind === "hall")
        ? pal.hanok[Math.floor(rand() * pal.hanok.length)]
        : pal.walls[Math.floor(rand() * pal.walls.length)];
      n.roofCol = (n.kind === "hanok" || n.kind === "pavilion" || n.kind === "hall")
        ? pal.tile : pal.roofs[Math.floor(rand() * pal.roofs.length)];
    });

    const sceneDraft = { water, shores, hills };
    const savedScene = scene;
    scene = sceneDraft;                 /* isWater/shoreDist 가 쓰도록 임시 주입 */

    /* 도로 — 지역마다 다른 각도의 격자, 물 위는 건너뛴다 */
    const gridRot = (rand() - 0.5) * 0.9;
    const gc = Math.cos(gridRot), gs = Math.sin(gridRot);
    const toWorld = (u, v) => ({ x: u * gc - v * gs, z: u * gs + v * gc });
    const half = 108, cell = 15.5, roads = [];
    for (let g = -half; g <= half; g += cell) {
      for (let t = -half; t < half; t += cell * 2) {
        for (const [au, av, bu, bv] of [
          [g, t, g, t + cell * 2], [t, g, t + cell * 2, g]
        ]) {
          const a = toWorld(au, av), b = toWorld(bu, bv);
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          if (Math.hypot(mx, mz) > half + 10) continue;
          if (isWater(mx, mz)) continue;
          let steep = false;
          for (const h of hills) {
            if (Math.hypot(mx - h.x, mz - h.z) < h.r * 0.8) { steep = true; break; }
          }
          if (steep) continue;
          let dx = b.x - a.x, dz = b.z - a.z;
          const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          const nx = -dz * 1.8, nz = dx * 1.8;
          roads.push([
            { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
            { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }
          ]);
        }
      }
    }

    /* 건물 — 지형에 따라 종류와 높이가 달라진다 */
    const buildings = [], props = [];
    const nearNode = (x, z) => {
      let best = null, bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(x - n.x, z - n.z);
        if (d < bd) { bd = d; best = n; }
      }
      return { n: best, d: bd };
    };

    for (let gu = -half; gu <= half; gu += cell) {
      for (let gv = -half; gv <= half; gv += cell) {
        const base = toWorld(gu + (rand() - 0.5) * 5, gv + (rand() - 0.5) * 5);
        const bx = base.x, bz = base.z;
        const rad = Math.hypot(bx, bz);
        if (rad > half) continue;
        if (isWater(bx, bz)) continue;

        const sd = shores.length ? shoreDist(bx, bz) : 999;
        if (sd < 9) continue;                         /* 모래톱 위는 비움 */

        let onHill = false;
        for (const h of hills) {
          if (Math.hypot(bx - h.x, bz - h.z) < h.r * 0.75) { onHill = true; break; }
        }
        if (onHill) continue;

        const near = nearNode(bx, bz);
        if (near.d < 13 + 8 * lmk) continue;
        if (Math.hypot(bx - near.n.lx, bz - near.n.lz) < 8 + 10 * lmk) continue;
        let onRoute = false;
        for (let i = 0; i < nodes.length - 1 && !onRoute; i++) {
          if (segDist(bx, bz, nodes[i], nodes[i + 1]) < 9) onRoute = true;
        }
        if (onRoute) continue;

        const ctx2 = near.n.terrain;
        if (rand() < 0.1 + 0.26 * (rad / half)) continue;

        /* 성격에 따른 건물 종류 */
        const core = 1 - Math.min(1, rad / half);
        let kinds;
        if (ctx2 === "beach" || ctx2 === "port") {
          kinds = sd < 34 ? ["lowrise", "gable", "shop", "villa", "slab"]
                          : ["block", "slab", "lowrise", "gable", "shop"];
        } else if (ctx2 === "heritage") {
          kinds = sd < 999 && rand() < 0.45 ? ["hanok", "hanokRow", "lowrise"]
                                            : ["lowrise", "block", "hanok", "shop"];
        } else if (ctx2 === "mountain" || ctx2 === "park") {
          kinds = ["villa", "gable", "lowrise", "hanok", "block"];
        } else if (ctx2 === "market") {
          kinds = ["shop", "lowrise", "block", "shop"];
        } else {
          kinds = ["block", "slab", "tower", "lowrise", "block", "shop"];
        }
        const kind = kinds[Math.floor(rand() * kinds.length)];

        let w = 6 + rand() * 5, d = 6 + rand() * 5, h;
        switch (kind) {
          case "tower": h = 16 + rand() * 10 + core * 26; w = 7 + rand() * 3; d = w; break;
          case "slab": h = 11 + rand() * 9 + core * 14; w = 13 + rand() * 9; d = 6 + rand() * 2; break;
          case "block": h = 7 + rand() * 7 + core * 13; break;
          case "lowrise": h = 5 + rand() * 4; break;
          case "gable": h = 4 + rand() * 2.4; w = 7 + rand() * 3; d = 6 + rand() * 2.5; break;
          case "villa": h = 4.5 + rand() * 3; break;
          case "hanok": h = 3.4 + rand() * 1.2; w = 8 + rand() * 3; d = 6 + rand() * 2; break;
          case "hanokRow": h = 3.2 + rand() * 1; w = 13 + rand() * 6; d = 6; break;
          default: h = 4.6 + rand() * 2.6;
        }
        if (ctx2 === "beach" || ctx2 === "port") h = Math.min(h, sd < 40 ? 9 + rand() * 7 : 15 + rand() * 9);
        if (ctx2 === "heritage" || ctx2 === "park" || ctx2 === "mountain") h = Math.min(h, 13 + rand() * 7);

        const lit = [];
        if (pal.dark && h > 6) {
          const n = 2 + Math.floor(rand() * 5);
          for (let i = 0; i < n; i++) lit.push({ u: 0.18 + rand() * 0.64, v: 0.18 + rand() * 0.64 });
        }
        const isHanok = kind === "hanok" || kind === "hanokRow";
        buildings.push({
          x: bx, z: bz, w, d, h, kind,
          rot: gridRot + (rand() - 0.5) * (rand() < 0.16 ? 1.4 : 0.14),
          col: isHanok ? pal.hanok[Math.floor(rand() * pal.hanok.length)]
                       : pal.walls[Math.floor(rand() * pal.walls.length)],
          roofCol: isHanok ? pal.tile : pal.roofs[Math.floor(rand() * pal.roofs.length)],
          awning: pal.awning[Math.floor(rand() * pal.awning.length)],
          lit: lit.length ? lit : null,
          antenna: kind === "tower" && rand() < 0.5
        });
      }
    }

    /* 산비탈 나무 */
    for (const hl of hills) {
      const n = Math.min(26, Math.round(hl.r / 6));
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, rr = hl.r * (0.45 + rand() * 0.5);
        const tx = hl.x + Math.cos(a) * rr, tz = hl.z + Math.sin(a) * rr;
        if (Math.hypot(tx, tz) > half + 150) continue;
        const slope = 1 - rr / hl.r;
        props.push({ kind: "tree", x: tx, z: tz, y: Math.max(0, slope * hl.h),
                     s: 0.9 + rand() * 0.7, rot: rand() * 6.2 });
      }
    }

    /* 바다/모래톱/강가 소품 */
    if (shores.length) {
      for (let i = 0; i < 220; i++) {
        const a = rand() * Math.PI * 2, rr = rand() * half;
        const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
        const w8 = isWater(px, pz), sd = shoreDist(px, pz);
        if (w8 && sd > 8 && sd < 70 && rand() < 0.3) {
          props.push({ kind: "boat", x: px, z: pz, rot: rand() * Math.PI * 2,
                       s: 0.8 + rand() * 0.8 });
        } else if (!w8 && sd < 8 && rand() < 0.5) {
          const near = nearNode(px, pz);
          if (near.d < 60 && (near.n.terrain === "beach" || near.n.terrain === "port")) {
            props.push({ kind: rand() < 0.65 ? "parasol" : "rock", x: px, z: pz,
                         rot: rand() * Math.PI * 2, s: 0.8 + rand() * 0.6,
                         col: pal.awning[Math.floor(rand() * pal.awning.length)] });
          }
        }
      }
    }

    /* 장소 주변 소품 */
    for (const n of nodes) {
      const t = n.terrain;
      const put = (kind, count, radMin, radMax, extra) => {
        for (let i = 0; i < count; i++) {
          const a = rand() * Math.PI * 2, rr = radMin + rand() * (radMax - radMin);
          const px = n.x + Math.cos(a) * rr, pz = n.z + Math.sin(a) * rr;
          if (isWater(px, pz) !== (kind === "boat")) continue;
          props.push(Object.assign({ kind, x: px, z: pz, rot: rand() * Math.PI * 2,
                                     s: 0.8 + rand() * 0.6 }, extra || {}));
        }
      };
      if (t === "park" || t === "heritage") put("tree", 12, 10, 34);
      if (t === "mountain") { put("tree", 10, 12, 36); put("rock", 5, 10, 30); }
      if (t === "beach") put("parasol", 9, 10, 32,
        { col: pal.awning[Math.floor(rand() * pal.awning.length)] });
      if (t === "port") { put("boat", 7, 14, 48); put("crate", 5, 9, 24); }
      if (t === "market") put("stall", 10, 8, 26,
        { col: pal.awning[Math.floor(rand() * pal.awning.length)] });
      if (t === "water") put("tree", 8, 12, 32);
      if (t === "urban") put("tree", 5, 11, 26);
    }

    /* 동선을 따라 가로등 */
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.min(8, Math.floor(L / 22));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        let dx = b.x - a.x, dz = b.z - a.z;
        const LL = Math.hypot(dx, dz) || 1; dx /= LL; dz /= LL;
        for (const side of [-1, 1]) {
          const lx = px - dz * 4.6 * side, lz = pz + dx * 4.6 * side;
          if (isWater(lx, lz)) continue;
          props.push({ kind: "lamp", x: lx, z: lz, rot: 0, s: 1 });
        }
      }
    }

    for (const n of nodes) { n.gy = groundY(n.x, n.z); n.lgy = groundY(n.lx, n.lz); }
    for (const p of props) if (p.y === undefined) p.y = groundY(p.x, p.z);
    for (const b of buildings) b.gy = groundY(b.x, b.z);

    const cum = [0];
    for (let i = 0; i < nodes.length - 1; i++) {
      cum.push(cum[i] + Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));
    }

    const ridges = [];
    for (let layer = 0; layer < 2; layer++) {
      const pts = [];
      for (let i = 0; i <= 26; i++) pts.push({ u: i / 26, h: 0.35 + rand() * (layer ? 0.75 : 0.45) });
      ridges.push(pts);
    }

    scene = savedScene;
    return {
      region, day, dayIndex, nodes, legs, buildings, props, roads, hills,
      water, shores, cum, ridges, half, lmk, gridRot,
      hasWater: water.length > 0
    };
  }

  const LANDMARK_BY_CAT = {
    spot: ["hall", "hanok", "tower", "pavilion", "dome"],
    food: ["shop", "hanok"],
    cafe: ["shop", "pavilion"]
  };
  const LANDMARK_BY_TERRAIN = {
    beach: ["pavilion", "shop"],
    port: ["pier", "shop"],
    mountain: ["tower", "pavilion"],
    park: ["pavilion", "hanok"],
    market: ["market"],
    heritage: ["hall", "hanok", "pavilion"],
    water: ["pavilion"]
  };

  /* ── 지면 ── */
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(pal.skyTop));
    g.addColorStop(1, rgb(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function horizonY() {
    const v = toView(P(cam.eye.x + cam.fwd.x * 5000, 0, cam.eye.z + cam.fwd.z * 5000));
    return v.z > NEAR ? sy(v) : H * 0.3;
  }
  function drawRidges() {
    const hy = horizonY();
    if (hy < -H || hy > H * 1.3) return;
    const shift = (cam.yaw / (Math.PI * 2)) * W * 2;
    scene.ridges.forEach((pts, li) => {
      const amp = li ? 96 : 58;
      ctx.fillStyle = rgb(li ? pal.ridgeNear : pal.ridgeFar);
      ctx.beginPath();
      ctx.moveTo(-W, hy + 4);
      const off = -shift * (li ? 0.55 : 0.32);
      for (let k = -1; k <= 2; k++) {
        pts.forEach((p, i) => ctx.lineTo(off + (k + p.u) * W + (i % 2 ? 6 : 0), hy + 4 - p.h * amp));
      }
      ctx.lineTo(W * 3, hy + 4);
      ctx.closePath();
      ctx.fill();
    });
  }
  function drawGround() {
    const R = 1200;
    flat([{ x: -R, z: -R }, { x: R, z: -R }, { x: R, z: R }, { x: -R, z: R }], 0, rgb(pal.ground));
  }
  function drawRoads() {
    const c = rgb(pal.road);
    for (const r of scene.roads) flat(r, 0.02, c);
  }
  function drawWaterBase() {
    if (!scene.water.length) return;
    const R = 1200;
    for (const w of scene.water) {
      if (w.island) {
        flat([{ x: -R, z: -R }, { x: R, z: -R }, { x: R, z: R }, { x: -R, z: R }], 0.03, rgb(pal.sea));
        flat(w.ring, 0.04, rgb(pal.ground));
      } else {
        flat(w.ring, 0.03, rgb(w.kind === "sea" ? pal.sea : pal.seaDeep));
      }
    }
  }
  function drawShore() {
    if (!scene.water.length) return;
    /* 바닷가는 모래톱, 강·호수는 둔치 */
    for (const sh of scene.shores) {
      const col = rgb(sh.kind === "sea" ? pal.sand : pal.bank);
      const wdt = sh.kind === "sea" ? 5 : 4;
      const q = sh.pts;
      for (let i = 0; i < q.length - 1; i++) {
        const a = q[i], b = q[i + 1];
        let dx = b.x - a.x, dz = b.z - a.z;
        const L = Math.hypot(dx, dz) || 1;
        if (L > 400) continue;
        dx /= L; dz /= L;
        const nx = -dz * wdt, nz = dx * wdt;
        flat([{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
              { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }], 0.05, col);
      }
    }
    for (const w of scene.water) {
      if (!w.island) flat(w.ring, 0.06, rgb(w.kind === "sea" ? pal.sea : pal.seaDeep));
    }
    drawWaves();
  }

  function drawWaves() {
    if (!scene.shores.length) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 11]);
    const t = (tour ? tour.clock : 0);
    for (let band = 1; band <= 3; band++) {
      ctx.strokeStyle = rgba(pal.foam, 0.42 - band * 0.09);
      ctx.lineDashOffset = -t * (14 + band * 6);
      for (const sh of scene.shores) {
        const s = sh.pts;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < s.length - 1; i++) {
          const a = s[i], b = s[i + 1];
          let dx = b.x - a.x, dz = b.z - a.z;
          const L = Math.hypot(dx, dz) || 1;
          if (L > 400) { started = false; continue; }
          dx /= L; dz /= L;
          const o = band * 4.2 + 2;
          let px = a.x - dz * o, pz = a.z + dx * o;
          if (!isWater(px, pz)) { px = a.x + dz * o; pz = a.z - dx * o; }
          const v = toView(P(px, 0.08, pz));
          if (v.z < NEAR) { started = false; continue; }
          const X = sx(v), Y = sy(v);
          if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function ribbon(a, b, w, col) {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w, nz = dx / l * w;
    const pts = [{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
                 { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }];
    poly(pts.map((p) => P(p.x, groundY(p.x, p.z) + 0.12, p.z)), col, null);
  }
  function drawRoute() {
    const done = rgb(pal.accent), rest = rgb(mix(pal.dim, pal.ground, 0.25));
    const trav = tour.dist;
    for (let i = 0; i < scene.nodes.length - 1; i++) {
      const a = scene.nodes[i], b = scene.nodes[i + 1];
      const d0 = scene.cum[i], d1 = scene.cum[i + 1];
      if (trav >= d1) { ribbon(a, b, 2.3, done); continue; }
      if (trav <= d0) { ribbon(a, b, 1.7, rest); continue; }
      const t = (trav - d0) / (d1 - d0);
      const m = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      ribbon(a, m, 2.3, done);
      ribbon(m, b, 1.7, rest);
    }
    for (const n of scene.nodes) {
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const th = (i / 14) * Math.PI * 2;
        pts.push({ x: n.x + Math.cos(th) * 7.4, z: n.z + Math.sin(th) * 7.4 });
      }
      poly(pts.map((p) => P(p.x, n.gy + 0.1, p.z)), rgb(mix(pal.accent, pal.ground, 0.78)), null);
    }
  }

  /* ── 건물/소품 ── */
  function drawBuilding(b) {
    const g = b.gy || 0;
    const cs = prism(b.x, b.z, b.w, b.d, b.rot, g, b.h, b.col, {
      floors: b.kind === "block" || b.kind === "tower" || b.kind === "slab",
      balcony: b.kind === "slab",
      lit: b.lit
    });
    if (!cs) return;
    switch (b.kind) {
      case "gable":
      case "villa":
        roofGable(cs, b.x, b.z, g + b.h, 2.2 + b.w * 0.12, b.roofCol, 0.7);
        break;
      case "hanok":
      case "hanokRow":
        roofHip(cs, b.x, b.z, g + b.h, 2.6, b.roofCol, 1.9);
        break;
      case "tower":
        prism(b.x, b.z, b.w * 0.68, b.d * 0.68, b.rot, g + b.h, 3.2, mul(b.col, 0.94), { line: false });
        if (b.antenna) prism(b.x, b.z, 0.5, 0.5, b.rot, g + b.h + 3.2, 6, pal.roofs[0], { line: false });
        break;
      case "block":
        if (b.h > 9) prism(b.x + 1, b.z, b.w * 0.3, b.d * 0.3, b.rot, g + b.h, 1.6,
          mul(b.col, 0.9), { line: false });
        break;
      case "shop": {
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        prism(b.x + s * (b.d / 2 + 1.1), b.z - c * (b.d / 2 + 1.1),
          b.w * 1.04, 2.2, b.rot, g + 2.9, 0.5, b.awning, { line: false });
        break;
      }
      case "lowrise":
        prism(b.x, b.z, b.w * 1.02, b.d * 1.02, b.rot, g + b.h, 0.5, mul(b.col, 0.82), { line: false });
        break;
    }
  }

  function drawProp(p) {
    const d = camDist(p.x, p.z);
    if (d > 230) return;
    const y = p.y || 0;
    switch (p.kind) {
      case "tree":
        prism(p.x, p.z, 0.7 * p.s, 0.7 * p.s, 0, y, 2.4 * p.s, pal.trunk, { line: false });
        cone(p.x, p.z, 2.3 * p.s, y + 1.8 * p.s, 4.4 * p.s, pal.foliage, 6, p.rot || 0);
        cone(p.x, p.z, 1.6 * p.s, y + 4.4 * p.s, 3.2 * p.s, pal.foliage2, 6, (p.rot || 0) + 0.5);
        break;
      case "parasol":
        prism(p.x, p.z, 0.35, 0.35, 0, 0, 3, pal.trunk, { line: false });
        cone(p.x, p.z, 2.5 * p.s, 2.6, 1.5, p.col || pal.awning[0], 8, p.rot);
        break;
      case "boat": {
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        prism(p.x, p.z, 2.2 * p.s, 5.6 * p.s, p.rot, 0.1, 1.2 * p.s,
          pal.dark ? [78, 88, 98] : [238, 240, 236], { line: false });
        prism(p.x - s * 0.6, p.z + c * 0.6, 1.5 * p.s, 1.8 * p.s, p.rot, 1.3 * p.s, 1.1 * p.s,
          pal.dark ? [60, 70, 80] : [206, 212, 212], { line: false });
        break;
      }
      case "stall":
        prism(p.x, p.z, 3.4 * p.s, 2.6 * p.s, p.rot, 0, 2.2, mul(pal.walls[1], 0.95), { line: false });
        prism(p.x, p.z, 4.2 * p.s, 3.4 * p.s, p.rot, 2.2, 0.45, p.col || pal.awning[0], { line: false });
        break;
      case "crate":
        prism(p.x, p.z, 1.6 * p.s, 1.6 * p.s, p.rot, 0, 1.4 * p.s, pal.awning[2], { line: false });
        break;
      case "rock":
        cone(p.x, p.z, 1.9 * p.s, y, 1.7 * p.s, mul(pal.hill, 0.9), 5, p.rot);
        break;
      case "lamp": {
        prism(p.x, p.z, 0.34, 0.34, 0, 0, 5.4, mul(pal.line, 0.9), { line: false });
        const v = toView(P(p.x, 5.9, p.z));
        if (v.z > NEAR && d < 150) {
          const r = Math.max(1.4, cam.f * 0.5 / v.z);
          ctx.fillStyle = pal.dark ? rgba(pal.lit, 0.95) : rgba(pal.halo, 0.9);
          ctx.beginPath();
          ctx.arc(sx(v), sy(v), r, 0, Math.PI * 2);
          ctx.fill();
          if (pal.dark) {
            const g = ctx.createRadialGradient(sx(v), sy(v), 0, sx(v), sy(v), r * 6);
            g.addColorStop(0, rgba(pal.lit, 0.3));
            g.addColorStop(1, rgba(pal.lit, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sx(v), sy(v), r * 6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
    }
  }

  /* ── 장소 랜드마크 ── */
  function landmark(n, k) {
    const u = k || 1, x = n.lx, z = n.lz, col = n.col, roofCol = n.roofCol;
    const rot = scene.gridRot, G = n.lgy || 0;
    const B = (dx, dz, w, d, y0, h, c, o) =>
      prism(x + dx * u, z + dz * u, w * u, d * u, rot, G + y0 * u, h * u, c, o || { line: false });
    switch (n.kind) {
      case "tower":
        B(0, 0, 5, 5, 0, 20, col, { floors: true });
        B(0, 0, 11, 11, 20, 5, mul(col, 1.05));
        B(0, 0, 2.2, 2.2, 25, 12, mul(col, 0.9));
        break;
      case "hall": {
        B(0, 0, 20, 13, 0, 2, mul(col, 0.9));
        const cs = corners(x, z, 17 * u, 10.5 * u, rot);
        B(0, 0, 17, 10.5, 2, 7, col);
        roofHip(cs, x, z, G + 9 * u, 4.6 * u, roofCol, 2.8 * u);
        break;
      }
      case "hanok": {
        B(0, 0, 13, 9, 0, 1.4, mul(col, 0.88));
        const cs = corners(x, z, 11 * u, 7.5 * u, rot);
        B(0, 0, 11, 7.5, 1.4, 4.6, col);
        roofHip(cs, x, z, G + 6 * u, 3.4 * u, roofCol, 2.4 * u);
        break;
      }
      case "pavilion": {
        for (const dx of [-4.4, 4.4]) for (const dz of [-3, 3])
          B(dx, dz, 1.2, 1.2, 0, 6.5, mul(col, 0.85));
        B(0, 0, 11, 8, 0, 0.8, mul(col, 0.9));
        const cs = corners(x, z, 11 * u, 8 * u, rot);
        roofHip(cs, x, z, G + 6.5 * u, 3.8 * u, roofCol, 2.2 * u);
        break;
      }
      case "dome": {
        B(0, 0, 12, 12, 0, 8, col, { floors: true });
        const cs = corners(x, z, 8 * u, 8 * u, rot);
        roofHip(cs, x, z, G + 8 * u, 7 * u, roofCol, 1.2 * u);
        break;
      }
      case "pier": {
        B(0, 0, 6, 16, 0, 1.2, mul(col, 0.92));
        B(0, -7, 7, 6, 1.2, 4.2, col);
        const cs = corners(x, z - 7 * u, 7 * u, 6 * u, rot);
        roofGable(cs, x, z - 7 * u, G + 5.4 * u, 2.2 * u, roofCol, 0.8 * u);
        for (const dz of [-2, 2, 6]) B(2.6, dz, 0.7, 0.7, -1, 2, mul(col, 0.7));
        break;
      }
      case "market": {
        for (let i = -1; i <= 1; i++) {
          B(i * 5, 0, 4.2, 9, 0, 2.6, mul(col, 0.95));
          B(i * 5, 0, 5, 10, 2.6, 0.5, pal.awning[(i + 1) % pal.awning.length]);
        }
        break;
      }
      case "shop":
      default: {
        B(0, 0, 10, 8, 0, 6.5, col);
        B(0, 4.6, 10.6, 1.6, 4.2, 0.9, roofCol);
        const cs = corners(x, z, 10 * u, 8 * u, rot);
        roofGable(cs, x, z, G + 6.5 * u, 2.4 * u, roofCol, 1.1 * u);
      }
    }
  }

  /* ── 여행자 ── */
  function drawTraveler() {
    const t = tour.pos, walking = tour.mode === "move" && tour.walk;
    const bob = tour.mode === "move" ? Math.sin(tour.clock * 9) * 0.35 : 0;
    const col = pal.dark ? [235, 240, 244] : [252, 252, 250];
    const rot = tour.heading, g = groundY(t.x, t.z);
    if (walking) {
      prism(t.x, t.z, 3.4, 3.4, rot, g + 0.5 + bob * 0.4, 4.4, pal.accent, { line: false });
      prism(t.x, t.z, 2.4, 2.4, rot, g + 5 + bob * 0.4, 2.2, col, { line: false });
    } else {
      prism(t.x, t.z, 4.6, 7.4, rot, g + 0.6, 2.9, pal.accent, { line: false });
      prism(t.x, t.z, 4, 4.2, rot, g + 3.5, 2.2, col, { line: false });
    }
    const v = toView(P(t.x, g + 0.08, t.z));
    if (v.z > NEAR) {
      const r = Math.max(3, cam.f * 5 / v.z);
      const g = ctx.createRadialGradient(sx(v), sy(v), 0, sx(v), sy(v), r);
      g.addColorStop(0, rgba(pal.accent, 0.42));
      g.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx(v), sy(v), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── 핀 ── */
  const GLYPH = {
    spot: (x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r * 0.92;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    },
    food: (x, y, r) => {
      ctx.lineWidth = Math.max(1, r * 0.28);
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const o of [-0.5, 0, 0.5]) {
        ctx.moveTo(x + o * r, y - r * 0.9);
        ctx.lineTo(x + o * r, y - r * 0.1);
      }
      ctx.moveTo(x, y - r * 0.1);
      ctx.lineTo(x, y + r * 0.9);
      ctx.stroke();
    },
    cafe: (x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.5);
      ctx.lineTo(x + r * 0.45, y - r * 0.5);
      ctx.lineTo(x + r * 0.35, y + r * 0.65);
      ctx.lineTo(x - r * 0.6, y + r * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.beginPath();
      ctx.arc(x + r * 0.55, y - r * 0.05, r * 0.36, -1.2, 1.2);
      ctx.stroke();
    }
  };

  let pinHits = [];
  function drawPins() {
    pinHits = [];
    const list = scene.nodes.map((n, i) => ({ n, i, v: toView(P(n.x, n.gy + 20, n.z)) }))
      .filter((o) => o.v.z > NEAR).sort((a, b) => b.v.z - a.v.z);
    for (const o of list) {
      const x = sx(o.v), y = sy(o.v);
      const base = toView(P(o.n.x, o.n.gy, o.n.z));
      const cat = pal.cat[o.n.item.cat] || pal.cat.spot;
      const scale = Math.max(0.42, Math.min(1.35, 74 / o.v.z));
      const r = 13 * scale;
      const current = tour.nodeIndex === o.i;
      const visited = tour.dist >= scene.cum[o.i] - 0.1;
      pinHits.push({ i: o.i, x, y, r: r * 1.6 });

      if (base.z > NEAR) {
        ctx.strokeStyle = rgba(cat, visited ? 0.85 : 0.4);
        ctx.lineWidth = Math.max(1, 1.8 * scale);
        ctx.beginPath();
        ctx.moveTo(sx(base), sy(base));
        ctx.lineTo(x, y + r * 0.7);
        ctx.stroke();
      }
      if (current) {
        ctx.fillStyle = rgba(cat, 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r * (1.7 + Math.sin(tour.clock * 3.4) * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = visited ? rgb(cat) : rgb(mix(cat, pal.fog, 0.42));
      ctx.strokeStyle = rgb(pal.halo);
      ctx.lineWidth = Math.max(1.4, 2.4 * scale);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgb(pal.halo);
      ctx.strokeStyle = rgb(pal.halo);
      (GLYPH[o.n.item.cat] || GLYPH.spot)(x, y, r * 0.62);

      ctx.fillStyle = rgb(pal.halo);
      ctx.strokeStyle = rgb(cat);
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      ctx.beginPath();
      ctx.arc(x + r * 0.82, y - r * 0.82, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgb(pal.text);
      ctx.font = `700 ${Math.max(8, r * 0.66)}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(o.i + 1), x + r * 0.82, y - r * 0.8);

      if (scale > 0.6 || current) {
        const label = o.n.item.name;
        ctx.font = `${current ? 700 : 500} ${Math.max(10, 13 * scale)}px "Noto Sans KR", sans-serif`;
        const hw = ctx.measureText(label).width / 2 + 6;
        const lx = Math.max(hw, Math.min(W - hw, x));
        ctx.lineWidth = Math.max(2.4, 3.4 * scale);
        ctx.strokeStyle = rgb(pal.halo);
        ctx.lineJoin = "round";
        ctx.strokeText(label, lx, y - r * 1.75);
        ctx.fillStyle = rgb(pal.text);
        ctx.fillText(label, lx, y - r * 1.75);
      }
    }
  }

  /* 산 이름 */
  function drawHillLabels() {
    ctx.font = `500 11px "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const h of scene.hills) {
      if (!h.name) continue;
      const v = toView(P(h.x, h.h * 1.04, h.z));
      if (v.z < NEAR || v.z > 520) continue;
      const x = sx(v), y = sy(v);
      if (x < 20 || x > W - 20 || y < 10 || y > H - 10) continue;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = rgb(pal.halo);
      ctx.strokeText(h.name, x, y - 8);
      ctx.fillStyle = rgba(pal.text, 0.7);
      ctx.fillText(h.name, x, y - 8);
    }
  }

  /* ── 렌더 ── */
  function render() {
    updateCamera();
    drawSky();
    drawRidges();
    drawGround();
    drawWaterBase();
    drawRoads();
    drawShore();

    const hs = scene.hills.slice().sort((a, b) => camDist(b.x, b.z) - camDist(a.x, a.z));
    for (const h of hs) {
      cone(h.x, h.z, h.r, 0, h.h, pal.hill, 9, h.x * 0.01);
      if (h.r > 20) cone(h.x, h.z, h.r * 0.45, h.h * 0.52, h.h * 0.5, pal.hillHi, 7, h.z * 0.01);
    }
    drawRoute();

    const objs = [];
    for (const b of scene.buildings) {
      const v = toView(P(b.x, (b.gy || 0) + b.h / 2, b.z));
      if (v.z < NEAR || v.z > 260) continue;
      if (Math.abs(sx(v) - W / 2) > W * 1.4 + cam.f * 14 / v.z) continue;
      objs.push({ z: v.z, k: 0, o: b });
    }
    for (const p of scene.props) {
      const v = toView(P(p.x, (p.y || 0) + 2, p.z));
      if (v.z < NEAR || v.z > 230) continue;
      if (Math.abs(sx(v) - W / 2) > W * 1.4 + cam.f * 10 / v.z) continue;
      objs.push({ z: v.z, k: 2, o: p });
    }
    for (const n of scene.nodes) {
      const v = toView(P(n.lx, n.lgy + 8, n.lz));
      if (v.z < NEAR) continue;
      objs.push({ z: v.z, k: 1, o: n });
    }
    const tv = toView(P(tour.pos.x, 2, tour.pos.z));
    if (tv.z > NEAR) objs.push({ z: tv.z, k: 3 });

    objs.sort((a, b) => b.z - a.z);
    for (const it of objs) {
      if (it.k === 0) drawBuilding(it.o);
      else if (it.k === 1) landmark(it.o, scene.lmk);
      else if (it.k === 2) drawProp(it.o);
      else drawTraveler();
    }
    drawHillLabels();
    drawPins();
  }

  /* ── 투어 ── */
  const STAY_MS = 1500, MIN_MOVE = 1300, MAX_MOVE = 4200;
  function legDuration(i) {
    const leg = scene.legs[i];
    return Math.max(MIN_MOVE, Math.min(MAX_MOVE, (leg ? leg.min : 15) * 90));
  }
  function setPosFromDist(d) {
    const cum = scene.cum, N = scene.nodes.length;
    if (d <= 0) { tour.pos = { x: scene.nodes[0].x, z: scene.nodes[0].z }; return; }
    if (d >= cum[N - 1]) {
      tour.pos = { x: scene.nodes[N - 1].x, z: scene.nodes[N - 1].z };
      return;
    }
    let i = 0;
    while (i < N - 2 && cum[i + 1] < d) i++;
    const a = scene.nodes[i], b = scene.nodes[i + 1];
    const t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
    tour.pos = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    tour.heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  function advance(dt) {
    tour.clock += dt / 1000;
    if (!tour.playing) return;
    const N = scene.nodes.length;
    tour.phase += dt * tour.speed;
    if (tour.mode === "stay") {
      if (tour.phase >= STAY_MS) {
        if (tour.nodeIndex >= N - 1) {
          tour.playing = false;
          tour.finished = true;
          syncControls();
          showCard(null);
          syncStatus();
          return;
        }
        tour.mode = "move";
        tour.phase = 0;
        tour.legIndex = tour.nodeIndex;
        tour.walk = scene.legs[tour.legIndex] && scene.legs[tour.legIndex].mode === "walk";
        showCard(null);
        syncStatus();
      }
    } else {
      const dur = legDuration(tour.legIndex);
      const t = Math.min(1, tour.phase / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const d0 = scene.cum[tour.legIndex], d1 = scene.cum[tour.legIndex + 1];
      tour.dist = d0 + (d1 - d0) * e;
      setPosFromDist(tour.dist);
      if (t >= 1) {
        tour.mode = "stay";
        tour.phase = 0;
        tour.nodeIndex = tour.legIndex + 1;
        tour.dist = scene.cum[tour.nodeIndex];
        showCard(scene.nodes[tour.nodeIndex].item, tour.nodeIndex);
        syncStatus();
      }
    }
    updateProgress();
  }

  function moveCamera(dt) {
    const sp = (cam.dist * 0.0085) * (dt / 16);
    let mx = 0, mz = 0;
    if (keys.w || keys.arrowup) mz += 1;
    if (keys.s || keys.arrowdown) mz -= 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    mx += nudge.x; mz += nudge.z;
    if (!mx && !mz) return false;
    const L = Math.hypot(mx, mz) || 1;
    mx /= L; mz /= L;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.target.x += (fx * mz + rx * mx) * sp;
    cam.target.z += (fz * mz + rz * mx) * sp;
    const lim = scene.half + 30;
    cam.target.x = Math.max(-lim, Math.min(lim, cam.target.x));
    cam.target.z = Math.max(-lim, Math.min(lim, cam.target.z));
    return true;
  }

  function followCamera(dt) {
    if (moveCamera(dt) && cam.follow) setFollow(false);
    if (!cam.follow) return;
    const k = Math.min(1, dt / 240);
    cam.target.x += (tour.pos.x - cam.target.x) * k;
    cam.target.z += (tour.pos.z - cam.target.z) * k;
    cam.target.y += (6 - cam.target.y) * k;
    if (cam.manual) return;
    const want = tour.mode === "move"
      ? tour.heading + Math.PI
      : tour.heading + Math.PI + Math.sin(tour.clock * 0.22) * 0.55;
    let diff = want - cam.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cam.yaw += diff * Math.min(1, dt / 900);
    const wd = tour.mode === "move" ? 108 : 82;
    const wp = tour.mode === "move" ? 0.46 : 0.58;
    cam.dist += (wd - cam.dist) * Math.min(1, dt / 1200);
    cam.pitch += (wp - cam.pitch) * Math.min(1, dt / 1200);
  }

  function frame(ts) {
    const dt = Math.min(60, lastTs ? ts - lastTs : 16);
    lastTs = ts;
    advance(dt);
    followCamera(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  /* ── HUD ── */
  function setFollow(on) {
    cam.follow = on;
    if (on) cam.manual = false;
    syncControls();
  }
  function syncStatus() {
    if (!statusEl) return;
    if (tour.finished) {
      const total = scene.legs.reduce((s, l) => s + l.min, 0);
      statusEl.textContent = `일정 완주 · 총 이동 ${total}분`;
    } else if (tour.mode === "stay") {
      const it = scene.nodes[tour.nodeIndex].item;
      statusEl.textContent = `${tour.nodeIndex + 1}. ${it.name} 도착 · 약 ${it.stay}분 머무름`;
    } else {
      const a = scene.nodes[tour.legIndex].item, b = scene.nodes[tour.legIndex + 1].item;
      const leg = scene.legs[tour.legIndex];
      const mode = leg.mode === "walk" ? "도보" : "차량";
      const dist = leg.km < 1 ? `${Math.round(leg.km * 1000)}m` : `${leg.km.toFixed(1)}km`;
      statusEl.textContent = `${a.name} → ${b.name} · ${mode} ${leg.min}분 (${dist})`;
    }
  }
  function showCard(item, idx) {
    if (!cardEl) return;
    if (!item) {
      if (tour.finished) {
        const total = scene.legs.reduce((s, l) => s + l.min, 0);
        const km = scene.legs.reduce((s, l) => s + l.km, 0);
        cardEl.innerHTML = `<div class="m3-card-top"><b>일정 완주</b></div>
          <p class="m3-card-desc">방문 ${scene.nodes.length}곳 · 총 이동 ${total}분 · ${km.toFixed(1)}km</p>`;
        cardEl.hidden = false;
        return;
      }
      cardEl.hidden = true;
      return;
    }
    cardEl.innerHTML = `
      <div class="m3-card-top">
        <span class="cat-chip ${item.cat}">${CAT_LABEL[item.cat]}</span>
        <b>${idx + 1}. ${item.name}</b>
        <span class="m3-stay">약 ${item.stay}분</span>
      </div>
      <p class="m3-card-desc">${item.desc}</p>
      ${tipRows(item)}`;
    cardEl.hidden = false;
  }
  function updateProgress() {
    if (!barFill) return;
    const total = scene.cum[scene.cum.length - 1] || 1;
    barFill.style.width = `${Math.min(100, (tour.dist / total) * 100)}%`;
  }
  function syncControls() {
    if (playBtn) playBtn.textContent = tour.finished ? "↺ 처음부터" : (tour.playing ? "⏸" : "▶");
    if (modeBtn) modeBtn.textContent = cam.follow ? "자유 이동" : "따라가기";
    if (speedBtn) speedBtn.textContent = `${tour.speed}×`;
    if (hintEl) hintEl.textContent = cam.follow
      ? "드래그 회전 · 휠 확대 · WASD로 직접 이동"
      : "자유 이동 중 · WASD·드래그·휠 / 핀을 누르면 그 장소로";
  }
  function restart() {
    tour.nodeIndex = 0; tour.legIndex = 0; tour.mode = "stay"; tour.phase = 0;
    tour.dist = 0; tour.finished = false; tour.playing = true;
    setPosFromDist(0);
    tour.heading = scene.nodes.length > 1
      ? Math.atan2(scene.nodes[1].x - scene.nodes[0].x, scene.nodes[1].z - scene.nodes[0].z) : 0;
    cam.target = { x: tour.pos.x, y: 6, z: tour.pos.z };
    cam.yaw = tour.heading + Math.PI;
    cam.follow = true;
    showCard(scene.nodes[0].item, 0);
    syncStatus(); syncControls(); updateProgress();
  }
  function seekTo(p) {
    const total = scene.cum[scene.cum.length - 1] || 1;
    const d = total * p;
    let i = 0;
    while (i < scene.nodes.length - 2 && scene.cum[i + 1] < d) i++;
    tour.finished = false;
    tour.dist = d;
    setPosFromDist(d);
    if (Math.abs(d - scene.cum[i]) < 0.5) {
      tour.mode = "stay"; tour.nodeIndex = i; tour.phase = 0;
      showCard(scene.nodes[i].item, i);
    } else {
      tour.mode = "move"; tour.legIndex = i; tour.nodeIndex = i;
      tour.walk = scene.legs[i] && scene.legs[i].mode === "walk";
      tour.phase = legDuration(i) * ((d - scene.cum[i]) / (scene.cum[i + 1] - scene.cum[i] || 1));
      showCard(null);
    }
    syncStatus(); updateProgress();
  }
  function jumpToNode(i) {
    const total = scene.cum[scene.cum.length - 1] || 1;
    seekTo(scene.cum[i] / total);
    cam.target.x = scene.nodes[i].x;
    cam.target.z = scene.nodes[i].z;
    tour.playing = false;
    syncControls();
  }

  /* ── 입력 ── */
  function bindInput() {
    const onDown = (e) => {
      const t = e.touches ? e.touches[0] : e;
      drag = { x: t.clientX, y: t.clientY };
      dragMoved = 0;
      if (e.touches && e.touches.length === 2) {
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                               e.touches[0].clientY - e.touches[1].clientY);
      }
    };
    const onMove = (e) => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist) cam.dist = Math.max(22, Math.min(260, cam.dist * (pinchDist / d)));
        pinchDist = d;
        e.preventDefault();
        return;
      }
      if (!drag) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      cam.manual = true;
      cam.yaw -= dx * 0.006;
      cam.pitch = Math.max(0.1, Math.min(1.3, cam.pitch + dy * 0.004));
      drag = { x: t.clientX, y: t.clientY };
      syncControls();
      if (e.touches) e.preventDefault();
    };
    const onUp = (e) => {
      if (drag && dragMoved < 6) {
        const r = canvas.getBoundingClientRect();
        const t = (e.changedTouches && e.changedTouches[0]) || e;
        const px = t.clientX - r.left, py = t.clientY - r.top;
        let hit = null, best = Infinity;
        for (const p of pinHits) {
          const d = Math.hypot(px - p.x, py - p.y);
          if (d < p.r && d < best) { best = d; hit = p.i; }
        }
        if (hit !== null) jumpToNode(hit);
      }
      drag = null;
      pinchDist = 0;
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.addEventListener("wheel", (e) => {
      cam.dist = Math.max(22, Math.min(260, cam.dist + e.deltaY * 0.08));
      e.preventDefault();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (overlay.hidden) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { close(); return; }
      if (k === " ") { e.preventDefault(); playBtn.click(); return; }
      if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k)) {
        keys[k] = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

    /* 모바일 조이스틱 */
    let sActive = false, sOrigin = null;
    const sStart = (e) => {
      sActive = true;
      const r = stick.getBoundingClientRect();
      sOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      sMove(e);
      e.preventDefault();
    };
    const sMove = (e) => {
      if (!sActive) return;
      const t = e.touches ? e.touches[0] : e;
      let dx = t.clientX - sOrigin.x, dy = t.clientY - sOrigin.y;
      const L = Math.hypot(dx, dy), max = 34;
      if (L > max) { dx = dx / L * max; dy = dy / L * max; }
      stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      nudge.x = dx / max;
      nudge.z = -dy / max;
      e.preventDefault();
    };
    const sEnd = () => {
      sActive = false;
      nudge.x = 0; nudge.z = 0;
      stickKnob.style.transform = "translate(0,0)";
    };
    stick.addEventListener("touchstart", sStart, { passive: false });
    stick.addEventListener("touchmove", sMove, { passive: false });
    stick.addEventListener("touchend", sEnd);
    stick.addEventListener("mousedown", sStart);
    window.addEventListener("mousemove", (e) => { if (sActive) sMove(e); });
    window.addEventListener("mouseup", () => { if (sActive) sEnd(); });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureDOM() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "m3-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <canvas class="m3-canvas"></canvas>
      <div class="m3-top">
        <div class="m3-title"></div>
        <button class="m3-close" aria-label="닫기">✕</button>
      </div>
      <div class="m3-status"></div>
      <div class="m3-card" hidden></div>
      <div class="m3-stick" aria-hidden="true"><span class="m3-knob"></span></div>
      <div class="m3-controls">
        <div class="m3-bar"><span class="m3-bar-fill"></span></div>
        <div class="m3-btns">
          <button class="m3-play" aria-label="재생/일시정지"></button>
          <button class="m3-speed">1×</button>
          <button class="m3-mode">자유 이동</button>
          <span class="m3-hint"></span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    canvas = overlay.querySelector(".m3-canvas");
    ctx = canvas.getContext("2d");
    titleEl = overlay.querySelector(".m3-title");
    statusEl = overlay.querySelector(".m3-status");
    cardEl = overlay.querySelector(".m3-card");
    playBtn = overlay.querySelector(".m3-play");
    speedBtn = overlay.querySelector(".m3-speed");
    modeBtn = overlay.querySelector(".m3-mode");
    barEl = overlay.querySelector(".m3-bar");
    barFill = overlay.querySelector(".m3-bar-fill");
    hintEl = overlay.querySelector(".m3-hint");
    stick = overlay.querySelector(".m3-stick");
    stickKnob = overlay.querySelector(".m3-knob");

    overlay.querySelector(".m3-close").addEventListener("click", close);
    playBtn.addEventListener("click", () => {
      if (tour.finished) { restart(); return; }
      tour.playing = !tour.playing;
      syncControls();
    });
    speedBtn.addEventListener("click", () => {
      tour.speed = tour.speed === 1 ? 2 : tour.speed === 2 ? 4 : 1;
      syncControls();
    });
    modeBtn.addEventListener("click", () => setFollow(!cam.follow));
    barEl.addEventListener("click", (e) => {
      const r = barEl.getBoundingClientRect();
      seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    });
    window.addEventListener("resize", () => { if (!overlay.hidden) resize(); });
    bindInput();
  }

  function open(region, day, dayIndex) {
    ensureDOM();
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pal = pickPalette();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    resize();
    keys = Object.create(null);
    nudge = { x: 0, z: 0 };

    cam = { yaw: 0, pitch: 0.56, dist: 96, target: { x: 0, y: 6, z: 0 },
            manual: false, follow: true };
    updateCamera();
    scene = buildScene(region, day, dayIndex);
    tour = {
      playing: !reduced, speed: 1, mode: "stay", phase: 0, clock: 0,
      nodeIndex: 0, legIndex: 0, dist: 0, heading: 0, walk: false, finished: false,
      pos: { x: scene.nodes[0].x, z: scene.nodes[0].z }
    };
    titleEl.textContent = `DAY ${dayIndex + 1} · ${region.name} ${day.zone.name}`;
    restart();
    tour.playing = !reduced;
    syncControls();
    lastTs = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function close() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }
  return { open, close };
})();
