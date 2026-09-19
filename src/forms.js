// 입자 모양 프리셋.
//
// 입자 수가 모양에 딸려 오는 이유: 점 스프라이트는 입자당 vertex shader가
// 1번 돌지만 정육면체는 36번 돈다. 같은 6만 개로는 60fps가 안 나온다.
//
// 그리고 이건 손해가 아니다. 영화의 마이크로봇은 하나하나가 눈에 보이는
// 칩이지 안개가 아니다. 6만 개는 먼지 구름이 되고, 1.2만 개는 로봇 떼가 된다.

export const PARTICLE_FORMS = [
  { id: "mist", label: "안개", kind: "points", high: 65536, low: 16384 },
  { id: "cube", label: "정육면체", kind: "chips", high: 12288, low: 4096 },
  { id: "rod", label: "막대", kind: "chips", high: 12288, low: 4096 },
  { id: "octa", label: "팔면체", kind: "chips", high: 12288, low: 4096 },
];

export const DEFAULT_FORM = "mist";

export function formById(id) {
  return PARTICLE_FORMS.find((f) => f.id === id) || PARTICLE_FORMS[0];
}
