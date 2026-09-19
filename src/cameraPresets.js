// 형상별 연출 앵글.
//
// phi는 +Y에서 잰 극각이다. PI/2(=1.571)가 수평, 그보다 크면 카메라가
// 형상 아래로 내려가 올려다보는 구도가 된다. 계단·다리·회오리처럼
// "크다"는 인상이 중요한 형상은 전부 아래에 둔다.

const DEFAULT = { theta: 0.6, phi: 1.18, radius: 6.3 };

const PRESETS = {
  sphere: { theta: 0.6, phi: 1.15, radius: 6.2 },
  torus: { theta: 0.9, phi: 0.92, radius: 6.1 },      // 위에서 구멍이 보이게
  knot: { theta: 1.2, phi: 1.22, radius: 5.9 },
  stairs: { theta: 0.5, phi: 1.70, radius: 5.8 },     // 계단 밑에서 올려다보기
  // 다리는 X축으로 길다. theta가 PI/2면 길이 방향 정면이라 얇은 판으로
  // 보인다. 0에 가까워야 경간이 드러난다.
  bridge: { theta: 0.15, phi: 1.55, radius: 6.6 },
  dna: { theta: 0.3, phi: 1.40, radius: 5.8 },
  lattice: { theta: 0.78, phi: 1.05, radius: 6.5 },   // 모서리 쪽에서
  // 물결면은 XZ 평면에 눕는다. 수평에 가까우면 선 하나로 보인다.
  wave: { theta: 1.1, phi: 1.30, radius: 6.6 },
  vortex: { theta: 0.7, phi: 1.68, radius: 6.2 },     // 깔때기 아래에서
  spikeball: { theta: 1.4, phi: 1.30, radius: 5.7 },
};

export function presetFor(shapeId) {
  return PRESETS[shapeId] || DEFAULT;
}

export { DEFAULT as DEFAULT_POSE };
