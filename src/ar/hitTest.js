import * as THREE from "three";

export async function initHitTest(session) {
  const referenceSpace = await session.requestReferenceSpace("viewer");
  const hitTestSource = await session.requestHitTestSource({ space: referenceSpace });
  return hitTestSource;
}

export function getHitPose(frame, hitTestSource, referenceSpace) {
  if (!hitTestSource) return null;
  const hitTestResults = frame.getHitTestResults(hitTestSource);
  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];
    return hit.getPose(referenceSpace);
  }
  return null;
}

export function checkSpace(reticle, machineData, camera) {
  if (!reticle || !reticle.visible) {
    return { valid: false, reason: "Scanning for flat surface..." };
  }

  // Safety fallback if tracking camera is not ready
  if (!camera) {
    return { valid: false, reason: "Initializing tracking camera..." };
  }

  // Decompose reticle matrix to get position and orientation
  const reticlePosition = new THREE.Vector3();
  const reticleQuaternion = new THREE.Quaternion();
  const reticleScale = new THREE.Vector3();
  reticle.matrix.decompose(reticlePosition, reticleQuaternion, reticleScale);

  // 1. Check if surface is horizontal (floor/flat surface)
  // The local up (y-axis) of the reticle represents the plane normal
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(reticleQuaternion);
  if (normal.y < 0.95) {
    return { valid: false, reason: "Surface is not flat enough." };
  }

  // 2. Check if there is enough floor space in front of the user
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);

  // Calculate distance on the XZ (horizontal) plane
  const dx = cameraPosition.x - reticlePosition.x;
  const dz = cameraPosition.z - reticlePosition.z;
  const distanceXZ = Math.sqrt(dx * dx + dz * dz);

  // Dimensions of the machine in meters (from mm)
  const requiredWidth = machineData.width / 1000;
  const requiredDepth = machineData.depth / 1000;
  const requiredRadius = Math.sqrt(requiredWidth * requiredWidth + requiredDepth * requiredDepth) / 2;

  // Minimum distance required so the user is not standing inside the model
  const minClearance = requiredRadius + 0.25;

  if (distanceXZ < minClearance) {
    return { valid: false, reason: "Not enough space to place machine. Step back." };
  }

  return { valid: true };
}
