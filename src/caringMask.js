// 케어링 로고 마크의 실루엣.
//
// 원본 이미지에서 마크 영역(글자 제외)만 잘라 96x68 비트마스크로 구웠다.
// 이미지 파일을 런타임에 들고 다니지 않으므로 "외부 에셋 0개" 원칙이
// 유지된다. 1비트 = 격자 한 칸, 4칸이 16진수 한 글자다.
//
// 추출 조건: 채도 40 이상이거나 밝기 200 미만인 픽셀을 잉크로 보고,
// 한 칸의 40% 이상이 잉크면 채운 칸으로 판정했다.

export const MASK_W = 96;
export const MASK_H = 68;

const HEX =
  "000000007f80000000000000000000007f8000000000000000000001fff00000000000000000000ffff8000000000000000" +
  "0001ffffe0000000000000000003fffff0000000000000000003fffff0000000000000000007fe07f8000000000000000007f" +
  "003fc00000000000000000fe001fc00000000000000003fc000ff00000000000000003f00007f00000000000000003f00007f" +
  "00000000000000007f00007f80000000000000007e00001f8000000000000000fe00001fcfc0000000000000fc00000fffffe" +
  "00000000000fc0000fffffff80000000000fc0000fffffff80000000001fc0007ffffffff0000000001f8003fffffffffc000" +
  "000001f800fffff007ffe000000001f801fffff0003ff800000001f801fffff0003ff800000001f80fff83f00007fc0000000" +
  "1f81ffc03fc0001fc00000003f03fe000fc0000fe00000003f0ffc000fc00007e00000003f1ff0000fe00007e00000003f1ff" +
  "0000fe00007e00000003f3fe00007f00007e0001f803f7f800007f00007e0003fe03f7f000003f80007e000fffc3ffe000001" +
  "ff0007e000fffe3ffc000001fff807e000fffe3ffc000001fff807e000fffffffc000000fffffffe00fefffff00000003fff" +
  "ffffc0fe3ffff00000000ffffffff8fe1fffe000000003fffffffcfe1fffe000000003fffffffcfe03ffe00000000001fffff" +
  "cff01fffc00000000001fc3fe3f003ffffe000000001f807e3f801ffffffff000007f807f1f801ffffffffe00007e003f1f80" +
  "1ffffffffe00007e003f1fc00fffffffffc000fe007f0fe00fe3ffffffe001fc007e0ff80fe001fffff001fc00fe07f807e00" +
  "0003ff003f801fc01fc07f0000003f807f003fc01fc07f0000003f807f003fc00ff07f0000001f81ff00ff8007fc3fc000001" +
  "f83fe01ff0007fe3fc000001f8ff807fc0001ff8fe000001fbff03ff80001ff8fe000001fbff03ff800007ffff000001fffe0" +
  "fff000003ffff800003fffcfffc000000fffff00007fffffff00000003ffffc003fffffffc00000000ffffff7fffffffe0000" +
  "00000ffffff7fffffffe0000000003fffffffffffff800000000007fffffffffff8000000000001ffffffffffc00000000000" +
  "000ffffffff80000000";

let cells = null;

// 마스크를 Uint8Array로 펼친다. 한 번만 만들고 재사용한다.
export function maskCells() {
  if (cells) return cells;
  cells = new Uint8Array(MASK_W * MASK_H);
  for (let i = 0; i < HEX.length; i++) {
    const v = parseInt(HEX[i], 16);
    for (let k = 0; k < 4; k++) {
      const idx = i * 4 + k;
      if (idx < cells.length) cells[idx] = (v >> (3 - k)) & 1;
    }
  }
  return cells;
}

export function isInk(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= MASK_W || gy >= MASK_H) return false;
  return maskCells()[gy * MASK_W + gx] === 1;
}
