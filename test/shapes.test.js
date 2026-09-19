import test from "node:test";
import assert from "node:assert/strict";
import { SHAPE_LIST, buildShape, buildScatter, FIT_RADIUS, mulberry32 } from "../src/shapes.js";

const N = 8192;

test("모든 형상이 정확히 같은 개수의 점을 반환한다", () => {
  // 이게 깨지면 입자 i의 A→B 대응이 무너져 morph 자체가 성립하지 않는다.
  for (const s of SHAPE_LIST) {
    const p = buildShape(s.id, N);
    assert.equal(p.length, N * 3, s.id);
    assert.ok(p instanceof Float32Array, s.id);
  }
});

test("NaN이나 Infinity가 섞이지 않는다", () => {
  for (const s of SHAPE_LIST) {
    const p = buildShape(s.id, N);
    for (let i = 0; i < p.length; i++) {
      if (!Number.isFinite(p[i])) {
        assert.fail(`${s.id} 인덱스 ${i} 값이 ${p[i]}`);
      }
    }
  }
});

test("최대 반경이 FIT_RADIUS로 정규화된다", () => {
  for (const s of SHAPE_LIST) {
    const p = buildShape(s.id, N);
    let maxR = 0;
    for (let i = 0; i < N; i++) {
      maxR = Math.max(maxR, Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
    }
    assert.ok(Math.abs(maxR - FIT_RADIUS) < 1e-3, `${s.id} maxR=${maxR}`);
  }
});

test("bbox 중심이 원점에 온다", () => {
  for (const s of SHAPE_LIST) {
    const p = buildShape(s.id, N);
    for (let axis = 0; axis < 3; axis++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < N; i++) {
        const v = p[i * 3 + axis];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      assert.ok(Math.abs((lo + hi) / 2) < 1e-4, `${s.id} axis${axis} center=${(lo + hi) / 2}`);
    }
  }
});

test("형상은 결정적이다 (같은 입력 → 같은 출력)", () => {
  for (const s of SHAPE_LIST) {
    const a = buildShape(s.id, 2048);
    const b = buildShape(s.id, 2048);
    assert.deepEqual(Array.from(a), Array.from(b), s.id);
  }
});

test("Morton 정렬로 이웃 인덱스가 공간적으로 가까워진다", () => {
  // 정렬이 실제로 먹었는지 확인. 인접 인덱스 간 평균 거리가
  // 무작위 쌍의 평균 거리보다 훨씬 작아야 한다.
  for (const s of SHAPE_LIST) {
    const p = buildShape(s.id, N);
    let adjacent = 0;
    for (let i = 1; i < N; i++) {
      adjacent += Math.hypot(
        p[i * 3] - p[(i - 1) * 3],
        p[i * 3 + 1] - p[(i - 1) * 3 + 1],
        p[i * 3 + 2] - p[(i - 1) * 3 + 2]);
    }
    adjacent /= N - 1;

    const rnd = mulberry32(7);
    let random = 0;
    const samples = 4000;
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
      random += Math.hypot(
        p[i * 3] - p[j * 3],
        p[i * 3 + 1] - p[j * 3 + 1],
        p[i * 3 + 2] - p[j * 3 + 2]);
    }
    random /= samples;

    assert.ok(adjacent < random * 0.2,
      `${s.id} 인접=${adjacent.toFixed(4)} 무작위=${random.toFixed(4)}`);
  }
});

test("오프닝 구름은 형상과 같은 개수이고 지정한 반경대에 있다", () => {
  // 개수가 어긋나면 오프닝에서 입자 대응이 무너진다.
  const inner = 2.9, outer = 5.0;
  const p = buildScatter(N, inner, outer);
  assert.equal(p.length, N * 3);
  for (let i = 0; i < N; i++) {
    const r = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    assert.ok(Number.isFinite(r), `인덱스 ${i}`);
    assert.ok(r >= inner - 1e-4 && r <= outer + 1e-4, `반경 ${r}`);
  }
});

test("오프닝 구름도 이웃 인덱스가 공간적으로 가깝다", () => {
  // 정렬이 없으면 입자가 제각각 날아와 흐름이 아니라 낱알로 보인다.
  // 구름은 형상보다 부피가 훨씬 커서 최근접 간격 자체가 크므로,
  // 절대 거리가 아니라 무작위 쌍과의 비율로 본다.
  const p = buildScatter(N);
  let adjacent = 0;
  for (let i = 1; i < N; i++) {
    adjacent += Math.hypot(
      p[i * 3] - p[(i - 1) * 3],
      p[i * 3 + 1] - p[(i - 1) * 3 + 1],
      p[i * 3 + 2] - p[(i - 1) * 3 + 2]);
  }
  adjacent /= N - 1;

  const rnd = mulberry32(11);
  let random = 0;
  const samples = 4000;
  for (let k = 0; k < samples; k++) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    random += Math.hypot(
      p[i * 3] - p[j * 3],
      p[i * 3 + 1] - p[j * 3 + 1],
      p[i * 3 + 2] - p[j * 3 + 2]);
  }
  random /= samples;

  assert.ok(adjacent < random * 0.2,
    `인접=${adjacent.toFixed(4)} 무작위=${random.toFixed(4)}`);
});

test("알 수 없는 형상 id는 던진다", () => {
  assert.throws(() => buildShape("nope", 64));
});

test("mulberry32는 0 이상 1 미만을 낸다", () => {
  const rnd = mulberry32(12345);
  for (let i = 0; i < 10000; i++) {
    const v = rnd();
    assert.ok(v >= 0 && v < 1, String(v));
  }
});
