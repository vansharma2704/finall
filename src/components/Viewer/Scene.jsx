import Lights from "./Lights";
import Ground from "./Ground";
import MachineModel from "./MachineModel";

function Scene({ machine }) {
  return (
    <>
      <Lights />
  

      <MachineModel
        key={machine.id}
        model={machine.model}
        scale={machine.previewScale}
      />
    </>
  );
}

export default Scene;