import * as THREE from "three";
import { SHAPE_LIST, buildShape, buildScatter, bottomOf, WORLD_SPAN, unitOf } from "./shapes.js";
import { createParticles } from "./particles.js";
import { createChips } from "./chips.js";
import { formById, DEFAULT_FORM } from "./forms.js";
import { createMorph } from "./morph.js";
import { createPostFX } from "./postfx.js";
import { createControls, cursorRay } from "./controls.js";
import { createPointerField } from "./pointer.js";
import { createUI } from "./ui.js";
import { createGround, pickCell } from "./ground.js";
import { presetFor } from "./cameraPresets.js";
import { createShow } from "./show.js";

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
let shapeCount = 0;
let currentForm = DEFAULT_FORM;
// 저사양으로 판정되면 이후 모든 모양에서 낮은 입자 수를 쓴다.
let lowQuality = false;

// 입자 크기를 픽셀이 아니라 월드 단위로 다루기 위한 환산 계수.
// resize에서 실제 값으로 채운다.
let projScale = 1000;

// ?debug=1 진단. 기기에서 실제로 무슨 일이 일어나는지 수치로 본다.
const DEBUG = new URLSearchParams(location.search).has("debug");
const debugEl = document.getElementById("debug");
let nRebuild = 0, nResize = 0, nCtxLost = 0;

const ground = createGround();
scene.add(ground.object);

// 형상 캐시를 buildWorld 바깥에 둔다. 바닥 높이를 정하려면 지금 렌더링하지
// 않는 형상의 바닥도 미리 알아야 한다.
let shapeCache = new Map();
let bottomCache = new Map();

function getShape(id) {
  if (!shapeCache.has(id)) {
    try {
      shapeCache.set(id, buildShape(id, shapeCount));
    } catch (err) {
      // 형상 생성이 실패하면 현재 형상을 유지한다.
      console.warn("형상 생성 실패:", id, err);
      return shapeCache.get(morph?.currentId) ?? new Float32Array(shapeCount * 3);
    }
  }
  return shapeCache.get(id);
}

function bottomFor(id) {
  if (!bottomCache.has(id)) {
    bottomCache.set(id, bottomOf(getShape(id), shapeCount));
  }
  return bottomCache.get(id);
}

const sizeOf = (id) => SHAPE_LIST.find((s) => s.id === id)?.realSize ?? 10;
const cellFor = (id) => pickCell(sizeOf(id), WORLD_SPAN);

const ui = createUI({
  onShape: (id) => morph.request(id),
  onMode: (id) => morph.setMode(id),
  onScrub: (v) => morph.setProgress(v),
  onPlayToggle: () => morph.setPlaying(!morph.playing),
  onAutoTour: (v) => morph.setAutoTour(v),
  onCursorRadius: (v) => pointerField.setRadius(v),
  onShowToggle: () => show.toggle(),
  onForm: (id) => {
    if (id === currentForm) return;
    currentForm = id;
    // 모양이 바뀌면 입자 수와 지오메트리가 통째로 바뀌므로 재구성한다.
    // 진행 중이던 전이는 현재 형상에 정착한 상태로 넘어간다.
    buildWorld(morph.currentId, false);
  },
});

function buildWorld(startId, withIntro) {
  nRebuild++;
  const form = formById(currentForm);
  const count = lowQuality ? form.low : form.high;

  if (particles) {
    scene.remove(particles.object);
    particles.dispose();
  }

  // 입자 수가 바뀌면 캐시된 형상은 못 쓴다.
  if (shapeCount !== count) {
    shapeCache = new Map();
    bottomCache = new Map();
    shapeCount = count;
  }

  particles = form.kind === "chips"
    ? createChips(count, form.id)
    : createParticles(count);
  // 칩 렌더러는 픽셀 크기를 쓰지 않으므로 이 uniform이 없다.
  if (particles.material.uniforms.uProjScale) {
    particles.material.uniforms.uProjScale.value = projScale;
  }
  scene.add(particles.object);

  pointerField = createPointerField(particles.disp, count);
  pointerField.setRadius(ui.cursorRadius);

  morph = createMorph({
    particles,
    getShape,
    shapeIds,
    startId,
    mode: morph?.mode,
    autoTour: morph?.autoTour,
    introFrom: withIntro ? buildScatter(count) : null,
    onUpdate: (s) => ui.sync(decorate(s)),
  });

  ui.sync(decorate({
    currentId: morph.currentId,
    fromId: morph.currentId,
    toId: morph.currentId,
    t: morph.progress,
    playing: morph.playing,
    queued: null,
    autoTour: morph.autoTour,
    mode: morph.mode,
    canScrub: false,
  }));
}

