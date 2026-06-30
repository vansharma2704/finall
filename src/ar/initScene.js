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

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  // Use "local" reference space — universally supported and stable on Android ARCore.
  // Hit-test already gives floor-level Y coordinates, so local-floor is not required.
  renderer.xr.setReferenceSpaceType("local");

  // No shadow maps — saves a full GPU pass per frame on mobile
  renderer.shadowMap.enabled = false;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  container.appendChild(renderer.domElement);

  // Hemisphere light for ambient illumination
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.2);
  scene.add(hemiLight);

  return { scene, camera, renderer };
}