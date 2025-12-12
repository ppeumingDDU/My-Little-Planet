// Latency 측정 코드
// import { PlanetGeneratorJS } from './js_planet.js'; // Pure JS 모듈 import
// let jsGenerator = new PlanetGeneratorJS(); // JS 인스턴스 생성

/**
 * @file main.js
 * @description Three.js와 WebAssembly(C++)를 연동하여 3D 행성을 절차적(Procedural)으로 생성하는 메인 스크립트입니다.
 * 사용자의 입력을 받아 C++ 노이즈 알고리즘을 실행하고, 그 결과를 3D 구체(Sphere)의 정점에 적용합니다.
 */

import createModule from './web/planet.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * @constant
 * @type {Object}
 * @description 애플리케이션 전반에 사용되는 설정값들을 모아둔 객체입니다.
 * 매직 넘버(하드코딩된 숫자)를 방지하고 유지보수를 쉽게 하기 위해 분리했습니다.
 */
const CONFIG = {
    /** 카메라 초기 설정 */
    camera: {
        fov: 75,           // 시야각 (Field of View)
        z: 5,              // 카메라의 Z축 초기 위치 (거리를 둠)
        targetY: -0.5      // 카메라가 바라보는 높이 조정 (행성을 화면 위쪽으로 올리기 위함)
    },
    /** 행성 기본 설정 */
    planet: {
        radius: 1,         // 기본 반지름
        segments: 200,     // 구체의 분할 수 (높을수록 지형이 더 정교해지지만 성능 부하 증가)
        oceanColor: 0x1a5fb4, // 깊은 바다색
        landColor: 0x48a348,  // 육지(숲)색
        roughness: 0.8,    // 재질의 거칠기 (빛 반사 정도)
        rotationSpeed: 0.002 // 행성 자전 속도
    },
    /** 조명 설정 */
    light: {
        sunColor: 0xffffff,     // 태양광 색상
        sunIntensity: 2,        // 태양광 강도
        sunPosition: { x: 5, y: 3, z: 2 }, // 태양 위치
        ambientColor: 0x404040  // 환경광 색상 (그림자 진 곳이 너무 어둡지 않게)
    }
};

// 색상 계산을 위해 THREE.Color 객체로 미리 변환 (RGB 값을 쉽게 얻기 위함)
const oceanColorObj = new THREE.Color(CONFIG.planet.oceanColor);
const landColorObj = new THREE.Color(CONFIG.planet.landColor);

/** @type {Object} WebAssembly 모듈 인스턴스 */
let wasmModule;

// Three.js 관련 전역 변수들
let scene, camera, renderer, controls;
let planetMesh;

/**
 * @type {Object}
 * @description HTML UI 요소들에 대한 참조를 저장하는 객체입니다.
 */
const ui = {
    btn: document.getElementById("generate-btn"),
    seed: document.getElementById("seed"),
    scale: document.getElementById("scale"),
    radius: document.getElementById("radius")
};

/**
 * @async
 * @function init
 * @description 애플리케이션의 진입점(Entry Point)입니다.
 * 1. WASM 모듈을 로드합니다.
 * 2. Three.js 씬과 조명, 기본 객체를 초기화합니다.
 * 3. 초기 행성을 생성하고 이벤트 리스너를 등록합니다.
 */
async function init() {
    try {
        // WASM 모듈 비동기 로드 (완료될 때까지 대기)
        wasmModule = await createModule();

        // 로드 완료 후 UI 활성화
        ui.btn.disabled = false;
        ui.btn.textContent = "Generate";

        // Three.js 환경 구성
        setupScene();
        setupLights();
        createPlanetMesh();

        // 초기 데이터로 행성 한 번 생성
        updatePlanet();

        // 이벤트 리스너 등록
        // 클릭 시 updatePlanet 후 measureLatency 호출
        ui.btn.addEventListener("click", () => {
            updatePlanet();
            // [Latency 비교] 화면 갱신이 완료된 후 측정을 시작하기 위해 약간의 지연을 줍니다.
            // setTimeout(measureLatency, 50);
        });
        window.addEventListener("resize", onWindowResize);

        // 렌더링 루프 시작
        animate();

    } catch (error) {
        console.error("Failed to initialize application:", error);
        ui.btn.textContent = "Error Loading";
    }
}

