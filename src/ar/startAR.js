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
  
  // Determine reference space type supported by this session and set it on Three.js WebXRManager
  let referenceSpaceType = "local";
  try {
    await session.requestReferenceSpace("local-floor");
    referenceSpaceType = "local-floor";
  } catch (e) {
    try {
      await session.requestReferenceSpace("local");
      referenceSpaceType = "local";
    } catch (e2) {
      referenceSpaceType = "viewer";
    }
  }

  renderer.xr.setReferenceSpaceType(referenceSpaceType);

  // Set the session on Three.js WebXRManager
  await renderer.xr.setSession(session);

  return session;
}
