import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";

function MachineModel({ model, scale = 1 }) {
  const { scene } = useGLTF(model);

  const clonedScene = useMemo(() => scene.clone(), [scene]);

  return (
    <primitive
      object={clonedScene}
      scale={scale}
      position={[0, 0, 0]}
    />
  );
}

export default MachineModel;