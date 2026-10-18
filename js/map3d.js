/* ── 길눈 · 3D 동선 맵 (Three.js) ───────────────────────────────
   js/terrain.js 의 실제 해안선·강·호수·산 좌표로 지형 메시를 만들고,
   그 위에 도시를 세운 뒤 방문 순서대로 캐릭터가 걸어가고 차로 달린다.

   좌표계: x 동쪽, y 높이, z 남쪽.                                   */

const Map3D = (function () {
  "use strict";

  /* ── DOM ── */
  let overlay, holder, titleEl, statusEl, cardEl, playBtn, modeBtn, speedBtn,
      barEl, barFill, hintEl, stick, stickKnob, noteEl;

  /* ── 렌더 ── */
  let renderer, scene3, camera, raycaster, pointerNDC;
  let worldGroup = null, sun = null, hemi = null, skyDome = null;
  let routeDone = null, routeSegs = 0, waterMats = [];
  let hero = null;                       /* 캐릭터 + 차 */
  let pinSprites = [];

  /* ── 상태 ── */
  let S = null;                          /* 장면 데이터 */
  let cam = null, tour = null, pal = null;
  let raf = 0, lastTs = 0, reduced = false, ready = false;
  let drag = null, pinchDist = 0, dragMoved = 0;
  let keys = Object.create(null), nudge = { x: 0, z: 0 };
  let W = 0, H = 0;

  /* ── 팔레트 ── */
  const DAY = {
    dark: false,
    skyTop: 0x7fa8c9, skyBot: 0xdfe7df, fog: 0xcfdcd9, fogNear: 120, fogFar: 620,
    sun: 0xfff4e4, sunI: 1.05, hemiSky: 0x9dbdd6, hemiGnd: 0x6d7a60, hemiI: 0.42,
    ground: 0xb8c6ac, groundAlt: 0xaebda2, road: 0xa9b1ab, roadLine: 0xcdd3c9,
    sea: 0x2f7593, lake: 0x3a7d94, sand: 0xcfbc8d, bank: 0x9db384,
    hill: 0x6f8a62, hillTop: 0x87a06f,
    foliage: 0x3f6b3c, foliage2: 0x568046, trunk: 0x6f5a46,
    walls: [0xc9c2b2, 0xb5bab6, 0xc0b3a2, 0xa8b4bc, 0xcab9a2, 0xbcbdb0, 0xaea79d],
    roofs: [0x77726a, 0x6f7c84, 0x8a7162, 0x636b74],
    hanok: [0x7e5440, 0x6a5e4e], tile: 0x4e4a46,
    awning: [0xb6604a, 0x567a8a, 0xc49e4c, 0x7f8560],
    accent: 0x2c5d8f, dim: 0x97a2a8, nodeDisc: 0x9fb5b0,
    cat: { spot: 0x2c5d8f, food: 0xb3502c, cafe: 0x77613f },
    skin: 0xe8b894, hair: 0x3a2f28, shirt: 0x2c5d8f, pants: 0x3e4a57,
    pack: 0xb3502c, car: 0xe9ecef, carDark: 0x4a5560,
    lampGlow: 0xfff0c8, lampI: 0.0,
    text: "#232f38", halo: "#f6f8f4"
  };
  const NIGHT = {
    dark: true,
    skyTop: 0x080d16, skyBot: 0x24344a, fog: 0x162030, fogNear: 110, fogFar: 640,
    sun: 0x9db6e0, sunI: 0.45, hemiSky: 0x33475f, hemiGnd: 0x1c242e, hemiI: 0.72,
    ground: 0x2b353f, groundAlt: 0x27313b, road: 0x39434e, roadLine: 0x4b5663,
    sea: 0x1b3c59, lake: 0x1d4055, sand: 0x4a473d, bank: 0x33402f,
    hill: 0x2b3a33, hillTop: 0x36473b,
    foliage: 0x27402f, foliage2: 0x314e38, trunk: 0x2c2620,
    walls: [0x3a444f, 0x333e4a, 0x404853, 0x2f3944, 0x3c424c, 0x363f49, 0x2c353f],
    roofs: [0x242c35, 0x28313a, 0x202831, 0x1e252d],
    hanok: [0x4a3328, 0x3e3830], tile: 0x272322,
    awning: [0x7a3f30, 0x35505e, 0x806648, 0x4e5440],
    accent: 0x7fb0dc, dim: 0x5f6b76, nodeDisc: 0x2b3b44,
    cat: { spot: 0x7fb0dc, food: 0xe08b66, cafe: 0xc2a878 },
    skin: 0xc49878, hair: 0x241d18, shirt: 0x7fb0dc, pants: 0x2a3340,
    pack: 0xc06a4a, car: 0xc8d0d6, carDark: 0x2e3740,
    lampGlow: 0xffd89a, lampI: 1.0,
    text: "#e6e8e3", halo: "#121820"
  };

  function pickPalette() {
    const m = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [244, 243, 238]).map(Number);
    return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 < 0.45 ? NIGHT : DAY;
  }

  function available() {
    if (typeof THREE === "undefined") return false;
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl") ||
                c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  }

  /* ── 기하 빌더: 정점을 직접 쌓아 한 덩어리 메시로 합친다 ── */
  function Builder() { return { p: [], n: [], u: [], c: [] }; }
  function pushColor(B, hex, count) {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    const lr = srgb(r), lg = srgb(g), lb = srgb(b);
    for (let i = 0; i < count; i++) B.c.push(lr, lg, lb);
  }
  function srgb(x) { return x < 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }

  /* 바깥면이 앞면(CCW)이 되도록 a→c→b 순서로 쌓는다 */
  function addTri(B, a, b, c, hex, uvs) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = -(uy * vz - uz * vy), ny = -(uz * vx - ux * vz), nz = -(ux * vy - uy * vx);
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    B.p.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    B.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    if (uvs) B.u.push(uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]);
    else B.u.push(0, 0, 1, 1, 1, 0);
    pushColor(B, hex, 3);
  }

  /* 지형처럼 computeVertexNormals 로 매끄럽게 깎는 면은 와인딩 그대로 */
  function addTriRaw(B, a, b, c, hex) {
    B.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    B.n.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    B.u.push(0, 0, 1, 0, 1, 1);
    pushColor(B, hex, 3);
  }
  function addQuad(B, a, b, c, d, hex, uv) {
    if (uv) {
      addTri(B, a, b, c, hex, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]);
      addTri(B, a, c, d, hex, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]);
    } else {
      addTri(B, a, b, c, hex, [0, 0, 1, 0, 1, 1]);
      addTri(B, a, c, d, hex, [0, 0, 1, 1, 0, 1]);
    }
  }
  const V = (x, y, z) => ({ x, y, z });

  function cornersOf(cx, cz, w, d, rot) {
    const co = Math.cos(rot), si = Math.sin(rot), hw = w / 2, hd = d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      .map(([lx, lz]) => ({ x: cx + lx * co - lz * si, z: cz + lx * si + lz * co }));
  }

  /* 벽면에 창문 UV 를 입힌 상자 */
  function addBox(B, cx, cz, w, d, rot, y0, h, hex, opt) {
    const o = opt || {};
    const cs = cornersOf(cx, cz, w, d, rot), y1 = y0 + h;
    const uo = o.uo || 0, vo = o.vo || 0;
    const FW = o.tile === false ? 0 : 1 / 4.4, FH = o.tile === false ? 0 : 1 / 3.6;
    addQuad(B, V(cs[0].x, y1, cs[0].z), V(cs[1].x, y1, cs[1].z),
            V(cs[2].x, y1, cs[2].z), V(cs[3].x, y1, cs[3].z), o.topHex || hex,
            [0, 0, 1, 0, 1, 1, 0, 1]);
    if (o.bottom) {
      addQuad(B, V(cs[3].x, y0, cs[3].z), V(cs[2].x, y0, cs[2].z),
              V(cs[1].x, y0, cs[1].z), V(cs[0].x, y0, cs[0].z), hex, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const u0 = uo, u1 = uo + len * FW, v0 = vo, v1 = vo + h * FH;
      addQuad(B, V(a.x, y0, a.z), V(b.x, y0, b.z), V(b.x, y1, b.z), V(a.x, y1, a.z),
              hex, [u0, v0, u1, v0, u1, v1, u0, v1]);
    }
    return cs;
  }

  function addHipRoof(B, cs, cx, cz, y0, h, hex, over) {
    const ex = cs.map((p) => {
      const dx = p.x - cx, dz = p.z - cz, L = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / L) * over, z: p.z + (dz / L) * over };
    });
    const apex = V(cx, y0 + h, cz);
    for (let i = 0; i < 4; i++) {
      const a = ex[i], b = ex[(i + 1) % 4];
      addTri(B, V(a.x, y0, a.z), V(b.x, y0, b.z), apex, hex);
    }
    addQuad(B, V(ex[3].x, y0, ex[3].z), V(ex[2].x, y0, ex[2].z),
            V(ex[1].x, y0, ex[1].z), V(ex[0].x, y0, ex[0].z), hex);
  }
  function addGableRoof(B, cs, cx, cz, y0, h, hex, over) {
    const ex = cs.map((p) => {
      const dx = p.x - cx, dz = p.z - cz, L = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / L) * over, z: p.z + (dz / L) * over };
    });
    const e01 = Math.hypot(ex[1].x - ex[0].x, ex[1].z - ex[0].z);
    const e12 = Math.hypot(ex[2].x - ex[1].x, ex[2].z - ex[1].z);
    const q = e01 >= e12 ? [ex[0], ex[1], ex[2], ex[3]] : [ex[1], ex[2], ex[3], ex[0]];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    const rA = mid(q[0], q[3]), rB = mid(q[1], q[2]), yr = y0 + h;
    addQuad(B, V(q[0].x, y0, q[0].z), V(q[1].x, y0, q[1].z),
            V(rB.x, yr, rB.z), V(rA.x, yr, rA.z), hex);
    addQuad(B, V(q[2].x, y0, q[2].z), V(q[3].x, y0, q[3].z),
            V(rA.x, yr, rA.z), V(rB.x, yr, rB.z), hex);
    addTri(B, V(q[0].x, y0, q[0].z), V(rA.x, yr, rA.z), V(q[3].x, y0, q[3].z), hex);
    addTri(B, V(q[1].x, y0, q[1].z), V(q[2].x, y0, q[2].z), V(rB.x, yr, rB.z), hex);
  }
  function addCone(B, cx, cz, r, y0, h, hex, seg, rot) {
    const n = seg || 7, apex = V(cx, y0 + h, cz), base = [];
    for (let i = 0; i < n; i++) {
      const a = (rot || 0) + (i / n) * Math.PI * 2;
      base.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    for (let i = 0; i < n; i++) {
      const a = base[i], b = base[(i + 1) % n];
      addTri(B, V(a.x, y0, a.z), V(b.x, y0, b.z), apex, hex);
    }
  }

  function toGeometry(B) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(B.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
    g.computeBoundingSphere();
    return g;
  }

  /* ── 텍스처 ── */
  function wallTexture(night) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = night ? "rgba(14,20,28,0.78)" : "rgba(90,104,116,0.3)";
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
      g.fillRect(col * 64 + 14, r * 64 + 16, 36, 32);
    }
    g.strokeStyle = night ? "rgba(255,255,255,0.05)" : "rgba(40,48,56,0.12)";
    g.lineWidth = 2;
    for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(0, r * 64 + 60); g.lineTo(256, r * 64 + 60); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function emissiveTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
      if (rnd() < 0.42) {
        const warm = 200 + Math.floor(rnd() * 55);
        g.fillStyle = `rgb(${warm},${Math.floor(warm * 0.82)},${Math.floor(warm * 0.56)})`;
        g.fillRect(col * 64 + 14, r * 64 + 16, 36, 32);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function rippleTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const a1 = x * 0.049 + y * 0.021, a2 = x * 0.017 - y * 0.038;
      const hx = Math.cos(a1) * 0.049 + Math.cos(a2) * 0.017;
      const hz = Math.cos(a1) * 0.021 - Math.cos(a2) * 0.038;
      const nx = -hx * 9, nz = -hz * 9, ny = 1;
      const h = 0;
      const L = Math.hypot(nx, ny, nz);
      img.data[i] = ((nx / L) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / L) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / L) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
      void h;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    return t;
  }
  function glowSprite(hex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const r = ((hex >> 16) & 255), gg = ((hex >> 8) & 255), b = hex & 255;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${r},${gg},${b},0.95)`);
    grd.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ── 장면 데이터 ── */
  function pointInPoly(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, zi = ring[i].z, xj = ring[j].x, zj = ring[j].z;
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
    let t = L ? ((px - a.x) * dx + (pz - a.z) * dz) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
  }

  function makeScene(region, day, dayIndex) {
    const items = day.items, legs = day.legs;
    const lat0 = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng0 = items.reduce((s, p) => s + p.lng, 0) / items.length;
    const latAdj = Math.cos(lat0 * Math.PI / 180), M = 111320;
    const raw = items.map((p) => ({ x: (p.lng - lng0) * latAdj * M, z: -(p.lat - lat0) * M }));
    let ext = 1;
    raw.forEach((p) => { ext = Math.max(ext, Math.abs(p.x), Math.abs(p.z)); });
    const sc = 78 / ext;
    const geo = (la, ln) => ({ x: (ln - lng0) * latAdj * M * sc, z: -(la - lat0) * M * sc });

    const nodes = raw.map((p, i) => ({
      x: p.x * sc, z: p.z * sc, item: items[i], terrain: placeTerrain(items[i])
    }));

    const terra = (typeof REGION_TERRAIN !== "undefined" && REGION_TERRAIN[region.id]) || {};
    const water = [], shores = [];
    for (const w of (terra.water || [])) {
      if (w.type === "river") {
        const c = w.center.map(([la, ln]) => geo(la, ln));
        const hw = (w.width / 2) * sc;
        const left = [], right = [];
        for (let i = 0; i < c.length; i++) {
          const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
          let dx = b.x - a.x, dz = b.z - a.z;
          const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          left.push({ x: c[i].x - dz * hw, z: c[i].z + dx * hw });
          right.push({ x: c[i].x + dz * hw, z: c[i].z - dx * hw });
        }
        water.push({ ring: left.concat(right.slice().reverse()), kind: "river" });
        shores.push({ pts: left, kind: "river" }, { pts: right, kind: "river" });
      } else if (w.type === "island") {
        const ring = w.ring.map(([la, ln]) => geo(la, ln));
        water.push({ ring, island: true, kind: "sea" });
        shores.push({ pts: ring.concat([ring[0]]), kind: "sea" });
      } else {
        const ring = w.ring.map(([la, ln]) => geo(la, ln));
        water.push({ ring, kind: w.type });
        shores.push({ pts: ring.slice(0, w.coast || ring.length), kind: w.type });
      }
    }
    const isWater = (x, z) => {
      for (const w of water) {
        if (w.island) { if (!pointInPoly(x, z, w.ring)) return true; }
        else if (pointInPoly(x, z, w.ring)) return true;
      }
      return false;
    };
    const shoreDist = (x, z) => {
      let best = Infinity;
      for (const sh of shores) {
        const q = sh.pts;
        for (let i = 0; i < q.length - 1; i++) {
          const d = segDist(x, z, q[i], q[i + 1]);
          if (d < best) best = d;
        }
      }
      return best;
    };

    const hills = (terra.hills || []).map((h) => {
      const g = geo(h.lat, h.lng);
      return {
        x: g.x, z: g.z, name: h.name,
        r: Math.max(16, Math.min(130, h.r * sc)),
        h: 10 + 26 * Math.min(1, Math.sqrt(h.h / 1900))
      };
    }).filter((h) => {
      if (Math.hypot(h.x, h.z) > 760) return false;
      if (h.r > 46) for (const n of nodes)
        if (Math.hypot(h.x - n.x, h.z - n.z) < h.r * 0.8) return false;
      return true;
    });
    const groundY = (x, z) => {
      let y = 0;
      for (const h of hills) {
        const d = Math.hypot(x - h.x, z - h.z);
        if (d < h.r) {
          const t = 1 - d / h.r;
          y = Math.max(y, h.h * t * t * (3 - 2 * t));     /* 부드러운 능선 */
        }
      }
      return y;
    };

    const rand = seededRand(region.id + "|" + dayIndex);
    let minGap = Infinity;
    for (let i = 0; i < nodes.length - 1; i++)
      minGap = Math.min(minGap, Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));
    const lmk = Math.max(0.5, Math.min(0.92, (isFinite(minGap) ? minGap : 30) / 30));
    const gridRot = (rand() - 0.5) * 0.9;

    nodes.forEach((n, i) => {
      const a = nodes[i - 1] || n, b = nodes[i + 1] || n;
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      n.lx = n.x - dz * 11.5 * lmk;
      n.lz = n.z + dx * 11.5 * lmk;
      const opts = LANDMARK_BY_TERRAIN[n.terrain] || LANDMARK_BY_CAT[n.item.cat] || ["hall"];
      n.kind = opts[Math.floor(rand() * opts.length)];
      const trad = n.kind === "hanok" || n.kind === "pavilion" || n.kind === "hall";
      n.col = trad ? pal.hanok[Math.floor(rand() * pal.hanok.length)]
                   : pal.walls[Math.floor(rand() * pal.walls.length)];
      n.roofCol = trad ? pal.tile : pal.roofs[Math.floor(rand() * pal.roofs.length)];
      n.gy = groundY(n.x, n.z);
      n.lgy = groundY(n.lx, n.lz);
    });

    /* 도로 */
    const co = Math.cos(gridRot), si = Math.sin(gridRot);
    const toW = (u, v) => ({ x: u * co - v * si, z: u * si + v * co });
    const half = 112, cell = 15.5, roads = [];
    for (let g = -half; g <= half; g += cell) {
      for (let t = -half; t < half; t += cell) {
        for (const seg of [[g, t, g, t + cell], [t, g, t + cell, g]]) {
          const a = toW(seg[0], seg[1]), b = toW(seg[2], seg[3]);
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          if (Math.hypot(mx, mz) > half) continue;
          if (isWater(mx, mz)) continue;
          let steep = false;
          for (const h of hills) if (Math.hypot(mx - h.x, mz - h.z) < h.r * 0.72) { steep = true; break; }
          if (steep) continue;
          roads.push({ a, b });
        }
      }
    }

    /* 건물 */
    const buildings = [], props = [];
    const nearNode = (x, z) => {
      let best = nodes[0], bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(x - n.x, z - n.z);
        if (d < bd) { bd = d; best = n; }
      }
      return { n: best, d: bd };
    };
    for (let gu = -half; gu <= half; gu += cell) {
      for (let gv = -half; gv <= half; gv += cell) {
        for (let k = 0; k < 2; k++) {
          const base = toW(gu + (rand() - 0.2) * cell * 0.7, gv + (rand() - 0.2) * cell * 0.7);
          const bx = base.x, bz = base.z, rad = Math.hypot(bx, bz);
          if (rad > half) continue;
          if (isWater(bx, bz)) continue;
          const sd = shores.length ? shoreDist(bx, bz) : 999;
          if (sd < 9) continue;
          let onHill = false;
          for (const h of hills) if (Math.hypot(bx - h.x, bz - h.z) < h.r * 0.72) { onHill = true; break; }
          if (onHill) continue;
          const near = nearNode(bx, bz);
          if (near.d < 13 + 8 * lmk) continue;
          if (Math.hypot(bx - near.n.lx, bz - near.n.lz) < 8 + 10 * lmk) continue;
          let onRoute = false;
          for (let i = 0; i < nodes.length - 1 && !onRoute; i++)
            if (segDist(bx, bz, nodes[i], nodes[i + 1]) < 9) onRoute = true;
          if (onRoute) continue;
          let tooClose = false;
          for (const b2 of buildings)
            if (Math.hypot(bx - b2.x, bz - b2.z) < 8) { tooClose = true; break; }
          if (tooClose) continue;
          if (rand() < 0.12 + 0.3 * (rad / half)) continue;

          const ctx2 = near.n.terrain, core = 1 - Math.min(1, rad / half);
          let kinds;
          if (ctx2 === "beach" || ctx2 === "port")
            kinds = sd < 34 ? ["lowrise", "gable", "shop", "villa"] : ["block", "lowrise", "gable", "shop", "slab"];
          else if (ctx2 === "heritage") kinds = ["hanok", "hanok", "lowrise", "shop", "block"];
          else if (ctx2 === "mountain" || ctx2 === "park") kinds = ["villa", "gable", "lowrise", "hanok"];
          else if (ctx2 === "market") kinds = ["shop", "shop", "lowrise", "block"];
          else kinds = ["block", "slab", "tower", "lowrise", "block", "shop"];
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
            default: h = 4.6 + rand() * 2.6;
          }
          if (ctx2 === "beach" || ctx2 === "port") h = Math.min(h, sd < 40 ? 9 + rand() * 7 : 15 + rand() * 9);
          if (ctx2 === "heritage" || ctx2 === "park" || ctx2 === "mountain") h = Math.min(h, 13 + rand() * 7);

          const isHanok = kind === "hanok";
          buildings.push({
            x: bx, z: bz, w, d, h, kind, gy: groundY(bx, bz),
            rot: gridRot + (rand() - 0.5) * (rand() < 0.16 ? 1.4 : 0.14),
            col: isHanok ? pal.hanok[Math.floor(rand() * pal.hanok.length)]
                         : pal.walls[Math.floor(rand() * pal.walls.length)],
            roofCol: isHanok ? pal.tile : pal.roofs[Math.floor(rand() * pal.roofs.length)],
            awning: pal.awning[Math.floor(rand() * pal.awning.length)],
            uo: rand() * 4, vo: rand() * 4,
            antenna: kind === "tower" && rand() < 0.5
          });
        }
      }
    }

    /* 소품 */
    const addProp = (o) => { o.y = o.y !== undefined ? o.y : groundY(o.x, o.z); props.push(o); };
    for (const hl of hills) {
      const n = Math.min(40, Math.round(hl.r / 4.5));
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, rr = hl.r * (0.25 + rand() * 0.72);
        const tx = hl.x + Math.cos(a) * rr, tz = hl.z + Math.sin(a) * rr;
        if (Math.hypot(tx, tz) > half + 220) continue;
        addProp({ kind: "tree", x: tx, z: tz, rot: rand() * 6.2, s: 0.9 + rand() * 0.8 });
      }
    }
    if (shores.length) {
      for (let i = 0; i < 260; i++) {
        const a = rand() * Math.PI * 2, rr = rand() * half;
        const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
        const w8 = isWater(px, pz), sd = shoreDist(px, pz);
        if (w8 && sd > 9 && sd < 75 && rand() < 0.26)
          addProp({ kind: "boat", x: px, z: pz, rot: rand() * 6.2, s: 0.8 + rand() * 0.8, y: 0 });
        else if (!w8 && sd < 8.5 && rand() < 0.45) {
          const near = nearNode(px, pz);
          if (near.d < 64 && (near.n.terrain === "beach" || near.n.terrain === "port"))
            addProp({ kind: rand() < 0.7 ? "parasol" : "rock", x: px, z: pz,
                      rot: rand() * 6.2, s: 0.8 + rand() * 0.6,
                      col: pal.awning[Math.floor(rand() * pal.awning.length)] });
        }
      }
    }
    for (const n of nodes) {
      const put = (kind, count, r0, r1, extra) => {
        for (let i = 0; i < count; i++) {
          const a = rand() * Math.PI * 2, rr = r0 + rand() * (r1 - r0);
          const px = n.x + Math.cos(a) * rr, pz = n.z + Math.sin(a) * rr;
          if (isWater(px, pz) !== (kind === "boat")) continue;
          addProp(Object.assign({ kind, x: px, z: pz, rot: rand() * 6.2,
                                  s: 0.8 + rand() * 0.6 }, extra || {}));
        }
      };
      const t = n.terrain;
      if (t === "park" || t === "heritage") put("tree", 14, 10, 36);
      if (t === "mountain") { put("tree", 12, 12, 38); put("rock", 6, 10, 30); }
      if (t === "beach") put("parasol", 10, 10, 34,
        { col: pal.awning[Math.floor(rand() * pal.awning.length)] });
      if (t === "port") { put("boat", 8, 16, 52, { y: 0 }); put("crate", 6, 9, 24); }
      if (t === "market") put("stall", 12, 8, 28,
        { col: pal.awning[Math.floor(rand() * pal.awning.length)] });
      if (t === "water") put("tree", 9, 12, 34);
      if (t === "urban") put("tree", 6, 11, 28);
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.min(9, Math.floor(L / 20));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        let dx = b.x - a.x, dz = b.z - a.z;
        const LL = Math.hypot(dx, dz) || 1; dx /= LL; dz /= LL;
        for (const side of [-1, 1]) {
          const lx = px - dz * 4.8 * side, lz = pz + dx * 4.8 * side;
          if (isWater(lx, lz)) continue;
          addProp({ kind: "lamp", x: lx, z: lz, rot: 0, s: 1 });
        }
      }
    }

    const cum = [0];
    for (let i = 0; i < nodes.length - 1; i++)
      cum.push(cum[i] + Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z));

    return { region, day, dayIndex, nodes, legs, buildings, props, roads, hills,
             water, shores, cum, half, lmk, gridRot, groundY, isWater, shoreDist, scale: sc };
  }

  const LANDMARK_BY_CAT = {
    spot: ["hall", "hanok", "tower", "pavilion", "dome"],
    food: ["shop", "hanok"], cafe: ["shop", "pavilion"]
  };
  const LANDMARK_BY_TERRAIN = {
    beach: ["pavilion", "shop"], port: ["pier", "shop"],
    mountain: ["tower", "pavilion"], park: ["pavilion", "hanok"],
    market: ["market"], heritage: ["hall", "hanok", "pavilion"], water: ["pavilion"]
  };

  /* ── 월드 메시 조립 ── */
  function addTriN(B, a, b, c, hex, ny, uvk) {
    /* 평면 폴리곤은 위를 향한 앞면이 되도록 와인딩을 맞춘다 */
    const cross2 = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if ((ny > 0) === (cross2 > 0)) { const t = b; b = c; c = t; }
    B.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) B.n.push(0, ny, 0);
    if (uvk) B.u.push(a.x * uvk, a.z * uvk, b.x * uvk, b.z * uvk, c.x * uvk, c.z * uvk);
    else B.u.push(0, 0, 1, 0, 1, 1);
    pushColor(B, hex, 3);
  }
  function addFlatQuad(B, a, b, c, d, y, hex) {
    addTriN(B, V(a.x, y, a.z), V(b.x, y, b.z), V(c.x, y, c.z), hex, 1);
    addTriN(B, V(a.x, y, a.z), V(c.x, y, c.z), V(d.x, y, d.z), hex, 1);
  }
  function addPolygon(B, ring, holes, y, hex, uvk) {
    const contour = ring.map((p) => new THREE.Vector2(p.x, p.z));
    const hs = (holes || []).map((h) => h.map((p) => new THREE.Vector2(p.x, p.z)));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, hs); }
    catch (e) { return; }
    const all = contour.concat.apply(contour, hs);
    for (const f of faces) {
      const a = all[f[0]], b = all[f[1]], c = all[f[2]];
      if (!a || !b || !c) continue;
      addTriN(B, V(a.x, y, a.y), V(b.x, y, b.y), V(c.x, y, c.y), hex, 1, uvk);
    }
  }

  function buildTerrain() {
    const size = 760, base = 20;
    const B = Builder();
    const gy = S.groundY;
    const hcol = pal.hill, htop = pal.hillTop, g0 = pal.ground, g1 = pal.groundAlt;
    const lerpHex = (a, b, t) => {
      const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) |
             ((ab + (bb - ab) * t) | 0);
    };
    /* 평지는 은은한 패치, 비탈은 산색, 높은 곳은 능선색 */
    const colAt = (x, z, y) => {
      if (y > 0.5) return lerpHex(hcol, htop, Math.min(1, y / 26));
      const n = (Math.sin(x * 0.031) + Math.sin(z * 0.027) + Math.sin((x + z) * 0.017)) / 3;
      return lerpHex(g0, g1, Math.max(0, Math.min(1, n * 0.5 + 0.5)));
    };
    /* 가까울수록 촘촘하게 — 거리별 LOD */
    const n = Math.round(size / base);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx0 = -size / 2 + i * base, cz0 = -size / 2 + j * base;
        const d = Math.max(Math.abs(cx0 + base / 2), Math.abs(cz0 + base / 2));
        const sub = d < 170 ? 5 : d < 300 ? 2 : 1;
        const st = base / sub;
        for (let a2 = 0; a2 < sub; a2++) {
          for (let b2 = 0; b2 < sub; b2++) {
            const x0 = cx0 + a2 * st, z0 = cz0 + b2 * st;
            const x1 = x0 + st, z1 = z0 + st;
            const y00 = gy(x0, z0), y10 = gy(x1, z0), y11 = gy(x1, z1), y01 = gy(x0, z1);
            const my = (y00 + y10 + y11 + y01) / 4;
            const hex = colAt((x0 + x1) / 2, (z0 + z1) / 2, my);
            addTriRaw(B, V(x0, y00, z0), V(x1, y11, z1), V(x1, y10, z0), hex);
            addTriRaw(B, V(x0, y00, z0), V(x0, y01, z1), V(x1, y11, z1), hex);
          }
        }
      }
    }
    /* 지평선까지 이어지는 바깥 평지 */
    const R = size / 2, F = 1250;
    const skirt = [
      [-F, -F, F, -R], [-F, R, F, F], [-F, -R, -R, R], [R, -R, F, R]
    ];
    for (const [ax, az, bx, bz] of skirt)
      addTriRaw(B, V(ax, 0, az), V(bx, 0, bz), V(bx, 0, az), colAt(ax, az, 0)),
      addTriRaw(B, V(ax, 0, az), V(ax, 0, bz), V(bx, 0, bz), colAt(ax, az, 0));
    const g = toGeometry(B);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildGroundDetail() {
    const B = Builder(), gy = S.groundY;
    /* 모래톱·둔치 */
    for (const sh of S.shores) {
      const hex = sh.kind === "sea" ? pal.sand : pal.bank;
      const wdt = sh.kind === "sea" ? 5.5 : 4;
      const q = sh.pts;
      for (let i = 0; i < q.length - 1; i++) {
        const a = q[i], b = q[i + 1];
        let dx = b.x - a.x, dz = b.z - a.z;
        const L = Math.hypot(dx, dz) || 1;
        if (L > 420) continue;
        dx /= L; dz /= L;
        const nx = -dz * wdt, nz = dx * wdt;
        addFlatQuad(B, { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
                    { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }, 0.05, hex);
      }
    }
    /* 도로 */
    for (const r of S.roads) {
      const a = r.a, b = r.b;
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz * 2.1, nz = dx * 2.1;
      const y = gy((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.07;
      addFlatQuad(B, { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
                  { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }, y, pal.road);
      const cx = -dz * 0.16, cz = dx * 0.16;
      addFlatQuad(B, { x: a.x + cx, z: a.z + cz }, { x: b.x + cx, z: b.z + cz },
                  { x: b.x - cx, z: b.z - cz }, { x: a.x - cx, z: a.z - cz }, y + 0.01, pal.roadLine);
    }
    /* 장소 바닥 원 */
    for (const n of S.nodes) {
      const pts = [];
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        pts.push({ x: n.x + Math.cos(t) * 8.2, z: n.z + Math.sin(t) * 8.2 });
      }
      for (let i = 1; i < 19; i++)
        addTriN(B, V(pts[0].x, n.gy + 0.1, pts[0].z), V(pts[i].x, n.gy + 0.1, pts[i].z),
                V(pts[i + 1].x, n.gy + 0.1, pts[i + 1].z), pal.nodeDisc, 1);
    }
    const mesh = new THREE.Mesh(toGeometry(B),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0,
                                       polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildWater() {
    if (!S.water.length) return null;
    const group = new THREE.Group();
    const ripple = rippleTexture();
    for (const w of S.water) {
      const B = Builder();
      if (w.island) {
        const R = 700;
        addPolygon(B, [{ x: -R, z: -R }, { x: R, z: -R }, { x: R, z: R }, { x: -R, z: R }],
                   [w.ring.slice().reverse()], 0.1, w.kind === "sea" ? pal.sea : pal.lake, 0.05);
      } else {
        addPolygon(B, w.ring, [], 0.1, w.kind === "sea" ? pal.sea : pal.lake, 0.05);
      }
      if (!B.p.length) continue;
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.42, metalness: 0.06,
        normalMap: ripple, normalScale: new THREE.Vector2(0.5, 0.5),
        transparent: true, opacity: 0.95
      });
      waterMats.push(mat);
      const mesh = new THREE.Mesh(toGeometry(B), mat);
      mesh.receiveShadow = false;
      group.add(mesh);
    }
    return group;
  }

  function buildCity() {
    const Bw = Builder(), Bp = Builder();
    for (const b of S.buildings) {
      const g = b.gy;
      const cs = addBox(Bw, b.x, b.z, b.w, b.d, b.rot, g, b.h, b.col,
                        { uo: b.uo, vo: b.vo, topHex: b.roofCol });
      switch (b.kind) {
        case "gable": case "villa":
          addGableRoof(Bp, cs, b.x, b.z, g + b.h, 2.2 + b.w * 0.1, b.roofCol, 0.75); break;
        case "hanok":
          addHipRoof(Bp, cs, b.x, b.z, g + b.h, 2.7, b.roofCol, 2.0); break;
        case "tower":
          addBox(Bp, b.x, b.z, b.w * 0.66, b.d * 0.66, b.rot, g + b.h, 3.2, b.col, { tile: false });
          if (b.antenna)
            addBox(Bp, b.x, b.z, 0.45, 0.45, b.rot, g + b.h + 3.2, 7, b.roofCol, { tile: false });
          break;
        case "block":
          if (b.h > 9)
            addBox(Bp, b.x + 1, b.z, b.w * 0.3, b.d * 0.3, b.rot, g + b.h, 1.7, b.roofCol, { tile: false });
          break;
        case "shop": {
          const c = Math.cos(b.rot), s = Math.sin(b.rot);
          addBox(Bp, b.x + s * (b.d / 2 + 1.1), b.z - c * (b.d / 2 + 1.1),
                 b.w * 1.05, 2.3, b.rot, g + 2.9, 0.45, b.awning, { tile: false });
          break;
        }
        case "lowrise":
          addBox(Bp, b.x, b.z, b.w * 1.03, b.d * 1.03, b.rot, g + b.h, 0.5, b.roofCol, { tile: false });
          break;
      }
    }
    for (const n of S.nodes) addLandmark(Bp, n, S.lmk);
    for (const p of S.props) addPropGeom(Bp, p);

    const wallTex = wallTexture(pal.dark);
    wallTex.repeat.set(1, 1);
    const cityMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: wallTex, roughness: 0.88, metalness: 0.02
    });
    if (pal.dark) {
      const em = emissiveTexture();
      cityMat.emissiveMap = em;
      cityMat.emissive = new THREE.Color(0xffffff);
      cityMat.emissiveIntensity = 1.0;
    }
    const city = new THREE.Mesh(toGeometry(Bw), cityMat);
    city.castShadow = true;
    city.receiveShadow = true;
    const plain = new THREE.Mesh(toGeometry(Bp),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 }));
    plain.castShadow = true;
    plain.receiveShadow = true;
    const g = new THREE.Group();
    g.add(city, plain);
    return g;
  }

  function addLandmark(B, n, u) {
    const x = n.lx, z = n.lz, rot = S.gridRot, G = n.lgy, col = n.col, rc = n.roofCol;
    const bx = (dx, dz, w, d, y0, h, c) =>
      addBox(B, x + dx * u, z + dz * u, w * u, d * u, rot, G + y0 * u, h * u, c, { tile: false });
    switch (n.kind) {
      case "tower": {
        bx(0, 0, 5, 5, 0, 20, col);
        bx(0, 0, 11, 11, 20, 5, col);
        bx(0, 0, 2.2, 2.2, 25, 12, rc);
        break;
      }
      case "hall": {
        bx(0, 0, 20, 13, 0, 2, col);
        const cs = cornersOf(x, z, 17 * u, 10.5 * u, rot);
        bx(0, 0, 17, 10.5, 2, 7, col);
        addHipRoof(B, cs, x, z, G + 9 * u, 4.6 * u, rc, 2.8 * u);
        break;
      }
      case "hanok": {
        bx(0, 0, 13, 9, 0, 1.4, col);
        const cs = cornersOf(x, z, 11 * u, 7.5 * u, rot);
        bx(0, 0, 11, 7.5, 1.4, 4.6, col);
        addHipRoof(B, cs, x, z, G + 6 * u, 3.4 * u, rc, 2.4 * u);
        break;
      }
      case "pavilion": {
        for (const dx of [-4.4, 4.4]) for (const dz of [-3, 3]) bx(dx, dz, 1.2, 1.2, 0, 6.5, col);
        bx(0, 0, 11, 8, 0, 0.8, col);
        const cs = cornersOf(x, z, 11 * u, 8 * u, rot);
        addHipRoof(B, cs, x, z, G + 6.5 * u, 3.8 * u, rc, 2.2 * u);
        break;
      }
      case "dome": {
        bx(0, 0, 12, 12, 0, 8, col);
        const cs = cornersOf(x, z, 8 * u, 8 * u, rot);
        addHipRoof(B, cs, x, z, G + 8 * u, 7 * u, rc, 1.2 * u);
        break;
      }
      case "pier": {
        bx(0, 0, 6, 16, 0, 1.2, col);
        bx(0, -7, 7, 6, 1.2, 4.2, col);
        const cs = cornersOf(x, z - 7 * u, 7 * u, 6 * u, rot);
        addGableRoof(B, cs, x, z - 7 * u, G + 5.4 * u, 2.2 * u, rc, 0.8 * u);
        for (const dz of [-2, 2, 6]) bx(2.6, dz, 0.7, 0.7, -1, 2, rc);
        break;
      }
      case "market": {
        for (let i = -1; i <= 1; i++) {
          bx(i * 5, 0, 4.2, 9, 0, 2.6, col);
          bx(i * 5, 0, 5, 10, 2.6, 0.5, pal.awning[(i + 1) % pal.awning.length]);
        }
        break;
      }
      default: {
        bx(0, 0, 10, 8, 0, 6.5, col);
        bx(0, 4.6, 10.6, 1.6, 4.2, 0.9, rc);
        const cs = cornersOf(x, z, 10 * u, 8 * u, rot);
        addGableRoof(B, cs, x, z, G + 6.5 * u, 2.4 * u, rc, 1.1 * u);
      }
    }
  }

  function addPropGeom(B, p) {
    const y = p.y || 0, s = p.s || 1;
    switch (p.kind) {
      case "tree":
        addBox(B, p.x, p.z, 0.7 * s, 0.7 * s, p.rot, y, 2.6 * s, pal.trunk, { tile: false });
        addCone(B, p.x, p.z, 2.4 * s, y + 1.9 * s, 4.6 * s, pal.foliage, 7, p.rot);
        addCone(B, p.x, p.z, 1.6 * s, y + 4.6 * s, 3.4 * s, pal.foliage2, 7, p.rot + 0.5);
        break;
      case "parasol":
        addBox(B, p.x, p.z, 0.3, 0.3, 0, y, 3.1, pal.trunk, { tile: false });
        addCone(B, p.x, p.z, 2.0 * s, y + 2.7, 1.3, p.col || pal.awning[0], 8, p.rot);
        break;
      case "boat":
        addBox(B, p.x, p.z, 2.3 * s, 5.8 * s, p.rot, 0.15, 1.3 * s, pal.car, { tile: false });
        addBox(B, p.x - Math.sin(p.rot) * 0.7 * s, p.z + Math.cos(p.rot) * 0.7 * s,
               1.5 * s, 1.9 * s, p.rot, 1.45 * s, 1.2 * s, pal.carDark, { tile: false });
        break;
      case "stall":
        addBox(B, p.x, p.z, 3.4 * s, 2.6 * s, p.rot, y, 2.3, pal.walls[1], { tile: false });
        addBox(B, p.x, p.z, 4.3 * s, 3.5 * s, p.rot, y + 2.3, 0.45,
               p.col || pal.awning[0], { tile: false });
        break;
      case "crate":
        addBox(B, p.x, p.z, 1.7 * s, 1.7 * s, p.rot, y, 1.5 * s, pal.awning[2], { tile: false });
        break;
      case "rock":
        addCone(B, p.x, p.z, 2 * s, y, 1.8 * s, pal.hill, 5, p.rot);
        break;
      case "lamp":
        addBox(B, p.x, p.z, 0.3, 0.3, 0, y, 5.6, pal.dim, { tile: false });
        addBox(B, p.x, p.z, 0.52, 0.52, 0, y + 5.6, 0.3, pal.lampGlow, { tile: false });
        break;
    }
  }

  /* ── 여행자: 관절이 움직이는 캐릭터 + 차 ── */
  function mkBox(w, h, d, hex, rough) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: hex, roughness: rough === undefined ? 0.75 : rough }));
    m.castShadow = true;
    return m;
  }
  function buildHero() {
    const root = new THREE.Group();

    /* 사람 */
    const person = new THREE.Group();
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(0.42, 1.75, 0);
    legR.position.set(-0.42, 1.75, 0);
    const legGeo = () => {
      const m = mkBox(0.52, 1.7, 0.56, pal.pants);
      m.position.y = -0.85;
      return m;
    };
    legL.add(legGeo()); legR.add(legGeo());
    const shoeL = mkBox(0.56, 0.3, 0.86, pal.hair); shoeL.position.set(0, -1.6, 0.14); legL.add(shoeL);
    const shoeR = mkBox(0.56, 0.3, 0.86, pal.hair); shoeR.position.set(0, -1.6, 0.14); legR.add(shoeR);

    const torso = mkBox(1.36, 1.65, 0.82, pal.shirt);
    torso.position.y = 2.6;
    const pack = mkBox(1.0, 1.15, 0.5, pal.pack);
    pack.position.set(0, 2.62, 0.64);
    const packTop = mkBox(0.96, 0.22, 0.46, pal.hair);
    packTop.position.set(0, 3.26, 0.64);

    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(0.86, 3.22, 0);
    armR.position.set(-0.86, 3.22, 0);
    const armGeo = () => {
      const m = mkBox(0.4, 1.5, 0.44, pal.shirt);
      m.position.y = -0.72;
      return m;
    };
    armL.add(armGeo()); armR.add(armGeo());
    const handL = mkBox(0.42, 0.4, 0.46, pal.skin); handL.position.y = -1.6; armL.add(handL);
    const handR = mkBox(0.42, 0.4, 0.46, pal.skin); handR.position.y = -1.6; armR.add(handR);

    const neck = mkBox(0.42, 0.26, 0.42, pal.skin); neck.position.y = 3.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16),
      new THREE.MeshStandardMaterial({ color: pal.skin, roughness: 0.8 }));
    head.position.y = 3.95;
    head.castShadow = true;
    const capCrown = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.7 }));
    capCrown.position.y = 3.98;
    capCrown.castShadow = true;
    const brim = mkBox(0.96, 0.1, 0.5, pal.accent);
    brim.position.set(0, 3.96, -0.42);

    person.add(legL, legR, torso, pack, packTop, armL, armR, neck, head, capCrown, brim);
    person.userData = { legL, legR, armL, armR, torso, head };

    /* 차 */
    const car = new THREE.Group();
    const body = mkBox(4.3, 1.5, 8.0, pal.car, 0.45);
    body.position.y = 1.5;
    const skirt = mkBox(4.0, 0.6, 7.4, pal.carDark, 0.6);
    skirt.position.y = 0.85;
    const hoodF = mkBox(3.9, 0.7, 2.2, pal.car, 0.45);
    hoodF.position.set(0, 2.3, -2.7);
    const cabin = mkBox(3.6, 1.4, 3.6, pal.carDark, 0.3);
    cabin.position.set(0, 2.9, 0.5);
    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.7, 18);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.85 });
    for (const wx of [-2.1, 2.1]) for (const wz of [-2.5, 2.6]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.95, wz);
      w.castShadow = true;
      car.add(w);
      wheels.push(w);
    }
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d0, emissive: new THREE.Color(0xffe9b0),
      emissiveIntensity: pal.dark ? 1.6 : 0.35, roughness: 0.3
    });
    for (const lx of [-1.4, 1.4]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.2), lampMat);
      l.position.set(lx, 2.2, -3.85);
      car.add(l);
    }
    car.add(body, skirt, hoodF, cabin);
    car.userData = { wheels };

    root.add(person, car);
    root.scale.setScalar(1.45);
    root.userData = { person, car };
    return root;
  }

  /* ── 동선 리본 ── */
  function buildRoute() {
    const gy = S.groundY, nodes = S.nodes;
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(2, Math.ceil(L / 2.2));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        pts.push({
          ax: a.x + (b.x - a.x) * t0, az: a.z + (b.z - a.z) * t0,
          bx: a.x + (b.x - a.x) * t1, bz: a.z + (b.z - a.z) * t1,
          d0: S.cum[i] + L * t0, d1: S.cum[i] + L * t1
        });
      }
    }
    const mk = (width, y, hex) => {
      const B = Builder();
      for (const sgm of pts) {
        let dx = sgm.bx - sgm.ax, dz = sgm.bz - sgm.az;
        const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz * width, nz = dx * width;
        const ya = gy(sgm.ax, sgm.az) + y, yb = gy(sgm.bx, sgm.bz) + y;
        addTriN(B, V(sgm.ax + nx, ya, sgm.az + nz), V(sgm.bx + nx, yb, sgm.bz + nz),
                V(sgm.bx - nx, yb, sgm.bz - nz), hex, 1);
        addTriN(B, V(sgm.ax + nx, ya, sgm.az + nz), V(sgm.bx - nx, yb, sgm.bz - nz),
                V(sgm.ax - nx, ya, sgm.az - nz), hex, 1);
      }
      const mesh = new THREE.Mesh(toGeometry(B), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.6, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -4
      }));
      return mesh;
    };
    routeSegs = pts.length;
    const rest = mk(1.9, 0.14, pal.dim);
    const done = mk(2.5, 0.17, pal.accent);
    done.geometry.setDrawRange(0, 0);
    routeDone = done;
    const g = new THREE.Group();
    g.add(rest, done);
    return g;
  }
  function updateRouteProgress() {
    if (!routeDone) return;
    const total = S.cum[S.cum.length - 1] || 1;
    const n = Math.round(routeSegs * Math.min(1, tour.dist / total));
    routeDone.geometry.setDrawRange(0, n * 6);
  }

  /* ── 핀 ── */
  function pinTexture(node, idx) {
    const SZ = 256, c = document.createElement("canvas");
    c.width = SZ; c.height = SZ;
    const g = c.getContext("2d");
    const catHex = pal.cat[node.item.cat] || pal.cat.spot;
    const col = "#" + catHex.toString(16).padStart(6, "0");
    const cx = SZ / 2, cy = 92, r = 54;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowBlur = 12;
    g.shadowOffsetY = 4;
    g.beginPath();
    g.moveTo(cx, cy + r * 1.75);
    g.lineTo(cx - r * 0.5, cy + r * 0.72);
    g.lineTo(cx + r * 0.5, cy + r * 0.72);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.restore();
    g.lineWidth = 6;
    g.strokeStyle = pal.halo;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = pal.halo;
    g.font = "700 54px 'Noto Sans KR', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(idx + 1), cx, cy + 3);
    const label = node.item.name;
    g.font = "700 30px 'Noto Sans KR', sans-serif";
    const tw = g.measureText(label).width;
    const bw = Math.min(SZ - 8, tw + 26);
    g.fillStyle = pal.halo;
    roundRect(g, cx - bw / 2, 196, bw, 44, 12);
    g.fill();
    g.fillStyle = pal.text;
    g.fillText(label, cx, 219);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function buildPins() {
    const g = new THREE.Group();
    pinSprites = [];
    S.nodes.forEach((n, i) => {
      const m = new THREE.SpriteMaterial({
        map: pinTexture(n, i), depthTest: false, depthWrite: false, transparent: true
      });
      const sp = new THREE.Sprite(m);
      sp.position.set(n.x, n.gy + 15, n.z);
      sp.center.set(0.5, 0.18);
      sp.renderOrder = 900;
      sp.userData.index = i;
      g.add(sp);
      pinSprites.push(sp);
      const B = Builder();
      addBox(B, n.x, n.z, 0.34, 0.34, 0, n.gy, 15, pal.cat[n.item.cat] || pal.cat.spot, { tile: false });
      const pole = new THREE.Mesh(toGeometry(B),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      g.add(pole);
    });
    return g;
  }

  function buildSky() {
    const geo = new THREE.SphereGeometry(690, 32, 18);
    const pos = geo.attributes.position, cols = [];
    const hx = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    const a = hx(pal.skyBot), b = hx(pal.skyTop);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (pos.getY(i) / 690 + 0.1) / 0.75));
      const e = t * t * (3 - 2 * t);
      cols.push(srgb(a[0] + (b[0] - a[0]) * e), srgb(a[1] + (b[1] - a[1]) * e),
                srgb(a[2] + (b[2] - a[2]) * e));
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = -1;
    return mesh;
  }

  function buildLampGlow() {
    if (!pal.dark) return null;
    const g = new THREE.Group();
    const tex = glowSprite(pal.lampGlow);
    const mat = new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8
    });
    let n = 0;
    for (const p of S.props) {
      if (p.kind !== "lamp" || n++ > 90) continue;
      const sp = new THREE.Sprite(mat);
      sp.position.set(p.x, (p.y || 0) + 5.9, p.z);
      sp.scale.set(7, 7, 1);
      g.add(sp);
    }
    return g;
  }

  /* ── 월드 생성 ── */
  function buildWorld() {
    if (worldGroup) {
      worldGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => {
            ["map", "emissiveMap", "normalMap"].forEach((k) => { if (m[k]) m[k].dispose(); });
            m.dispose();
          });
        }
      });
      scene3.remove(worldGroup);
    }
    waterMats = [];
    worldGroup = new THREE.Group();
    worldGroup.add(buildTerrain());
    worldGroup.add(buildGroundDetail());
    const w = buildWater();
    if (w) worldGroup.add(w);
    worldGroup.add(buildRoute());
    worldGroup.add(buildCity());
    worldGroup.add(buildPins());
    const lg = buildLampGlow();
    if (lg) worldGroup.add(lg);
    hero = buildHero();
    worldGroup.add(hero);
    scene3.add(worldGroup);
  }

  /* ── 투어 ── */
  const STAY_MS = 1600, MIN_MOVE = 1400, MAX_MOVE = 4400;
  function legDuration(i) {
    const leg = S.legs[i];
    return Math.max(MIN_MOVE, Math.min(MAX_MOVE, (leg ? leg.min : 15) * 95));
  }
  function setPosFromDist(d) {
    const cum = S.cum, N = S.nodes.length;
    if (d <= 0) { tour.pos = { x: S.nodes[0].x, z: S.nodes[0].z }; return; }
    if (d >= cum[N - 1]) { tour.pos = { x: S.nodes[N - 1].x, z: S.nodes[N - 1].z }; return; }
    let i = 0;
    while (i < N - 2 && cum[i + 1] < d) i++;
    const a = S.nodes[i], b = S.nodes[i + 1];
    const t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
    tour.pos = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    tour.heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  function advance(dt) {
    tour.clock += dt / 1000;
    if (!tour.playing) return;
    const N = S.nodes.length;
    tour.phase += dt * tour.speed;
    if (tour.mode === "stay") {
      if (tour.phase >= STAY_MS) {
        if (tour.nodeIndex >= N - 1) {
          tour.playing = false; tour.finished = true;
          syncControls(); showCard(null); syncStatus();
          return;
        }
        tour.mode = "move"; tour.phase = 0; tour.legIndex = tour.nodeIndex;
        tour.walk = S.legs[tour.legIndex] && S.legs[tour.legIndex].mode === "walk";
        showCard(null); syncStatus();
      }
    } else {
      const dur = legDuration(tour.legIndex);
      const t = Math.min(1, tour.phase / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const d0 = S.cum[tour.legIndex], d1 = S.cum[tour.legIndex + 1];
      tour.speedNow = Math.abs(d1 - d0) / (dur / 1000);
      tour.dist = d0 + (d1 - d0) * e;
      setPosFromDist(tour.dist);
      if (t >= 1) {
        tour.mode = "stay"; tour.phase = 0; tour.nodeIndex = tour.legIndex + 1;
        tour.dist = S.cum[tour.nodeIndex];
        showCard(S.nodes[tour.nodeIndex].item, tour.nodeIndex);
        syncStatus();
      }
    }
    updateProgress();
    updateRouteProgress();
  }

  function updateHero(dt) {
    if (!hero) return;
    const g = S.groundY(tour.pos.x, tour.pos.z);
    hero.position.set(tour.pos.x, g, tour.pos.z);
    hero.rotation.y = tour.heading;
    const person = hero.userData.person, car = hero.userData.car;
    const moving = tour.mode === "move";
    const driving = moving && !tour.walk;
    car.visible = driving;
    const u = person.userData;
    if (driving) {
      person.position.set(0, 1.35, 0.9);
      person.scale.setScalar(0.82);
      u.legL.rotation.x = -1.35; u.legR.rotation.x = -1.35;
      u.armL.rotation.x = -1.15; u.armR.rotation.x = -1.15;
      u.armL.rotation.z = 0.2; u.armR.rotation.z = -0.2;
      const spin = (tour.speedNow || 8) * dt / 1000 / 0.95;
      car.userData.wheels.forEach((w) => { w.rotation.x -= spin; });
    } else {
      person.position.set(0, 0, 0);
      person.scale.setScalar(1);
      u.armL.rotation.z = 0; u.armR.rotation.z = 0;
      if (moving) {
        const f = tour.clock * 7.5;
        u.legL.rotation.x = Math.sin(f) * 0.72;
        u.legR.rotation.x = -Math.sin(f) * 0.72;
        u.armL.rotation.x = -Math.sin(f) * 0.6;
        u.armR.rotation.x = Math.sin(f) * 0.6;
        person.position.y = Math.abs(Math.cos(f)) * 0.14;
        u.torso.rotation.x = 0.07;
      } else {
        const idle = Math.sin(tour.clock * 1.7) * 0.05;
        u.legL.rotation.x = 0; u.legR.rotation.x = 0;
        u.armL.rotation.x = idle; u.armR.rotation.x = -idle;
        u.torso.rotation.x = 0;
        person.position.y = Math.sin(tour.clock * 1.7) * 0.05;
        hero.rotation.y = tour.heading + Math.sin(tour.clock * 0.5) * 0.35;
      }
    }
  }

  /* ── 카메라 ── */
  function moveCamera(dt) {
    const sp = (cam.dist * 0.0085) * (dt / 16);
    let mx = 0, mz = 0;
    if (keys.w || keys.arrowup) mz += 1;
    if (keys.s || keys.arrowdown) mz -= 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    mx += nudge.x; mz += nudge.z;
    if (!mx && !mz) return false;
    const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.target.x += (fx * mz + rx * mx) * sp;
    cam.target.z += (fz * mz + rz * mx) * sp;
    const lim = S.half + 30;
    cam.target.x = Math.max(-lim, Math.min(lim, cam.target.x));
    cam.target.z = Math.max(-lim, Math.min(lim, cam.target.z));
    return true;
  }
  function updateCam(dt) {
    if (moveCamera(dt) && cam.follow) setFollow(false);
    if (cam.follow) {
      const k = Math.min(1, dt / 240);
      cam.target.x += (tour.pos.x - cam.target.x) * k;
      cam.target.z += (tour.pos.z - cam.target.z) * k;
      if (!cam.manual) {
        const want = tour.mode === "move" ? tour.heading + Math.PI
          : tour.heading + Math.PI + Math.sin(tour.clock * 0.22) * 0.6;
        let diff = want - cam.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cam.yaw += diff * Math.min(1, dt / 900);
        const wd = tour.mode === "move" ? 86 : 62;
        const wp = tour.mode === "move" ? 0.38 : 0.46;
        cam.dist += (wd - cam.dist) * Math.min(1, dt / 1200);
        cam.pitch += (wp - cam.pitch) * Math.min(1, dt / 1200);
      }
    }
    const ty = S.groundY(cam.target.x, cam.target.z) + 5;
    cam.target.y += (ty - cam.target.y) * Math.min(1, dt / 300);
    const cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    const ex = cam.target.x + cam.dist * cp * Math.sin(cam.yaw);
    const ez = cam.target.z + cam.dist * cp * Math.cos(cam.yaw);
    let ey = cam.target.y + cam.dist * sp2;
    /* 시선이 능선에 가리면 눈높이를 끌어올린다 */
    for (let t = 0.15; t <= 1.001; t += 0.15) {
      const px = cam.target.x + (ex - cam.target.x) * t;
      const pz = cam.target.z + (ez - cam.target.z) * t;
      const need = S.groundY(px, pz) + 7;
      const rayY = cam.target.y + (ey - cam.target.y) * t;
      if (rayY < need) ey = cam.target.y + (need - cam.target.y) / t;
    }
    camera.position.set(ex, ey, ez);
    camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    if (sun) {
      sun.position.set(cam.target.x - 90, 150, cam.target.z - 70);
      sun.target.position.set(cam.target.x, 0, cam.target.z);
      sun.target.updateMatrixWorld();
    }
  }

  function frame(ts) {
    const dt = Math.min(64, lastTs ? ts - lastTs : 16);
    lastTs = ts;
    advance(dt);
    updateHero(dt);
    updateCam(dt);
    for (const m of waterMats)
      if (m.normalMap) { m.normalMap.offset.x = tour.clock * 0.012; m.normalMap.offset.y = tour.clock * 0.02; }
    const camDist = (o) => o.position.distanceTo(camera.position);
    for (const sp of pinSprites) {
      const s = Math.max(0.5, Math.min(60, camDist(sp) * 0.095));
      sp.scale.set(s, s, 1);
    }
    renderer.render(scene3, camera);
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
      statusEl.textContent = `일정 완주 · 총 이동 ${S.legs.reduce((s, l) => s + l.min, 0)}분`;
    } else if (tour.mode === "stay") {
      const it = S.nodes[tour.nodeIndex].item;
      statusEl.textContent = `${tour.nodeIndex + 1}. ${it.name} 도착 · 약 ${it.stay}분 머무름`;
    } else {
      const a = S.nodes[tour.legIndex].item, b = S.nodes[tour.legIndex + 1].item;
      const leg = S.legs[tour.legIndex];
      const dist = leg.km < 1 ? `${Math.round(leg.km * 1000)}m` : `${leg.km.toFixed(1)}km`;
      statusEl.textContent =
        `${a.name} → ${b.name} · ${leg.mode === "walk" ? "도보" : "차량"} ${leg.min}분 (${dist})`;
    }
  }
  function showCard(item, idx) {
    if (!cardEl) return;
    if (!item) {
      if (tour.finished) {
        const total = S.legs.reduce((s, l) => s + l.min, 0);
        const km = S.legs.reduce((s, l) => s + l.km, 0);
        cardEl.innerHTML = `<div class="m3-card-top"><b>일정 완주</b></div>
          <p class="m3-card-desc">방문 ${S.nodes.length}곳 · 총 이동 ${total}분 · ${km.toFixed(1)}km</p>`;
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
    const total = S.cum[S.cum.length - 1] || 1;
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
    tour.heading = S.nodes.length > 1
      ? Math.atan2(S.nodes[1].x - S.nodes[0].x, S.nodes[1].z - S.nodes[0].z) : 0;
    cam.target = { x: tour.pos.x, y: S.nodes[0].gy + 5, z: tour.pos.z };
    cam.yaw = tour.heading + Math.PI;
    cam.follow = true;
    showCard(S.nodes[0].item, 0);
    syncStatus(); syncControls(); updateProgress(); updateRouteProgress();
  }
  function seekTo(p) {
    const total = S.cum[S.cum.length - 1] || 1, d = total * p;
    let i = 0;
    while (i < S.nodes.length - 2 && S.cum[i + 1] < d) i++;
    tour.finished = false; tour.dist = d;
    setPosFromDist(d);
    if (Math.abs(d - S.cum[i]) < 0.5) {
      tour.mode = "stay"; tour.nodeIndex = i; tour.phase = 0;
      showCard(S.nodes[i].item, i);
    } else {
      tour.mode = "move"; tour.legIndex = i; tour.nodeIndex = i;
      tour.walk = S.legs[i] && S.legs[i].mode === "walk";
      tour.phase = legDuration(i) * ((d - S.cum[i]) / (S.cum[i + 1] - S.cum[i] || 1));
      showCard(null);
    }
    syncStatus(); updateProgress(); updateRouteProgress();
  }
  function jumpToNode(i) {
    seekTo(S.cum[i] / (S.cum[S.cum.length - 1] || 1));
    cam.target.x = S.nodes[i].x;
    cam.target.z = S.nodes[i].z;
    tour.playing = false;
    syncControls();
  }

  /* ── 입력 ── */
  function pickPin(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointerNDC.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(pinSprites, false);
    return hits.length ? hits[0].object.userData.index : null;
  }
  function bindInput() {
    const el = renderer.domElement;
    const onDown = (e) => {
      const t = e.touches ? e.touches[0] : e;
      drag = { x: t.clientX, y: t.clientY };
      dragMoved = 0;
      if (e.touches && e.touches.length === 2)
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                               e.touches[0].clientY - e.touches[1].clientY);
    };
    const onMove = (e) => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist) cam.dist = Math.max(16, Math.min(300, cam.dist * (pinchDist / d)));
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
      cam.pitch = Math.max(0.08, Math.min(1.3, cam.pitch + dy * 0.004));
      drag = { x: t.clientX, y: t.clientY };
      syncControls();
      if (e.touches) e.preventDefault();
    };
    const onUp = (e) => {
      if (drag && dragMoved < 6) {
        const t = (e.changedTouches && e.changedTouches[0]) || e;
        const hit = pickPin(t.clientX, t.clientY);
        if (hit !== null) jumpToNode(hit);
      }
      drag = null;
      pinchDist = 0;
    };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("touchstart", onDown, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onUp);
    el.addEventListener("wheel", (e) => {
      cam.dist = Math.max(16, Math.min(300, cam.dist + e.deltaY * 0.08));
      e.preventDefault();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (!overlay || overlay.hidden) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { close(); return; }
      if (k === " ") { e.preventDefault(); playBtn.click(); return; }
      if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k)) { keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

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
      nudge.x = dx / max; nudge.z = -dy / max;
      e.preventDefault();
    };
    const sEnd = () => {
      sActive = false; nudge.x = 0; nudge.z = 0;
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
    const r = holder.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(240, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  function ensureDOM() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "m3-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="m3-holder"></div>
      <div class="m3-top">
        <div class="m3-title"></div>
        <button class="m3-close" aria-label="닫기">✕</button>
      </div>
      <div class="m3-status"></div>
      <div class="m3-card" hidden></div>
      <div class="m3-note" hidden></div>
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
    holder = overlay.querySelector(".m3-holder");
    titleEl = overlay.querySelector(".m3-title");
    statusEl = overlay.querySelector(".m3-status");
    cardEl = overlay.querySelector(".m3-card");
    noteEl = overlay.querySelector(".m3-note");
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
  }

  function initGL() {
    if (ready) return true;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.8, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    holder.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    scene3 = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1800);
    raycaster = new THREE.Raycaster();
    pointerNDC = new THREE.Vector2();
    bindInput();
    ready = true;
    return true;
  }

  function setupLights() {
    if (hemi) scene3.remove(hemi);
    if (sun) { scene3.remove(sun); scene3.remove(sun.target); }
    if (skyDome) scene3.remove(skyDome);
    hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGnd, pal.hemiI);
    scene3.add(hemi);
    sun = new THREE.DirectionalLight(pal.sun, pal.sunI);
    sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(mobile ? 1024 : 1536, mobile ? 1024 : 1536);
    sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.6;
    scene3.add(sun, sun.target);
    skyDome = buildSky();
    scene3.add(skyDome);
    scene3.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
  }

  /* ── 공개 API ── */
  function open(region, day, dayIndex) {
    ensureDOM();
    if (!available()) {
      overlay.hidden = false;
      noteEl.hidden = false;
      noteEl.textContent = "이 브라우저에서는 3D 보기를 지원하지 않습니다. 2D 동선 지도를 이용해 주세요.";
      return;
    }
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pal = pickPalette();
    overlay.hidden = false;
    noteEl.hidden = true;
    document.body.style.overflow = "hidden";
    initGL();
    resize();
    setupLights();
    keys = Object.create(null);
    nudge = { x: 0, z: 0 };

    S = makeScene(region, day, dayIndex);
    cam = { yaw: 0, pitch: 0.46, dist: 76, target: { x: 0, y: 6, z: 0 },
            manual: false, follow: true };
    tour = { playing: !reduced, speed: 1, mode: "stay", phase: 0, clock: 0,
             nodeIndex: 0, legIndex: 0, dist: 0, heading: 0, walk: false,
             finished: false, speedNow: 8, pos: { x: S.nodes[0].x, z: S.nodes[0].z } };
    buildWorld();
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
  return { open, close, available };
})();
