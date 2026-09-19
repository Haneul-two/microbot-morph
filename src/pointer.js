// 커서 반발 스프링.
//
// 변위를 CPU 버퍼에 누적해 aDisp 속성으로 올린다. 커서가 떠나면 감쇠로
// 제자리에 돌아온다.
//
// 판정 기준은 커서가 만드는 *시선 광선까지의 수직 거리*다. 광선을 축으로
// 하는 원기둥 안의 입자가 축에서 멀어지는 방향으로 밀린다. 화면에서 커서에
// 겹쳐 보이는 입자가 깊이와 상관없이 반응한다.
//
// 거리 판정에는 입자의 *정착 좌표*를 쓴다. 비행 중 실시간 좌표는 셰이더가
// 계산하므로 CPU에서 다시 구하려면 경로 수식을 두 벌 유지해야 하는데,
// 그 중복이 버그의 원인이 된다. 사용자가 입자를 만지는 순간은 대개
// 형상이 정착한 상태라 실질적 차이가 없다.

const RADIUS = 0.55;
const STRENGTH = 4.5;
const MAX_DISP = 0.8;

export function createPointerField(disp, count) {
  let energy = 0;

  return {
    get energy() { return energy; },

    // 반환값: 속성 업로드가 필요하면 true.
    update(dt, settled, rayOrigin, rayDir, active) {
      // 변위가 완전히 가라앉았고 커서도 없으면 아무것도 하지 않는다.
      if (!active && energy < 1e-4) return false;

      const decay = Math.pow(0.02, dt);
      const r2 = RADIUS * RADIUS;
      const ox = rayOrigin.x, oy = rayOrigin.y, oz = rayOrigin.z;
      const dx0 = rayDir.x, dy0 = rayDir.y, dz0 = rayDir.z;
      let sum = 0;

      for (let i = 0; i < count; i++) {
        const o = i * 3;
        let dx = disp[o] * decay;
        let dy = disp[o + 1] * decay;
        let dz = disp[o + 2] * decay;

        if (active) {
          const vx = settled[o] - ox;
          const vy = settled[o + 1] - oy;
          const vz = settled[o + 2] - oz;
          const along = vx * dx0 + vy * dy0 + vz * dz0;
          if (along > 0) {
            // 광선 축에 수직인 성분.
            const px = vx - dx0 * along;
            const py = vy - dy0 * along;
            const pz = vz - dz0 * along;
            const d2 = px * px + py * py + pz * pz;
            if (d2 < r2) {
              const d = Math.sqrt(d2) || 1e-4;
              const f = 1 - d / RADIUS;
              const push = f * f * STRENGTH * dt;
              dx += (px / d) * push;
              dy += (py / d) * push;
              dz += (pz / d) * push;
            }
          }
        }

        const m = Math.hypot(dx, dy, dz);
        if (m > MAX_DISP) {
          const s = MAX_DISP / m;
          dx *= s; dy *= s; dz *= s;
        }

        disp[o] = dx; disp[o + 1] = dy; disp[o + 2] = dz;
        sum += Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      }

      energy = sum / count;
      return true;
    },

    clear() {
      disp.fill(0);
      energy = 0;
    },
  };
}
