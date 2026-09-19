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

  return {
    object,
    material,

    // 형상마다 바닥 높이가 다르므로 목표만 정해두고 부드럽게 따라간다.
    setTargetY(y) { targetY = y; },

    update(dt) {
      const k = 1 - Math.pow(0.02, dt);
      object.position.y += (targetY - object.position.y) * k;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
