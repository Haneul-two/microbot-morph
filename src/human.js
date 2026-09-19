import * as THREE from "three";

// 사람 실루엣. 이 프로젝트에서 크기를 알려주는 유일한 기준점이다.
//
// 형상은 전부 반경 1.5로 정규화돼 있어서, 형상을 키우는 대신 이 사람을
// 줄인다. 나선계단(24m) 옆에서는 계단 높이의 7%가 되고, 구(6m) 옆에서는
// 28%가 된다. 눈에는 형상이 커진 것으로 보인다.
//
// 외부 에셋 없이 기본 도형만 조립한다. 화면에서 수십 픽셀밖에 안 되므로
// 실루엣만 맞으면 충분하다.

const VERT = `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = `
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(vec3(-0.45, 0.85, 0.55));

  float lam = max(dot(n, l), 0.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);

  // 어두운 바닥 위의 어두운 실루엣이라 기본색을 눌러두면 아예 안 보인다.
  vec3 col = uBaseColor * (0.5 + 1.1 * lam);
  col += uRimColor * fres * 0.85;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 키를 1로 두고 만든 비율. 바깥에서 scale로 실제 크기를 준다.
const PARTS = [
  // [지오메트리 인자, 위치]
  { size: [0.115, 0.115, 0.115], pos: [0, 0.925, 0], sphere: true },
  { size: [0.09, 0.05, 0.09], pos: [0, 0.855, 0] },        // 목
  { size: [0.22, 0.26, 0.13], pos: [0, 0.71, 0] },         // 가슴
  { size: [0.19, 0.11, 0.12], pos: [0, 0.545, 0] },        // 골반
  { size: [0.075, 0.50, 0.095], pos: [-0.055, 0.25, 0] },  // 다리
  { size: [0.075, 0.50, 0.095], pos: [0.055, 0.25, 0] },
  { size: [0.065, 0.36, 0.075], pos: [-0.145, 0.66, 0] },  // 팔
  { size: [0.065, 0.36, 0.075], pos: [0.145, 0.66, 0] },
];

export function createHuman() {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uBaseColor: { value: new THREE.Color(0x232f3e) },
      uRimColor: { value: new THREE.Color(0x9fb6d2) },
    },
  });

  const group = new THREE.Group();
  const geometries = [];

  for (const p of PARTS) {
    const geo = p.sphere
      ? new THREE.SphereGeometry(p.size[0] * 0.5, 10, 8)
      : new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    group.add(mesh);
  }

  group.frustumCulled = false;

  let targetHeight = 0.5;

  return {
    object: group,

    // 형상의 realSize(미터)에 맞춰 키를 정한다.
    // 사람 키 1.7m가 형상의 월드 크기에서 차지하는 비율.
    setScaleFor(realSizeMeters, worldSpan) {
      targetHeight = (1.7 / realSizeMeters) * worldSpan;
    },

    // 바닥 높이가 바뀌면 발을 붙여 따라간다.
    setGroundY(y) { group.position.y = y; },

    place(x, z) { group.position.x = x; group.position.z = z; },

    update(dt) {
      const k = 1 - Math.pow(0.02, dt);
      const s = group.scale.x + (targetHeight - group.scale.x) * k;
      group.scale.setScalar(s);
    },

    dispose() {
      for (const g of geometries) g.dispose();
      material.dispose();
    },
  };
}
