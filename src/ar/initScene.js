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

  // CRITICAL: Set reference space BEFORE setSession is called.
  // "local-floor" gives us a floor-calibrated coordinate system where Y=0 is the physical floor.
  renderer.xr.setReferenceSpaceType("local-floor");

  // Disable shadow maps entirely for smooth mobile AR performance
  renderer.shadowMap.enabled = false;

  // Realistic Color & Contrast
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  container.appendChild(renderer.domElement);

  // Soft environmental/hemisphere light (ambient skylight + ground reflection)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.2);
  scene.add(hemiLight);

  return { scene, camera, renderer };
}