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

export const RADIUS_MIN = 0.08;
export const RADIUS_MAX = 0.75;
export const RADIUS_DEFAULT = 0.22;

const STRENGTH = 4.5;

export function createPointerField(disp, count) {
  let energy = 0;
  let radius = RADIUS_DEFAULT;

  return {
    get energy() { return energy; },
    get radius() { return radius; },

    setRadius(v) {
      radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, v));
    },

    // 반환값: 속성 업로드가 필요하면 true.
    update(dt, settled, rayOrigin, rayDir, active) {
      // 변위가 완전히 가라앉았고 커서도 없으면 아무것도 하지 않는다.
      if (!active && energy < 1e-4) return false;

      const decay = Math.pow(0.02, dt);
      const r2 = radius * radius;
      // 밀려나는 거리는 반경에 비례시킨다. 고정 상한을 쓰면 반경을 줄여도
      // 한 번 밀린 입자가 똑같이 멀리 날아가 조절이 안 되는 느낌이 든다.
      const maxDisp = radius * 1.4;
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
              const f = 1 - d / radius;
              const push = f * f * STRENGTH * dt;
              dx += (px / d) * push;
              dy += (py / d) * push;
              dz += (pz / d) * push;
            }
          }
        }

        const m = Math.hypot(dx, dy, dz);
        if (m > maxDisp) {
          const s = maxDisp / m;
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
