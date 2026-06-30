import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function Cameracontroller({ machine }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    camera.position.set(...machine.cameraPosition);
    camera.fov = machine.fov;
    camera.updateProjectionMatrix();

    if (controls instanceof OrbitControls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [machine, camera, controls]);

  return null;
}

export default Cameracontroller;