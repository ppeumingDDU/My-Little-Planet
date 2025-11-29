import createModule from '/web/planet.js';
// Latency 측정 코드
import { PlanetGeneratorJS } from '/js_planet.js'; // Pure JS 모듈 import
let jsGenerator = new PlanetGeneratorJS(); // JS 인스턴스 생성

/**
 * @file main.js
 * @description Three.js와 WebAssembly(C++)를 연동하여 3D 행성을 절차적(Procedural)으로 생성하는 메인 스크립트입니다.
 * 사용자의 입력을 받아 C++ 노이즈 알고리즘을 실행하고, 그 결과를 3D 구체(Sphere)의 정점에 적용합니다.
 */

// import createModule from './web/planet.js';
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
        color: 0x88ccff,   // 행성 기본 색상 (바다색)
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
        ui.btn.addEventListener("click", updatePlanet);
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 고해상도 디스플레이(Retina 등) 대응
    document.body.appendChild(renderer.domElement);

    // 2. 씬 생성
    scene = new THREE.Scene();

    // 3. 카메라 설정
    camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = CONFIG.camera.z;
    scene.add(camera);

    // 4. 컨트롤 설정 (마우스로 회전/줌)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;  // 부드러운 감속 효과
    controls.dampingFactor = 0.05;
    controls.enablePan = false;     // 우클릭 이동 방지 (행성 중심 유지)
    controls.minDistance = 1.5;     // 줌인 한계
    controls.maxDistance = 10;      // 줌아웃 한계

    // 카메라가 바라보는 타겟 점을 아래로 내려서, 행성이 상대적으로 위로 보이게 함
    controls.target.set(0, CONFIG.camera.targetY, 0);
    controls.update();
}

/**
 * @function setupLights
 * @description 씬에 태양광(DirectionalLight)과 환경광(AmbientLight)을 배치합니다.
 */
function setupLights() {
    // 주광원 (태양 역할)
    const sunLight = new THREE.DirectionalLight(CONFIG.light.sunColor, CONFIG.light.sunIntensity);
    sunLight.position.set(
        CONFIG.light.sunPosition.x,
        CONFIG.light.sunPosition.y,
        CONFIG.light.sunPosition.z
    );
    scene.add(sunLight);

    // 보조광 (그림자 부분 밝히기)
    const ambientLight = new THREE.AmbientLight(CONFIG.light.ambientColor);
    scene.add(ambientLight);
}

/**
 * @function createPlanetMesh
 * @description 행성의 뼈대(Geometry)와 피부(Material)를 생성하여 씬에 추가합니다.
 * 초기에는 지형 굴곡이 없는 완벽한 구 형태로 생성됩니다.
 */
