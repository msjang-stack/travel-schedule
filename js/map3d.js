/* ── 길눈 · 3D 동선 맵 ───────────────────────────────────────────
   외부 3D 라이브러리 없이 canvas 2D 위에 원근 투영을 직접 구현한다.
   지형·도로·건물을 절차적으로 세우고, 실제 방문 순서대로 카메라가
   따라가며 이동을 재생한다.

   좌표계: x 동쪽, y 높이(위), z 남쪽.                                */

const Map3D = (function () {
  "use strict";

  let overlay, canvas, ctx, titleEl, statusEl, cardEl, playBtn, camBtn,
      speedBtn, barEl, barFill, barTicks;
  let W = 0, H = 0, dpr = 1;
  let raf = 0, lastTs = 0;
  let scene = null, cam = null, tour = null, pal = null;
  let drag = null, pinchDist = 0;
  let reduced = false;

  /* ── 색 유틸 ── */
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
  ];

  const LIGHT = {
    dark: false,
    skyTop: [156, 188, 210], skyBot: [223, 230, 224],
    ridgeFar: [172, 190, 194], ridgeNear: [141, 165, 167],
    ground: [214, 223, 211], road: [199, 206, 202], roadLine: [232, 236, 230],
    fog: [214, 222, 220],
    walls: [[214, 208, 196], [200, 202, 198], [206, 196, 184], [190, 198, 202], [216, 200, 186]],
    roofs: [[150, 142, 132], [138, 148, 150], [160, 140, 126]],
    hanok: [[126, 82, 62], [104, 92, 78]],
    line: [120, 124, 120], lit: [250, 226, 168],
    accent: [44, 93, 143], dim: [150, 162, 170],
    text: [35, 47, 56], halo: [246, 248, 244],
    cat: { spot: [44, 93, 143], food: [179, 80, 44], cafe: [119, 97, 63] }
  };
  const DARK = {
    dark: true,
    skyTop: [12, 18, 27], skyBot: [32, 44, 58],
    ridgeFar: [30, 42, 55], ridgeNear: [20, 29, 39],
    ground: [21, 28, 35], road: [32, 41, 50], roadLine: [52, 64, 76],
    fog: [22, 30, 39],
    walls: [[56, 67, 78], [49, 60, 73], [62, 69, 78], [46, 57, 69], [58, 63, 72]],
    roofs: [[30, 38, 47], [34, 42, 50], [28, 36, 44]],
    hanok: [[74, 50, 40], [62, 56, 48]],
    line: [64, 76, 88], lit: [255, 206, 128],
    accent: [127, 176, 220], dim: [96, 110, 122],
    text: [230, 232, 227], halo: [18, 24, 31],
    cat: { spot: [127, 176, 220], food: [224, 139, 102], cafe: [194, 168, 120] }
  };

  function pickPalette() {
    const m = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [244, 243, 238])
      .map(Number);
    const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    return lum < 0.45 ? DARK : LIGHT;
  }

  /* ── 벡터 / 카메라 ── */
  function norm(v) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function updateCamera() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    cam.eye = {
      x: cam.target.x + cam.dist * cp * Math.sin(cam.yaw),
      y: cam.target.y + cam.dist * sp,
      z: cam.target.z + cam.dist * cp * Math.cos(cam.yaw)
    };
    cam.fwd = norm({
      x: cam.target.x - cam.eye.x,
      y: cam.target.y - cam.eye.y,
      z: cam.target.z - cam.eye.z
    });
    cam.right = norm(cross(cam.fwd, { x: 0, y: 1, z: 0 }));
    cam.up = cross(cam.right, cam.fwd);
    cam.f = H / (2 * Math.tan(0.5 * 0.86));
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

  /* 거리에 따라 안개색으로 섞어 원근감을 준다 */
  function fogged(col, dist) {
    const t = Math.min(0.72, Math.max(0, (dist - 55) / 210));
    return rgb(mix(col, pal.fog, t));
  }

  const P = (x, y, z) => ({ x, y, z });

  /* ── 기본 입체 ── */
  function box(cx, cz, w, d, y0, h, col, opt) {
    const o = opt || {};
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const dist = Math.hypot(cx - cam.eye.x, cz - cam.eye.z);
    const line = o.line === false ? null : rgb(mix(pal.line, pal.fog, Math.min(0.8, dist / 260)));

    poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
      fogged(mul(col, 1.0), dist), line);

    const faces = [
      { n: 1, k: 0.78, pts: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], cx: x1, cz: cz, ax: "x" },
      { n: -1, k: 0.6, pts: [P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0)], cx: x0, cz: cz, ax: "x" },
      { n: 1, k: 0.86, pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], cx: cx, cz: z1, ax: "z" },
      { n: -1, k: 0.52, pts: [P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], cx: cx, cz: z0, ax: "z" }
    ];
    for (const f of faces) {
      const toEye = f.ax === "x" ? cam.eye.x - f.cx : cam.eye.z - f.cz;
      if (toEye * f.n <= 0) continue;
      poly(f.pts, fogged(mul(col, f.k), dist), line);
      if (o.floors && h > 6 && dist < 170) drawFloors(f, y0, h, dist);
    }
    if (o.lit && pal.dark && dist < 150) drawLit(faces, y0, h, o.lit, dist);
  }

  function drawFloors(f, y0, h, dist) {
    const step = 3.6;
    const c = rgb(mix(mix(pal.line, pal.fog, Math.min(0.85, dist / 200)), pal.fog, 0.25));
    ctx.strokeStyle = c;
    ctx.lineWidth = 0.8;
    for (let y = y0 + step; y < y0 + h - 0.8; y += step) {
      const a = { ...f.pts[0], y }, b = { ...f.pts[3], y };
      const va = toView(a), vb = toView(b);
      if (va.z < NEAR || vb.z < NEAR) continue;
      ctx.beginPath();
      ctx.moveTo(sx(va), sy(va));
      ctx.lineTo(sx(vb), sy(vb));
      ctx.stroke();
    }
  }

  function drawLit(faces, y0, h, lit, dist) {
    const glow = rgb(mix(pal.lit, pal.fog, Math.min(0.6, dist / 190)));
    for (const f of faces) {
      const toEye = f.ax === "x" ? cam.eye.x - f.cx : cam.eye.z - f.cz;
      if (toEye * f.n <= 0) continue;
      const a = f.pts[0], b = f.pts[3];
      for (const w of lit) {
        const y = y0 + h * w.v;
        if (y > y0 + h - 1) continue;
        const px = a.x + (b.x - a.x) * w.u, pz = a.z + (b.z - a.z) * w.u;
        const p1 = toView(P(px, y, pz));
        if (p1.z < NEAR) continue;
        const s = Math.max(0.9, cam.f * 0.9 / p1.z);
        ctx.fillStyle = glow;
        ctx.fillRect(sx(p1) - s / 2, sy(p1) - s / 2, s, s * 1.3);
      }
    }
  }

  /* 사각뿔 지붕 (기와/전각) */
  function roof(cx, cz, w, d, y0, h, col, over) {
    const ov = over || 0;
    const x0 = cx - w / 2 - ov, x1 = cx + w / 2 + ov;
    const z0 = cz - d / 2 - ov, z1 = cz + d / 2 + ov;
    const dist = Math.hypot(cx - cam.eye.x, cz - cam.eye.z);
    const apex = P(cx, y0 + h, cz);
    const corners = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)];
    const shade = [0.55, 0.82, 0.95, 0.66];
    const tri = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      tri.push({ pts: [a, b, apex], k: shade[i], d: Math.hypot(mx - cam.eye.x, mz - cam.eye.z) });
    }
    tri.sort((p, q) => q.d - p.d);
    for (const t of tri) poly(t.pts, fogged(mul(col, t.k), dist), null);
  }

  /* ── 장소별 랜드마크 ── */
  function landmark(kind, x, z, col, roofCol, k) {
    const u = k || 1;
    const B = (dx, dz, w, d, y0, h, c, o) =>
      box(x + dx * u, z + dz * u, w * u, d * u, y0 * u, h * u, c, o);
    const R = (w, d, y0, h, c, ov) =>
      roof(x, z, w * u, d * u, y0 * u, h * u, c, ov * u);
    switch (kind) {
      case "tower":
        B(0, 0, 5, 5, 0, 20, col, { floors: true });
        B(0, 0, 11, 11, 20, 5, mul(col, 1.05), { line: false });
        B(0, 0, 2.2, 2.2, 25, 12, mul(col, 0.9), { line: false });
        break;
      case "hall":
        B(0, 0, 20, 13, 0, 2, mul(col, 0.9), { line: false });
        B(0, 0, 17, 10.5, 2, 7, col, { floors: false });
        R(17, 10.5, 9, 4.6, roofCol, 2.8);
        break;
      case "hanok":
        B(0, 0, 13, 9, 0, 1.4, mul(col, 0.88), { line: false });
        B(0, 0, 11, 7.5, 1.4, 4.6, col, { line: false });
        R(11, 7.5, 6, 3.4, roofCol, 2.4);
        break;
      case "pavilion":
        for (const dx of [-4.4, 4.4]) for (const dz of [-3, 3])
          B(dx, dz, 1.2, 1.2, 0, 6.5, mul(col, 0.85), { line: false });
        B(0, 0, 11, 8, 0, 0.8, mul(col, 0.9), { line: false });
        R(11, 8, 6.5, 3.8, roofCol, 2.2);
        break;
      case "dome":
        B(0, 0, 12, 12, 0, 8, col, { floors: true });
        R(8, 8, 8, 7, roofCol, 1.2);
        break;
      case "shop":
      default:
        B(0, 0, 10, 8, 0, 6.5, col, { floors: false });
        B(0, 4.6, 10.6, 1.6, 4.2, 0.9, roofCol, { line: false });
        R(10, 8, 6.5, 2.4, roofCol, 1.1);
    }
  }

  const LANDMARK_BY_CAT = {
    spot: ["hall", "hanok", "tower", "pavilion", "dome"],
    food: ["shop", "hanok"],
    cafe: ["shop", "pavilion"]
  };

  /* ── 장면 구성 ── */
  function segDist(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = dx * dx + dz * dz;
    let t = L ? ((px - a.x) * dx + (pz - a.z) * dz) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
  }

  function buildScene(region, day, dayIndex) {
    const items = day.items, legs = day.legs;
    const lat0 = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng0 = items.reduce((s, p) => s + p.lng, 0) / items.length;
    const latAdj = Math.cos(lat0 * Math.PI / 180), M = 111320;

    const raw = items.map((p) => ({
      x: (p.lng - lng0) * latAdj * M,
      z: -(p.lat - lat0) * M
    }));
    let ext = 1;
    raw.forEach((p) => { ext = Math.max(ext, Math.abs(p.x), Math.abs(p.z)); });
    const s = 78 / ext;

    const nodes = raw.map((p, i) => ({
      x: p.x * s, z: p.z * s, item: items[i],
      kind: null, col: null
    }));

    /* 장소가 밀집한 코스에서는 랜드마크를 작게 세운다 */
    let minGap = Infinity;
    for (let i = 0; i < nodes.length - 1; i++) {
      minGap = Math.min(minGap, Math.hypot(
        nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));
    }
    const lmk = Math.max(0.5, Math.min(1.1, (isFinite(minGap) ? minGap : 30) / 27));
    const offset = 11.5 * lmk;

    /* 랜드마크는 동선(길)에서 살짝 비껴 세워 여행자와 겹치지 않게 한다 */
    nodes.forEach((n, i) => {
      const a = nodes[i - 1] || n, b = nodes[i + 1] || n;
      let dx = b.x - a.x, dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      n.lx = n.x - dz * offset;
      n.lz = n.z + dx * offset;
    });

    const rand = seededRand(region.id + "|" + dayIndex);
    nodes.forEach((n) => {
      const opts = LANDMARK_BY_CAT[n.item.cat] || LANDMARK_BY_CAT.spot;
      n.kind = opts[Math.floor(rand() * opts.length)];
      n.col = n.kind === "hanok" || n.kind === "pavilion" || n.kind === "hall"
        ? pal.hanok[Math.floor(rand() * pal.hanok.length)]
        : pal.walls[Math.floor(rand() * pal.walls.length)];
      n.roofCol = pal.roofs[Math.floor(rand() * pal.roofs.length)];
    });

    /* 도시 블록: 격자 + 지터, 동선/랜드마크 주변은 비운다 */
    const half = 104, cell = 13.5, buildings = [];
    for (let gx = -half; gx <= half; gx += cell) {
      for (let gz = -half; gz <= half; gz += cell) {
        const bx = gx + (rand() - 0.5) * 4.5, bz = gz + (rand() - 0.5) * 4.5;
        const rad = Math.hypot(bx, bz);
        if (rad > half) continue;
        if (rand() < 0.13 + 0.3 * (rad / half)) continue;

        let clear = true;
        for (const n of nodes) {
          if (Math.hypot(bx - n.x, bz - n.z) < 13 + 8 * lmk ||
              Math.hypot(bx - n.lx, bz - n.lz) < 8 + 10 * lmk) { clear = false; break; }
        }
        if (!clear) continue;
        for (let i = 0; i < nodes.length - 1 && clear; i++) {
          if (segDist(bx, bz, nodes[i], nodes[i + 1]) < 9) clear = false;
        }
        if (!clear) continue;

        const core = 1 - Math.min(1, rad / half);
        const h = 3 + rand() * 5.5 + core * core * (7 + rand() * 15);
        const w = 5.5 + rand() * 4.2, d = 5.5 + rand() * 4.2;
        const lit = [];
        if (pal.dark) {
          const n = 2 + Math.floor(rand() * 5);
          for (let i = 0; i < n; i++) lit.push({ u: 0.18 + rand() * 0.64, v: 0.2 + rand() * 0.62 });
        }
        buildings.push({
          x: bx, z: bz, w, d, h,
          col: pal.walls[Math.floor(rand() * pal.walls.length)],
          lit: lit.length ? lit : null
        });
      }
    }

    /* 도로: 격자선 */
    const roads = [];
    for (let g = -half; g <= half; g += cell) {
      roads.push({ x: g, z: 0, w: 3.4, d: half * 2 + cell });
      roads.push({ x: 0, z: g, w: half * 2 + cell, d: 3.4 });
    }

    /* 구간별 누적 거리 */
    const cum = [0];
    for (let i = 0; i < nodes.length - 1; i++) {
      cum.push(cum[i] + Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));
    }

    /* 원경 능선 */
    const ridges = [];
    for (let layer = 0; layer < 2; layer++) {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        pts.push({ u: i / 26, h: 0.35 + rand() * (layer ? 0.75 : 0.45) });
      }
      ridges.push(pts);
    }

    return { region, day, dayIndex, nodes, legs, buildings, roads, cum, ridges, half, lmk };
  }

  /* ── 지면 (하늘·능선·땅·도로·경로) ── */
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(pal.skyTop));
    g.addColorStop(1, rgb(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function horizonY() {
    const far = P(cam.eye.x + cam.fwd.x * 4000, 0, cam.eye.z + cam.fwd.z * 4000);
    const v = toView(far);
    return v.z > NEAR ? sy(v) : H * 0.35;
  }

  function drawRidges() {
    const hy = horizonY();
    if (hy < -H || hy > H * 1.3) return;
    const shift = (cam.yaw / (Math.PI * 2)) * W * 2;
    scene.ridges.forEach((pts, li) => {
      const amp = li ? 96 : 58;
      const col = rgb(li ? pal.ridgeNear : pal.ridgeFar);
      const off = -shift * (li ? 0.55 : 0.32);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-W, hy + 4);
      for (let k = -1; k <= 2; k++) {
        pts.forEach((p, i) => {
          const x = off + (k + p.u) * W + (i % 2 ? 6 : 0);
          ctx.lineTo(x, hy + 4 - p.h * amp);
        });
      }
      ctx.lineTo(W * 3, hy + 4);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawGround() {
    const R = 900;
    poly([P(-R, 0, -R), P(R, 0, -R), P(R, 0, R), P(-R, 0, R)], rgb(pal.ground), null);
    for (const r of scene.roads) {
      poly([
        P(r.x - r.w / 2, 0.02, r.z - r.d / 2), P(r.x + r.w / 2, 0.02, r.z - r.d / 2),
        P(r.x + r.w / 2, 0.02, r.z + r.d / 2), P(r.x - r.w / 2, 0.02, r.z + r.d / 2)
      ], rgb(pal.road), null);
    }
  }

  /* 경로 리본 — 지나온 구간은 진하게, 남은 구간은 흐리게 */
  function ribbon(a, b, w, col) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w, nz = dx / l * w;
    poly([
      P(a.x + nx, 0.06, a.z + nz), P(b.x + nx, 0.06, b.z + nz),
      P(b.x - nx, 0.06, b.z - nz), P(a.x - nx, 0.06, a.z - nz)
    ], col, null);
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
      const seg = 14;
      const pts = [];
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        pts.push(P(n.x + Math.cos(th) * 7.4, 0.05, n.z + Math.sin(th) * 7.4));
      }
      poly(pts, rgb(mix(pal.accent, pal.ground, 0.78)), null);
    }
  }

  /* ── 여행자 ── */
  function drawTraveler() {
    const t = tour.pos, walking = tour.mode === "move" && tour.walk;
    const bob = tour.mode === "move" ? Math.sin(tour.clock * 9) * 0.35 : 0;
    const col = pal.dark ? [235, 240, 244] : [252, 252, 250];
    if (walking) {
      box(t.x, t.z, 3.4, 3.4, 0.5 + bob * 0.4, 4.4, pal.accent, { line: false });
      box(t.x, t.z, 2.4, 2.4, 5 + bob * 0.4, 2.2, col, { line: false });
    } else {
      box(t.x, t.z, 4.6, 7.4, 0.6, 2.9, pal.accent, { line: false });
      box(t.x, t.z, 4, 4.2, 3.5, 2.2, col, { line: false });
    }
    const beam = toView(P(t.x, 0.08, t.z));
    if (beam.z > NEAR) {
      const r = Math.max(3, cam.f * 5 / beam.z);
      const g = ctx.createRadialGradient(sx(beam), sy(beam), 0, sx(beam), sy(beam), r);
      g.addColorStop(0, `rgba(${pal.accent.join(",")},0.42)`);
      g.addColorStop(1, `rgba(${pal.accent.join(",")},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx(beam), sy(beam), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── 핀 (항상 건물 위에 뜬다) ── */
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

  function drawPins() {
    const list = scene.nodes.map((n, i) => {
      const v = toView(P(n.x, 20, n.z));
      return { n, i, v };
    }).filter((o) => o.v.z > NEAR).sort((a, b) => b.v.z - a.v.z);

    for (const o of list) {
      const x = sx(o.v), y = sy(o.v);
      const base = toView(P(o.n.x, 0, o.n.z));
      const cat = pal.cat[o.n.item.cat] || pal.cat.spot;
      const scale = Math.max(0.42, Math.min(1.35, 74 / o.v.z));
      const r = 13 * scale;
      const current = tour.nodeIndex === o.i;
      const visited = tour.dist >= scene.cum[o.i] - 0.1;

      if (base.z > NEAR) {
        ctx.strokeStyle = `rgba(${cat.join(",")},${visited ? 0.85 : 0.4})`;
        ctx.lineWidth = Math.max(1, 1.8 * scale);
        ctx.beginPath();
        ctx.moveTo(sx(base), sy(base));
        ctx.lineTo(x, y + r * 0.7);
        ctx.stroke();
      }

      if (current) {
        const pr = r * (1.7 + Math.sin(tour.clock * 3.4) * 0.28);
        ctx.fillStyle = `rgba(${cat.join(",")},0.16)`;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
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

      /* 순번 배지 */
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
        const halfW = ctx.measureText(label).width / 2 + 6;
        const lx = Math.max(halfW, Math.min(W - halfW, x));
        ctx.lineWidth = Math.max(2.4, 3.4 * scale);
        ctx.strokeStyle = rgb(pal.halo);
        ctx.lineJoin = "round";
        ctx.strokeText(label, lx, y - r * 1.75);
        ctx.fillStyle = rgb(pal.text);
        ctx.fillText(label, lx, y - r * 1.75);
      }
    }
  }

  /* ── 렌더 ── */
  function render() {
    updateCamera();
    drawSky();
    drawRidges();
    drawGround();
    drawRoute();

    const objs = [];
    for (const b of scene.buildings) {
      const v = toView(P(b.x, b.h / 2, b.z));
      if (v.z < NEAR) continue;
      const m = Math.abs(sx(v) - W / 2);
      if (m > W * 1.3 + cam.f * 12 / v.z) continue;
      objs.push({ z: v.z, kind: "b", o: b });
    }
    for (const n of scene.nodes) {
      const v = toView(P(n.lx, 8, n.lz));
      if (v.z < NEAR) continue;
      objs.push({ z: v.z, kind: "n", o: n });
    }
    const tv = toView(P(tour.pos.x, 2, tour.pos.z));
    if (tv.z > NEAR) objs.push({ z: tv.z, kind: "t" });

    objs.sort((a, b) => b.z - a.z);
    for (const it of objs) {
      if (it.kind === "b") {
        box(it.o.x, it.o.z, it.o.w, it.o.d, 0, it.o.h, it.o.col,
          { floors: true, lit: it.o.lit });
      } else if (it.kind === "n") {
        landmark(it.o.kind, it.o.lx, it.o.lz, it.o.col, it.o.roofCol, scene.lmk);
      } else {
        drawTraveler();
      }
    }
    drawPins();
  }

  /* ── 투어 진행 ── */
  const STAY_MS = 1500, MIN_MOVE = 1300, MAX_MOVE = 4200;

  function legDuration(i) {
    const leg = scene.legs[i];
    return Math.max(MIN_MOVE, Math.min(MAX_MOVE, (leg ? leg.min : 15) * 90));
  }

  function setPosFromDist(d) {
    const cum = scene.cum, N = scene.nodes.length;
    if (d <= 0) { tour.pos = { x: scene.nodes[0].x, z: scene.nodes[0].z }; return; }
    const last = cum[N - 1];
    if (d >= last) { tour.pos = { x: scene.nodes[N - 1].x, z: scene.nodes[N - 1].z }; return; }
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

  function followCamera(dt) {
    const k = Math.min(1, dt / 240);
    const tx = tour.pos.x, tz = tour.pos.z;
    cam.target.x += (tx - cam.target.x) * k;
    cam.target.z += (tz - cam.target.z) * k;
    cam.target.y += (6 - cam.target.y) * k;

    if (!cam.manual) {
      let want = tour.mode === "move"
        ? tour.heading + Math.PI
        : tour.heading + Math.PI + Math.sin(tour.clock * 0.22) * 0.55;
      let diff = want - cam.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cam.yaw += diff * Math.min(1, dt / 900);
      const wantDist = tour.mode === "move" ? 108 : 82;
      const wantPitch = tour.mode === "move" ? 0.46 : 0.58;
      cam.dist += (wantDist - cam.dist) * Math.min(1, dt / 1200);
      cam.pitch += (wantPitch - cam.pitch) * Math.min(1, dt / 1200);
    }
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
  function syncStatus() {
    if (!statusEl) return;
    const N = scene.nodes.length;
    if (tour.finished) {
      const total = scene.legs.reduce((s, l) => s + l.min, 0);
      statusEl.textContent = `일정 완주 · 총 이동 ${total}분`;
      return;
    }
    if (tour.mode === "stay") {
      const it = scene.nodes[tour.nodeIndex].item;
      statusEl.textContent = `${tour.nodeIndex + 1}. ${it.name} 도착 · 약 ${it.stay}분 머무름`;
    } else {
      const a = scene.nodes[tour.legIndex].item, b = scene.nodes[tour.legIndex + 1].item;
      const leg = scene.legs[tour.legIndex];
      const mode = leg.mode === "walk" ? "도보" : "차량";
      const dist = leg.km < 1 ? `${Math.round(leg.km * 1000)}m` : `${leg.km.toFixed(1)}km`;
      statusEl.textContent = `${a.name} → ${b.name} · ${mode} ${leg.min}분 (${dist})`;
    }
    void N;
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
    if (playBtn) {
      const p = tour.playing;
      playBtn.textContent = tour.finished ? "↺ 처음부터" : (p ? "⏸ 일시정지" : "▶ 재생");
      playBtn.setAttribute("aria-label", tour.finished ? "처음부터 다시 재생" : (p ? "일시정지" : "재생"));
    }
    if (camBtn) camBtn.textContent = cam.manual ? "시점 자동" : "시점 직접";
    if (speedBtn) speedBtn.textContent = `${tour.speed}×`;
  }

  function restart() {
    tour.nodeIndex = 0;
    tour.legIndex = 0;
    tour.mode = "stay";
    tour.phase = 0;
    tour.dist = 0;
    tour.finished = false;
    tour.playing = true;
    setPosFromDist(0);
    tour.heading = scene.nodes.length > 1
      ? Math.atan2(scene.nodes[1].x - scene.nodes[0].x, scene.nodes[1].z - scene.nodes[0].z)
      : 0;
    cam.target = { x: tour.pos.x, y: 6, z: tour.pos.z };
    cam.yaw = tour.heading + Math.PI;
    showCard(scene.nodes[0].item, 0);
    syncStatus();
    syncControls();
    updateProgress();
  }

  /* ── 입력 ── */
  function bindInput() {
    const onDown = (e) => {
      const t = e.touches ? e.touches[0] : e;
      drag = { x: t.clientX, y: t.clientY };
      if (e.touches && e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    };
    const onMove = (e) => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist) cam.dist = Math.max(26, Math.min(230, cam.dist * (pinchDist / d)));
        pinchDist = d;
        e.preventDefault();
        return;
      }
      if (!drag) return;
      const t = e.touches ? e.touches[0] : e;
      cam.manual = true;
      cam.yaw -= (t.clientX - drag.x) * 0.006;
      cam.pitch = Math.max(0.12, Math.min(1.25, cam.pitch + (t.clientY - drag.y) * 0.004));
      drag = { x: t.clientX, y: t.clientY };
      syncControls();
      if (e.touches) e.preventDefault();
    };
    const onUp = () => { drag = null; pinchDist = 0; };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.addEventListener("wheel", (e) => {
      cam.dist = Math.max(26, Math.min(230, cam.dist + e.deltaY * 0.08));
      e.preventDefault();
    }, { passive: false });
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

  /* ── 오버레이 ── */
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
      <div class="m3-controls">
        <div class="m3-bar"><span class="m3-bar-fill"></span></div>
        <div class="m3-btns">
          <button class="m3-play"></button>
          <button class="m3-speed">1×</button>
          <button class="m3-cam">시점 직접</button>
          <span class="m3-hint">드래그 회전 · 휠/핀치 확대</span>
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
    camBtn = overlay.querySelector(".m3-cam");
    barEl = overlay.querySelector(".m3-bar");
    barFill = overlay.querySelector(".m3-bar-fill");

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
    camBtn.addEventListener("click", () => {
      cam.manual = !cam.manual;
      syncControls();
    });
    barEl.addEventListener("click", (e) => {
      const r = barEl.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      seekTo(p);
    });
    window.addEventListener("keydown", (e) => {
      if (overlay.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === " ") { e.preventDefault(); playBtn.click(); }
    });
    window.addEventListener("resize", () => { if (!overlay.hidden) resize(); });
    bindInput();
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
    syncStatus();
    updateProgress();
  }

  function open(region, day, dayIndex) {
    ensureDOM();
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pal = pickPalette();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    resize();

    cam = { yaw: 0, pitch: 0.56, dist: 96, target: { x: 0, y: 6, z: 0 }, manual: false };
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
