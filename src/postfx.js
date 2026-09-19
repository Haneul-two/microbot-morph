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
  vec3 prev = texture2D(tPrev, vUv).rgb * uDecay;
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

  float vig = smoothstep(0.92, 0.28, length(vUv - 0.5));
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
      uThreshold: { value: 0.18 },
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
    const type = THREE.HalfFloatType;
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
    setSize(w, h) {
      disposeTargets();
      makeTargets(w, h);
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
