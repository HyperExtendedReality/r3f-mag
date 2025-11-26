[![npm](https://img.shields.io/npm/v/r3f-mag?color=%23F69500)](https://www.npmjs.com/package/r3f-mag)
[![npm](https://img.shields.io/badge/bulletphysics%20(fork)-3.17-%23F69500)](https://github.com/notrabs/ammo.js/tree/bullet_submodule)
![npm](https://img.shields.io/npm/types/r3f-mag?label=%20)

# r3f-mag

_Fast_ Physics hooks for use with [react-three-fiber](https://github.com/pmndrs/react-three-fiber).

Achieved by running the [ammo.js](https://github.com/kripken/ammo.js/) physics library in a web-worker. 
Ammo itself is a WebAssembly wrapper around the powerful [Bullet Physics](http://www.bulletphysics.org/) engine.
Data is synced with SharedArrayBuffers having minimal impact on the main thread.

**r3f-mag** is a modern fork of [use-ammojs](https://github.com/pmndrs/use-ammojs) with added features and compatibility fixes for Next.js, Turbopack, and the modern `@react-three/drei` ecosystem.

## Installation

```bash
npm install r3f-mag @react-three/drei leva stats-gl
```

or

```bash
yarn add r3f-mag @react-three/drei leva stats-gl
```

## Features

- **WebWorker Physics**: Heavy calculations run off the main thread
- **Soft Body Textures**: Added support for textures on soft bodies ✨
- **Modern Stats**: Integrated with Leva and StatsGl for deep performance profiling
- **Next.js Compatible**: Fixed bundling issues with Turbopack and Server Components
- **Full Soft Body Support**: Cloth, ropes, and volumes

## Examples

### API Demos (Sandbox)

> **Note**: Examples below are from the original use-ammojs repo but remain compatible with the r3f-mag API.

- [Hello Physics World](https://codesandbox.io/s/use-ammojs-hello-world-example-forked-x5nss7)
- [Soft Bodies](https://codesandbox.io/s/use-ammojs-soft-bodies-example-forked-qc8l45)
- [Crane (Constraint)](https://codesandbox.io/s/use-ammojs-crane-constraint-example-forked-w1x1qw)
- [Crane (Rope + Attachment)](https://codesandbox.io/s/use-ammojs-crane-rope-attachment-example-forked-yd8qgs)
- [Raycast](https://codesandbox.io/s/use-ammojs-raycast-example-forked-yq15ec)

> ⚠️ **Note**: CodeSandbox examples do not support SharedArrayBuffers [due to missing cross-origin isolation](https://web.dev/coop-coep/) and use regular ArrayBuffers as a fallback. Currently the debug-drawer has no ArrayBuffer fallback implemented and will not render anything.

## Why r3f-mag?

This package builds upon [use-ammojs](https://github.com/pmndrs/use-ammojs) and [use-cannon](https://github.com/pmndrs/use-cannon). While use-cannon is excellent and mature, it lacks Soft Body support and can struggle with large triangle meshes. r3f-mag brings the full power of Bullet Physics (Ammo.js) to React Three Fiber with modern tooling support.

### Key Improvements over use-ammojs

- ✅ **Texture support for Soft Bodies** (main feature addition)
- ✅ Next.js and Turbopack compatibility
- ✅ Modern build system using Vite
- ✅ Enhanced performance monitoring with Leva integration
- ✅ TypeScript improvements
- ✅ Updated dependencies and ecosystem compatibility

## Roadmap

### Main Goals

- [x] Create a Physics World as a React context and simulate it in a web-worker
- [x] Sync three objects to physics Rigid Bodies
- [x] Add Rigid Body support
- [x] Add [Soft Body](https://pybullet.org/Bullet/BulletFull/classbtSoftBody.html) support
  - [x] Volumes/Cloth from Triangle Mesh
  - [x] Ropes
  - [x] **Support textures on Soft Bodies** ✨ (New in r3f-mag)
  - [ ] Deformables
- [x] Add Constraints between Rigid Bodies
- [x] Add Constraints to Soft Bodies (ability to pin nodes in place or to Rigid Bodies)
- [ ] Improve Physics API
  - [x] Make all props reactive
  - [x] Expose more methods through the hook (e.g. setPosition/applyImpulse/[more...](https://pybullet.org/Bullet/BulletFull/classbtRigidBody.html))
  - [ ] Support collision callbacks
- [x] **Modernize Build System** (Vite/Next.js/Turbopack compatibility) ✨

### Low Priority Goals

- [ ] Automatic refresh rate detection and performance throttling
- [x] Add [Raycast](https://pybullet.org/Bullet/BulletFull/classbtCollisionWorld.html#aaac6675c8134f6695fecb431c72b0a6a) queries
  - [x] One-time (async) ray-tests
  - [ ] Continuous queries through a fixed scene component to mitigate worker latency
- [x] Use ArrayBuffers as a fallback for missing cross-origin isolation
  - [x] Rigid Bodies
  - [x] Soft Bodies
  - [ ] Debug Rendering
- [x] Simulation management
  - [x] Configurable simulation speed
  - [x] Expose performance info
  - [x] Integrated with @react-three/drei StatsGl component
  - [x] Integrated with Leva for graphing
  - [ ] Automatically pause simulation if tab is out of focus or not rendering (as option)
- [ ] Improve automatic shape detection (set shapeType automatically based on the three Mesh type)
- [ ] Raycast Vehicle API
- [ ] Support for instanced objects

## Quick Start

### 1. Wrap your scene in a Physics Provider

```jsx
import { Physics, PhysicsStats } from "r3f-mag";

<Physics drawDebug>
  <Scene />
  {/* Optional: Add performance visualizer */}
  <PhysicsStats showGraph showStats />
</Physics>
```

### 2a. Make objects physical (Rigid Bodies)

Automatically parse Shape parameters from the three Mesh (courtesy of [three-to-ammo](https://github.com/InfiniteLee/three-to-ammo)):

```jsx
import { Box } from "@react-three/drei";
import { useRigidBody, ShapeType } from "r3f-mag";
import { Mesh } from "three";

function MyBox() {
  // If you need a ref with a narrower type than Object3D, provide a generic argument
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

Or define Collision Shapes manually:

```jsx
import { BodyType, ShapeType, ShapeFit } from "r3f-mag";
import { Vector3 } from "three";

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

Or add collisions to an imported GLTF scene:

```jsx
useRigidBody(
  () => ({
    shapeType: ShapeType.MESH,
    bodyType: BodyType.STATIC,
  }),
  gltf.scene
);
```

### 2b. Make objects squishy (Soft Bodies)

```jsx
import { useSoftBody, SoftBodyType } from "r3f-mag";
import { Sphere } from "@react-three/drei";

function SoftSphere() {
  const [ref] = useSoftBody(() => ({
    type: SoftBodyType.TRIMESH,
  }));

  return (
    <Sphere position={[0, 2, 7]} args={[1, 16, 16]} ref={ref}>
      <meshPhysicalMaterial attach="material" color="blue" />
    </Sphere>
  );
}
```

### 2c. Add Constraints

```jsx
// TODO: Add constraint examples
```

### 3. Raycasts

```jsx
import { useAmmo } from "r3f-mag";
import { Vector3 } from "three";

function RaycastExample() {
  const { rayTest } = useAmmo();

  const performRaycast = async () => {
    const hits = await rayTest({
      from: new Vector3(0, 5, 7),
      to: new Vector3(0, -1, 7),
      multiple: true
    });

    if (hits.length) {
      console.log(hits[0].object.name, hits[0].hitPosition);
    }
  };

  return <button onClick={performRaycast}>Cast Ray</button>;
}
```

### 4. Update Motion State

```jsx
const [playerRef, api] = useRigidBody(() => ({
  bodyType: BodyType.DYNAMIC,
  shapeType: ShapeType.CAPSULE,
  angularFactor: new Vector3(0, 0, 0),
  shapeConfig: {
    fit: ShapeFit.MANUAL,
    halfExtents: new Vector3(0.3, 0.6, 0.3),
  },
}));

function handleRespawn() {
  // Directly set position/velocity via the API
  api.setPosition(new Vector3(0, 0, 0));
  api.setLinearVelocity(new Vector3(0, 0, 0));
}
```

## Documentation

### Components

#### `<Physics />`

Physics Context. Use to wrap all physical objects within the same physics world.

**Props:**
- `drawDebug?: boolean` - Enable debug rendering

```jsx
<Physics drawDebug>
  {/* Your physics objects */}
</Physics>
```

#### `<PhysicsStats />`

Shows a StatsGl panel (FPS/GPU) and registers a Leva monitor graph for Physics CPU timings.

**Props:**
- `showGraph?: boolean` - Show Leva performance graph (default: true)
- `showStats?: boolean` - Show StatsGl panel (default: true)

```jsx
<PhysicsStats showGraph showStats />
```

### Hooks

#### `useAmmo()`

Utility functions available anywhere within a `<Physics />` context.

```jsx
const { rayTest } = useAmmo();
```

#### `useRigidBody()`

Create a rigid body physics object.

```jsx
const [ref, api] = useRigidBody(() => ({
  mass: 1,
  position: [0, 5, 0],
  shapeType: ShapeType.BOX,
}));
```

**Returns:**
- `ref`: Reference to attach to your Three.js object
- `api`: Methods to control the body (setPosition, setLinearVelocity, etc.)

#### `useSoftBody()`

Create a soft body physics object (cloth, rope, volume).

```jsx
const [ref, api] = useSoftBody(() => ({
  type: SoftBodyType.TRIMESH,
}));
```

## Cross-Origin Isolation

To use `SharedArrayBuffers` for optimal communication between the main thread and web worker, cross-origin isolation is required in [modern browsers](https://caniuse.com/sharedarraybuffer).

### Next.js Config (`next.config.js`)

```javascript
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
```

### Vite Config (`vite.config.js`)

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

### Create React App (with @craco/craco)

<details>
<summary>Click to expand CRA configuration</summary>

1. Install craco: `npm install @craco/craco --save-dev`
2. Replace `react-scripts` with `craco` in your `package.json` scripts
3. Create `craco.config.js` in project root:

```javascript
const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Fix duplicate React instances when using yarn/npm link
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        react: path.resolve('./node_modules/react'),
        '@react-three/fiber': path.resolve('./node_modules/@react-three/fiber'),
        three: path.resolve('./node_modules/three'),
      };
      return webpackConfig;
    },
  },
  devServer: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
};
```

</details>

### Fallback Behavior

r3f-mag will automatically fallback to using `ArrayBuffers` with `postMessage()` transfers if `SharedArrayBuffers` are not available. While not as performant as SharedArrayBuffers, this fallback still avoids full data copies on each transfer.

## Developing Locally

<details>
<summary>Setting up local development with Next.js/Vite</summary>

### Using npm link

1. Run `npm link` in r3f-mag root directory
2. Run `npm link r3f-mag` in your project's directory
3. In r3f-mag, run `npm run build` or `npm run dev` to watch for changes
4. Build and run your project as usual

### Resolving Peer Dependency Issues (Next.js)

If using Next.js with `npm link`, you may need to resolve peer dependency duplications:

```javascript
// next.config.js
const path = require('path');

module.exports = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(__dirname, 'node_modules/react'),
      three: path.resolve(__dirname, 'node_modules/three'),
      '@react-three/fiber': path.resolve(__dirname, 'node_modules/@react-three/fiber'),
    };
    return config;
  },
};
```

</details>

## Migration from use-ammojs

r3f-mag maintains API compatibility with use-ammojs. To migrate:

1. Replace `use-ammojs` with `r3f-mag` in your package.json
2. Update imports:
   ```jsx
   // Before
   import { Physics, useRigidBody } from 'use-ammojs';
   
   // After
   import { Physics, useRigidBody } from 'r3f-mag';
   ```
3. Update `<PhysicsStats />` if used - it now integrates with Leva and StatsGl
4. Ensure cross-origin isolation headers are configured for your build tool

## Built With

- [ammo.js](https://github.com/kripken/ammo.js/) - WebAssembly port of Bullet Physics
- [three-ammo](https://github.com/infinitelee/three-ammo) - Three.js integration foundation
- [react-three-fiber](https://github.com/pmndrs/react-three-fiber) - React renderer for Three.js

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Original [use-ammojs](https://github.com/pmndrs/use-ammojs) by the Poimandres team
- [three-ammo](https://github.com/infinitelee/three-ammo) and related work
- The Bullet Physics and Ammo.js communities
