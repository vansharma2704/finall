import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import Scene from "./Scene";
import Cameracontroller from "./Cameracontroller";

function Viewer({ machine }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden h-[600px]">

      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">

        <h2 className="font-semibold">
          3D Viewer
        </h2>

        <button className="text-sm bg-cyan-500 px-3 py-1 rounded-lg">
          Reset Camera
        </button>

      </div>

      <Canvas
  style={{ height: "540px" }}
  camera={{
    position: machine.cameraPosition,
    fov: machine.fov,
  }}
>
  <Cameracontroller machine={machine} />

  <color attach="background" args={["#1f2937"]} />

  <Scene machine={machine} />

  <OrbitControls
    makeDefault
    autoRotate
    autoRotateSpeed={3}
  />
</Canvas>

    </div>
  );
}

export default Viewer;