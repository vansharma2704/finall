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

    // Capture the current camera position from the tracking loop
    const xrCamera = this.renderer.xr.getCamera(this.camera);
    if (xrCamera) {
      if (!this.lastCameraPosition) {
        this.lastCameraPosition = new THREE.Vector3();
      }
      xrCamera.getWorldPosition(this.lastCameraPosition);
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

        // Reset scale/rotation to calculate true dimensions
        this.placedModel.scale.set(1, 1, 1);
        this.placedModel.rotation.set(0, 0, 0);

        const box = new THREE.Box3().setFromObject(this.placedModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Calculate exact non-uniform scaling to match target dimensions in meters
        const targetWidth = this.machineData.width / 1000;
        const targetHeight = this.machineData.height / 1000;
        const targetDepth = this.machineData.depth / 1000;

        let scaleX = 1.0;
        let scaleY = 1.0;
        let scaleZ = 1.0;

        if (size.x > 0) scaleX = targetWidth / size.x;
        if (size.y > 0) scaleY = targetHeight / size.y;
        if (size.z > 0) scaleZ = targetDepth / size.z;

        this.placedModel.scale.set(scaleX, scaleY, scaleZ);

        // Calculate bounding box again after scaling to find the bottom offset relative to the pivot
        const scaledBox = new THREE.Box3().setFromObject(this.placedModel);

        // Position model exactly on the floor hit point
        this.placedModel.position.copy(position);
        // Adjust Y so the bottom of the model rests exactly on the floor
        this.placedModel.position.y -= scaledBox.min.y;

        // Orient model to face the camera (user) horizontally using cached position
        const cameraPosition = this.lastCameraPosition || new THREE.Vector3(0, 1.6, 0);
        const toCamera = new THREE.Vector3().subVectors(cameraPosition, position);
        toCamera.y = 0; // lock to horizontal plane
        toCamera.normalize();

        const angle = Math.atan2(toCamera.x, toCamera.z);
        this.placedModel.rotation.set(0, angle, 0);

        this.scene.add(this.placedModel);

        // Place shadow plane exactly under the model
        this.shadowPlane.position.copy(position);
        this.shadowPlane.position.y += 0.001; // Prevent z-fighting
        this.shadowPlane.visible = true;

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
