import * as THREE from "three";

export function createReticle() {
  const group = new THREE.Group();

  // Outer ring: 12cm inner radius, 15cm outer radius
  const ringGeometry = new THREE.RingGeometry(0.12, 0.15, 32);
  ringGeometry.rotateX(-Math.PI / 2); // lie flat on horizontal surface
  
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x06b6d4, // Tailwind Cyan-500
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  group.add(ring);

  // Inner translucent disk: 12cm radius
  const diskGeometry = new THREE.CircleGeometry(0.12, 32);
  diskGeometry.rotateX(-Math.PI / 2);
  const diskMaterial = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.15,
  });
  const disk = new THREE.Mesh(diskGeometry, diskMaterial);
  group.add(disk);

  // Small center dot
  const dotGeometry = new THREE.CircleGeometry(0.015, 16);
  dotGeometry.rotateX(-Math.PI / 2);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  group.add(dot);

  group.visible = false;
  // Use manual matrix updates because the WebXR hit test pose matrix is directly assigned
  group.matrixAutoUpdate = false;

  return group;
}
