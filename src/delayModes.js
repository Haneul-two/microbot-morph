// 입자별 출발 시차.
//
// 이 파일이 "군집 비행"과 "조립식"의 유일한 차이다. 경로 수식도, 셰이더도
// 같고 오직 각 입자가 언제 출발하는지만 다르다.

export const MAX_DELAY_FLOCK = 0.30;
export const MAX_DELAY_ASSEMBLE = 0.62;

// 군집 비행: 바깥쪽 입자가 먼저 떠나고 안쪽이 뒤따른다.
// 순수 무작위보다 "우르르 몰려나간다"는 인상이 강하다.
export function fillFlockDelays(out, n, from, rnd) {
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(from[i * 3], from[i * 3 + 1], from[i * 3 + 2]);
    const outerness = Math.min(1, r / 1.5);
    const bias = 1 - outerness;
    out[i] = MAX_DELAY_FLOCK * (0.62 * rnd() + 0.38 * bias);
  }
}

// 조립식: 목표 형상의 Y가 낮은 입자부터 자리를 잡는다.
// 밑바닥부터 층층이 쌓여 올라가는 것처럼 보인다.
//
// 랭크 정렬 대신 Y를 선형 사상한다. 6만 개를 매 전이마다 정렬하면
// 수십 ms가 날아가는데, 눈으로는 차이가 없다.
export function fillAssembleDelays(out, n, to, rnd) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = to[i * 3 + 1];
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < n; i++) {
    const t = (to[i * 3 + 1] - lo) / span;
    // 약간의 지터가 없으면 같은 높이의 입자가 한 줄로 딱 붙어 층이 진다.
    out[i] = Math.min(MAX_DELAY_ASSEMBLE, MAX_DELAY_ASSEMBLE * t + rnd() * 0.035);
  }
}

export const DELAY_MODES = [
  { id: "flock", label: "군집 비행", fill: fillFlockDelays, usesTarget: false },
  { id: "assemble", label: "조립식", fill: fillAssembleDelays, usesTarget: true },
];
