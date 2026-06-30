import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { machine } from "../data/machine";
import { ARApp } from "../ar/ARApp";

function ARViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [placed, setPlaced] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [spaceValid, setSpaceValid] = useState(false);
  const [spaceReason, setSpaceReason] = useState("Initializing AR...");
  const [errorMessage, setErrorMessage] = useState("");
  const [arAppInstance, setArAppInstance] = useState(null);

  // Find the selected machine data matching the routing id
  const selectedMachine = machine.find((m) => m.id === id);

  useEffect(() => {
    if (!selectedMachine) {
      setErrorMessage(`Machine '${id}' not found in database.`);
      return;
    }

    let arApp;

    // Small timeout to guarantee DOM container is fully sized and ready
    const timer = setTimeout(() => {
      arApp = new ARApp({
        container: containerRef.current,
        machineData: selectedMachine,
        onSpaceStatus: (isValid, reason) => {
          setSpaceValid(isValid);
          setSpaceReason(reason);
        },
        onPlaced: () => {
          setPlaced(true);
          setLoadingProgress(null);
          setSpaceReason("");
        },
        onRemoved: () => {
          setPlaced(false);
          setLoadingProgress(null);
        },
        onLoadingProgress: (progress) => {
          setLoadingProgress(Math.round(progress));
        },
        onError: (err) => {
          setErrorMessage(err);
          // Auto-clear tracking warnings after 3.5 seconds
          if (err.includes("space") || err.includes("flat") || err.includes("surface")) {
            setTimeout(() => setErrorMessage(""), 3500);
          }
        },
      });

      arApp.start();
      setArAppInstance(arApp);
    }, 150);

    return () => {
      clearTimeout(timer);
      if (arApp) {
        arApp.destroy();
      }
    };
  }, [id, selectedMachine]);

  const handleBack = () => {
    if (arAppInstance) {
      arAppInstance.destroy();
    }
    navigate("/");
  };

  const handleRemove = () => {
    if (arAppInstance) {
      arAppInstance.removeMachine();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Floating Top Header UI */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center pointer-events-none z-10">
        {/* Back Button */}
        <button
          onClick={handleBack}
          className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Machine details indicator */}
        {selectedMachine && (
          <div className="bg-zinc-950/80 border border-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            {selectedMachine.name}
          </div>
        )}
      </div>

      {/* Center Reticle Status Hint (Scanning & Space Check Warnings) */}
      {!placed && loadingProgress === null && !errorMessage && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-11/12 max-w-md text-center pointer-events-none z-10">
          <div
            className={`px-6 py-3.5 rounded-2xl text-sm font-medium shadow-xl backdrop-blur-md transition-all duration-300 ${
              spaceValid
                ? "bg-cyan-950/90 border border-cyan-800 text-cyan-200"
                : "bg-zinc-950/90 border border-zinc-800 text-zinc-300"
            }`}
          >
            {spaceValid ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                Tap screen to place machine ({selectedMachine?.width}×{selectedMachine?.depth}mm)
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {spaceReason}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading Progress Overlay */}
      {loadingProgress !== null && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl shadow-2xl text-center max-w-xs w-full pointer-events-auto">
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

      {/* Space Check Error Toast */}
      {errorMessage && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-11/12 max-w-sm text-center z-30 pointer-events-none">
          <div className="bg-red-950/90 border border-red-800 text-red-200 px-5 py-3.5 rounded-xl font-medium shadow-2xl backdrop-blur-sm pointer-events-auto animate-bounce flex items-center justify-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Remove Machine Button */}
      {placed && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-center z-10 pointer-events-none">
          <button
            onClick={handleRemove}
            className="pointer-events-auto bg-red-650 hover:bg-red-600 text-white font-semibold px-6 py-3.5 rounded-2xl shadow-xl hover:shadow-red-900/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer border border-red-700/50 bg-red-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remove Machine
          </button>
        </div>
      )}
    </div>
  );
}

export default ARViewer;