function createPlanetMesh() {
    // 구체 지오메트리 생성 (반지름, 가로 분할 수, 세로 분할 수)
    const geometry = new THREE.SphereGeometry(
        CONFIG.planet.radius,
        CONFIG.planet.segments,
        CONFIG.planet.segments
    );

    // 재질 생성 (빛에 반응하는 Standard Material)
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.planet.color,
        flatShading: true, // 각진 폴리곤 느낌 (Low Poly 스타일)
        roughness: CONFIG.planet.roughness
    });

    planetMesh = new THREE.Mesh(geometry, material);
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
    const posAttribute = geometry.getAttribute('position');
    const vertexCount = posAttribute.count;

    // 1. TypedArray 가져오기 (Float32Array)
    // Three.js의 BufferAttribute는 이미 Float32Array를 가지고 있습니다.
    const jsArray = posAttribute.array;

    // 2. 바이트 크기 계산 (float는 4바이트)
    const byteSize = jsArray.length * jsArray.BYTES_PER_ELEMENT;

    // 3. WASM 힙(Heap) 메모리 할당 (malloc)
    // C++ 쪽 메모리 공간을 빌립니다.
    const ptr = wasmModule._malloc(byteSize);

    // 4. JS 데이터 -> WASM 힙으로 복사
    // HEAPF32는 WASM 메모리를 float(32bit) 단위로 바라보는 뷰입니다.
    // ptr은 바이트 단위 주소이므로, float 인덱스로 쓰려면 4로 나눠야(>>2) 합니다.
    wasmModule.HEAPF32.set(jsArray, ptr >> 2);

    // 5. ★ C++ 배치 함수 호출 (단 1번의 호출!)
    // 루프는 C++ 내부에서 돕니다. (엄청 빠름)
    wasmModule._apply_displacement_batch(ptr, vertexCount);

    // 6. 결과 데이터 회수 (WASM 힙 -> JS 데이터)
    // 계산된 결과가 담긴 메모리 구간을 가져와서 원본 배열에 덮어씁니다.
    const calculatedArray = wasmModule.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + jsArray.length);
    jsArray.set(calculatedArray);

    // 7. 메모리 해제 (free) - 필수! 안 하면 메모리 누수 발생
    wasmModule._free(ptr);

    // 8. 업데이트 알림
    posAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
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
/**
 * @function measureLatency
 * @description C++(WASM)과 Pure JS의 지형 생성 시간을 비교 측정합니다.
 */
function measureLatency() {
    if (!wasmModule || !planetMesh) return;

    const seed = parseInt(ui.seed.value);
    const scale = parseFloat(ui.scale.value) / 100.0;
    const radius = parseFloat(ui.radius.value);

    // Geometry 준비 (원본 백업)
    const geometry = planetMesh.geometry.clone();
    const posAttribute = geometry.getAttribute('position');
    const vertexCount = posAttribute.count;

    console.log(`--- Latency Comparison (Vertices: ${vertexCount}) ---`);

    // ============================================
    // 1. C++ (WASM) 측정
    // ============================================
    const startWasm = performance.now();

    // 1-1. 초기화
    wasmModule._init_planet(seed, scale, radius);

    // 1-2. 루프 & 호출
    for (let i = 0; i < vertexCount; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = posAttribute.getZ(i);

        // C++ 호출
        const h = wasmModule._get_height(x, y, z);

        // (참고: 실제 적용 로직은 측정에서 제외하거나 포함해도 됨. 여기선 연산값 획득까지 측정)
    }

    const endWasm = performance.now();
    const timeWasm = endWasm - startWasm;
    console.log(`C++ (WASM) Total Time: ${timeWasm.toFixed(4)} ms`);


    // ============================================
    // 2. Pure JavaScript 측정
    // ============================================
    const startJS = performance.now();

    // 2-1. 초기화
    jsGenerator.init(seed);

    // 2-2. 루프 & 호출
    for (let i = 0; i < vertexCount; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = posAttribute.getZ(i);

        // JS 호출
        const h = jsGenerator.getHeight(x, y, z, scale, radius);
    }

    const endJS = performance.now();
    const timeJS = endJS - startJS;
    console.log(`Pure JS Total Time: ${timeJS.toFixed(4)} ms`);

    // ============================================
    // 3. 결과 출력 및 비교
    // ============================================
    const ratio = timeJS / timeWasm;
    console.log(`Result: WASM is ${ratio.toFixed(2)}x faster than JS`);

    alert(`[Latency Result]\nVertices: ${vertexCount}\nWASM: ${timeWasm.toFixed(2)}ms\nJS: ${timeJS.toFixed(2)}ms\n(WASM is ${ratio.toFixed(2)}x faster)`);
}

// 기존 updatePlanet 대신 측정 함수를 버튼에 연결하거나,
// updatePlanet 함수 내부 맨 끝에 measureLatency()를 호출하도록 수정하세요.
ui.btn.addEventListener("click", () => {
    updatePlanet();    // 시각적 업데이트
    setTimeout(measureLatency, 100); // UI 렌더링 후 측정 실행
});
