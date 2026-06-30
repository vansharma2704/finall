export async function startAR(renderer, sessionInit = {}) {
  if (!navigator.xr) {
    throw new Error("WebXR is not supported on this browser or device.");
  }

  const isArSupported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!isArSupported) {
    throw new Error("Immersive AR is not supported on this device/browser.");
  }

  // Request the session
  const session = await navigator.xr.requestSession("immersive-ar", sessionInit);
  
  // Force local reference space type to ensure stable stationary tracking
  renderer.xr.setReferenceSpaceType("local");

  // Set the session on Three.js WebXRManager
  await renderer.xr.setSession(session);

  return session;
}
