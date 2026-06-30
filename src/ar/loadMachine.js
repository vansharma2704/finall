import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// Create a shared DRACO loader instance (reused across all loads)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
dracoLoader.setDecoderConfig({ type: "js" });

// Create a shared GLTF loader with DRACO support
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

export function loadMachine(modelUrl, onLoad, onProgress, onError) {
  gltfLoader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;

          // Disable frustum culling to prevent disappearing when looking away
          child.frustumCulled = false;

          if (child.material) {
            child.material.shadowSide = THREE.DoubleSide;
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
        onProgress(50);
      }
    },
    (error) => {
      console.error("Error loading GLTF model:", error);
      if (onError) onError(error);
    }
  );
}
