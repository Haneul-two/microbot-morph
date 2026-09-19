import * as THREE from "three";

// 자체 구현 궤도 카메라.
// three의 OrbitControls는 examples/jsm에 있어 CDN 제공이 불안정하다.
// 필요한 건 드래그 회전·휠 줌·핀치 줌뿐이라 직접 만드는 편이 의존성이 적다.

export function createControls(camera, dom) {
  // 비행 중 입자가 형상 반경 밖으로 크게 나가므로 여유를 두고 시작한다.
  let theta = 0.6, phi = 1.18, radius = 6.3;
  let tTheta = theta, tPhi = phi, tRadius = radius;
  let dragging = false, lastX = 0, lastY = 0, pinch = 0;

  // 잔상은 화면 공간에 누적되므로 카메라가 움직이면 번진다.
  // 이 값으로 그 순간 잔상 감쇠를 낮춘다.
  let motion = 0;

  const MIN_PHI = 0.16, MAX_PHI = Math.PI - 0.16;
  // 쇼의 접근 연출이 입자 떼 가장자리까지 들어가려면 형상 반경(1.5)에
  // 가까운 곳까지 허용해야 한다.
  const MIN_R = 1.8, MAX_R = 12;

  // 카메라가 바닥 아래로 내려가면 바닥면을 뒤에서 보게 되어 통째로 사라진다.
  // 올려다보는 구도는 살리되 지면 위에는 남아 있어야 한다.
  let floorY = -Infinity;
  const FLOOR_MARGIN = 0.35;

  function phiCeiling(r) {
    if (!isFinite(floorY)) return MAX_PHI;
    const c = (floorY + FLOOR_MARGIN) / Math.max(r, 0.001);
    return Math.min(MAX_PHI, Math.acos(Math.min(1, Math.max(-1, c))));
  }

  // 사용자가 마지막으로 카메라를 직접 만진 시각. 자동 카메라가 사람의
  // 조작을 덮어쓰지 않게 하려고 기록한다.
  let userAt = -1e9;

  function rotateBy(dx, dy) {
    tTheta -= dx * 0.005;
    tPhi = Math.min(MAX_PHI, Math.max(MIN_PHI, tPhi - dy * 0.005));
    motion = 1;
    userAt = performance.now();
  }

  function zoomBy(f) {
    tRadius = Math.min(MAX_R, Math.max(MIN_R, tRadius * f));
    motion = 1;
    userAt = performance.now();
  }

  dom.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && e.isPrimary === false) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });

  dom.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rotateBy(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });

  const endDrag = (e) => {
    dragging = false;
    if (e.pointerId !== undefined && dom.hasPointerCapture?.(e.pointerId)) {
      dom.releasePointerCapture(e.pointerId);
    }
  };
  dom.addEventListener("pointerup", endDrag);
  dom.addEventListener("pointercancel", endDrag);

  dom.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomBy(1 + Math.sign(e.deltaY) * 0.09);
  }, { passive: false });

  dom.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d = Math.hypot(dx, dy);
    if (pinch > 0) zoomBy(pinch / d);
    pinch = d;
  }, { passive: false });

  dom.addEventListener("touchend", () => { pinch = 0; });

  return {
    // 프로그램이 거는 줌. 오프닝의 돌리 인에 쓴다.
    // motion을 건드리지 않는다 — 느린 돌리까지 잔상을 끊으면 오프닝에서
    // 가장 볼 만한 궤적이 사라진다.
    setDistance(r, snap = false) {
      tRadius = Math.min(MAX_R, Math.max(MIN_R, r));
      if (snap) radius = tRadius;
    },

    // 형상별 연출 앵글. 같은 구조도 밑에서 올려다보면 달라 보인다.
    setPose(theta, phi, r) {
      // theta는 한 바퀴 돌아 가까운 쪽으로 간다. 안 그러면 먼 길로 휘돈다.
      let d = theta - tTheta;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      tTheta += d;
      tPhi = Math.min(MAX_PHI, Math.max(MIN_PHI, phi));
      tRadius = Math.min(MAX_R, Math.max(MIN_R, r));
    },

    // 최근 seconds초 안에 사용자가 카메라를 직접 만졌는가.
    userRecently(seconds) {
      return performance.now() - userAt < seconds * 1000;
    },

    setFloor(y) { floorY = y; },

    update(dt) {
      const k = 1 - Math.pow(0.001, dt);
      theta += (tTheta - theta) * k;
      phi += (tPhi - phi) * k;
      radius += (tRadius - radius) * k;

      // 목표값까지 같이 눌러야 감쇠가 천장과 계속 싸우지 않는다.
      const ceil = phiCeiling(radius);
      if (tPhi > ceil) tPhi = ceil;
      if (phi > ceil) phi = ceil;

      const sp = Math.sin(phi);
      camera.position.set(
        radius * sp * Math.sin(theta),
        radius * Math.cos(phi),
        radius * sp * Math.cos(theta));
      camera.lookAt(0, 0, 0);

      motion = Math.max(0, motion - dt * 2.2);
    },
    // 0이면 정지, 1이면 방금 움직였다.
    get motion() { return motion; },
    get theta() { return theta; },
  };
}

// 커서가 만드는 시선 광선의 방향.
//
// 커서를 평면 위의 한 점으로 투영하지 않는 이유: 형상은 대부분 속이 빈
// 껍질이라 그 점이 껍질 안쪽 빈 공간에 놓이고, 결국 아무 입자에도 닿지
// 않는다. 광선까지의 거리로 판정하면 화면에서 겹쳐 보이는 입자가 깊이와
// 상관없이 밀려난다 — 사용자가 기대하는 동작이다.
export function cursorRay(camera, ndcX, ndcY, outDir) {
  outDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position);
  const l = outDir.length();
  if (l < 1e-6) return false;
  outDir.divideScalar(l);
  return true;
}