/**
 * @function setupScene
 * @description 렌더러, 씬, 카메라, 컨트롤(OrbitControls)을 설정합니다.
 */
function setupScene() {
    // 1. 렌더러 설정
    renderer = new THREE.WebGLRenderer({ antialias: true }); // 계단 현상 방지
    renderer.setSize(window.innerWidth, window.innerHeight);    // 렌더러가 그림을 그릴 캔버스의 크기를 브라우저 창 크기로 설정
    renderer.setPixelRatio(window.devicePixelRatio); // 고해상도 디스플레이(Retina 등) 대응
    document.body.appendChild(renderer.domElement);

    // 2. 씬 생성
    scene = new THREE.Scene();  // 무대 생성

    // 3. 카메라 설정
    camera = new THREE.PerspectiveCamera(   // PerspectiveCamera: 원근감이 있는 카메라
        CONFIG.camera.fov,  // 시야각
        window.innerWidth / window.innerHeight, // 비율 (창 크기에 맞춤)
        0.1,    // 카메라 앞 0.1만큼 가까운 물체부터 찍음
        1000    // 카메라 앞 1000만큼 먼 물체까지만 찍음
    );
    camera.position.z = CONFIG.camera.z; // z축 방향 - 카메라를 뒤로 뺌 (기본적으로는 원점(0)에 있음)
    scene.add(camera);

    // 4. 컨트롤 설정 (마우스로 회전/줌)
    controls = new OrbitControls(camera, renderer.domElement);  // 마우스 이벤트를 감지하여 카메라를 자동으로 움직여주는 도구
    controls.enableDamping = true;  // 부드러운 감속 효과 (관성 효과)
    controls.dampingFactor = 0.05;  // 관성 강도
    controls.enablePan = false;     // 우클릭으로 카메라 초점 이동 방지 (행성 중심 유지)
    controls.minDistance = 1.5;     // 줌인 한계
    controls.maxDistance = 10;      // 줌아웃 한계

    // 카메라가 바라보는 타겟 점을 아래로 내려서, 행성이 상대적으로 위로 보이게 함
    controls.target.set(0, CONFIG.camera.targetY, 0);
    controls.update();  // 위 설정 적용
}

/**
 * @function setupLights
 * @description 씬에 태양광(DirectionalLight)과 환경광(AmbientLight)을 배치합니다.
 */
function setupLights() {
    // 직사광 (태양 역할) Parameter: 빛 색상, 빛 세기(숫자가 클 수록 눈부시게 밝음)
    const sunLight = new THREE.DirectionalLight(CONFIG.light.sunColor, CONFIG.light.sunIntensity);
    sunLight.position.set(  // 태양의 위치
        CONFIG.light.sunPosition.x,
        CONFIG.light.sunPosition.y,
        CONFIG.light.sunPosition.z
    );
    scene.add(sunLight);

    // 보조광 (그림자 부분 밝히기 - 기본 밝기)
    const ambientLight = new THREE.AmbientLight(CONFIG.light.ambientColor); // 환경광
    scene.add(ambientLight);
}

/**
 * @function createPlanetMesh
 * @description 행성의 뼈대(Geometry)와 피부(Material)를 생성하여 씬에 추가합니다.
 * 초기에는 지형 굴곡이 없는 완벽한 구 형태로 생성됩니다.
 */
