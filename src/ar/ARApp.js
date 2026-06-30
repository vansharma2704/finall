import * as THREE from "three";
import { initScene } from "./initScene";
import { startAR } from "./startAR";
import { initHitTest, getHitPose, checkSpace } from "./hitTest";
import { createReticle } from "./reticle";
import { loadMachine } from "./loadMachine";

/**
 * ARApp — Custom WebXR AR engine for placing a 3D machine on the floor.
 *
 * DESIGN PRINCIPLES:
 * 1. The model is placed ONCE and NEVER touched again in the render loop.
 * 2. matrixAutoUpdate = false freezes the model's world matrix.
 * 3. The camera moves freely; the model stays stationary.
 * 4. No per-frame position.copy, scale.set, lookAt, or quaternion updates on the model.
 * 5. Background preloading ensures instant placement on tap.
 */
export class ARApp {
  constructor({
    container,
    machineData,
    onSpaceStatus,
    onPlaced,
    onRemoved,
    onError,
    onLoadingProgress,
  }) {
    this.container = container;
    this.machineData = machineData;
    this.onSpaceStatus = onSpaceStatus;
    this.onPlaced = onPlaced;
    this.onRemoved = onRemoved;
    this.onError = onError;
    this.onLoadingProgress = onLoadingProgress;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.session = null;

    this.hitTestSource = null;
    this.reticle = null;
    this.placedModel = null;
    this.dirLight = null;
    this.ambientLight = null;

    this.isPlaced = false;
    this.isLoading = false;
    this.isSpaceValid = false;
    this.lastSpaceCheckReason = "Scanning for flat surface...";

    this.onSelectBind = this.onSelect.bind(this);
    this.onWindowResizeBind = this.onWindowResize.bind(this);

    // Preloading state
    this.preloadedModel = null;
    this.preLoadError = null;
    this.isPreloaded = false;

    // Reusable vectors for hit-test (avoids per-frame GC allocations)
    this._reticlePos = new THREE.Vector3();
    this._reticleQuat = new THREE.Quaternion();
    this._reticleScale = new THREE.Vector3();
  }

  async start() {
    try {
      // 1. Initialize Scene, Camera, Renderer (sets local-floor reference space)
      const sceneData = initScene(this.container);
      this.scene = sceneData.scene;
      this.camera = sceneData.camera;
      this.renderer = sceneData.renderer;

      // 2. Set up lighting
      this.setupLighting();

      // 3. Create Reticle
      this.reticle = createReticle();
      this.scene.add(this.reticle);

      // 4. Start WebXR AR Session
      const sessionInit = {
        requiredFeatures: ["hit-test", "local-floor"],
        optionalFeatures: ["anchors"],
      };
      this.session = await startAR(this.renderer, sessionInit);

      // Listen for tap gesture
      this.session.addEventListener("select", this.onSelectBind);

      // Handle session termination
      this.session.addEventListener("end", () => {
        this.destroy();
      });

      // 5. Initialize Hit Test
      this.hitTestSource = await initHitTest(this.session);

      // 6. Handle Window Resizing
      window.addEventListener("resize", this.onWindowResizeBind);

      // 7. Start the XR animation render loop
      this.renderer.setAnimationLoop((timestamp, frame) =>
        this.tick(timestamp, frame)
      );

      // 8. Background-preload the machine model immediately
      this._startPreload();
    } catch (error) {
      console.error("Failed to start WebXR AR:", error);
      if (this.onError) {
        this.onError(
          error.message || "Failed to initialize WebXR immersive AR session."
        );
      }
      this.destroy();
    }
  }

  // ─── Lighting ────────────────────────────────────────────────────────────────

  setupLighting() {
    // Simple directional light (no shadows for performance)
    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(1.5, 4.0, 1.5);
    this.scene.add(this.dirLight);

    // Complementary ambient fill light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);
  }

  // ─── Render Loop (tick) ──────────────────────────────────────────────────────
  //
  // CRITICAL: This function NEVER modifies the placed model's position, rotation,
  // scale, or matrix. It only:
  //   a) Updates the reticle position from hit-test (before placement)
  //   b) Calls renderer.render()

