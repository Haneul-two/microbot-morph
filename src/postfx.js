import * as THREE from "three";

// 잔상 누적 및 합성.
//
// 화면 전체 피드백 방식이다. 밝은 부분(림라이트와 고속 입자의 주황빛)만
// 추출해 이전 프레임 누적본과 max 합성하고, 마지막에 원본에 더한다.
//
// 알려진 한계: 화면 공간 누적이라 카메라를 돌리면 화면이 번진다.
// 궤도 회전 중에는 감쇠를 낮춰 완화한다 (main.js).

const FS_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const ACC_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tPrev;
uniform float uDecay;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec3 s = texture2D(tScene, vUv).rgb;
  float lum = max(max(s.r, s.g), s.b);
  vec3 bright = s * smoothstep(uThreshold, uThreshold + 0.3, lum);
  // 곱하기만 하면 8비트 타깃에서 낮은 값이 반올림으로 제자리에 남아
  // 잔상이 영영 사라지지 않는다. 한 계단씩 빼 줘야 바닥까지 내려간다.
  vec3 prev = max(texture2D(tPrev, vUv).rgb * uDecay - 0.004, vec3(0.0));
  gl_FragColor = vec4(max(bright, prev), 1.0);
}
`;

const COMP_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tAcc;
uniform float uTrail;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tAcc, vUv).rgb * uTrail;

  // smoothstep은 edge0 >= edge1이면 결과가 정의되지 않는다. 인자를 바로
  // 놓고 1에서 빼야 드라이버를 가리지 않는다.
  float vig = 1.0 - smoothstep(0.28, 0.92, length(vUv - 0.5));
  c *= mix(0.62, 1.0, vig);

  gl_FragColor = vec4(c, 1.0);
}
`;

const ACC_SCALE = 0.6;

export function createPostFX(renderer, width, height) {
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const accMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: ACC_FRAG,
    uniforms: {
      tScene: { value: null },
      tPrev: { value: null },
      uDecay: { value: 0.945 },
      // 바닥 격자가 잔상을 남기지 않을 만큼은 높아야 한다.
      // 입자의 림라이트(0.8대)는 여유롭게 통과한다.
      uThreshold: { value: 0.26 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const compMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: COMP_FRAG,
    uniforms: {
      tScene: { value: null },
      tAcc: { value: null },
      uTrail: { value: 1.05 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(quadGeo, accMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let rtScene, accA, accB;

  function makeTargets(w, h) {
    // 반정밀도 텍스처를 **선형 샘플링**하려면 OES_texture_half_float_linear가
    // 있어야 한다. 렌더링해 넣는 것(EXT_color_buffer_float)과는 별개다.
    //
    // 모바일 크롬에는 이 확장이 없는 경우가 있고, 없는데도 LinearFilter로
    // 읽으면 결과가 정의되지 않아 화면이 검게 나온다. 데스크톱에는 대개
    // 있어서 드러나지 않는다. 없으면 8비트로 떨어뜨린다 — 이 파이프라인은
    // 값이 0~1을 넘지 않으므로 잃는 것이 없고 메모리도 절반이다.
    const type = renderer.extensions.has("OES_texture_half_float_linear")
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
    rtScene = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type,
      depthBuffer: true,
    });
    const aw = Math.max(1, Math.floor(w * ACC_SCALE));
    const ah = Math.max(1, Math.floor(h * ACC_SCALE));
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type, depthBuffer: false };
    accA = new THREE.WebGLRenderTarget(aw, ah, opts);
    accB = new THREE.WebGLRenderTarget(aw, ah, opts);
  }

  function disposeTargets() {
    rtScene?.dispose();
    accA?.dispose();
    accB?.dispose();
  }

  makeTargets(width, height);

  return {
    // 진단용. 모바일에서 어떤 정밀도로 떨어졌는지 확인한다.
    get textureType() {
      return rtScene.texture.type === THREE.HalfFloatType ? "half" : "byte";
    },

    // 타깃을 버리고 새로 만들지 않는다.
    //
    // 모바일은 주소창이 오르내릴 때마다 리사이즈를 쏘는데, 그때마다
    // 재할당하면 화면이 한 프레임씩 검게 깜빡이고 할당이 실패하면
    // 버려진 타깃으로 계속 그리게 된다. 크기만 바꾸면 그 창이 없다.
    setSize(w, h) {
      const aw = Math.max(1, Math.floor(w * ACC_SCALE));
      const ah = Math.max(1, Math.floor(h * ACC_SCALE));
      rtScene.setSize(w, h);
      accA.setSize(aw, ah);
      accB.setSize(aw, ah);
    },

    // decay: 0에 가까울수록 잔상이 짧다.
    render(scene, camera, decay) {
      accMat.uniforms.uDecay.value = decay;

      renderer.setRenderTarget(rtScene);
      renderer.clear();
      renderer.render(scene, camera);

      quad.material = accMat;
      accMat.uniforms.tScene.value = rtScene.texture;
      accMat.uniforms.tPrev.value = accA.texture;
      renderer.setRenderTarget(accB);
      renderer.render(quadScene, quadCamera);

      const swap = accA; accA = accB; accB = swap;

      quad.material = compMat;
      compMat.uniforms.tScene.value = rtScene.texture;
      compMat.uniforms.tAcc.value = accA.texture;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },

    dispose() {
      disposeTargets();
      quadGeo.dispose();
      accMat.dispose();
      compMat.dispose();
    },
  };
}
