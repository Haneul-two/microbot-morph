import * as THREE from "three";
import { mulberry32 } from "./shapes.js";
import { DELAY_MODES } from "./delayModes.js";
import { PATH_GLSL, pathUniforms } from "./pathGlsl.js";

// 안개형 렌더러. 입자 하나가 점 스프라이트 하나다.
// 위치 계산은 전부 vertex shader가 한다. CPU는 형상 배열 두 개와
// 진행률 하나만 넘긴다.

const VERT = PATH_GLSL + `
uniform float uSize;
uniform float uSpeedScale;
uniform float uProjScale;
uniform float uCamDist;

attribute vec3 aPosB;
attribute vec3 aSeed;
attribute float aDelay;
attribute vec3 aDisp;

varying float vSpeed;
varying float vFog;
varying float vTint;

void main() {
  // three가 자동으로 넣어주는 position 속성에 출발 형상 A를 싣는다.
  vec3 pos = pathAt(position, aPosB, aDelay, aSeed, uT);

  // 속도는 경로를 두 번 평가해 수치적으로 추정한다.
  vec3 prev = pathAt(position, aPosB, aDelay, aSeed, max(uT - 0.012, 0.0));
  float raw = length(pos - prev) / 0.012 * uSpeedScale;
  // 가장 빠른 입자만 달아오르게 한다. 선형으로 두면 전이 내내 주황색이 된다.
  vSpeed = pow(clamp(raw, 0.0, 1.0), 1.6);

  pos += aDisp;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // 거리 감쇠. 점구름은 앞뒤 입자가 같은 밝기로 겹쳐 보여서
  // 이게 없으면 구가 평평한 원반이 된다.
  vFog = clamp((-mv.z - (uCamDist - 1.65)) / 3.3, 0.0, 1.0);

  // 크기와 밝기를 같은 시드에 묶는다. 큰 입자가 더 밝아야 "별"로 읽힌다.
  // 전부 같은 크기면 아무리 배치를 잘해도 먼지처럼 보인다.
  float grade = aSeed.z;
  vTint = 0.5 + grade * 0.95;

  // uSize는 월드 단위 지름이다. 원근에 따라 자연스럽게 작아진다.
  // 상한이 헐거우면 카메라가 가까이 붙었을 때 입자가 거대한 방울이 되어
  // 화면을 덮고 형상이 사라진다. 평소 크기는 2~6px이라 상한이 낮아도 손해가 없다.
  float px = uSize * (0.62 + grade * 1.3) * (1.0 + vSpeed * 0.8)
             * uProjScale / max(-mv.z, 0.1);
  gl_PointSize = clamp(px, 1.0, 12.0);
}
`;

const FRAG = `
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
uniform vec3 uHotColor;
uniform vec3 uFogColor;
uniform float uFogAmount;
uniform float uAdditive;
uniform float uAdditiveGain;

varying float vSpeed;
varying float vFog;
varying float vTint;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 0.98) discard;

  // 가산 모드: 겹칠수록 밝아진다. 은하의 팽대부처럼 빽빽한 곳이 저절로
  // 하얗게 타오른다.
  //
  // 여기서 거리 감쇠를 배경색으로 "섞으면" 안 된다. 배경색이 입자 수만큼
  // 더해져 화면 전체가 뿌옇게 뜬다. 검정 쪽으로 곱해서 줄여야 한다.
  if (uAdditive > 0.5) {
    float soft = pow(max(0.0, 1.0 - r), 2.2);
    vec3 star = mix(uRimColor, uHotColor, vSpeed * 0.7);
    vec3 acc = star * vTint * soft * uAdditiveGain * (1.0 - vFog * uFogAmount);
    gl_FragColor = vec4(acc, 1.0);
    return;
  }

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

  // 뒤쪽 입자를 배경색으로 밀어 넣는다. 오프닝 동안에는 main이
  // uFogAmount를 낮춘다 — 훨씬 멀리서 날아오기 때문이다.
  col = mix(col, uFogColor, vFog * uFogAmount);

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
    uniforms: Object.assign(pathUniforms(), {
      uSize: { value: 0.016 },
      uProjScale: { value: 1000 },
      uCamDist: { value: 6.3 },
      // 조립식은 시차가 커서 각 입자의 이동 구간이 짧고, 그만큼 실제로
      // 더 빠르다. 이 값이 높으면 전이 내내 화면이 주황색으로 포화된다.
      uSpeedScale: { value: 0.032 },
      uBaseColor: { value: new THREE.Color(0x141920) },
      uRimColor: { value: new THREE.Color(0x9fb6d2) },
      uHotColor: { value: new THREE.Color(0xff7a33) },
      uFogColor: { value: new THREE.Color(0x05070a) },
      uFogAmount: { value: 0.88 },
      uAdditive: { value: 0 },
      // 입자가 더해지므로 하나하나는 어두워야 한다. 높이면 코어가 아니라
      // 원반 전체가 하얗게 탄다.
      uAdditiveGain: { value: 0.30 },
    }),
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;

  const delayRnd = mulberry32(0x5eed);

  return {
    count,
    object,
    geometry,
    material,
    posA,
    posB,
    disp,

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

    markDispDirty() {
      geometry.attributes.aDisp.needsUpdate = true;
    },

    // 가산 모드에서는 깊이 기록을 끈다. 켜두면 앞쪽 입자가 뒤쪽을 가려
    // 겹침이 누적되지 않아 가산의 의미가 없어진다.
    setAdditive(on) {
      material.uniforms.uAdditive.value = on ? 1 : 0;
      material.blending = on ? THREE.AdditiveBlending : THREE.NormalBlending;
      material.transparent = on;
      material.depthWrite = !on;
      material.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
