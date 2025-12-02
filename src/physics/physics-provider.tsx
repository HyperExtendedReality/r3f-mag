import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { DefaultBufferSize } from "ammo-debug-drawer";
import {
  AmmoPhysicsContext,
  PhysicsPerformanceInfo,
  PhysicsState,
  ShapeDescriptor,
} from "./physics-context";
import {
  allocateCompatibleBuffer,
  AmmoDebugOptions,
  ammoDebugOptionsToNumber,
  isSharedArrayBufferSupported,
} from "../utils/utils";
import {
  createAmmoWorker,
  WorkerHelpers,
} from "../three-ammo/lib/worker-helper";
import {
  BodyConfig,
  BufferState,
  ClientMessageType,
  MessageType,
  RaycastHit,
  RaycastHitMessage,
  RaycastOptions,
  SharedBuffers,
  SharedSoftBodyBuffers,
  SoftBodyConfig,
  SoftBodyType,
  UUID,
  WorldConfig,
} from "../three-ammo/lib/types";
import { BUFFER_CONFIG } from "../three-ammo/lib/constants";
import { mergeVertices } from "three-stdlib";
import { PhysicsUpdate } from "./physics-update";
import { PhysicsDebug } from "./physics-debug";

interface AmmoPhysicsProps {
  drawDebug?: boolean;
  drawDebugMode?: AmmoDebugOptions;
  gravity?: [number, number, number];
  epsilon?: number;
  fixedTimeStep?: number;
  maxSubSteps?: number;
  solverIterations?: number;
  simulationSpeed?: number;
}

const DEFAULT_DEBUG_MODE = { DrawWireframe: true };

/**
 * Helper: Welds vertices based on position only (ignoring UVs/Normals).
 * Returns the welded data + a map to link visual vertices to physics vertices.
 */
function createWeldedPhysicsTopology(geometry: BufferGeometry) {
  const visualPos = geometry.attributes.position.array;
  const visualCount = geometry.attributes.position.count;
  const visualIndex = geometry.index ? geometry.index.array : null;

  // Map: "x_y_z" -> uniquePhysicsIndex
  const posMap = new Map<string, number>();
  const physicsVerts: number[] = [];
  const visualToPhysics = new Int32Array(visualCount);

  // Precision to detect co-located vertices
  const precision = 1e5;

  for (let i = 0; i < visualCount; i++) {
    const x = visualPos[i * 3];
    const y = visualPos[i * 3 + 1];
    const z = visualPos[i * 3 + 2];

    // Create a hash key for the position
    const key = `${Math.round(x * precision)}_${Math.round(y * precision)}_${Math.round(z * precision)}`;

    if (posMap.has(key)) {
      visualToPhysics[i] = posMap.get(key)!;
    } else {
      const newIdx = physicsVerts.length / 3;
      posMap.set(key, newIdx);
      visualToPhysics[i] = newIdx;
      physicsVerts.push(x, y, z);
    }
  }

  // Remap indices to the new welded topology
  const physicsIndices: number[] = [];
  if (visualIndex) {
    for (let i = 0; i < visualIndex.length; i++) {
      physicsIndices.push(visualToPhysics[visualIndex[i]]);
    }
  }

  return {
    physicsVerts: new Float32Array(physicsVerts),
    physicsIndices: new Uint32Array(physicsIndices),
    visualToPhysics,
  };
}

