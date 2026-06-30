import * as THREE from "three";

export function initScene(container) {

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.xr.enabled = true;

  container.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(
    0xffffff,
    0xbbbbff,
    2
  );

  scene.add(light);

  return {
    scene,
    camera,
    renderer,
  };
}