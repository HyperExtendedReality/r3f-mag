r3f-mag
![alt text](https://img.shields.io/npm/v/r3f-mag?color=%23F69500)

![alt text](https://img.shields.io/npm/types/r3f-mag?label=%20)
Fast Physics hooks for use with react-three-fiber.
Achieved by running the ammo.js physics library in a web-worker.
Ammo itself is a WebAssembly wrapper around the powerful Bullet Physics engine.
Data is synced with SharedArrayBuffers having minimal impact on the main thread.
r3f-mag is a modern fork of use-ammojs designed for compatibility with Next.js, Turbopack, and the modern @react-three/drei ecosystem.
Installation
code
Bash
npm install r3f-mag @react-three/drei leva stats-gl
# or
yarn add r3f-mag @react-three/drei leva stats-gl
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
Raycast
⚠️ Note that codesandbox examples do not support SharedArrayBuffers due to missing cross-origin isolation and use regular ArrayBuffers as a fallback.
Quick Start
1. Wrap your scene in a Physics Provider
code
Tsx
import { Physics, PhysicsStats } from "r3f-mag";

// Wrap your content in the Physics provider
<Physics>
  <Scene />
  {/* Optional: Add the new visualizer */}
  <PhysicsStats /> 
</Physics>
2. Make objects physical (Rigid Bodies)
Automatically parse Shape parameters from the three Mesh:
code
Tsx
import { Box } from "@react-three/drei";
import { useRigidBody, ShapeType } from "r3f-mag";
import { Mesh } from "three";

function MyBox() {
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
3. Performance & Debugging
r3f-mag includes a modernized PhysicsStats component that combines two powerful tools:
Leva Monitor: visualizing exact Physics Calculation times (in ms) on the CPU.
StatsGl: visualizing FPS and GPU memory from @react-three/drei.
code
Tsx
import { PhysicsStats } from "r3f-mag";

<Physics>
  {/* 
      showGraph: Toggles the Leva Monitor
      showStats: Toggles the FPS overlay 
  */}
  <PhysicsStats showGraph={true} showStats={true} />
</Physics>
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

Expose more methods trough the hook (e.g. setPosition/applyImpulse)

Support collision callbacks

New: Modernize Build System (Vite/Next.js/Turbopack compatibility)
Performance & Tooling:

Use ArrayBuffers as a fallback for missing cross-origin isolation

Configurable simulation speed

Expose performance info

Integrated with @react-three/drei StatsGl component

Integrated with Leva for graphing
Documentation
Components
code
Tsx
<Physics />
Physics Context. Use to wrap all physical objects within the same physics world.
code
Tsx
<PhysicsStats showGraph={true} showStats={true} />
Updated: Shows a StatsGl panel (FPS/GPU) and registers a Leva monitor graph for Physics CPU timings.
Hooks
code
Tsx
const { rayTest } = useAmmo();
Utility functions available anywhere in the <Physics /> context.
code
Tsx
const [ref, api] = useRigidBody();
Creates a Rigid Body.
code
Tsx
const [ref, api] = useSoftBody();
Creates a Soft Body (Cloth, Rope, Volume).
Cross-origin isolation
To use SharedArrayBuffers for better communication between the main-thread and the web-worker-thread, a cross-origin isolated environment is necessary in modern browsers.
Next.js Config (next.config.js):
code
Js
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
r3f-mag will fallback to using ArrayBuffers and postMessage() transfers if SharedArrayBuffers are not available. This is not as bad as a full copy on each transfer, but it does not allow the data to be available on both threads at the same time.