// morph는 형상 id만 안다. 모양·크기·쇼 상태는 여기서 붙인다.
function decorate(s) {
  return Object.assign(s, {
    form: currentForm,
    realSize: sizeOf(s.toId).toLocaleString("ko-KR"),
    unit: unitOf(s.toId),
    cellMeters: cellFor(s.toId).meters,
    showRunning: show ? show.running : false,
    showIndex: show ? show.index : 0,
    showTotal: show ? show.total : 0,
  });
}

const INTRO_FAR = 10.2;   // 오프닝 시작 거리
const INTRO_NEAR = 6.3;   // 조립이 끝났을 때 거리

// 세로로 긴 화면에서는 가로 시야가 좁아 형상이 양옆으로 잘린다.
// 카메라 거리는 가로 기준으로도 형상이 들어올 만큼은 확보해야 한다.
// 가로가 넉넉한 화면에서는 원래 거리를 그대로 쓴다.
const FIT_MARGIN = 1.8;   // 형상 반경 1.5 + 비행 중 부풀림 여유

function fitRadius(r) {
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
  return Math.max(r, FIT_MARGIN / Math.max(halfW, 0.05));
}

let show = null;

buildWorld(shapeIds[0], true);
if (morph.intro) controls.setDistance(INTRO_FAR, true);

// 객체가 아니라 가져오는 함수를 넘긴다. 재구성하면 morph가 교체되므로
// 붙잡아 두면 쇼가 죽은 morph를 조종하게 된다.
show = createShow({ getMorph: () => morph, onChange: () => ui.sync(decorate(morph.state())) });

let lastW = 0, lastH = 0;

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  // 모바일은 주소창이 오르내릴 때 같은 크기로도 리사이즈를 쏜다.
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  nResize++;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const bw = Math.max(1, Math.floor(w * dpr));
  const bh = Math.max(1, Math.floor(h * dpr));

  // gl_PointSize는 장치 픽셀 단위라 드로잉 버퍼 높이를 쓴다.
  // 칩 렌더러는 픽셀 크기를 쓰지 않아 이 uniform이 없다. 가드가 없으면
  // 칩 모드에서 리사이즈할 때마다 예외가 나고 아래 postfx 갱신이 통째로
  // 건너뛰어져, 캔버스와 렌더 타깃 크기가 어긋난 채로 그려진다.
  projScale = bh / (2 * Math.tan((camera.fov * Math.PI) / 360));
  if (particles && particles.material.uniforms.uProjScale) {
    particles.material.uniforms.uProjScale.value = projScale;
  }

  if (postfx) postfx.setSize(bw, bh);
  else postfx = createPostFX(renderer, bw, bh);
}

resize();
window.addEventListener("resize", resize);

// 모바일은 메모리 압박으로 WebGL 컨텍스트를 잃는 일이 있다.
// preventDefault를 부르지 않으면 브라우저가 복구를 시도조차 하지 않아
// 캔버스가 영영 검은 채로 남는다.
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  nCtxLost++;
  console.warn("WebGL 컨텍스트 손실 — 복구 대기");
});

canvas.addEventListener("webglcontextrestored", () => {
  console.info("WebGL 컨텍스트 복구됨");
  // 크기를 다시 계산해 렌더 타깃을 새 컨텍스트에 올린다.
  lastW = 0; lastH = 0;
  resize();
});

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
let introDolly = false;
// 어느 형상에 맞춰 카메라를 세워뒀는지. 형상이 바뀔 때만 앵글을 옮긴다.
let posedFor = null;


