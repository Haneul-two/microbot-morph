import * as THREE from "three";
import { SHAPE_LIST, buildShape, buildScatter, DEFAULT_COUNT, LOW_COUNT } from "./shapes.js";
import { createParticles } from "./particles.js";
import { createMorph } from "./morph.js";
import { createPostFX } from "./postfx.js";
import { createControls, cursorRay } from "./controls.js";
import { createPointerField } from "./pointer.js";
import { createUI } from "./ui.js";

const canvas = document.getElementById("gl");

// 별도 캔버스로 확인한다. 본 캔버스에서 컨텍스트를 먼저 잡으면
// three가 원하는 속성으로 다시 만들 수 없다.
if (!document.createElement("canvas").getContext("webgl2")) {
  canvas.style.display = "none";
  document.getElementById("panel").style.display = "none";
  document.getElementById("fallback").style.display = "grid";
  throw new Error("WebGL2 미지원");
}

const shapeIds = SHAPE_LIST.map((s) => s.id);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setClearColor(0x05070a, 1);

const dpr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const controls = createControls(camera, canvas);

let postfx = null;
let particles = null;
let morph = null;
let pointerField = null;
let shapeCount = DEFAULT_COUNT;

// 입자 크기를 픽셀이 아니라 월드 단위로 다루기 위한 환산 계수.
// resize에서 실제 값으로 채운다.
let projScale = 1000;

const ui = createUI({
  onShape: (id) => morph.request(id),
  onMode: (id) => morph.setMode(id),
  onScrub: (v) => morph.setProgress(v),
  onPlayToggle: () => morph.setPlaying(!morph.playing),
  onAutoTour: (v) => morph.setAutoTour(v),
  onCursorRadius: (v) => pointerField.setRadius(v),
});

function buildWorld(count, startId, withIntro) {
  if (particles) {
    scene.remove(particles.points);
    particles.dispose();
  }

  const cache = new Map();
  const getShape = (id) => {
    if (!cache.has(id)) {
      try {
        cache.set(id, buildShape(id, count));
      } catch (err) {
        // 형상 생성이 실패하면 현재 형상을 유지한다.
        console.warn("형상 생성 실패:", id, err);
        return cache.get(morph?.currentId) ?? new Float32Array(count * 3);
      }
    }
    return cache.get(id);
  };

  particles = createParticles(count);
  particles.material.uniforms.uProjScale.value = projScale;
  scene.add(particles.points);

  pointerField = createPointerField(particles.disp, count);
  pointerField.setRadius(ui.cursorRadius);

  morph = createMorph({
    particles,
    getShape,
    shapeIds,
    startId,
    introFrom: withIntro ? buildScatter(count) : null,
    onUpdate: (s) => ui.sync(s),
  });

  shapeCount = count;
  ui.sync({
    currentId: morph.currentId,
    fromId: morph.currentId,
    toId: morph.currentId,
    t: morph.progress,
    playing: morph.playing,
    queued: null,
    autoTour: morph.autoTour,
    mode: morph.mode,
    canScrub: false,
  });
}

const INTRO_FAR = 10.2;   // 오프닝 시작 거리
const INTRO_NEAR = 6.3;   // 조립이 끝났을 때 거리

buildWorld(DEFAULT_COUNT, shapeIds[0], true);
if (morph.intro) controls.setDistance(INTRO_FAR, true);

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const bw = Math.max(1, Math.floor(w * dpr));
  const bh = Math.max(1, Math.floor(h * dpr));

  // gl_PointSize는 장치 픽셀 단위라 드로잉 버퍼 높이를 쓴다.
  projScale = bh / (2 * Math.tan((camera.fov * Math.PI) / 360));
  if (particles) particles.material.uniforms.uProjScale.value = projScale;

  if (postfx) postfx.dispose();
  postfx = createPostFX(renderer, bw, bh);
}

resize();
window.addEventListener("resize", resize);

// --- 커서 ------------------------------------------------------------------

const ndc = { x: 0, y: 0 };
let pointerOver = false;
const rayDir = new THREE.Vector3();

canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  pointerOver = true;
});
canvas.addEventListener("pointerleave", () => { pointerOver = false; });

// --- 루프 ------------------------------------------------------------------

const clock = new THREE.Clock();
let fpsAccum = 0, fpsFrames = 0, fpsShown = 0;
let probeTime = 0, probeFrames = 0, probeDone = false;

function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);

  // 오프닝 돌리 인. 멀리서 시작해야 흩어진 구름 전체가 프레임에 들어온다.
  if (morph.intro) {
    controls.setDistance(INTRO_FAR + (INTRO_NEAR - INTRO_FAR) * morph.progress);
  }

  controls.update(dt);
  morph.update(dt);
  particles.material.uniforms.uTime.value += dt;
  particles.material.uniforms.uCamDist.value = camera.position.length();

  // 거리 감쇠는 형상 크기에 맞춰져 있어, 훨씬 멀리서 날아오는 오프닝
  // 입자에 그대로 걸면 아무것도 안 보인다. 조립되는 동안 원래 값으로 되돌린다.
  particles.material.uniforms.uFogAmount.value =
    morph.intro ? 0.30 + 0.58 * morph.progress : 0.88;

  const hasCursor = pointerOver && cursorRay(camera, ndc.x, ndc.y, rayDir);
  if (pointerField.update(dt, particles.posB, camera.position, rayDir, hasCursor)) {
    particles.markDispDirty();
  }

  // 카메라가 움직이는 동안에는 잔상을 짧게 끊는다.
  // 화면 공간 누적이라 그대로 두면 화면 전체가 번진다.
  const decay = 0.945 - controls.motion * 0.2;
  postfx.render(scene, camera, decay);

  // FPS 표시
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) {
    fpsShown = fpsFrames / fpsAccum;
    ui.setStats(shapeCount, fpsShown);
    fpsAccum = 0; fpsFrames = 0;
  }

  // 오프닝이 끝난 뒤 2.5초 평균이 40fps 미만이면 입자 수를 낮춘다.
  // 오프닝 도중에 재구성하면 첫 장면이 끊긴다.
  if (!probeDone && shapeCount === DEFAULT_COUNT && !morph.intro) {
    probeTime += dt; probeFrames++;
    if (probeTime > 2.5) {
      probeDone = true;
      if (probeFrames / probeTime < 40) {
        console.info("저사양 감지: 입자 수를", LOW_COUNT, "로 낮춥니다");
        // 재구성 때는 오프닝을 다시 틀지 않는다.
        buildWorld(LOW_COUNT, morph.currentId, false);
      }
    }
  }
}

frame();
