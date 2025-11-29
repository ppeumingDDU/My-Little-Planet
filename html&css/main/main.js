import createModule from './web/planet.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 설정 (Configuration)
const CONFIG = {
    camera: {
        fov: 75,
        z: 5,
        targetY: -0.5 // 행성을 화면 위로 올리기 위한 타겟 오프셋
    },
    planet: {
        radius: 1,
        segments: 200, // 세그먼트가 많을수록 디테일함
        color: 0x88ccff,
        roughness: 0.8,
        rotationSpeed: 0.002
    },
    light: {
        sunColor: 0xffffff,
        sunIntensity: 2,
        sunPosition: { x: 5, y: 3, z: 2 },
        ambientColor: 0x404040
    }
};

let wasmModule;
let scene, camera, renderer, controls;
let planetMesh;

// DOM 요소 (DOM Elements)
const ui = {
    btn: document.getElementById("generate-btn"),
    seed: document.getElementById("seed"),
    scale: document.getElementById("scale"),
    radius: document.getElementById("radius")
};

// 초기화 (Initialization)
async function init() {
    try {
        // WASM 로드
        wasmModule = await createModule();

        // UI 활성화
        ui.btn.disabled = false;
        ui.btn.textContent = "Generate";

        // Three.js 씬 구성
        setupScene();
        setupLights();
        createPlanetMesh();

        // 초기 데이터 생성
        updatePlanet();

        // 이벤트 리스너 등록
        ui.btn.addEventListener("click", updatePlanet);
        window.addEventListener("resize", onWindowResize);

        // 애니메이션 시작
        animate();

    } catch (error) {
        console.error("Failed to initialize:", error);
        ui.btn.textContent = "Error Loading";
    }
}

// Three.js 설정 함수들
function setupScene() {
    // 렌더러
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 고해상도 디스플레이 대응
    document.body.appendChild(renderer.domElement);

    // 씬
    scene = new THREE.Scene();

    // 카메라
    camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = CONFIG.camera.z;
    scene.add(camera);

    // 컨트롤
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;

    // 카메라 시점 조절 (행성 위치 보정)
    controls.target.set(0, CONFIG.camera.targetY, 0);
    controls.update();
}

function setupLights() {
    // 주광원 (태양)
    const sunLight = new THREE.DirectionalLight(CONFIG.light.sunColor, CONFIG.light.sunIntensity);
    sunLight.position.set(
        CONFIG.light.sunPosition.x,
        CONFIG.light.sunPosition.y,
        CONFIG.light.sunPosition.z
    );
    scene.add(sunLight);

    // 보조광 (환경광)
    const ambientLight = new THREE.AmbientLight(CONFIG.light.ambientColor);
    scene.add(ambientLight);
}

function createPlanetMesh() {
    const geometry = new THREE.SphereGeometry(
        CONFIG.planet.radius,
        CONFIG.planet.segments,
        CONFIG.planet.segments
    );

    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.planet.color,
        flatShading: true,
        roughness: CONFIG.planet.roughness
    });

    planetMesh = new THREE.Mesh(geometry, material);
    scene.add(planetMesh);
}

// 로직 업데이트 (Logic)
function updatePlanet() {
    if (!wasmModule || !planetMesh) return;

    const seed = parseInt(ui.seed.value);
    const scale = parseFloat(ui.scale.value) / 100.0;
    const radius = parseFloat(ui.radius.value);

    // WASM 계산
    wasmModule._init_planet(seed, scale, radius);

    // 지형 적용
    applyDisplacement(planetMesh.geometry, radius);
}

function applyDisplacement(geometry, radius) {
    const posAttribute = geometry.getAttribute('position');
    const vertexCount = posAttribute.count;

    // 반복문 밖에서 벡터 객체 생성 (GC 압박 줄임)
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = posAttribute.getZ(i);

        // C++에서 높이값 가져오기
        const h = wasmModule._get_height(x, y, z);

        // 벡터 재사용하여 계산
        tempVec.set(x, y, z).normalize().multiplyScalar(radius + h);

        posAttribute.setXYZ(i, tempVec.x, tempVec.y, tempVec.z);
    }

    posAttribute.needsUpdate = true;
    geometry.computeVertexNormals(); // 조명 반사를 위해 법선 재계산
}

// 유틸리티 및 이벤트 핸들러
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    if (planetMesh) {
        planetMesh.rotation.y += CONFIG.planet.rotationSpeed;
    }

    controls.update();
    renderer.render(scene, camera);
}

init();
