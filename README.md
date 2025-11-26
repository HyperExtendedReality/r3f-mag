[![npm](https://img.shields.io/npm/v/r3f-mag?color=%23F69500)](https://www.npmjs.com/package/r3f-mag)
[![npm](https://img.shields.io/badge/bulletphysics%20(fork)-3.17-%23F69500)](https://github.com/notrabs/ammo.js/tree/bullet_submodule)
![npm](https://img.shields.io/npm/types/r3f-mag?label=%20)

# r3f-mag

_Fast_ Physics hooks for use with [react-three-fiber](https://github.com/pmndrs/react-three-fiber).

Achieved by running the [ammo.js](https://github.com/kripken/ammo.js/) physics library in a web-worker. 
Ammo itself is a WebAssembly wrapper around the powerful [Bullet Physics](http://www.bulletphysics.org/) engine.
Data is synced with SharedArrayBuffers having minimal impact on the main thread.

`r3f-mag` is a modern fork of `use-ammojs` designed for compatibility with Next.js, Turbopack, and the modern `@react-three/drei` ecosystem.

## Installation

```bash
npm install r3f-mag @react-three/drei leva stats-gl
```
# or
```bash
yarn add r3f-mag @react-three/drei leva stats-gl
```
Features

WebWorker Physics: Heavy calculations run off the main thread.

Modern Stats: Integrated with Leva and StatsGl for deep performance profiling.

Next.js Compatible: Fixed bundling issues with Turbopack and Server Components.

Soft Bodies: Support for cloth, ropes, and volumes.

Examples
API Demos (Sandbox)

Note: Sandboxes below are from the original use-ammojs repo but compatible with r3f-mag API.

Hello Physics World

Soft Bodies

Crane (Constraint)

Crane (Rope + Attachment)

Raycast

⚠️ Note that the codesandbox examples do not support SharedArrayBuffers due to missing cross-origin isolation and use regular ArrayBuffers as a fallback. Currently the debug-drawer has no ArrayBuffer fallback implemented and will not render anything.

Why r3f-mag?

This package builds upon use-ammojs and use-cannon. While use-cannon is excellent, it lacks Soft Body support. r3f-mag brings the full power of Bullet Physics (Ammo.js) to React Three Fiber, including Soft Bodies, while fixing modern build system issues found in older wrappers.

Roadmap
Main goals:

Create a Physics World as a React context and simulate it in a web-worker

Sync three objects to physics Rigid Bodies

Add Rigid Body support

Add Soft Body support

Volumes/Cloth from Triangle Mesh

Ropes

Support textures on Soft Bodies

Deformables

Add Constraints between Rigid Bodies

Add Constraints to Soft Bodies (ability to pin nodes in place or to Rigid Bodies)

Improve Physics API

Make all props reactive

Expose more methods trough the hook (e.g. setPosition/applyImpulse/more...)

Support collision callbacks

New: Modernize Build System (Vite/Next.js/Turbopack compatibility)

Low priority goals (for unchecked tasks):

Automatic refresh rate detection and performance throttling (i.e. match the simulation rate to the requestAnimationFrame-rate and throttle performance if simulation steps take too long)

Add Raycast queries

One-time (async) ray-tests

Continuous queries trough a fixed scene component to mitigate worker latency

Use ArrayBuffers as a fallback for missing cross-origin isolation

Rigid Bodies

Soft Bodies

Debug Rendering

Simulation managment

Configurable simulation speed

Expose performance info

Integrated with @react-three/drei StatsGl component

Integrated with Leva for graphing

Automatically pause simulation if tab is out of focus or not rendering (as option)

Improve the automatic shape detection (set shapeType automatically based on the three Mesh type)

Quick Start
1. Wrap your scene in a Physics Provider
```bash
import { Physics, PhysicsStats } from "r3f-mag";

// Wrap your content in the Physics provider
<Physics>
  <Scene />
  {/* Optional: Add the new visualizer */}
  <PhysicsStats /> 
</Physics>
```

2.a Make objects physical (Rigid Bodies)

Automatically parse Shape parameters from the three Mesh (courtesy of three-to-ammo):

```bash
import { Box } from "@react-three/drei";
import { useRigidBody, ShapeType } from "r3f-mag";
import { Mesh } from "three";

function MyBox() {
  // If you need a ref with a narrower type than Object3D, provide a generic argument here
  const [ref] = useRigidBody<Mesh>(() => ({
    mass: 1,
    position: [0, 2, 4],
    shapeType: ShapeType.BOX,
  }));

  return (
    <Box ref={ref}>
      <meshBasicMaterial attach="material" color="red" />
    </Box>
  );
}
```
or define Collision Shapes manually:

```bash
const [playerCapsuleRef] = useRigidBody(() => ({
  bodyType: BodyType.DYNAMIC,
  shapeType: ShapeType.CAPSULE,
  angularFactor: new Vector3(0, 0, 0),
  shapeConfig: {
    fit: ShapeFit.MANUAL,
    halfExtents: new Vector3(0.3, 0.6, 0.3),
  },
}));
```

or add collisions to an imported gltf scene:

```bash
useRigidBody(
  () => ({
    shapeType: ShapeType.MESH,
    bodyType: BodyType.STATIC,
  }),
  gltf.scene
);
```
2.b Make objects squishy (Soft Bodies)
```bash
const [ref] = useSoftBody(() => ({
  type: SoftBodyType.TRIMESH,
}));

return (
  <Sphere position={[0, 2, 7]} args={[1, 16, 16]} ref={ref}>
    <meshPhysicalMaterial attach="material" color="blue" />
  </Sphere>
);
```
3. Raycasts
```bash
const { rayTest } = useAmmo();

// ...

const hits = await rayTest({
  from: new Vector3(0, 5, 7),
  to: new Vector3(0, -1, 7),
  multiple: true
})

if (hits.length) {
    console.log(hits[0].object.name, hits[0].hitPosition)
}
```
4. Update Motion State
```bash
const [playerRef, api] = useRigidBody(() => ({
  bodyType: BodyType.DYNAMIC,
  shapeType: ShapeType.CAPSULE,
  // ...
}));

function handleRespawn() {
  // Directly set position/velocity via the API
  api.setPosition(new Vector3(0, 0, 0));
  api.setLinearVelocity(new Vector3(0, 0, 0));
}
```
Documentation
Components
```bash
<Physics />
```

Phyiscs Context. Use to wrap all physical objects within the same physics world.

```bash
<PhysicsStats showGraph={true} showStats={true} />
```

Updated: Shows a StatsGl panel (FPS/GPU) and registers a Leva monitor graph for Physics CPU timings.

Hooks
```bash
const { rayTest } = useAmmo();
```
Utility funcionts available anywhere in the <Physics /> context.

```bash
const [ref, api] = useRigidBody();
```
```bash
const [ref, api] = useSoftBody();
```
Cross-origin isolation

To use SharedArrayBuffers for better communication between the main-thread and the web-worker-thread, a cross-origin isolated environment is necessary in modern browsers.

Next.js Config (next.config.js):

```bash
module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

Vite Config (vite.config.js):
```
```bash
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
```
r3f-mag will fallback to using ArrayBuffers and postMessage() transfers if SharedArrayBuffers are not available. This is not as bad as a full copy on each transfer, but it does not allow the data to be availble on both threads at the same time.

Developing locally
<details>
<summary> Setting up local development with Next.js/Vite </summary>


Run npm link in r3f-mag root directory.

Run npm link r3f-mag in your project's directory.

In r3f-mag, run npm run build or npm run dev to watch for changes.

If using Next.js and linking, you may need to add the following to next.config.js to resolve peer dependency duplications (React/Three):

```bash
const path = require('path');

module.exports = {
  webpack: (config) => {
    config.resolve.alias['react'] = path.resolve(__dirname, 'node_modules/react');
    config.resolve.alias['three'] = path.resolve(__dirname, 'node_modules/three');
    return config;
  },
};
</details>
```