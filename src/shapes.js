// 형상 생성기.
// three.js에 의존하지 않는 순수 함수라 Node에서 그대로 테스트된다.
//
// 불변 규칙: 모든 형상은 정확히 같은 개수의 점을 반환한다.
// 입자 i가 형상 A의 i번째 자리에서 형상 B의 i번째 자리로 1:1 대응되어야 한다.

const TAU = Math.PI * 2;

export const FIT_RADIUS = 1.5;
export const DEFAULT_COUNT = 65536;
export const LOW_COUNT = 16384;

// 결정적 난수. 같은 형상은 항상 같은 점 배치를 내놓아야 테스트가 안정적이다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- 공통 후처리 -----------------------------------------------------------

// bbox 중심을 원점으로 옮기고 최대 반경을 FIT_RADIUS로 맞춘다.
// 형상마다 회전축이 어긋나거나 화면 크기가 들쭉날쭉해지는 것을 막는다.
function centerAndFit(pos, n) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;

  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3] - cx, y = pos[i * 3 + 1] - cy, z = pos[i * 3 + 2] - cz;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > maxR) maxR = r;
  }
  const s = maxR > 1e-6 ? FIT_RADIUS / maxR : 1;
  for (let i = 0; i < n * 3; i++) pos[i] *= s;
}

function part1By2(v) {
  v = (v | (v << 16)) & 0x030000ff;
  v = (v | (v << 8)) & 0x0300f00f;
  v = (v | (v << 4)) & 0x030c30c3;
  v = (v | (v << 2)) & 0x09249249;
  return v >>> 0;
}

// 3D z-order 정렬. 두 형상에서 가까운 인덱스가 공간적으로도 가깝게 놓여
// 입자 이동 거리가 짧아지고 이웃 관계가 유지된다.
function mortonSort(pos, n, halfSpan = FIT_RADIUS) {
  const codes = new Float64Array(n);
  const order = new Array(n);
  const span = halfSpan * 2;
  for (let i = 0; i < n; i++) {
    order[i] = i;
    const nx = Math.min(1023, Math.max(0, Math.round(((pos[i * 3] + halfSpan) / span) * 1023)));
    const ny = Math.min(1023, Math.max(0, Math.round(((pos[i * 3 + 1] + halfSpan) / span) * 1023)));
    const nz = Math.min(1023, Math.max(0, Math.round(((pos[i * 3 + 2] + halfSpan) / span) * 1023)));
    codes[i] = part1By2(nx) + part1By2(ny) * 2 + part1By2(nz) * 4;
  }
  order.sort((a, b) => (codes[a] - codes[b]) || (a - b));
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const src = order[i];
    out[i * 3] = pos[src * 3];
    out[i * 3 + 1] = pos[src * 3 + 1];
    out[i * 3 + 2] = pos[src * 3 + 2];
  }
  pos.set(out);
}

function setP(pos, i, x, y, z) {
  pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
}

// 단위 구 위에 고르게 퍼진 방향 벡터들.
function fibonacciDirs(count) {
  const ga = Math.PI * (3 - Math.sqrt(5));
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * ga;
    out.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  return out;
}

// v에 수직인 정규직교 기저 두 개.
function basisFrom(v) {
  const up = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ax = up[1] * v[2] - up[2] * v[1];
  let ay = up[2] * v[0] - up[0] * v[2];
  let az = up[0] * v[1] - up[1] * v[0];
  const l = Math.hypot(ax, ay, az) || 1;
  ax /= l; ay /= l; az /= l;
  const bx = v[1] * az - v[2] * ay;
  const by = v[2] * ax - v[0] * az;
  const bz = v[0] * ay - v[1] * ax;
  return [[ax, ay, az], [bx, by, bz]];
}

// --- 형상 생성기 -----------------------------------------------------------

function genSphere(pos, n) {
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * ga;
    setP(pos, i, Math.cos(phi) * r, y, Math.sin(phi) * r);
  }
}