export function Physics({
  drawDebug,
  drawDebugMode = DEFAULT_DEBUG_MODE,
  gravity,
  epsilon,
  fixedTimeStep,
  maxSubSteps,
  solverIterations,
  simulationSpeed = 1,
  children,
}: PropsWithChildren<AmmoPhysicsProps>) {
  const [physicsState, setPhysicsState] = useState<PhysicsState>();
  const sharedBuffersRef = useRef<SharedBuffers>({} as any);
  const threadSafeQueueRef = useRef<(() => void)[]>([]);
  const physicsPerformanceInfoRef = useRef<PhysicsPerformanceInfo>({
    substepCounter: 0,
    lastTickMs: 0,
  });

  useEffect(() => {
    const uuids: string[] = [];
    const object3Ds: Record<string, Object3D> = {};
    const uuidToIndex: Record<string, number> = {};
    const IndexToUuid: Record<number, string> = {};
    const bodyOptions: Record<string, BodyConfig> = {};
    const softBodies: Record<UUID, Mesh> = {};

    const ammoWorker: Worker = createAmmoWorker();
    const workerHelpers = WorkerHelpers(ammoWorker);

    // Init Buffers
    const rigidBodyBuffer = allocateCompatibleBuffer(
      4 * BUFFER_CONFIG.HEADER_LENGTH +
        4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES +
        4 * BUFFER_CONFIG.MAX_BODIES
    );
    const headerIntArray = new Int32Array(
      rigidBodyBuffer,
      0,
      BUFFER_CONFIG.HEADER_LENGTH
    );
    const headerFloatArray = new Float32Array(
      rigidBodyBuffer,
      0,
      BUFFER_CONFIG.HEADER_LENGTH
    );
    const objectMatricesIntArray = new Int32Array(
      rigidBodyBuffer,
      BUFFER_CONFIG.HEADER_LENGTH * 4,
      BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
    );
    const objectMatricesFloatArray = new Float32Array(
      rigidBodyBuffer,
      BUFFER_CONFIG.HEADER_LENGTH * 4,
      BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
    );
    objectMatricesIntArray[0] = BufferState.UNINITIALIZED;

    const debugBuffer = allocateCompatibleBuffer(4 + 2 * DefaultBufferSize * 4);
    const debugIndex = new Uint32Array(debugBuffer, 0, 4);
    const debugVertices = new Float32Array(debugBuffer, 4, DefaultBufferSize);
    const debugColors = new Float32Array(
      debugBuffer,
      4 + DefaultBufferSize,
      DefaultBufferSize
    );
    const debugGeometry = new BufferGeometry();
    debugGeometry.setAttribute(
      "position",
      new BufferAttribute(debugVertices, 3).setUsage(DynamicDrawUsage)
    );
    debugGeometry.setAttribute(
      "color",
      new BufferAttribute(debugColors, 3).setUsage(DynamicDrawUsage)
    );

    sharedBuffersRef.current = {
      rigidBodies: {
        headerIntArray,
        headerFloatArray,
        objectMatricesFloatArray,
        objectMatricesIntArray,
      },
      softBodies: [],
      debug: {
        indexIntArray: debugIndex,
        vertexFloatArray: debugVertices,
        colorFloatArray: debugColors,
      },
    };

    const worldConfig: WorldConfig = {
      debugDrawMode: ammoDebugOptionsToNumber(drawDebugMode),
      gravity: gravity && new Vector3(gravity[0], gravity[1], gravity[2]),
      epsilon,
      fixedTimeStep,
      maxSubSteps,
      solverIterations,
    };

    workerHelpers.initWorld(worldConfig, sharedBuffersRef.current);

    const workerInitPromise = new Promise<PhysicsState>((resolve) => {
      ammoWorker.onmessage = async (event) => {
        const type: ClientMessageType = event.data.type;
        switch (type) {
          case ClientMessageType.READY: {
            if (event.data.sharedBuffers) {
              sharedBuffersRef.current = event.data.sharedBuffers;
            }
            resolve({
              workerHelpers,
              sharedBuffersRef,
              debugGeometry,
              debugBuffer,
              bodyOptions,
              uuids,
              object3Ds,
              softBodies,
              uuidToIndex,
              debugIndex,
              addRigidBody,
              removeRigidBody,
              addSoftBody,
              removeSoftBody,
              rayTest,
            });
            return;
          }
          case ClientMessageType.RIGIDBODY_READY: {
            const uuid = event.data.uuid;
            uuids.push(uuid);
            uuidToIndex[uuid] = event.data.index;
            IndexToUuid[event.data.index] = uuid;
            return;
          }
          case ClientMessageType.SOFTBODY_READY: {
            threadSafeQueueRef.current.push(() => {
              sharedBuffersRef.current.softBodies.push(
                event.data.sharedSoftBodyBuffers
              );
            });
            return;
          }
          case ClientMessageType.TRANSFER_BUFFERS: {
            sharedBuffersRef.current = event.data.sharedBuffers;
            return;
          }
          case ClientMessageType.RAYCAST_RESPONSE: {
            workerHelpers.resolveAsyncRequest(event.data);
            return;
          }
        }
        throw new Error("unknown message type " + type);
      };
    });

    workerInitPromise.then(setPhysicsState);

    function addRigidBody(
      uuid: UUID,
      mesh: Object3D,
      shape: ShapeDescriptor,
      options: BodyConfig = {}
    ) {
      bodyOptions[uuid] = options;
      object3Ds[uuid] = mesh;
      if (!mesh.userData.useAmmo) mesh.userData.useAmmo = {};
      mesh.userData.useAmmo.rigidBody = { uuid };
      workerHelpers.addRigidBody(uuid, mesh, shape, options);
    }

    function removeRigidBody(uuid: string) {
      const idx = uuids.indexOf(uuid);
      if (idx > -1) {
        uuids.splice(idx, 1);
        const internalIdx = uuidToIndex[uuid];
        delete IndexToUuid[internalIdx];
        delete uuidToIndex[uuid];
        delete bodyOptions[uuid];
        if (object3Ds[uuid]?.userData?.useAmmo?.rigidBody)
          delete object3Ds[uuid].userData.useAmmo.rigidBody;
        delete object3Ds[uuid];
        workerHelpers.removeRigidBody(uuid);
      }
    }

    function addSoftBody(uuid: UUID, mesh: Mesh, options: SoftBodyConfig = {}) {
      if (!mesh.geometry)
        throw new Error("useSoftBody requires a BufferGeometry");

      // Bake transforms into vertices once
      if (!mesh.userData.ammoBaked) {
        mesh.updateMatrixWorld(true);
        mesh.geometry.applyMatrix4(mesh.matrixWorld);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.set(0, 0, 0, 1);
        mesh.scale.set(1, 1, 1);
        mesh.userData.ammoBaked = true;
      }
      mesh.frustumCulled = false;

      let physicsVerts: Float32Array;
      let physicsIndices: Uint32Array | Uint16Array;
      let indexLength = 0;
      let vertexLength = 0;
      let normalLength = 0;

      // This map links visual vertices (Split) to physics vertices (Welded)
      let visualToPhysics: Int32Array | null = null;

      if (options.type === SoftBodyType.TRIMESH) {
        // Ensure index buffer exists
        if (!mesh.geometry.index) {
          mesh.geometry = mergeVertices(mesh.geometry); // Fallback: try to generate index
        }
        if (!mesh.geometry.index)
          throw new Error("SoftBody Trimesh requires indexed geometry");

        // Generate WELDED topology for physics (ignores UV seams)
        const welded = createWeldedPhysicsTopology(mesh.geometry);
        physicsVerts = welded.physicsVerts;
        physicsIndices = welded.physicsIndices;
        visualToPhysics = welded.visualToPhysics;

        // Attach mapper to mesh for the Update Loop
        mesh.userData.physicsMapper = visualToPhysics;

        indexLength = physicsIndices.length;
        vertexLength = physicsVerts.length;
        // Physics normal buffer matches physics vertex count
        normalLength = vertexLength;
      } else {
        // Rope / Line logic
        // (Ropes usually don't have seams so we can use 1:1, but keeping generic logic)
        indexLength = 0;
        if (mesh.geometry.attributes.instanceStart) {
          vertexLength = mesh.geometry.attributes.instanceStart.count * 3;
        } else {
          vertexLength = mesh.geometry.attributes.position.count * 3;
        }
        physicsVerts = new Float32Array(vertexLength); // filled later
        physicsIndices = new Uint16Array(0);
      }

      const buffer = allocateCompatibleBuffer(
        indexLength * 4 + vertexLength * 4 + normalLength * 4
      );

      const sharedSoftBodyBuffers: SharedSoftBodyBuffers = {
        uuid,
        indexIntArray: new (indexLength > 65535 ? Uint32Array : Uint16Array)(
          buffer as ArrayBuffer,
          0,
          indexLength
        ),
        vertexFloatArray: new Float32Array(
          buffer,
          indexLength * 4,
          vertexLength
        ),
        normalFloatArray: new Float32Array(
          buffer,
          indexLength * 4 + vertexLength * 4,
          normalLength
        ),
      };

      // Populate Buffer
      if (options.type === SoftBodyType.TRIMESH) {
        sharedSoftBodyBuffers.vertexFloatArray.set(physicsVerts!);
        sharedSoftBodyBuffers.indexIntArray.set(physicsIndices!);
        // Initial normal set (can be just zeroes or welded normals if we calculated them,
        // but worker will overwrite anyway)
      } else if (
        options.type === SoftBodyType.ROPE &&
        mesh.geometry.attributes.instanceStart
      ) {
        // Rope logic...
        for (let i = 0; i < vertexLength / 3; i++) {
          sharedSoftBodyBuffers.vertexFloatArray[i * 3] =
            mesh.geometry.attributes.instanceStart.getX(i);
          sharedSoftBodyBuffers.vertexFloatArray[i * 3 + 1] =
            mesh.geometry.attributes.instanceStart.getY(i);
          sharedSoftBodyBuffers.vertexFloatArray[i * 3 + 2] =
            mesh.geometry.attributes.instanceStart.getZ(i);
        }
      }

      // Important: For Trimesh with seams, we CANNOT use setAttribute with SharedBuffer
      // because visual count != physics count. We will manually update in physics-update.tsx.
      // For Ropes, we often use 1:1, but the update loop handles that logic.

      softBodies[uuid] = mesh;
      workerHelpers.addSoftBody(uuid, sharedSoftBodyBuffers, options);
    }

    function removeSoftBody(uuid: string) {
      delete softBodies[uuid];
      workerHelpers.removeSoftBody(uuid);
      sharedBuffersRef.current.softBodies =
        sharedBuffersRef.current.softBodies.filter((s) => s.uuid !== uuid);
    }

    async function rayTest(options: RaycastOptions): Promise<RaycastHit[]> {
      const { hits } = await workerHelpers.makeAsyncRequest({
        type: MessageType.RAYCAST_REQUEST,
        ...options,
      });
      return hits.map((hit: RaycastHitMessage) => ({
        object: object3Ds[hit.uuid] || softBodies[hit.uuid],
        hitPosition: new Vector3(
          hit.hitPosition.x,
          hit.hitPosition.y,
          hit.hitPosition.z
        ),
        normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      }));
    }

    return () => {
      ammoWorker.terminate();
      setPhysicsState(undefined);
    };
  }, [
    drawDebug,
    drawDebugMode,
    epsilon,
    fixedTimeStep,
    gravity,
    maxSubSteps,
    simulationSpeed,
    solverIterations,
  ]);

  useEffect(() => {
    if (physicsState?.workerHelpers) {
      workerHelpers.enableDebug(
        !!drawDebug && isSharedArrayBufferSupported,
        physicsState.debugBuffer
      );
    }
  }, [drawDebug, physicsState]);

  useEffect(() => {
    if (physicsState?.workerHelpers)
      physicsState.workerHelpers.setSimulationSpeed(simulationSpeed);
  }, [physicsState?.workerHelpers, simulationSpeed]);

  if (!physicsState) return null;
  const { workerHelpers, debugGeometry } = physicsState;

  return (
    <AmmoPhysicsContext.Provider
      value={{
        ...workerHelpers,
        addRigidBody: physicsState.addRigidBody,
        removeRigidBody: physicsState.removeRigidBody,
        addSoftBody: physicsState.addSoftBody,
        removeSoftBody: physicsState.removeSoftBody,
        object3Ds: physicsState.object3Ds,
        rayTest: physicsState.rayTest,
        physicsPerformanceInfoRef,
      }}
    >
      <PhysicsUpdate
        physicsState={physicsState}
        sharedBuffersRef={sharedBuffersRef}
        threadSafeQueueRef={threadSafeQueueRef}
        physicsPerformanceInfoRef={physicsPerformanceInfoRef}
      />
      {drawDebug && <PhysicsDebug geometry={debugGeometry} />}
      {children}
    </AmmoPhysicsContext.Provider>
  );
}
