import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { machine } from "../data/machine";

function ARViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const modelViewerRef = useRef(null);

  const [loadingProgress, setLoadingProgress] = useState(null);
  const [modelScale, setModelScale] = useState("1 1 1");
  const [errorMessage, setErrorMessage] = useState("");

  // Find the selected machine data matching the routing id
  const selectedMachine = machine.find((m) => m.id === id);

  useEffect(() => {
    if (!selectedMachine) {
      setErrorMessage(`Machine '${id}' not found.`);
      return;
    }

    const viewer = modelViewerRef.current;
    if (!viewer) return;

    const onProgress = (event) => {
      const progress = Math.round(event.detail.totalProgress * 100);
      setLoadingProgress(progress === 100 ? null : progress);
    };

    const onLoad = () => {
      setLoadingProgress(null);
      // Automatically calculate exact uniform scaling to match target height in meters
      const dimensions = viewer.getDimensions();
      const targetHeight = selectedMachine.height / 1000;
      if (dimensions && dimensions.y > 0) {
        const scaleFactor = targetHeight / dimensions.y;
        setModelScale(`${scaleFactor} ${scaleFactor} ${scaleFactor}`);
      }
    };

    const onError = (err) => {
      console.error("Model viewer error:", err);
      setErrorMessage("Failed to load 3D model assets.");
    };

    viewer.addEventListener("progress", onProgress);
    viewer.addEventListener("load", onLoad);
    viewer.addEventListener("error", onError);

    return () => {
      viewer.removeEventListener("progress", onProgress);
      viewer.removeEventListener("load", onLoad);
      viewer.removeEventListener("error", onError);
    };
  }, [id, selectedMachine]);

  const handleBack = () => {
    navigate("/");
  };

  const handleActivateAR = () => {
    if (modelViewerRef.current) {
      modelViewerRef.current.activateAR();
    }
  };

  if (!selectedMachine) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <p className="text-xl font-semibold mb-4">Machine not found</p>
          <button onClick={handleBack} className="bg-zinc-800 hover:bg-zinc-700 px-6 py-2 rounded-xl">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 select-none flex flex-col">
      {/* 3D Model Viewer Container */}
      <div className="flex-1 w-full h-full relative z-0">
        <model-viewer
          ref={modelViewerRef}
          src={selectedMachine.model}
          scale={modelScale}
          ar
          ar-modes="webxr scene-viewer quick-look"
          camera-controls
          shadow-intensity="1.5"
          shadow-softness="0.8"
          environment-image="neutral"
          auto-rotate
          interaction-prompt="auto"
          ar-placement="floor"
          className="w-full h-full"
          style={{ width: "100%", height: "100%", "--poster-color": "transparent" }}
        >
          {/* Hide default AR button since we use our custom premium UI CTA */}
          <button slot="ar-button" style={{ display: "none" }} />
        </model-viewer>
      </div>

      {/* Floating Top Header UI */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center pointer-events-none z-10">
        <button
          onClick={handleBack}
          className="pointer-events-auto bg-zinc-900/95 hover:bg-zinc-800 border border-zinc-800 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="bg-zinc-900/95 border border-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-xl backdrop-blur-md flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          {selectedMachine.name}
        </div>
      </div>

      {/* Premium Floating Bottom Control Panel */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-zinc-900/95 border border-zinc-800/80 p-5 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col gap-4 z-10">
        <div>
          <h3 className="text-white text-base font-bold mb-1">Interactive 3D Preview</h3>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Drag to rotate, pinch to zoom. Place in your physical space to view the actual size ({selectedMachine.width} × {selectedMachine.depth} × {selectedMachine.height} mm).
          </p>
        </div>

        {/* View in AR Button */}
        <button
          onClick={handleActivateAR}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-cyan-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer border border-cyan-400/20"
        >
          <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          View in Your Room (AR)
        </button>
      </div>

      {/* Loading Progress Overlay */}
      {loadingProgress !== null && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/75 backdrop-blur-sm z-20 pointer-events-none">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl text-center max-w-xs w-full pointer-events-auto">
            <svg className="w-9 h-9 animate-spin text-cyan-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-white font-semibold mb-2">Loading model assets...</p>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-zinc-400 text-xs mt-2">{loadingProgress}% loaded</p>
          </div>
        </div>
      )}

      {/* Error Message Toast */}
      {errorMessage && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-11/12 max-w-sm text-center z-30 pointer-events-none">
          <div className="bg-red-950/95 border border-red-800 text-red-200 px-5 py-3.5 rounded-xl font-medium shadow-2xl backdrop-blur-sm pointer-events-auto flex items-center justify-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ARViewer;