function genTorus(pos, n, rnd) {
  const R = 1.0, r = 0.4;
  let i = 0, guard = 0;
  while (i < n && guard < n * 40) {
    guard++;
    const u = rnd() * TAU, v = rnd() * TAU;
    // 면적 밀도 보정. 안 하면 안쪽 고리에 점이 뭉친다.
    if (rnd() > (R + r * Math.cos(v)) / (R + r)) continue;
    const rr = R + r * Math.cos(v);
    setP(pos, i, rr * Math.cos(u), r * Math.sin(v), rr * Math.sin(u));
    i++;
  }
  for (; i < n; i++) setP(pos, i, R, 0, 0);
}

function genTorusKnot(pos, n, rnd) {
  const p = 2, q = 3, radius = 1.0, tube = 0.26;
  const curve = (u, out) => {
    const cu = Math.cos(u), su = Math.sin(u);
    const quOverP = (q / p) * u;
    const cs = Math.cos(quOverP);
    out[0] = radius * (2 + cs) * 0.5 * cu;
    out[1] = radius * (2 + cs) * 0.5 * su;
    out[2] = radius * Math.sin(quOverP) * 0.5;
  };
  const P1 = [0, 0, 0], P2 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = rnd() * TAU * p;
    const v = rnd() * TAU;
    curve(u, P1);
    curve(u + 0.01, P2);
    let tx = P2[0] - P1[0], ty = P2[1] - P1[1], tz = P2[2] - P1[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const frame = basisFrom([tx, ty, tz]);
    const N = frame[0], B = frame[1];
    const c = Math.cos(v) * tube, s = Math.sin(v) * tube;
    setP(pos, i,
      P1[0] + N[0] * c + B[0] * s,
      P1[1] + N[1] * c + B[1] * s,
      P1[2] + N[2] * c + B[2] * s);
  }
}

function genHelixStairs(pos, n, rnd) {
  // 각 디딤판은 각도 쐐기(부채꼴)다. 고정 폭 판으로 만들면 안쪽은 겹치고
  // 바깥쪽은 벌어져 계단이 연속 경사로처럼 뭉개진다.
  const steps = 20, turns = 1.35, rise = 2.2;
  const wedge = (TAU * turns) / steps;          // 한 칸이 도는 각도
  const stepUp = rise / steps;                  // 한 칸 높이
  const rIn = 0.32, rOut = 1.12;
  const tread = 0.045;                          // 디딤판 두께

  for (let i = 0; i < n; i++) {
    if (rnd() < 0.14) {
      // 중심 기둥
      const a = rnd() * TAU, rr = rIn * (0.62 + rnd() * 0.06);
      setP(pos, i, Math.cos(a) * rr, -rise / 2 + rnd() * rise, Math.sin(a) * rr);
      continue;
    }

    const k = Math.floor(rnd() * steps);
    const baseY = -rise / 2 + k * stepUp;
    let a, rad, y;

    if (rnd() < 0.74) {
      // 디딤판: 쐐기 안을 채우되 칸 사이에 약간의 틈을 남긴다.
      a = k * wedge + rnd() * wedge * 0.88;
      rad = rIn + rnd() * (rOut - rIn);
      y = baseY + (rnd() < 0.5 ? tread : -tread);
    } else {
      // 챌판: 칸이 시작하는 모서리에 세운 수직면.
      a = k * wedge + rnd() * wedge * 0.04;
      rad = rIn + rnd() * (rOut - rIn);
      y = baseY - rnd() * stepUp;
    }

    setP(pos, i, Math.cos(a) * rad, y, Math.sin(a) * rad);
  }
}

