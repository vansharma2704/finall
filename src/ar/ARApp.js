import * as THREE from "three";
import { initScene } from "./initScene";
import { startAR } from "./startAR";
import { initHitTest, getHitPose } from "./hitTest";
import { createReticle } from "./reticle";
import { loadMachine } from "./loadMachine";

/**
 * ARApp — Production WebXR AR engine.
 *
 * ARCHITECTURE:
 * - Model is placed once on tap using the hit-test surface position.
 * - A WebXR Anchor is created at the placement point for drift correction.
 * - If anchors are supported, the model follows the anchor (which is physically fixed).
 * - If anchors are NOT supported, the model is frozen at the initial position.
 * - Scale is computed once and never changed.
 * - The camera moves independently; the model stays in physical space.
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

    // Anchor tracking
    this.anchor = null;
    this.modelYOffset = 0;         // Vertical offset from anchor to model bottom
    this.modelScaleFactor = 1.0;   // Stored scale (set once, never changed)
    this.modelQuaternion = new THREE.Quaternion(); // Stored orientation (set once)
    this.hasAnchors = false;       // Whether WebXR anchors are available

    // Preloading state
    this.preloadedModel = null;
    this.preLoadError = null;
    this.isPreloaded = false;
  }

  async start() {
    try {
      // 1. Initialize Scene, Camera, Renderer
      const sceneData = initScene(this.container);
      this.scene = sceneData.scene;
      this.camera = sceneData.camera;
      this.renderer = sceneData.renderer;

      // 2. Set up lighting (no shadows)
      this.setupLighting();

      // 3. Create Reticle
      this.reticle = createReticle();
      this.scene.add(this.reticle);

      // 4. Start WebXR AR Session
      const sessionInit = {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["anchors", "local-floor"],
      };
      this.session = await startAR(this.renderer, sessionInit);

      // Listen for tap
      this.session.addEventListener("select", this.onSelectBind);

      // Handle session end
      this.session.addEventListener("end", () => {
        this.destroy();
      });

      // 5. Initialize Hit Test
      this.hitTestSource = await initHitTest(this.session);

      // 6. Handle Resize
      window.addEventListener("resize", this.onWindowResizeBind);

      // 7. Start render loop
      this.renderer.setAnimationLoop((ts, frame) => this.tick(ts, frame));

      // 8. Background-preload the machine model
      this._startPreload();
    } catch (error) {
      console.error("Failed to start WebXR AR:", error);
      if (this.onError) {
        this.onError(
          error.message || "Failed to initialize WebXR AR session."
        );
      }
      this.destroy();
    }
  }

  // ─── Lighting ───────────────────────────────────────────────────────────────

  setupLighting() {
    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(1.5, 4.0, 1.5);
    this.scene.add(this.dirLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);
  }

  // ─── Render Loop ────────────────────────────────────────────────────────────
  //
  // Before placement: update reticle from hit-test
  // After placement with anchor: update model position from anchor (physical lock)
  // After placement without anchor: do nothing (frozen transform)

  tick(timestamp, frame) {
    if (!frame) return;

    const refSpace = this.renderer.xr.getReferenceSpace();

    // ── Pre-placement: reticle tracking ──
    if (!this.isPlaced && !this.isLoading && this.hitTestSource && refSpace) {
      const pose = getHitPose(frame, this.hitTestSource, refSpace);

      if (pose) {
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(pose.transform.matrix);

        // Simple surface normal check for flatness
        const m = this.reticle.matrix;
        // Normal Y component is matrix element [5] (2nd column, 2nd row)
        const normalY = m.elements[5];
        if (normalY < 0.95) {
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

    // ── Try to create anchor (must happen inside an active XR frame) ──
    if (this._pendingAnchor) {
      this._tryCreateAnchor(frame);
    }
    // ── Post-placement: anchor-based drift correction ──
    if (this.isPlaced && this.placedModel && this.anchor && refSpace) {
      try {
        const anchorPose = frame.getPose(this.anchor.anchorSpace, refSpace);
        if (anchorPose) {
          const p = anchorPose.transform.position;
          // Update ONLY position from anchor (scale and rotation are frozen)
          this.placedModel.position.set(p.x, p.y + this.modelYOffset, p.z);
          this.placedModel.updateMatrix();
          this.placedModel.updateMatrixWorld(true);
        }
      } catch (e) {
        // Anchor lost — model stays at last known position
      }
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Placement ──────────────────────────────────────────────────────────────

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

    // Capture placement position & orientation from reticle
    const placementPos = new THREE.Vector3();
    const placementQuat = new THREE.Quaternion();
    const placementScale = new THREE.Vector3();
    this.reticle.matrix.decompose(placementPos, placementQuat, placementScale);

    // Store orientation (used once, never changed)
    this.modelQuaternion.copy(placementQuat);

    // Try to create a WebXR anchor at this position
    this._createAnchorFromHitTest();

    // Place model function
    const doPlace = (model) => {
      this.placedModel = model;
      this.scene.add(this.placedModel);

      // Reset to measure original dimensions
      this.placedModel.scale.set(1, 1, 1);
      this.placedModel.rotation.set(0, 0, 0);
      this.placedModel.position.set(0, 0, 0);
      this.placedModel.updateMatrixWorld(true);

      // Measure visual bounding box
      const box = getVisualBoundingBox(this.placedModel);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Compute uniform scale (height-based, mm → meters)
      const targetHeight = this.machineData.height / 1000;
      this.modelScaleFactor = size.y > 0.001 ? targetHeight / size.y : 1.0;

      // Apply scale ONCE
      this.placedModel.scale.setScalar(this.modelScaleFactor);
      this.placedModel.updateMatrixWorld(true);

      // Get bottom offset after scaling
      const scaledBox = getVisualBoundingBox(this.placedModel);
      this.modelYOffset = -scaledBox.min.y;

      // Position on floor hit point
      this.placedModel.position.copy(placementPos);
      this.placedModel.position.y += this.modelYOffset;

      // Orient to surface
      this.placedModel.quaternion.copy(this.modelQuaternion);

      // Finalize matrix
      this.placedModel.updateMatrix();
      this.placedModel.updateMatrixWorld(true);

      // If no anchors, freeze transform completely
      if (!this.hasAnchors) {
        this.placedModel.matrixAutoUpdate = false;
        this.placedModel.traverse((child) => {
          child.matrixAutoUpdate = false;
        });
      }

      // Point light at model
      this.dirLight.target = this.placedModel;
      this.dirLight.position.set(
        placementPos.x + 1.5,
        placementPos.y + 4.0,
        placementPos.z + 1.5
      );

      this.isPlaced = true;
      this.isLoading = false;

      if (this.onSpaceStatus) {
        this.onSpaceStatus(true, "");
      }
      if (this.onPlaced) {
        this.onPlaced();
      }
    };

    // Use preloaded model if ready
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
      // Model still downloading — poll
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

  // ─── Anchor Creation ────────────────────────────────────────────────────────

  _createAnchorFromHitTest() {
    // Will be executed in the next frame when hit test results are available
    this._pendingAnchor = true;
  }

  // Called from tick() to create anchor within an active XR frame
  _tryCreateAnchor(frame) {
    if (!this._pendingAnchor || !this.hitTestSource) return;
    this._pendingAnchor = false;

    try {
      const refSpace = this.renderer.xr.getReferenceSpace();
      const results = frame.getHitTestResults(this.hitTestSource);
      if (results.length > 0 && results[0].createAnchor) {
        results[0]
          .createAnchor()
          .then((anchor) => {
            this.anchor = anchor;
            this.hasAnchors = true;
            console.log("WebXR Anchor created — model is physically locked.");

            // Now that we have an anchor, enable matrixAutoUpdate so anchor
            // pose updates are reflected
            if (this.placedModel) {
              this.placedModel.matrixAutoUpdate = true;
            }
          })
          .catch(() => {
            console.warn("Anchors not available — using fixed position.");
            this.hasAnchors = false;
          });
      }
    } catch (e) {
      this.hasAnchors = false;
    }
  }

  // ─── Preloading ─────────────────────────────────────────────────────────────

  _startPreload() {
    this.preloadedModel = null;
    this.preLoadError = null;
    this.isPreloaded = false;

    loadMachine(
      this.machineData.model,
      (model) => {
        this.preloadedModel = model;
        this.isPreloaded = true;
        console.log("Machine model preloaded.");
      },
      (progress) => {
        if (this.onLoadingProgress && !this.isPlaced) {
          this.onLoadingProgress(Math.round(progress));
        }
      },
      (err) => {
        this.preLoadError = err;
        console.error("Failed to preload:", err);
      }
    );
  }

  // ─── Remove Machine ────────────────────────────────────────────────────────

  removeMachine() {
    if (!this.isPlaced || !this.placedModel) return;

    this.scene.remove(this.placedModel);

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
              if (
                prop &&
                typeof prop.dispose === "function" &&
                prop.isTexture
              ) {
                prop.dispose();
              }
            }
            mat.dispose();
          });
        }
      }
    });

    this.placedModel = null;
    this.anchor = null;
    this.hasAnchors = false;
    this.isPlaced = false;
    this.isSpaceValid = false;
    this.lastSpaceCheckReason = "Scanning for flat surface...";

    this._startPreload();

    if (this.onRemoved) {
      this.onRemoved();
    }
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

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

// ─── Helper ───────────────────────────────────────────────────────────────────

function getVisualBoundingBox(object) {
  const box = new THREE.Box3();
  let found = false;

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

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

    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }

    const lb = child.geometry.boundingBox.clone();
    child.updateWorldMatrix(true, false);
    lb.applyMatrix4(child.matrixWorld);
    box.union(lb);
    found = true;
  });

  if (!found) {
    box.setFromObject(object);
  }

  return box;
}
