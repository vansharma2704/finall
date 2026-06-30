;import { useEffect, useRef } from "react";
import { initScene } from "../ar/initScene";

function ARViewer() {
  const containerRef = useRef(null);

  useEffect(() => {
    const { scene, camera, renderer } = initScene(containerRef.current);

    const animate = () => {
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    };

    animate();

    return () => {
      renderer.setAnimationLoop(null);
      renderer.dispose();

      if (
        containerRef.current &&
        renderer.domElement.parentNode === containerRef.current
      ) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-screen h-screen overflow-hidden"
    />
  );
}

export default ARViewer;