function genBridge(pos, n, rnd) {
  const L = 1.6, deckY = 0.25, archLow = -0.85;
  const archY = (x) => archLow + (deckY - archLow) * (1 - (x / L) * (x / L));
  for (let i = 0; i < n; i++) {
    const kind = rnd();
    if (kind < 0.30) {                       // 상판
      const x = (rnd() * 2 - 1) * L;
      setP(pos, i, x, deckY + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.64);
    } else if (kind < 0.62) {                // 아치 리브 두 줄
      const x = (rnd() * 2 - 1) * L;
      const z = (rnd() < 0.5 ? -1 : 1) * 0.30 + (rnd() - 0.5) * 0.05;
      setP(pos, i, x, archY(x) + (rnd() - 0.5) * 0.06, z);
    } else if (kind < 0.86) {                // 수직 지주
      const x = (rnd() * 2 - 1) * L;
      const t = rnd();
      const z = (rnd() < 0.5 ? -1 : 1) * 0.30;
      setP(pos, i, x + (rnd() - 0.5) * 0.02, archY(x) + (deckY - archY(x)) * t, z);
    } else {                                 // 양끝 교대
      const s = rnd() < 0.5 ? -1 : 1;
      setP(pos, i, s * (L + (rnd() - 0.5) * 0.18), archLow + rnd() * (deckY - archLow + 0.15), (rnd() - 0.5) * 0.7);
    }
  }
}

function genDna(pos, n, rnd) {
  const turns = 3, helixR = 0.5, height = 2.0, rungs = 42;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.55) {                      // 두 가닥 백본
      const strand = rnd() < 0.5 ? 0 : Math.PI;
      const t = rnd();
      const a = t * TAU * turns + strand;
      const y = -height / 2 + t * height;
      setP(pos, i,
        Math.cos(a) * helixR + (rnd() - 0.5) * 0.12,
        y + (rnd() - 0.5) * 0.06,
        Math.sin(a) * helixR + (rnd() - 0.5) * 0.12);
    } else {                                 // 염기쌍 가로대
      const t = (Math.floor(rnd() * rungs) + 0.5) / rungs;
      const a = t * TAU * turns;
      const y = -height / 2 + t * height;
      const u = rnd() * 2 - 1;
      setP(pos, i,
        Math.cos(a) * helixR * u + (rnd() - 0.5) * 0.04,
        y + (rnd() - 0.5) * 0.04,
        Math.sin(a) * helixR * u + (rnd() - 0.5) * 0.04);
    }
  }
}

function genLattice(pos, n, rnd) {
  const g = [-1, -1 / 3, 1 / 3, 1];
  const lines = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const a of g) for (const b of g) lines.push([axis, a, b]);
  }
  for (let i = 0; i < n; i++) {
    const line = lines[Math.floor(rnd() * lines.length)];
    const axis = line[0], a = line[1], b = line[2];
    const t = rnd() * 2 - 1;
    const j = (rnd() - 0.5) * 0.03;
    if (axis === 0) setP(pos, i, t, a + j, b + j);
    else if (axis === 1) setP(pos, i, a + j, t, b + j);
    else setP(pos, i, a + j, b + j, t);
  }
}

function genWave(pos, n, rnd) {
  for (let i = 0; i < n; i++) {
    const r = 1.6 * Math.sqrt(rnd());
    const a = rnd() * TAU;
    const y = 0.55 * Math.sin(r * 4.2) * Math.exp(-r * 0.55);
    setP(pos, i, Math.cos(a) * r, y + (rnd() - 0.5) * 0.03, Math.sin(a) * r);
  }
}

function genVortex(pos, n, rnd) {
  const arms = 3;
  for (let i = 0; i < n; i++) {
    const t = rnd();
    const rad = 0.12 + 1.35 * Math.pow(t, 1.4);
    const y = -1.0 + t * 2.0;
    const arm = Math.floor(rnd() * arms);
    const a = (arm / arms) * TAU + t * TAU * 2.2 + (rnd() - 0.5) * 0.55;
    setP(pos, i, Math.cos(a) * rad, y + (rnd() - 0.5) * 0.05, Math.sin(a) * rad);
  }
}

function genSpikeBall(pos, n, rnd) {
  const dirs = fibonacciDirs(26);
  const frames = dirs.map(basisFrom);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.55) {                      // 본체 구
      const x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      setP(pos, i, (x / l) * 0.72, (y / l) * 0.72, (z / l) * 0.72);
    } else {                                 // 가시(원뿔)
      const k = Math.floor(rnd() * dirs.length);
      const d = dirs[k], u = frames[k][0], v = frames[k][1];
      const t = rnd();
      const along = 0.72 + t * 0.80;
      const rr = 0.20 * (1 - t);
      const a = rnd() * TAU;
      const c = Math.cos(a) * rr, s = Math.sin(a) * rr;
      setP(pos, i,
        d[0] * along + u[0] * c + v[0] * s,
        d[1] * along + u[1] * c + v[1] * s,
        d[2] * along + u[2] * c + v[2] * s);
    }
  }
}

