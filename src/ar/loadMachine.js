import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function loadMachine(modelUrl, onLoad, onProgress, onError) {
  const loader = new GLTFLoader();

  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;

      // Enable casting and receiving shadows on all parts of the model
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            // Apply double-sided shadows to prevent light leaks on thin meshes
            child.material.shadowSide = THREE.DoubleSide;
            // Retain material details but ensure roughness yields natural highlights
            if (child.material.roughness !== undefined) {
              child.material.roughness = Math.max(child.material.roughness, 0.15);
            }
          }
        }
      });

      onLoad(model);
    },
    (xhr) => {
      if (onProgress && xhr.total > 0) {
        const percent = (xhr.loaded / xhr.total) * 100;
        onProgress(percent);
      } else if (onProgress) {
        // Fallback for chunked transfer-encoding where total is 0
        onProgress(50);
      }
    },
    (error) => {
      console.error("Error loading GLTF model in WebXR:", error);
      if (onError) onError(error);
    }
  );
}
