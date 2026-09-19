import { SHAPE_LIST } from "./shapes.js";

// 쇼 모드 — 기승전결이 있는 자동 연출.
//
// 순서는 형상의 realSize 오름차순이다. 형상의 월드 크기는 전부 같으므로
// 실제로 커지는 것은 없지만, 옆에 선 사람이 계속 작아진다. 구(6m)에서
// 시작해 아치형 다리(40m)로 끝나면 사람이 1/7로 줄어든다 — 눈에는
// 구조물이 점점 거대해지는 것으로 읽힌다.
//
// 끝나면 처음으로 돌아간다. 40m에서 6m로 떨어지는 낙차가 다음 순환의
// 크레셴도를 다시 살려준다.

export const SHOW_ORDER = SHAPE_LIST
  .slice()
  .sort((a, b) => a.realSize - b.realSize)
  .map((s) => s.id);

const DWELL = 1.6;   // 형상을 보여주고 다음으로 넘어가기까지(초)

export function createShow({ morph, onChange }) {
  let running = false;
  let index = 0;
  let dwell = 0;

  return {
    get running() { return running; },
    get index() { return index; },
    get total() { return SHOW_ORDER.length; },

    start() {
      running = true;
      index = 0;
      dwell = 0;
      morph.setAutoTour(false);
      morph.request(SHOW_ORDER[0]);
      onChange?.();
    },

    stop() {
      running = false;
      onChange?.();
    },

    toggle() {
      if (running) this.stop();
      else this.start();
    },

    update(dt) {
      if (!running) return;

      // 전이가 진행 중이면 기다린다.
      if (morph.playing || morph.progress < 1) {
        dwell = 0;
        return;
      }

      dwell += dt;
      if (dwell < DWELL) return;

      dwell = 0;
      index = (index + 1) % SHOW_ORDER.length;
      // 비트마다 변형 방식을 번갈아 쓴다. 같은 연출이 열 번 반복되면
      // 순서만 다른 자동 순회와 구분이 안 된다.
      morph.setMode(index % 2 === 0 ? "flock" : "assemble");
      morph.request(SHOW_ORDER[index]);
      onChange?.();
    },
  };
}