function createPlanetMesh() {
    // 구체 지오메트리(뼈대) 생성 (반지름, 가로 분할 수, 세로 분할 수)
    const geometry = new THREE.SphereGeometry(
        CONFIG.planet.radius,   // 반지름
        CONFIG.planet.segments, // 가로/세로 분할 수: 숫자가 높으면 표면이 매끈해짐 (낮으면 다각항 면들이 드러나 보임)
        CONFIG.planet.segments
    );

    // 1. 버텍스 컬러 버퍼 생성
    // 점(Vertex)마다 색상 정보를 저장할 공간을 만듭니다. (점 개수 * 3 (R,G,B))
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);

    // 초기에는 모두 바다색으로 채웁니다.
    for (let i = 0; i < count; i++) {
        colors[i * 3] = oceanColorObj.r;
        colors[i * 3 + 1] = oceanColorObj.g;
        colors[i * 3 + 2] = oceanColorObj.b;
    }
    // 지오메트리에 색상 속성 추가 (3개씩 끊어 읽음)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 재질 생성 (빛에 반응하는 Standard Material)
    const material = new THREE.MeshStandardMaterial({   // 물리 기반 렌더링: 빛을 받았을 때 현실적으로 반응
        // color: CONFIG.planet.color, // [삭제됨] 단일 색상 대신 vertexColors 사용
        color: 0xffffff, // 기본 바탕색을 흰색으로 해야 버텍스 컬러가 그대로 보임
        vertexColors: true, // "이 재질은 각 점이 가진 고유의 색을 사용합니다"라고 설정
        flatShading: false, // 매끄러운 느낌 (점과 점 사이를 매끈하게 이어줌)
        roughness: CONFIG.planet.roughness  // 거칠기(1에 가까울수록 매트하고 거친 느낌)
    });

    planetMesh = new THREE.Mesh(geometry, material);    // 지오메트리에 재절 입히기
    scene.add(planetMesh);
}

/**
 * @function updatePlanet
 * @description UI 입력값을 읽어와 WASM(C++) 함수를 호출하고, 계산된 지형을 적용합니다.
 * 'Generate' 버튼을 누를 때마다 실행됩니다.
 */
function updatePlanet() {
    // 모듈이나 메쉬가 준비되지 않았으면 중단
    if (!wasmModule || !planetMesh) return;

    // UI 값 파싱
    const seed = parseInt(ui.seed.value);
    const scale = parseFloat(ui.scale.value) / 100.0; // 0~100 값을 0.0~1.0 단위로 변환
    const radius = parseFloat(ui.radius.value);

    // 1. C++(WASM) 내부 상태 초기화 (노이즈 맵 생성 등)
    wasmModule._init_planet(seed, scale, radius);

    // 2. 계산된 노이즈 값을 이용해 3D 지오메트리 변형
    applyDisplacement(planetMesh.geometry, radius);
}

/**
 * @function applyDisplacement
 * @description 구체의 모든 정점(Vertex)을 순회하며 C++에서 계산한 높이 값을 적용합니다.
 * @param {THREE.BufferGeometry} geometry - 변형할 행성의 지오메트리
 * @param {number} radius - 행성의 기본 반지름
 */
