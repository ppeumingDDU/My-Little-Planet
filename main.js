import createModule from './web/planet.js';
import * as THREE from 'three';

let wasm;
let scene, camera, renderer, planetMesh;

const generateBtn = document.getElementById("generate-btn");

const seedInput = document.getElementById("seed");
const scaleInput = document.getElementById("scale");
const radiusInput = document.getElementById("radius");

async function init() {
    wasm = await createModule();

    generateBtn.disabled = false;
    generateBtn.textContent = "Generate";

    initThree();
    updatePlanet();
    animate();
}

generateBtn.addEventListener("click", () => {
    console.log("BUTTON CLICK");
    updatePlanet();
});

function initThree() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(0,0,4);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5,5,5);
    scene.add(light);

    const geo = new THREE.SphereGeometry(1, 200, 200);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        flatShading: true
    });

    planetMesh = new THREE.Mesh(geo, mat);
    scene.add(planetMesh);
}

function updatePlanet() {
    const seed = parseInt(seedInput.value);
    const scale = parseFloat(scaleInput.value) / 100.0; // 슬라이더: 10~200 → 0.1~2.0
    const radius = parseFloat(radiusInput.value);

    wasm._init_planet(seed, scale, radius);
    applyDisplacement(planetMesh.geometry, radius);
}

function applyDisplacement(geo, radius) {
    console.log("APPLYDISPLACEMENT");
    const pos = geo.getAttribute('position');

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const h = wasm._get_height(x, y, z);  // ← C++ 호출

        const n = new THREE.Vector3(x, y, z).normalize();
        const finalR = radius + h;

        pos.setXYZ(i, n.x * finalR, n.y * finalR, n.z * finalR);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
}

function animate() {
    requestAnimationFrame(animate);
    planetMesh.rotation.y += 0.001;
    renderer.render(scene, camera);
}

init();