// --- 공개 API --------------------------------------------------------------

const GENERATORS = {
  sphere: genSphere,
  torus: genTorus,
  knot: genTorusKnot,
  stairs: genHelixStairs,
  bridge: genBridge,
  dna: genDna,
  lattice: genLattice,
  wave: genWave,
  vortex: genVortex,
  spikeball: genSpikeBall,
};

// realSize: 이 형상이 "현실에서 몇 미터짜리인가". 월드 좌표를 바꾸지 않는다.
//
// 형상은 전부 반경 1.5로 정규화된 채로 두고, 옆에 세우는 사람 실루엣의
// 크기만 이 값으로 정한다. 눈이 인지하는 건 절대 크기가 아니라 비율이라
// 결과는 같으면서, 형상 크기에 물려 있는 상수들(부풀림·난류·입자 크기·
// 커서 반경·카메라 거리)을 다시 잡지 않아도 된다.
export const SHAPE_LIST = [
  { id: "sphere", label: "구", realSize: 6 },
  { id: "torus", label: "토러스", realSize: 9 },
  { id: "knot", label: "토러스 매듭", realSize: 7 },
  { id: "stairs", label: "나선계단", realSize: 24 },
  { id: "bridge", label: "아치형 다리", realSize: 40 },
  { id: "dna", label: "DNA 이중나선", realSize: 16 },
  { id: "lattice", label: "큐브 격자", realSize: 14 },
  { id: "wave", label: "물결면", realSize: 30 },
  { id: "vortex", label: "회오리", realSize: 26 },
  { id: "spikeball", label: "가시 구체", realSize: 9 },
];

// 정규화된 형상의 최대 지름. centerAndFit이 최대 반경을 FIT_RADIUS로
// 맞추므로 가장 긴 축은 이 값에 가깝다.
export const WORLD_SPAN = FIT_RADIUS * 2;

// 바닥을 어디에 깔지 정하려면 형상의 바닥 높이가 필요하다.
export function bottomOf(pos, count) {
  let lo = Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1];
    if (y < lo) lo = y;
  }
  return lo;
}

// 오프닝용 흩어진 구름. 갤러리에 넣지 않는다 — 사용자가 고를 형상이 아니라
// 첫 조립의 출발점이다.
//
// 형상들과 달리 반경을 정규화하지 않는다. 멀리 흩어져 있다는 것이 요점이다.
// Morton 정렬은 여기서도 한다. 한 구역에서 출발한 입자들이 목표의 한 구역으로
// 함께 몰려가야 낱알이 아니라 흐름으로 보인다.
// 바깥 반경은 카메라 거리(기본 6.3)보다 넉넉히 작아야 한다. 구름이 카메라를
// 감싸면 코앞의 입자가 거대한 스프라이트로 그려져 화면을 덮어버린다.
export function buildScatter(count = DEFAULT_COUNT, inner = 2.3, outer = 3.8) {
  const pos = new Float32Array(count * 3);
  const rnd = mulberry32(0x5ca77e5);
  for (let i = 0; i < count; i++) {
    let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
    const l = Math.hypot(x, y, z) || 1;
    // cbrt로 껍질이 아니라 부피에 고르게 퍼뜨린다.
    const r = inner + (outer - inner) * Math.cbrt(rnd());
    setP(pos, i, (x / l) * r, (y / l) * r, (z / l) * r);
  }
  mortonSort(pos, count, outer);
  return pos;
}

export function buildShape(id, count = DEFAULT_COUNT) {
  const gen = GENERATORS[id];
  if (!gen) throw new Error("알 수 없는 형상: " + id);
  const pos = new Float32Array(count * 3);
  gen(pos, count, mulberry32(seedOf(id)));
  centerAndFit(pos, count);
  mortonSort(pos, count);
  return pos;
}
