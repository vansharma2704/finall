export async function startAR(renderer, sessionInit = {}) {
  if (!navigator.xr) {
    throw new Error("WebXR is not supported on this browser or device.");
  }

  const isArSupported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!isArSupported) {
    throw new Error("Immersive AR is not supported on this device/browser.");
  }

  const session = await navigator.xr.requestSession("immersive-ar", sessionInit);

  // Reference space type is already set on renderer.xr in initScene.js
  await renderer.xr.setSession(session);

  return session;
}