function applyDisplacement(geometry, radius) {
    const posAttribute = geometry.getAttribute('position'); // 점들의 위치를 숫자 배열로 관리
    const vertexCount = posAttribute.count;

    // 1. TypedArray 가져오기 (Float32Array)
    // Three.js의 BufferAttribute는 이미 Float32Array를 가지고 있습니다.
    const jsArray = posAttribute.array;

    // 2. 메모리(바이트) 크기 계산 (float는 4바이트)
    const byteSize = jsArray.length * jsArray.BYTES_PER_ELEMENT;

    // 3. WASM 힙(Heap) 메모리 할당 (malloc)
    // WASM의 메모리 공간에서 byteSize만큼 자리 빌림 (ptr: 빌린 메모리 공간의 시작 주소 번지)
    const ptr = wasmModule._malloc(byteSize);

    // 4. JS 데이터 -> WASM 힙으로 복사
    // HEAPF32는 WASM 메모리를 float(32bit) 단위로 바라보는 뷰입니다. 4바이트씩 묶어서 인덱스 셈
    // ptr은 바이트 단위 주소이므로, float 인덱스로 쓰려면 4로 나눠야(>>2) 합니다.
    wasmModule.HEAPF32.set(jsArray, ptr >> 2);  // JS배열을 WASM 메모리 공간에 복사

    // 5. C++ 배치 함수 호출
    // 파라미터: 메모리 주소와 점의 개수
    wasmModule._apply_displacement_batch(ptr, vertexCount); // 포인터가 가르키는 배열의 값 변경

    // 6. 결과 데이터 회수 (WASM 힙 -> JS 데이터)
    // 계산된 결과가 담긴 메모리 구간을 가져와서 원본 배열에 덮어씁니다.
    const calculatedArray = wasmModule.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + jsArray.length);
    jsArray.set(calculatedArray);   // jsArray로 복사

    // 7. 메모리 해제 (안 하면 메모리 누수 발생)
    wasmModule._free(ptr);

    // 7-1. 높이에 따른 색상 적용 (바다 vs 육지)
    // 색상 버퍼를 가져옵니다.
    const colorAttribute = geometry.getAttribute('color');
    const colors = colorAttribute.array;

    // 기준 높이: 반지름보다 높으면 육지로 판정
    const seaLevel = radius * 1.1;

    // 대신 "비교할 기준값(seaLevel)을 미리 제곱"해두고, 거리의 제곱값(x*x + y*y + z*z)과 비교합니다.
    const seaLevelSq = seaLevel * seaLevel;

    for (let i = 0; i < vertexCount; i++) {
        // 현재 점의 좌표
        const x = jsArray[i * 3];
        const y = jsArray[i * 3 + 1];
        const z = jsArray[i * 3 + 2];

        // 원점에서의 거리 제곱 계산 (sqrt 제거)
        const magnitudeSq = x*x + y*y + z*z;

        // 높이에 따라 색상 결정 (제곱된 값끼리 비교)
        if (magnitudeSq > seaLevelSq) {
            // 육지
            colors[i * 3] = landColorObj.r;
            colors[i * 3 + 1] = landColorObj.g;
            colors[i * 3 + 2] = landColorObj.b;
        } else {
            // 바다
            colors[i * 3] = oceanColorObj.r;
            colors[i * 3 + 1] = oceanColorObj.g;
            colors[i * 3 + 2] = oceanColorObj.b;
        }
    }
    // 색상이 변경되었음을 알림
    colorAttribute.needsUpdate = true;

    // 8. 업데이트 알림
    posAttribute.needsUpdate = true;
    geometry.computeVertexNormals();    // 지형이 변경되었으니, 빛 반사 각도 다시 계산
}

/**
 * @function onWindowResize
 * @description 브라우저 창 크기가 변경될 때 카메라 비율과 렌더러 크기를 조정합니다.
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * @function animate
 * @description 매 프레임마다 화면을 갱신하는 렌더링 루프입니다.
 * 행성을 회전시키고, 컨트롤 상태를 업데이트하며, 장면을 그립니다.
 */
function animate() {
    // 재귀 호출
    requestAnimationFrame(animate);

    // 행성 자전 (Y축 회전)
    if (planetMesh) {
        planetMesh.rotation.y += CONFIG.planet.rotationSpeed;
    }

    // 컨트롤 관성 효과 업데이트
    controls.update();

    // 최종 렌더링
    renderer.render(scene, camera);
}

// 애플리케이션 시작
init();


