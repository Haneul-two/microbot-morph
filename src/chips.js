import * as THREE from "three";
import { mulberry32 } from "./shapes.js";
import { DELAY_MODES } from "./delayModes.js";
import { PATH_GLSL, pathUniforms } from "./pathGlsl.js";

// 칩형 렌더러. 입자 하나가 실제 3D 메시 하나다.
//
// 점 렌더러와 인터페이스가 같아서 main은 둘을 바꿔 끼우기만 하면 된다.
// 경로 계산은 pathGlsl.js를 공유한다 — 두 벌로 나누면 모드를 바꿀 때
// 형상이 어긋난다.

const VERT = PATH_GLSL + `
uniform float uSpeedScale;
uniform float uChipSize;
uniform float uCamDist;

attribute vec3 aPosA;
attribute vec3 aPosB;
attribute vec3 aSeed;
attribute float aDelay;
attribute vec3 aDisp;

varying float vSpeed;
varying float vFog;
varying float vTint;
varying vec3 vNormal;
varying vec3 vWorld;

// d를 세 번째 축으로 삼는 정규직교 기저.
mat3 basisFrom(vec3 d) {
  vec3 up = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 x = normalize(cross(up, d));
  vec3 y = cross(d, x);
  return mat3(x, y, d);
}

void main() {
  vec3 c = pathAt(aPosA, aPosB, aDelay, aSeed, uT);
  vec3 prev = pathAt(aPosA, aPosB, aDelay, aSeed, max(uT - 0.012, 0.0));

  vec3 vel = c - prev;
  float raw = length(vel) / 0.012 * uSpeedScale;
  vSpeed = pow(clamp(raw, 0.0, 1.0), 1.6);

  c += aDisp;

  // 멈춰 있을 땐 칩마다 제각각 굴러 있고, 날기 시작하면 진행 방향으로
  // 정렬된다. 정지 상태에서 속도 방향을 쓰면 방향이 0이라 떨린다.
  vec3 dirRand = normalize(aSeed * 2.0 - 1.0 + vec3(0.017, 0.031, 0.011));
  vec3 dirVel = length(vel) > 1e-5 ? normalize(vel) : dirRand;
  vec3 blended = mix(dirRand, dirVel, smoothstep(0.0, 0.12, raw));
  vec3 d = length(blended) > 1e-4 ? normalize(blended) : dirRand;
  mat3 rot = basisFrom(d);

  vec3 local = position * uChipSize * (0.78 + aSeed.y * 0.44);
  vec3 world = c + rot * local;

  vNormal = normalize(rot * normal);
  vWorld = world;
  vTint = 0.72 + aSeed.z * 0.55;

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vFog = clamp((-mv.z - (uCamDist - 1.65)) / 3.3, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
uniform vec3 uHotColor;
uniform vec3 uFogColor;
uniform float uFogAmount;

varying float vSpeed;
varying float vFog;
varying float vTint;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(vec3(-0.45, 0.85, 0.55));

  // 점 스프라이트의 가짜 음영과 달리 여기서는 진짜 면 법선이 있다.
  //
  // 어두운 기본색에 램버트만 곱하면 거의 검게 나온다. 점 렌더러가 밝아
  // 보였던 건 림라이트가 2~4px 스프라이트의 대부분을 덮었기 때문이다.
  // 여기서는 어두운 색과 밝은 금속색 **사이를 오가게** 해야 한다.
  float lam = max(dot(n, l), 0.0);
  float fill = max(dot(n, -l), 0.0);          // 뒷면이 완전히 죽지 않게
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 40.0);

  vec3 col = mix(uBaseColor, uRimColor, clamp(lam * 0.8 + fill * 0.14, 0.0, 1.0));
  col += uRimColor * fres * 0.55;
  col += uRimColor * spec * 1.1;
  col *= vTint;
  col = mix(col, uHotColor, vSpeed * 0.85);
  col = mix(col, uFogColor, vFog * uFogAmount);

  gl_FragColor = vec4(col, 1.0);
}
`;

// 칩 하나의 기본 형태. 세 번째 축(+Z)이 진행 방향이 된다.
function baseGeometry(formId) {
  if (formId === "rod") return new THREE.BoxGeometry(0.34, 0.34, 2.1);
  if (formId === "octa") return new THREE.OctahedronGeometry(0.72);
  return new THREE.BoxGeometry(1, 1, 0.4);   // cube: 납작한 칩
}

export function createChips(count, formId) {
  const base = baseGeometry(formId);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.attributes.position);
  geometry.setAttribute("normal", base.attributes.normal);
  geometry.instanceCount = count;

  const posA = new Float32Array(count * 3);
  const posB = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const disp = new Float32Array(count * 3);

  const rnd = mulberry32(0xc0ffee);
  for (let i = 0; i < count * 3; i++) seed[i] = rnd();

  geometry.setAttribute("aPosA", new THREE.InstancedBufferAttribute(posA, 3));
  geometry.setAttribute("aPosB", new THREE.InstancedBufferAttribute(posB, 3));
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 3));
  geometry.setAttribute("aDelay", new THREE.InstancedBufferAttribute(delay, 1));
  geometry.setAttribute("aDisp", new THREE.InstancedBufferAttribute(disp, 3));

  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: Object.assign(pathUniforms(), {
      // 입자가 적어진 만큼 하나가 커야 표면이 메워진다.
      // 칩은 제각각 굴러 있어 종종 옆날이 보이므로, 넓이 계산보다
      // 넉넉히 잡아야 형상에 구멍이 뚫려 보이지 않는다.
      uChipSize: { value: formId === "rod" ? 0.055 : formId === "octa" ? 0.072 : 0.080 },
      uCamDist: { value: 6.3 },
      uSpeedScale: { value: 0.032 },
      uBaseColor: { value: new THREE.Color(0x141920) },
      uRimColor: { value: new THREE.Color(0x9fb6d2) },
      uHotColor: { value: new THREE.Color(0xff7a33) },
      uFogColor: { value: new THREE.Color(0x05070a) },
      uFogAmount: { value: 0.88 },
    }),
  });

  const object = new THREE.Mesh(geometry, material);
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

    setTransition(fromArr, toArr, modeId) {
      posA.set(fromArr);
      posB.set(toArr);
      const mode = DELAY_MODES.find((m) => m.id === modeId) || DELAY_MODES[0];
      mode.fill(delay, count, mode.usesTarget ? toArr : fromArr, delayRnd);
      geometry.attributes.aPosA.needsUpdate = true;
      geometry.attributes.aPosB.needsUpdate = true;
      geometry.attributes.aDelay.needsUpdate = true;
    },

    markDispDirty() {
      geometry.attributes.aDisp.needsUpdate = true;
    },

    dispose() {
      base.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