function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);

  // 오프닝 돌리 인. 멀리서 시작해야 흩어진 구름 전체가 프레임에 들어온다.
  if (morph.intro) {
    controls.setDistance(fitRadius(INTRO_FAR) + (fitRadius(INTRO_NEAR) - fitRadius(INTRO_FAR)) * morph.progress);
    introDolly = true;
  } else if (introDolly) {
    // 오프닝이 끝났거나, 도중에 입자 모양을 바꿔 재구성되면서 취소됐다.
    // 여기서 한 번 당겨주지 않으면 카메라가 오프닝 시작 거리에 갇힌다.
    introDolly = false;
    controls.setDistance(fitRadius(INTRO_NEAR));
  }

  show.update(dt);

  // --- 자동 카메라 ---------------------------------------------------------
  // 사용자가 최근에 카메라를 만졌으면 손대지 않는다. 오프닝 중에도 비운다
  // (돌리 인이 거리를 직접 몰고 있다).
  const autoCam = !morph.intro && !controls.userRecently(8);
  if (autoCam) {
    const preset = presetFor(morph.toId);
    const radius = fitRadius(preset.radius);
    if (posedFor !== morph.toId) {
      controls.setPose(preset.theta, preset.phi, radius);
      posedFor = morph.toId;
    }
    if (show.running) {
      if (morph.progress < 1) {
        // 비행 구간에는 카메라가 입자 떼 쪽으로 밀고 들어갔다 빠진다.
        // 너무 깊이 들어가면 입자가 화면을 덮어 형상이 사라진다.
        const u = Math.min(1, Math.max(0, (morph.progress - 0.12) / 0.72));
        // 비행 중에는 입자가 형상 반경 밖으로 부풀기 때문에, 정착 거리
        // 기준으로 재면 생각보다 훨씬 가까워진다. 18%면 충분히 다가온다.
        controls.setDistance(radius * (1 - 0.18 * Math.sin(Math.PI * u)));
      } else {
        // 형상을 보여주는 동안에는 천천히 돈다. 정지 화면과 확실히 다르다.
        controls.orbit(dt * 0.16);
      }
    }
  }

  controls.update(dt);
  morph.update(dt);

  // --- 바닥과 기준점 -------------------------------------------------------
  // 전이 중에는 두 형상의 바닥 중 낮은 쪽에 맞춘다. 올라가는 쪽으로 먼저
  // 따라가면 도착 형상이 바닥을 뚫고 내려간 것처럼 보인다.
  ground.setTargetY(Math.min(bottomFor(morph.fromId), bottomFor(morph.toId)) - 0.04);
  ground.setCell(cellFor(morph.toId).world);
  ground.update(dt);
  controls.setFloor(ground.object.position.y);

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

    if (DEBUG) {
      debugEl.hidden = false;
      debugEl.textContent = [
        "fps      " + Math.round(fpsShown),
        "dpr      " + dpr + " (raw " + (window.devicePixelRatio || 1) + ")",
        "css      " + lastW + "x" + lastH,
        "buffer   " + Math.floor(lastW * dpr) + "x" + Math.floor(lastH * dpr),
        "RT       " + (postfx ? postfx.textureType : "-"),
        "particle " + shapeCount + (lowQuality ? " (low)" : ""),
        "form     " + currentForm,
        "rebuild  " + nRebuild,
        "resize   " + nResize,
        "ctxlost  " + nCtxLost,
        "show     " + (show.running ? show.index + 1 + "/" + show.total : "off"),
        "shape    " + morph.fromId + "->" + morph.toId + " " + Math.round(morph.progress * 100) + "%",
        "cam      r" + camera.position.length().toFixed(1),
      ].join("\n");
    }
  }

  // 오프닝이 끝난 뒤 2.5초 평균이 40fps 미만이면 입자 수를 낮춘다.
  // 오프닝 도중에 재구성하면 첫 장면이 끊긴다.
  if (!probeDone && !lowQuality && !morph.intro) {
    probeTime += dt; probeFrames++;
    if (probeTime > 2.5) {
      probeDone = true;
      if (probeFrames / probeTime < 40) {
        lowQuality = true;
        console.info("저사양 감지: 입자 수를 낮춥니다");
        // 재구성 때는 오프닝을 다시 틀지 않는다.
        buildWorld(morph.currentId, false);
      }
    }
  }
}

frame();
