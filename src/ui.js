import { SHAPE_LIST } from "./shapes.js";
import { DELAY_MODES } from "./delayModes.js";
import { PARTICLE_FORMS } from "./forms.js";

// 패널 DOM. 마크업은 index.html에 있고 여기서는 버튼 생성과 상태 반영만 한다.

const labelOf = (id) => SHAPE_LIST.find((s) => s.id === id)?.label ?? id;

export function createUI(handlers) {
  const shapesEl = document.getElementById("shapes");
  const modesEl = document.getElementById("modes");
  const scrubEl = document.getElementById("scrub");
  const playEl = document.getElementById("play");
  const percentEl = document.getElementById("percent");
  const transitionEl = document.getElementById("transitionLabel");
  const autoTourEl = document.getElementById("autoTour");
  const cursorRadiusEl = document.getElementById("cursorRadius");
  const cursorRadiusValueEl = document.getElementById("cursorRadiusValue");
  const statCountEl = document.getElementById("statCount");
  const statFpsEl = document.getElementById("statFps");
  const statSizeEl = document.getElementById("statSize");
  const showBtnEl = document.getElementById("showBtn");
  const panelEl = document.getElementById("panel");
  const hintEl = document.getElementById("hint");
  const hudEl = document.getElementById("showHud");
  const hudIndexEl = document.getElementById("hudIndex");
  const hudTotalEl = document.getElementById("hudTotal");
  const hudNameEl = document.getElementById("hudName");
  const hudSizeEl = document.getElementById("hudSize");
  const hudCellEl = document.getElementById("hudCell");

  showBtnEl.addEventListener("click", () => handlers.onShowToggle());

  const shapeButtons = new Map();
  for (const s of SHAPE_LIST) {
    const b = document.createElement("button");
    b.textContent = s.label;
    b.addEventListener("click", () => handlers.onShape(s.id));
    shapesEl.appendChild(b);
    shapeButtons.set(s.id, b);
  }

  const formsEl = document.getElementById("forms");
  const formButtons = new Map();
  for (const f of PARTICLE_FORMS) {
    const b = document.createElement("button");
    b.textContent = f.label;
    b.addEventListener("click", () => handlers.onForm(f.id));
    formsEl.appendChild(b);
    formButtons.set(f.id, b);
  }

  const modeButtons = new Map();
  for (const m of DELAY_MODES) {
    const b = document.createElement("button");
    b.textContent = m.label;
    b.addEventListener("click", () => handlers.onMode(m.id));
    modesEl.appendChild(b);
    modeButtons.set(m.id, b);
  }

  scrubEl.addEventListener("input", () => {
    handlers.onScrub(Number(scrubEl.value) / 1000);
  });

  playEl.addEventListener("click", () => handlers.onPlayToggle());
  autoTourEl.addEventListener("change", () => handlers.onAutoTour(autoTourEl.checked));

  cursorRadiusEl.addEventListener("input", () => {
    const v = Number(cursorRadiusEl.value) / 100;
    cursorRadiusValueEl.textContent = v.toFixed(2);
    handlers.onCursorRadius(v);
  });

  // 패널은 세로 스크롤이 되는데, 휠로 스크롤하다 슬라이더 위를 지나가면
  // 브라우저가 스크롤 대신 슬라이더 값을 바꿔버린다. 의도한 조작이 아니다.
  for (const el of [scrubEl, cursorRadiusEl]) {
    el.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  }

  let scrubbing = false;
  scrubEl.addEventListener("pointerdown", () => { scrubbing = true; });
  const stop = () => { scrubbing = false; };
  scrubEl.addEventListener("pointerup", stop);
  scrubEl.addEventListener("pointercancel", stop);

  return {
    sync(state) {
      for (const [id, b] of shapeButtons) {
        b.classList.toggle("active", id === state.toId);
        b.classList.toggle("queued", id === state.queued);
      }
      for (const [id, b] of modeButtons) {
        b.classList.toggle("active", id === state.mode);
      }
      for (const [id, b] of formButtons) {
        b.classList.toggle("active", id === state.form);
      }

      // 사용자가 슬라이더를 잡고 있는 동안에는 값을 덮어쓰지 않는다.
      if (!scrubbing) scrubEl.value = String(Math.round(state.t * 1000));
      scrubEl.disabled = !state.canScrub;

      percentEl.textContent = Math.round(state.t * 100) + "%";
      playEl.textContent = state.playing ? "❚❚" : "▶";
      transitionEl.textContent = state.canScrub
        ? labelOf(state.fromId) + " → " + labelOf(state.toId)
        : labelOf(state.currentId);
      autoTourEl.checked = state.autoTour;

      // 크기 표시가 이 프로젝트에서 스케일을 말로 확인시켜 주는 유일한 곳이다.
      const unit = state.unit || "m";
      statSizeEl.textContent = state.realSize ? state.realSize + " " + unit : "—";

      showBtnEl.textContent = state.showRunning ? "■ 쇼 정지" : "▶ 쇼 시작";
      showBtnEl.classList.toggle("running", Boolean(state.showRunning));

      // 쇼 중에는 패널을 접고 화면 아래에 큰 자막을 띄운다.
      const running = Boolean(state.showRunning);
      panelEl.classList.toggle("collapsed", running);
      hintEl.hidden = running;
      hudEl.hidden = !running;
      if (running) {
        hudIndexEl.textContent = String((state.showIndex ?? 0) + 1);
        hudTotalEl.textContent = String(state.showTotal ?? 0);
        hudNameEl.textContent = labelOf(state.toId);
        hudSizeEl.textContent = (state.realSize ?? "—") + " " + unit;
        hudCellEl.textContent = (state.cellMeters ?? "—") + " " + unit;
      }
    },

    // 입자 시스템을 다시 만들어도 슬라이더에 표시된 값이 그대로 적용되도록
    // 현재 값을 돌려준다.
    get cursorRadius() { return Number(cursorRadiusEl.value) / 100; },

    setStats(count, fps) {
      statCountEl.textContent = count.toLocaleString("ko-KR") + " 입자";
      statFpsEl.textContent = fps > 0 ? Math.round(fps) + " fps" : "— fps";
    },
  };
}
