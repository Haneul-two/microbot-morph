// 전이 상태.
//
// 진행률 t 하나가 전부다. 셰이더가 t만 보고 위치를 계산하므로
// 스크러버는 t를 직접 쓰는 것으로 구현된다 — 되감기가 공짜다.

const DURATION = 2.4;      // 전이 1회 길이(초)
const TOUR_PAUSE = 2.6;    // 자동 순회 시 형상을 보여주는 시간(초)

export function createMorph({ particles, getShape, shapeIds, startId, onUpdate }) {
  let currentId = shapeIds.includes(startId) ? startId : shapeIds[0];
  let fromId = currentId;
  let toId = currentId;
  let mode = "flock";
  let t = 1;
  let playing = false;
  let queued = null;
  let autoTour = true;
  let idle = 0;

  particles.setTransition(getShape(currentId), getShape(currentId), mode);
  particles.material.uniforms.uT.value = 1;

  function begin(id) {
    if (id === currentId) return;
    fromId = currentId;
    toId = id;
    particles.setTransition(getShape(fromId), getShape(toId), mode);
    t = 0;
    playing = true;
    idle = 0;
    notify();
  }

  function notify() {
    onUpdate?.({
      currentId, fromId, toId, t, playing, queued, autoTour, mode,
      canScrub: fromId !== toId,
      transitioning: fromId !== toId && t < 1,
    });
  }

  return {
    get currentId() { return currentId; },
    get toId() { return toId; },
    get progress() { return t; },
    get playing() { return playing; },
    get autoTour() { return autoTour; },
    get mode() { return mode; },
    // 전이가 한 번이라도 걸려 있어야 스크럽할 대상이 있다.
    get canScrub() { return fromId !== toId; },

    // 전이 중이면 큐에 넣는다. 전이 도중의 좌표에서 새 전이를 시작하려면
    // 셰이더의 경로 수식을 JS에 복제해야 하는데, 두 벌을 동기화하는
    // 비용이 얻는 것보다 크다.
    request(id) {
      if (playing && t < 1) {
        queued = (id === toId) ? null : id;
        notify();
      } else if (t < 1) {
        // 스크러버로 멈춰 세운 상태. 마저 재생한 뒤 이어간다.
        queued = (id === toId) ? null : id;
        playing = true;
        notify();
      } else {
        begin(id);
      }
    },

    setMode(id) {
      if (id === mode) return;
      mode = id;
      // 시차 배열만 다시 채우면 된다. 경로도 셰이더도 그대로다.
      particles.setTransition(getShape(fromId), getShape(toId), mode);
      notify();
    },

    setProgress(v) {
      if (fromId === toId) return;
      t = Math.min(1, Math.max(0, v));
      playing = false;
      // 스크럽으로 끝에 닿아도 정착 처리는 하지 않는다.
      // 사용자가 자유롭게 되감을 수 있어야 한다.
      notify();
    },

    setPlaying(v) {
      if (v && t >= 1) t = 0;
      playing = v;
      notify();
    },

    setAutoTour(v) {
      autoTour = v;
      idle = 0;
      notify();
    },

    update(dt) {
      if (playing) {
        t = Math.min(1, t + dt / DURATION);
        if (t >= 1) playing = false;
        notify();
      }

      // 정착 판정은 재생으로 끝났는지가 아니라 t가 끝에 닿았는지로 한다.
      // 스크러버로 100%까지 민 경우에도 정착시켜야 대기 중인 형상이
      // 실행되고 다음 선택이 정상 동작한다.
      if (t >= 1 && currentId !== toId) {
        currentId = toId;
        idle = 0;
        if (queued) {
          const next = queued;
          queued = null;
          begin(next);          // begin이 notify까지 한다
        } else {
          notify();
        }
      } else if (!playing && t >= 1) {
        idle += dt;
        if (autoTour && !queued && idle > TOUR_PAUSE) {
          const i = shapeIds.indexOf(currentId);
          begin(shapeIds[(i + 1) % shapeIds.length]);
        }
      }

      particles.material.uniforms.uT.value = t;
    },
  };
}
