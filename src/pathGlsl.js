// 입자 하나의 궤적. 점 렌더러와 칩 렌더러가 **같은 소스**를 쓴다.
//
// 두 벌로 나눠 두면 한쪽만 고쳤을 때 모드를 바꾸는 순간 형상이 어긋난다.
// 그래서 A/B 좌표와 시차를 전역이 아니라 인자로 받는 순수 함수로 만들었다.
// 점 렌더러는 A를 `position` 속성에서, 칩 렌더러는 `aPosA`에서 넘긴다.

export const PATH_GLSL = `
uniform float uT;
uniform float uTime;
uniform float uBulge;
uniform float uSwirl;
uniform float uTurb;

vec3 pathAt(vec3 pA, vec3 pB, float delay, vec3 seed, float t) {
  float span = max(1.0 - delay, 0.0001);
  float p = clamp((t - delay) / span, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);

  vec3 base = mix(pA, pB, e);

  // 양 끝에서 정확히 0이 되는 포락선.
  // 이게 없으면 출발·도착 형상이 흐트러진 채로 맺힌다.
  //
  // max로 0에서 잘라야 한다. 정착하면 e가 정확히 1이 되는데, float32에서
  // 3.14159265는 파이보다 살짝 커서 sin이 -8.7e-8, 즉 **음수**를 낸다.
  // 아래에서 이 값을 pow의 밑으로 쓰는데 GLSL은 밑이 음수면 결과가
  // 정의되지 않는다. 데스크톱 드라이버는 0을 돌려주지만 NaN을 내는
  // 드라이버도 있고, 그러면 입자 좌표가 전부 NaN이 되어 형상이 통째로
  // 사라진다 — 전이 중에는 멀쩡하다가 다 맺히는 순간 화면이 비는 증상이다.
  float arc = max(sin(e * 3.14159265), 0.0);

  // 중심 반대 방향으로 부풀린다. 직선 순간이동을 비행으로 바꾼다.
  vec3 n = normalize(base + vec3(0.0001, 0.0002, 0.0003));
  base += n * pow(arc, 0.7) * uBulge * (0.68 + seed.x * 0.5);

  // 아래부터: 전부 *위치*로 결정되는 장이다. 입자별 난수로 흔들면
  // 이웃끼리 반대 방향으로 흩어져 흐름이 아니라 잡음이 된다.

  // 높이에 따라 비틀리는 소용돌이.
  float ang = arc * uSwirl * (0.35 + 0.9 * sin(base.y * 1.5 + uTime * 0.2));
  float c = cos(ang), s = sin(ang);
  base.xz = mat2(c, -s, s, c) * base.xz;

  // 축을 엇갈린 사인 합성으로 만든 난류장. 비행 구간에 집중된다.
  vec3 q = base * 1.6 + uTime * 0.25;
  vec3 turb = vec3(
    sin(q.y * 1.3) + sin(q.z * 0.8),
    sin(q.z * 1.1) + sin(q.x * 0.9),
    sin(q.x * 1.2) + sin(q.y * 0.7));
  base += (turb * 0.5 + (seed - 0.5) * 0.3) * pow(arc, 1.6) * uTurb;

  return base;
}
`;

// 두 렌더러가 공유하는 uniform 기본값.
export function pathUniforms() {
  return {
    uT: { value: 1 },
    uTime: { value: 0 },
    uBulge: { value: 0.34 },
    uSwirl: { value: 1.35 },
    uTurb: { value: 0.28 },
  };
}
