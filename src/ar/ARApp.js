import * as THREE from "three";
import { initScene } from "./initScene";
import { startAR } from "./startAR";
import { initHitTest, getHitPose, checkSpace } from "./hitTest";
import { createReticle } from "./reticle";
import { loadMachine } from "./loadMachine";

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
    this.shadowPlane = null;
    this.dirLight = null;
    this.ambientLight = null;

    this.isPlaced = false;
    this.isLoading = false;
    this.isSpaceValid = false;
    this.lastSpaceCheckReason = "Scanning for flat surface...";

    this.lastCameraPosition = new THREE.Vector3(0, 1.6, 0);

    this.onSelectBind = this.onSelect.bind(this);
    this.onWindowResizeBind = this.onWindowResize.bind(this);
  }

  async start() {
    try {
      // 1. Initialize Scene, Camera, Renderer
      const sceneData = initScene(this.container);
      this.scene = sceneData.scene;
      this.camera = sceneData.camera;
      this.renderer = sceneData.renderer;

      // 2. Set up realistic lighting and shadows
      this.setupRealisticLighting();

      // 3. Create Reticle
      this.reticle = createReticle();
      this.scene.add(this.reticle);

      // Create visible 3D solid ground base helper (default radius 1.0, thickness 0.02)
      const baseGeometry = new THREE.CylinderGeometry(1.0, 1.0, 0.02, 32);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x18181b, // Zinc-900 (dark charcoal grey)
        roughness: 0.4,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
      });
      this.groundBase = new THREE.Mesh(baseGeometry, baseMaterial);
      this.groundBase.castShadow = true;
      this.groundBase.receiveShadow = true;
      this.groundBase.visible = false;
      this.scene.add(this.groundBase);

      // Glowing top border outline (default radius 1.005, thickness 0.005)
      const borderGeometry = new THREE.CylinderGeometry(1.005, 1.005, 0.005, 32);
      const borderMaterial = new THREE.MeshBasicMaterial({
        color: 0x06b6d4, // Cyan glow
        transparent: true,
        opacity: 0.8
      });
      this.groundOutline = new THREE.Mesh(borderGeometry, borderMaterial);
      this.groundOutline.visible = false;
      this.scene.add(this.groundOutline);

      // 4. Start WebXR AR Session
      const sessionInit = {
        requiredFeatures: ["hit-test", "local"],
      };

      this.session = await startAR(this.renderer, sessionInit);

      // Listen for tap gesture (WebXR select event)
      this.session.addEventListener("select", this.onSelectBind);

      // Handle session termination (e.g., user exits AR or browser closes)
      this.session.addEventListener("end", () => {
        this.destroy();
      });

      // 5. Initialize Hit Test
      this.hitTestSource = await initHitTest(this.session);

      // 6. Handle Window Resizing
      window.addEventListener("resize", this.onWindowResizeBind);

      // 7. Start the XR animation render loop
      this.renderer.setAnimationLoop((timestamp, frame) => this.tick(timestamp, frame));

    } catch (error) {
      console.error("Failed to start custom WebXR AR App:", error);
      if (this.onError) {
        this.onError(error.message || "Failed to initialize WebXR immersive AR session.");
      }
      this.destroy();
    }
  }

  setupRealisticLighting() {
    // Directional light representing overhead room illumination
    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(1.5, 4.0, 1.5);
    this.dirLight.castShadow = true;

    // High quality soft shadows settings
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 8.0;

    // Small orthographic frustum aligned with machine size
    const d = 1.0;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;

    // Bias to prevent self-shadowing artifacts
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Complementary ambient fill light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    // Dynamic shadow plane to blend shadow with actual floor
    const shadowPlaneGeometry = new THREE.PlaneGeometry(6, 6);
    shadowPlaneGeometry.rotateX(-Math.PI / 2);
    const shadowPlaneMaterial = new THREE.ShadowMaterial({ opacity: 0.45 });
    this.shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.position.set(0, 0, 0);
    this.shadowPlane.visible = false;
    this.scene.add(this.shadowPlane);
  }

  tick(timestamp, frame) {
    if (!frame) return;

    // Capture the current camera position from the tracking loop using the WebXR frame pose
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    if (referenceSpace) {
      const viewerPose = frame.getViewerPose(referenceSpace);
      if (viewerPose) {
        if (!this.lastCameraPosition) {
          this.lastCameraPosition = new THREE.Vector3();
        }
        this.lastCameraPosition.set(
          viewerPose.transform.position.x,
          viewerPose.transform.position.y,
          viewerPose.transform.position.z
        );
      }
    }

    // Only update hit test if nothing is placed yet and model is not loading
    if (this.session && this.hitTestSource && !this.isPlaced && !this.isLoading) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const pose = getHitPose(frame, this.hitTestSource, referenceSpace);

      if (pose) {
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(pose.transform.matrix);

        // Perform space check
        const xrCamera = this.renderer.xr.getCamera();
        const spaceResult = checkSpace(this.reticle, this.machineData, xrCamera);
        this.isSpaceValid = spaceResult.valid;
        this.lastSpaceCheckReason = spaceResult.reason || "";

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

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  onSelect() {
    if (this.isPlaced || this.isLoading) return;

    // Block placement if space requirements are not met
    if (!this.isSpaceValid) {
      if (this.onError) {
        this.onError(this.lastSpaceCheckReason || "Not enough space to place machine.");
      }
      return;
    }

    this.isLoading = true;
    this.reticle.visible = false;
    if (this.onSpaceStatus) {
      this.onSpaceStatus(false, "Loading machine model...");
    }

    // Decompose the reticle matrix to capture placement location
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    this.reticle.matrix.decompose(position, quaternion, scale);

    loadMachine(
      this.machineData.model,
      (model) => {
        this.placedModel = model;

        // Add to scene first so that world matrices can be computed correctly
        this.scene.add(this.placedModel);

        // Reset scale/rotation/position to calculate true original dimensions
        this.placedModel.scale.set(1, 1, 1);
        this.placedModel.rotation.set(0, 0, 0);
        this.placedModel.position.set(0, 0, 0);
        this.placedModel.updateMatrixWorld(true);

        const box = getVisualBoundingBox(this.placedModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Calculate uniform scale factor to match the real-world height (in meters) without distortion
        const targetHeight = this.machineData.height / 1000;
        let scaleFactor = 1.0;
        if (size.y > 0.001) {
          scaleFactor = targetHeight / size.y;
        }

        this.placedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        this.placedModel.updateMatrixWorld(true);

        // Calculate bounding box again after scaling to find the bottom offset relative to the pivot
        const scaledBox = getVisualBoundingBox(this.placedModel);

        // Position model exactly on the solid ground top (2cm above floor)
        this.placedModel.position.copy(position);
        this.placedModel.position.y += (0.02 - scaledBox.min.y);
        this.placedModel.updateMatrixWorld(true);

        // Orient model to face the camera (user) horizontally using cached position
        const cameraPosition = new THREE.Vector3();
        if (this.lastCameraPosition) {
          cameraPosition.copy(this.lastCameraPosition);
        } else {
          cameraPosition.set(0, 1.6, 0);
        }
        const toCamera = new THREE.Vector3().subVectors(cameraPosition, position);
        toCamera.y = 0; // lock to horizontal plane
        toCamera.normalize();

        const angle = Math.atan2(toCamera.x, toCamera.z);
        this.placedModel.rotation.set(0, angle, 0);
        this.placedModel.updateMatrixWorld(true);

        // Place shadow plane exactly under the model
        this.shadowPlane.position.copy(position);
        this.shadowPlane.position.y += 0.001; // Prevent z-fighting
        this.shadowPlane.visible = true;

        // Place the ground base and outline exactly under the model
        if (this.groundBase && this.groundOutline) {
          const diagonal = Math.sqrt(this.machineData.width * this.machineData.width + this.machineData.depth * this.machineData.depth) / 1000;
          const radius = (diagonal / 2) + 0.05; // 5cm margin

          this.groundBase.scale.set(radius, 1.0, radius); // scale radius but keep thickness 0.02
          this.groundBase.position.set(position.x, position.y + 0.01, position.z); // center at 1cm height (so bottom is at 0 and top is at 2cm)
          this.groundBase.visible = true;

          this.groundOutline.scale.set(radius, 1.0, radius); // scale radius but keep thickness 0.005
          this.groundOutline.position.set(position.x, position.y + 0.02, position.z); // place at top edge (2cm height)
          this.groundOutline.visible = true;
        }

        // Position shadow-casting light target onto placed model
        this.dirLight.target = this.placedModel;
        this.dirLight.position.set(position.x + 1.5, position.y + 4.0, position.z + 1.5);

        this.isPlaced = true;
        this.isLoading = false;

        if (this.onSpaceStatus) {
          this.onSpaceStatus(true, ""); // Clear messages
        }
        if (this.onPlaced) {
          this.onPlaced();
        }
      },
      (progress) => {
        if (this.onLoadingProgress) {
          this.onLoadingProgress(progress);
        }
      },
      (err) => {
        this.isLoading = false;
        this.reticle.visible = true; // Show reticle to allow trying again
        if (this.onError) {
          this.onError("Failed to load model: " + (err.message || err));
        }
      }
    );
  }

  removeMachine() {
    if (!this.isPlaced || !this.placedModel) return;

    this.scene.remove(this.placedModel);

    // Prevent memory leaks: recursively dispose geometry, materials, and textures
    this.placedModel.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              this.disposeMaterial(mat);
            });
          } else {
            this.disposeMaterial(child.material);
          }
        }
      }
    });

    this.placedModel = null;
    this.shadowPlane.visible = false;
    if (this.groundBase) this.groundBase.visible = false;
    if (this.groundOutline) this.groundOutline.visible = false;
    this.isPlaced = false;
    this.isSpaceValid = false;
    this.lastSpaceCheckReason = "Scanning for flat surface...";

    if (this.onRemoved) {
      this.onRemoved();
    }
  }

  disposeMaterial(material) {
    material.dispose();
    // Dispose of any textures bound to maps
    for (const key of Object.keys(material)) {
      const prop = material[key];
      if (prop && typeof prop.dispose === "function" && prop.isTexture) {
        prop.dispose();
      }
    }
  }

  onWindowResize() {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  destroy() {
    // 1. Unbind window event
    window.removeEventListener("resize", this.onWindowResizeBind);

    // 2. Clean up XR Event listeners and end session
    if (this.session) {
      this.session.removeEventListener("select", this.onSelectBind);
      const activeSession = this.session;
      this.session = null; // Prevent loop trigger in listeners
      activeSession.end().catch((err) => {
        console.warn("Session already ended or failed to close cleanly:", err);
      });
    }

    // 3. Stop Animation loop
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }

    // 4. Remove and clean up the placed machine
    if (this.placedModel) {
      this.removeMachine();
    }

    // 5. Clean up other scene assets
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => this.disposeMaterial(mat));
            } else {
              this.disposeMaterial(child.material);
            }
          }
        }
      });
    }

    // 6. Dispose WebGLRenderer and clean DOM
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    // 7. Fire Removed callback to clear React UI states
    if (this.onRemoved) {
      this.onRemoved();
    }
  }
}

function getVisualBoundingBox(object) {
  const box = new THREE.Box3();
  let hasVisualMesh = false;

  object.traverse((child) => {
    if (child.isMesh) {
      const name = child.name.toLowerCase();
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
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const isInvisible = mats.every((m) => m.visible === false || m.opacity === 0);
        if (isInvisible) return;
      }

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
