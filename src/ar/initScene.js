import * as THREE from "three";

export function initScene(container) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit ratio to 1.5 for stable mobile frame rates
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");

  // Shadow Map Settings
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Realistic Color & Contrast
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  container.appendChild(renderer.domElement);

  // Soft environmental/hemisphere light (ambient skylight + ground reflection)
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.2);
  scene.add(light);

  // Return the main three.js components
  return {
    scene,
    camera,
    renderer,
  };
}