  tick(timestamp, frame) {
    if (!frame) return;

    // Only update hit test reticle BEFORE placement
    if (this.session && this.hitTestSource && !this.isPlaced && !this.isLoading) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      if (referenceSpace) {
        const pose = getHitPose(frame, this.hitTestSource, referenceSpace);

        if (pose) {
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);

          // Space check using reusable vectors (no allocation per frame)
          this.reticle.matrix.decompose(
            this._reticlePos,
            this._reticleQuat,
            this._reticleScale
          );

          // Simple surface normal check (avoid expensive camera-based distance check)
          const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(
            this._reticleQuat
          );
          if (normal.y < 0.95) {
            this.isSpaceValid = false;
            this.lastSpaceCheckReason = "Surface is not flat enough.";
          } else {
            this.isSpaceValid = true;
            this.lastSpaceCheckReason = "";
          }

          if (this.onSpaceStatus) {
            this.onSpaceStatus(this.isSpaceValid, this.lastSpaceCheckReason);
          }
        } else {
          this.reticle.visible = false;
          this.isSpaceValid = false;
          this.lastSpaceCheckReason = "Scanning for flat surface...";

          if (this.onSpaceStatus) {
            this.onSpaceStatus(false, this.lastSpaceCheckReason);
          }
        }
      }
    }

    // *** NO model position/scale/rotation updates here — ever ***

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Placement (onSelect) ────────────────────────────────────────────────────

  onSelect() {
    if (this.isPlaced || this.isLoading) return;

    if (!this.isSpaceValid) {
      if (this.onError) {
        this.onError(
          this.lastSpaceCheckReason || "Not enough space to place machine."
        );
      }
      return;
    }

    this.isLoading = true;
    this.reticle.visible = false;
    if (this.onSpaceStatus) {
      this.onSpaceStatus(false, "Placing machine...");
    }

    // Capture placement transform from the reticle AT THIS MOMENT
    const placementPos = new THREE.Vector3();
    const placementQuat = new THREE.Quaternion();
    const placementScale = new THREE.Vector3();
    this.reticle.matrix.decompose(placementPos, placementQuat, placementScale);

    // Place the model
    const doPlace = (model) => {
      this.placedModel = model;

      // 1. Add to scene at origin to compute bounding box
      this.scene.add(this.placedModel);
      this.placedModel.scale.set(1, 1, 1);
      this.placedModel.rotation.set(0, 0, 0);
      this.placedModel.position.set(0, 0, 0);
      this.placedModel.updateMatrixWorld(true);

      // 2. Measure the visual bounding box
      const box = getVisualBoundingBox(this.placedModel);
      const size = new THREE.Vector3();
      box.getSize(size);

      // 3. Uniform scale to match real-world height (mm → meters)
      const targetHeight = this.machineData.height / 1000;
      let scaleFactor = 1.0;
      if (size.y > 0.001) {
        scaleFactor = targetHeight / size.y;
      }

      // 4. Apply scale ONCE
      this.placedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
      this.placedModel.updateMatrixWorld(true);

      // 5. Get bottom offset after scaling
      const scaledBox = getVisualBoundingBox(this.placedModel);

      // 6. Position ONCE — sit bottom of model on the floor hit point
      this.placedModel.position.copy(placementPos);
      this.placedModel.position.y -= scaledBox.min.y;

      // 7. Orient ONCE — use the reticle's yaw
      this.placedModel.quaternion.copy(placementQuat);

      // 8. Compute final world matrix
      this.placedModel.updateMatrixWorld(true);

      // 9. FREEZE — never touch this model's transform again
      this.placedModel.matrixAutoUpdate = false;
      this.placedModel.traverse((child) => {
        child.matrixAutoUpdate = false;
      });

      // 10. Position directional light near the model
      this.dirLight.target = this.placedModel;
      this.dirLight.position.set(
        placementPos.x + 1.5,
        placementPos.y + 4.0,
        placementPos.z + 1.5
      );

      // 11. Done
      this.isPlaced = true;
      this.isLoading = false;

      if (this.onSpaceStatus) {
        this.onSpaceStatus(true, "");
      }
      if (this.onPlaced) {
        this.onPlaced();
      }
    };

    // Use preloaded model if ready, otherwise wait
    if (this.isPreloaded && this.preloadedModel) {
      doPlace(this.preloadedModel);
    } else if (this.preLoadError) {
      this.isLoading = false;
      if (this.onError) {
        this.onError(
          "Failed to load model: " +
            (this.preLoadError.message || this.preLoadError)
        );
      }
    } else {
      // Model still downloading — poll until ready
      if (this.onSpaceStatus) {
        this.onSpaceStatus(false, "Downloading machine model...");
      }
      const poll = setInterval(() => {
        if (this.isPreloaded && this.preloadedModel) {
          clearInterval(poll);
          doPlace(this.preloadedModel);
        } else if (this.preLoadError) {
          clearInterval(poll);
          this.isLoading = false;
          if (this.onError) {
            this.onError(
              "Failed to load model: " +
                (this.preLoadError.message || this.preLoadError)
            );
          }
        }
      }, 100);
    }
  }

  // ─── Preloading ──────────────────────────────────────────────────────────────

  _startPreload() {
    this.preloadedModel = null;
    this.preLoadError = null;
    this.isPreloaded = false;

    loadMachine(
      this.machineData.model,
      (model) => {
        this.preloadedModel = model;
        this.isPreloaded = true;
        console.log("Machine model preloaded successfully.");
      },
      (progress) => {
        if (this.onLoadingProgress && !this.isPlaced) {
          this.onLoadingProgress(Math.round(progress));
        }
      },
      (err) => {
        this.preLoadError = err;
        console.error("Failed to preload machine model:", err);
      }
    );
  }

  // ─── Remove Machine ─────────────────────────────────────────────────────────

  removeMachine() {
    if (!this.isPlaced || !this.placedModel) return;

    this.scene.remove(this.placedModel);

    // Dispose geometry, materials, and textures
    this.placedModel.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          mats.forEach((mat) => {
            for (const key of Object.keys(mat)) {
              const prop = mat[key];
              if (prop && typeof prop.dispose === "function" && prop.isTexture) {
                prop.dispose();
              }
            }
            mat.dispose();
          });
        }
      }
    });

    this.placedModel = null;
    this.isPlaced = false;
    this.isSpaceValid = false;
    this.lastSpaceCheckReason = "Scanning for flat surface...";

    // Re-preload for next placement
    this._startPreload();

    if (this.onRemoved) {
      this.onRemoved();
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  onWindowResize() {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  destroy() {
    window.removeEventListener("resize", this.onWindowResizeBind);

    if (this.session) {
      this.session.removeEventListener("select", this.onSelectBind);
      const s = this.session;
      this.session = null;
      s.end().catch(() => {});
    }

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }

    if (this.placedModel) {
      this.removeMachine();
    }

    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => m.dispose());
          }
        }
      });
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (
        this.container &&
        this.renderer.domElement.parentNode === this.container
      ) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    if (this.onRemoved) {
      this.onRemoved();
    }
  }
}

// ─── Helper: Visual Bounding Box ─────────────────────────────────────────────

function getVisualBoundingBox(object) {
  const box = new THREE.Box3();
  let hasVisualMesh = false;

  object.traverse((child) => {
    if (child.isMesh) {
      const name = (child.name || "").toLowerCase();
      if (
        name.includes("helper") ||
        name.includes("collider") ||
        name.includes("floor") ||
        name.includes("ground") ||
        name.includes("plane") ||
        name.includes("shadow")
      ) {
        return;
      }

      if (child.material) {
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        if (mats.every((m) => m.visible === false || m.opacity === 0)) return;
      }

      if (!child.geometry) return;
      if (!child.geometry.boundingBox) {
        child.geometry.computeBoundingBox();
      }

      const localBox = child.geometry.boundingBox.clone();
      child.updateWorldMatrix(true, false);
      localBox.applyMatrix4(child.matrixWorld);
      box.union(localBox);
      hasVisualMesh = true;
    }
  });

  if (!hasVisualMesh) {
    box.setFromObject(object);
  }

  return box;
}
