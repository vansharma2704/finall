export const machine = [
  {
    id: "fusion",
    name: "Fusion",
    description: "Smart Beverage Machine",

    width: 585,
    depth: 325,
    height: 550,

    model: "/models/fusion.glb",
    thumbnail: "/images/fusion.png",

    // Preview Settings
    previewScale: 1,
    cameraPosition: [0, 0.5, 1.8],
    fov: 45,

    status: "Ready",
  },

  {
    id: "doll",
    name: "Doll",
    description: "Smart 3D Doll",

    width: 120,
    depth: 220,
    height: 150,

    model: "/models/doll.glb",
    thumbnail: "/images/doll.png",

    // Preview Settings
    previewScale: 3,
    cameraPosition: [0, 0.5, 15],
    fov: 35,

    status: "Ready",
  },
];