import * as THREE from "three";

// 바닥과 지평선.
//
// 허공에 떠 있는 물체는 크기가 없다. 바닥이 생기고 그 위에 그림자가 지면
// 같은 형상이 "떠 있는 물건"에서 "서 있는 구조물"로 읽힌다.
//
// 격자는 멀어질수록 배경색으로 녹아 지평선을 만든다. 잔상 후처리의
// 밝기 문턱(0.18)보다 어둡게 유지해야 바닥이 잔상을 남기지 않는다.

const VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = `
uniform vec3 uLineColor;
uniform vec3 uFogColor;
uniform float uCell;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uShadowRadius;

varying vec3 vWorld;

// fwidth를 쓰지 않는다. three는 WebGL2에서도 GLSL ES 1.00으로 컴파일해서
// 미분 함수가 확장에 걸릴 수 있다. 대신 거리에 따라 선을 두껍게 한다.
float gridLine(vec2 p, float cell, float w) {
  vec2 f = abs(fract(p / cell - 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, min(f.x, f.y));
}

void main() {
  vec2 p = vWorld.xz;
  float d = length(p);

  float w = 0.008 + d * 0.0016;
  float g = gridLine(p, uCell, w) * 0.5 + gridLine(p, uCell * 5.0, w * 0.7) * 0.5;

  vec3 col = mix(uFogColor, uLineColor, g);

  // 형상 바로 아래를 어둡게 눌러 접지 그림자를 만든다.
  float s = exp(-(d * d) / (2.0 * uShadowRadius * uShadowRadius));
  col *= 1.0 - 0.75 * s;

  // 멀어지면 배경색으로 녹는다. 이 경계가 지평선이 된다.
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);
  col = mix(uFogColor, col, fade);

  gl_FragColor = vec4(col, 1.0);
}
`;

// 격자 한 칸이 실제 몇 미터인가를 고른다.
//
// 사람 실루엣을 뺀 뒤로 이 격자가 유일한 크기 기준이다. 칸이 항상 같은
// 월드 크기면 아무것도 알려주지 않으므로, 형상의 realSize에 맞춰 "깔끔한"
// 미터 값(1·2·5·10·20)을 고르고 그 값을 화면에 적는다.
//
// 월드 크기가 0.35~1.2 밖으로 나가면 격자가 뭉개지거나 너무 성겨진다.
// 은하(10만 광년)부터 로고(4m)까지 걸치므로 자릿수를 넓게 깐다.
const NICE_METERS = [];
for (let e = -2; e <= 6; e++) {
  for (const m of [1, 2, 5]) NICE_METERS.push(m * Math.pow(10, e));
}

export function pickCell(realSizeMeters, worldSpan) {
  let best = NICE_METERS[0];
  let bestErr = Infinity;
  for (const m of NICE_METERS) {
    const world = (m / realSizeMeters) * worldSpan;
    if (world < 0.3 || world > 1.3) continue;
    const err = Math.abs(world - 0.55);
    if (err < bestErr) { bestErr = err; best = m; }
  }
  // 0.1 단위까지 내려가면 소수점이 붙는다. 읽기 좋게 정리한다.
  const label = best >= 1 ? String(best) : String(Math.round(best * 100) / 100);
  return { meters: label, world: (best / realSizeMeters) * worldSpan };
}

export function createGround() {
  const geometry = new THREE.PlaneGeometry(260, 260);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uLineColor: { value: new THREE.Color(0x33475e) },
      uFogColor: { value: new THREE.Color(0x05070a) },
      uCell: { value: 0.6 },
      // 카메라가 반경 6 안팎에 있으므로 페이드가 그보다 멀리서 시작해야
      // 형상 주변 바닥이 남는다. 너무 짧으면 지평선이 발밑에 생긴다.
      uFadeStart: { value: 4 },
      uFadeEnd: { value: 34 },
      uShadowRadius: { value: 1.6 },
    },
    depthWrite: true,
  });

  const object = new THREE.Mesh(geometry, material);
  object.frustumCulled = false;
  object.position.y = -1.6;

  let targetY = -1.6;
  let targetCell = 0.6;

  return {
    object,
    material,

    // 형상마다 바닥 높이가 다르므로 목표만 정해두고 부드럽게 따라간다.
    setTargetY(y) { targetY = y; },

    setCell(world) { targetCell = world; },

    update(dt) {
      const k = 1 - Math.pow(0.02, dt);
      object.position.y += (targetY - object.position.y) * k;
      const u = material.uniforms.uCell;
      u.value += (targetCell - u.value) * k;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
