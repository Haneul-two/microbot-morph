import * as THREE from "three";
import { mulberry32 } from "./shapes.js";
import { DELAY_MODES } from "./delayModes.js";

// 입자 시스템. 위치 계산은 전부 vertex shader가 한다.
// CPU는 형상 배열 두 개와 진행률 하나만 넘긴다.

const VERT = `
uniform float uT;
uniform float uTime;
uniform float uSize;
uniform float uBulge;
uniform float uSwirl;
uniform float uTurb;
uniform float uSpeedScale;

// 월드 크기 1인 물체가 깊이 1에서 차지하는 픽셀 수.
// viewportHeightPx / (2 * tan(fov/2)). 화면 크기가 바뀌면 다시 넣는다.
uniform float uProjScale;

uniform float uCamDist;

attribute vec3 aPosB;
attribute vec3 aSeed;
attribute float aDelay;
attribute vec3 aDisp;

varying float vSpeed;
varying float vFog;
varying float vTint;

// 입자 하나의 궤적. t는 전체 진행률.
vec3 pathAt(float t) {
  float span = max(1.0 - aDelay, 0.0001);
  float p = clamp((t - aDelay) / span, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);

  vec3 base = mix(position, aPosB, e);

  // 양 끝에서 정확히 0이 되는 포락선.
  // 이게 없으면 출발·도착 형상이 흐트러진 채로 맺힌다.
  float arc = sin(e * 3.14159265);

  // 중심 반대 방향으로 부풀린다. 직선 순간이동을 비행으로 바꾼다.
  vec3 n = normalize(base + vec3(0.0001, 0.0002, 0.0003));
  base += n * pow(arc, 0.7) * uBulge * (0.68 + aSeed.x * 0.5);

  // 아래부터: 전부 *위치*로 결정되는 장이다. 입자별 난수로 흔들면
  // 이웃끼리 반대 방향으로 흩어져 흐름이 아니라 잡음이 된다.
  // 같은 자리의 입자들이 같은 방향으로 가야 궤적이 눈에 보인다.

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
  // 아주 약한 입자별 지터만 남겨 입자 알갱이가 보이게 한다.
  base += (turb * 0.5 + (aSeed - 0.5) * 0.3) * pow(arc, 1.6) * uTurb;

  return base;
}

void main() {
  vec3 pos = pathAt(uT);

  // 속도는 경로를 두 번 평가해 수치적으로 추정한다.
  // 입자 6만 개에 vertex shader 두 번은 부담이 아니다.
  vec3 prev = pathAt(max(uT - 0.012, 0.0));
  float raw = length(pos - prev) / 0.012 * uSpeedScale;
  // 가장 빠른 입자만 달아오르게 한다. 선형으로 두면 전이 내내 전부 주황색이 된다.
  vSpeed = pow(clamp(raw, 0.0, 1.0), 1.6);

  pos += aDisp;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // 거리 감쇠. 점구름은 앞뒤 입자가 같은 밝기로 겹쳐 보여서
  // 이게 없으면 구가 평평한 원반이 된다. 카메라 거리에 상대적으로 잡는다.
  vFog = clamp((-mv.z - (uCamDist - 1.65)) / 3.3, 0.0, 1.0);

  // 입자마다 미세한 밝기 차. 고른 노이즈로 보이는 것을 막는다.
  vTint = 0.72 + aSeed.z * 0.55;

  // uSize는 월드 단위 지름이다. 원근에 따라 자연스럽게 작아진다.
  float px = uSize * (1.0 + vSpeed * 0.8) * uProjScale / max(-mv.z, 0.1);
  gl_PointSize = clamp(px, 1.0, 24.0);
}
`;

const FRAG = `
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
uniform vec3 uHotColor;
uniform vec3 uFogColor;

varying float vSpeed;
varying float vFog;
varying float vTint;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 0.98) discard;

  // 어두운 금속 몸체 + 가장자리 림라이트 + 고정 방향 하이라이트.
  // 검은 입자를 검은 배경에서 보이게 하는 건 전적으로 이 림라이트다.
  float core = 1.0 - smoothstep(0.0, 0.92, r);
  float rim = smoothstep(0.52, 0.96, r);
  float hi = max(0.0, dot(normalize(vec3(uv, 0.75)), normalize(vec3(-0.45, 0.62, 0.65))));

  vec3 col = uBaseColor * (0.3 + 0.7 * core);
  col += uRimColor * rim * 0.85;
  col += uRimColor * pow(hi, 7.0) * 0.55;
  col *= vTint;
  col = mix(col, uHotColor, vSpeed * 0.85);

  // 뒤쪽 입자를 배경색으로 밀어 넣는다.
  col = mix(col, uFogColor, vFog * 0.88);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createParticles(count) {
  const geometry = new THREE.BufferGeometry();

  // three는 "position" 속성을 셰이더에 자동으로 넣어준다.
  // 그래서 출발 형상 A를 그대로 position에 싣는다. 버퍼 하나를 아낀다.
  const posA = new Float32Array(count * 3);
  const posB = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const disp = new Float32Array(count * 3);

  const rnd = mulberry32(0xc0ffee);
  for (let i = 0; i < count * 3; i++) seed[i] = rnd();

  geometry.setAttribute("position", new THREE.BufferAttribute(posA, 3));
  geometry.setAttribute("aPosB", new THREE.BufferAttribute(posB, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aDisp", new THREE.BufferAttribute(disp, 3));

  // 입자가 궤적 도중 형상 반경 밖으로 크게 나가므로 컬링을 끈다.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true,
    uniforms: {
      uT: { value: 1 },
      uTime: { value: 0 },
      uSize: { value: 0.016 },
      uBulge: { value: 0.34 },
      uSwirl: { value: 1.35 },
      uTurb: { value: 0.28 },
      uProjScale: { value: 1000 },
      uCamDist: { value: 5.4 },
      // 조립식은 시차가 커서 각 입자의 이동 구간이 짧고, 그만큼 실제로
      // 더 빠르다. 이 값이 높으면 전이 내내 화면이 주황색으로 포화된다.
      uSpeedScale: { value: 0.032 },
      uBaseColor: { value: new THREE.Color(0x141920) },
      uRimColor: { value: new THREE.Color(0x9fb6d2) },
      uHotColor: { value: new THREE.Color(0xff7a33) },
      uFogColor: { value: new THREE.Color(0x05070a) },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const delayRnd = mulberry32(0x5eed);

  return {
    count,
    points,
    geometry,
    material,
    posA,
    posB,

    // 전이 시작. A는 현재 정착 형상, B는 목표 형상.
    setTransition(fromArr, toArr, modeId) {
      posA.set(fromArr);
      posB.set(toArr);
      const mode = DELAY_MODES.find((m) => m.id === modeId) || DELAY_MODES[0];
      mode.fill(delay, count, mode.usesTarget ? toArr : fromArr, delayRnd);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aPosB.needsUpdate = true;
      geometry.attributes.aDelay.needsUpdate = true;
    },

    disp,
    markDispDirty() {
      geometry.attributes.aDisp.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