// Latency 측정 코드
// /**
//  * @function measureLatency
//  * @description C++(WASM)과 Pure JS의 지형 생성 시간을 공정하게 비교합니다.
//  * 두 방식 모두 점 하나하나가 아니라, 전체 배열을 처리하는 시간(Batch Process)을 측정합니다.
//  */
// function measureLatency() {
//     if (!wasmModule || !planetMesh || !jsGenerator) return;
//
//     const seed = parseInt(ui.seed.value);
//     const scale = parseFloat(ui.scale.value) / 100.0;
//     const radius = parseFloat(ui.radius.value);
//
//     // 공정한 비교를 위해 테스트용 지오메트리를 복제하여 사용 (원본 훼손 방지)
//     // 1. WASM 테스트용
//     const geometryWasm = planetMesh.geometry.clone();
//     const arrayWasm = geometryWasm.getAttribute('position').array; // Float32Array
//     const vertexCount = arrayWasm.length / 3;
//
//     // 2. JS 테스트용
//     const geometryJS = planetMesh.geometry.clone();
//     const arrayJS = geometryJS.getAttribute('position').array; // Float32Array
//
//     console.log(`--- Latency Comparison (Vertices: ${vertexCount}) ---`);
//
//     // ============================================
//     // 1. C++ (WASM) 측정
//     // : 메모리 할당 -> 데이터 복사 -> 배치 계산 -> 데이터 회수 -> 해제
//     // ============================================
//     const startWasm = performance.now();
//
//     // 1-1. 초기화
//     wasmModule._init_planet(seed, scale, radius);
//
//     // 1-2. 메모리 준비 및 복사 (Data Marshalling Cost 포함)
//     const byteSize = arrayWasm.length * arrayWasm.BYTES_PER_ELEMENT;
//     const ptr = wasmModule._malloc(byteSize);
//     wasmModule.HEAPF32.set(arrayWasm, ptr >> 2);
//
//     // 1-3. ★ C++ 배치 함수 실행 (핵심 연산)
//     wasmModule._apply_displacement_batch(ptr, vertexCount);
//
//     // 1-4. 결과 회수
//     const resultView = wasmModule.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + arrayWasm.length);
//     arrayWasm.set(resultView);
//
//     // 1-5. 메모리 해제
//     wasmModule._free(ptr);
//
//     const endWasm = performance.now();
//     const timeWasm = endWasm - startWasm;
//     console.log(`C++ (WASM) Total Time: ${timeWasm.toFixed(4)} ms`);
//
//
//     // ============================================
//     // 2. Pure JavaScript 측정
//     // : Float32Array 직접 접근 (Direct Access Optimization)
//     // ============================================
//     const startJS = performance.now();
//
//     // 2-1. 초기화
//     jsGenerator.init(seed);
//
//     // 2-2. ★ JS 루프 실행 (WASM 배치 함수가 하는 일을 JS로 동일하게 수행)
//     // Three.js의 getX, setX 같은 함수는 오버헤드가 크므로, 배열 인덱스로 직접 접근합니다.
//     for (let i = 0; i < vertexCount; i++) {
//         const index = i * 3;
//
//         // 데이터 읽기
//         const x = arrayJS[index];
//         const y = arrayJS[index + 1];
//         const z = arrayJS[index + 2];
//
//         // JS 호출 (높이 값 계산)
//         const h = jsGenerator.getHeight(x, y, z, scale, radius);
//
//         // WASM과 작업량을 맞추기 위해 위치 업데이트 수행 (Write Back)
//         // 보통 지형 생성 공식: NewPosition = OriginalPosition * (Height / Radius)
//         const factor = h / radius;
//         arrayJS[index] *= factor;     // X 업데이트
//         arrayJS[index + 1] *= factor; // Y 업데이트
//         arrayJS[index + 2] *= factor; // Z 업데이트
//     }
//
//     const endJS = performance.now();
//     const timeJS = endJS - startJS;
//     console.log(`Pure JS Total Time: ${timeJS.toFixed(4)} ms`);
//
//     // ============================================
//     // 3. 결과 출력 및 비교
//     // ============================================
//     const ratio = timeJS / timeWasm;
//     console.log(`Result: WASM is ${ratio.toFixed(2)}x faster than JS`);
//
//     const resultText = `[Latency Result]\nVertices: ${vertexCount}\n🚀 WASM: ${timeWasm.toFixed(2)}ms\n🐢 JS: ${timeJS.toFixed(2)}ms\n\n(WASM is ${ratio.toFixed(2)}x faster)`;
//     alert(resultText);
// }
