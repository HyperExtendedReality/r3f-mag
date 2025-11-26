import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Object3D, Vector3, } from "three";
import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { DefaultBufferSize } from "ammo-debug-drawer";
import { AmmoPhysicsContext, PhysicsPerformanceInfo, PhysicsState, ShapeDescriptor, } from "./physics-context";
import {
  allocateCompatibleBuffer,
  AmmoDebugOptions,
  ammoDebugOptionsToNumber,
  isSharedArrayBufferSupported,
} from "../utils/utils";
import { createAmmoWorker, WorkerHelpers, } from "../three-ammo/lib/worker-helper";
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
  // Draw a collision debug mesh into the scene
  drawDebug?: boolean;

  // Configures the debug options (not all options are tested)
  drawDebugMode?: AmmoDebugOptions;

  // default = [0, -9.8, 0]
  gravity?: [number, number, number];

  // default = 10e-6
  epsilon?: number;

  // default = 1/60
  fixedTimeStep?: number;

  // default = 4
  maxSubSteps?: number;

  // default = 10
  solverIterations?: number;

  // default = 1
  simulationSpeed?: number;
}

const DEFAULT_DEBUG_MODE = { DrawWireframe: true };

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

  // Functions that are executed while the main thread holds control over the shared data
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

    const rigidBodyBuffer = allocateCompatibleBuffer(
      4 * BUFFER_CONFIG.HEADER_LENGTH + //header
        4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES + //matrices
        4 * BUFFER_CONFIG.MAX_BODIES //velocities
    );
    const headerIntArray = new Int32Array(
      rigidBodyBuffer as ArrayBuffer,
      0,
      BUFFER_CONFIG.HEADER_LENGTH
    );
    const headerFloatArray = new Float32Array(
      rigidBodyBuffer as ArrayBuffer,
      0,
      BUFFER_CONFIG.HEADER_LENGTH
    );
    const objectMatricesIntArray = new Int32Array(
      rigidBodyBuffer as ArrayBuffer,
      BUFFER_CONFIG.HEADER_LENGTH * 4,
      BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
    );
    const objectMatricesFloatArray = new Float32Array(
      rigidBodyBuffer as ArrayBuffer,
      BUFFER_CONFIG.HEADER_LENGTH * 4,
      BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
    );

    objectMatricesIntArray[0] = BufferState.UNINITIALIZED;

    const debugBuffer = allocateCompatibleBuffer(4 + 2 * DefaultBufferSize * 4);
    const debugIndex = new Uint32Array(debugBuffer as ArrayBuffer, 0, 4);
    const debugVertices = new Float32Array(debugBuffer as ArrayBuffer, 4, DefaultBufferSize);
    const debugColors = new Float32Array(
      debugBuffer as ArrayBuffer,
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
        throw new Error("unknown message type" + type);
      };
    });

    workerInitPromise.then(setPhysicsState);

    function addRigidBody(
      uuid,
      mesh,
      shape: ShapeDescriptor,
      options: BodyConfig = {}
    ) {
      bodyOptions[uuid] = options;
      object3Ds[uuid] = mesh;

      if (!mesh.userData.useAmmo) {
        mesh.userData.useAmmo = {};
      }

      mesh.userData.useAmmo.rigidBody = {
        uuid,
      };

      workerHelpers.addRigidBody(uuid, mesh, shape, options);
    }

    function removeRigidBody(uuid: string) {
      uuids.splice(uuids.indexOf(uuid), 1);
      delete IndexToUuid[uuidToIndex[uuid]];
      delete uuidToIndex[uuid];
      delete bodyOptions[uuid];
      if (object3Ds[uuid]) {
        if (object3Ds[uuid].userData && object3Ds[uuid].userData.useAmmo) {
            delete object3Ds[uuid].userData.useAmmo.rigidBody;
        }
        delete object3Ds[uuid];
      }
      workerHelpers.removeRigidBody(uuid);
    }

    function addSoftBody(uuid: UUID, mesh: Mesh, options: SoftBodyConfig = {}) {
      if (!mesh.geometry) {
        console.error("useSoftBody received: ", mesh);
        throw new Error("useSoftBody is only supported on BufferGeometries");
      }

      const visualGeometry = mesh.geometry.clone();
      mesh.geometry = visualGeometry;

      let indexLength = 0;
      let vertexLength = 0;
      let normalLength = 0;

      let physicsGeometry: BufferGeometry | undefined;
      let mapping: Int32Array | undefined;

      if (options.type === SoftBodyType.TRIMESH) {
        physicsGeometry = visualGeometry.clone();
        physicsGeometry.deleteAttribute("uv");
        physicsGeometry.deleteAttribute("normal"); 
        physicsGeometry = mergeVertices(physicsGeometry);
        physicsGeometry.computeVertexNormals();

        const visualPos = visualGeometry.attributes.position;
        const physicsPos = physicsGeometry.attributes.position;
        
        const visualArray = visualPos.array as Float32Array;
        const physicsArray = physicsPos.array as Float32Array;

        mapping = new Int32Array(visualPos.count);

        const physicsMap = new Map<string, number>();
        const precision = 10000;
        
        let i = 0, x = 0, y = 0, z = 0, key = "";
        
        for (i = 0; i < physicsPos.count; i++) {
          x = physicsArray[i * 3];
          y = physicsArray[i * 3 + 1];
          z = physicsArray[i * 3 + 2];
          key = `${Math.round(x * precision)}_${Math.round(y * precision)}_${Math.round(z * precision)}`;
          physicsMap.set(key, i);
        }

        for (i = 0; i < visualPos.count; i++) {
          x = visualArray[i * 3];
          y = visualArray[i * 3 + 1];
          z = visualArray[i * 3 + 2];
          key = `${Math.round(x * precision)}_${Math.round(y * precision)}_${Math.round(z * precision)}`;
          
          const val = physicsMap.get(key);
          mapping[i] = val !== undefined ? val : 0;
        }

        indexLength = visualGeometry.index ? visualGeometry.index.count : 0;
        vertexLength = visualPos.count * visualPos.itemSize;
        normalLength = visualGeometry.attributes.normal.count * visualGeometry.attributes.normal.itemSize;

      } else if (options.type === SoftBodyType.ROPE) {
         const attr = visualGeometry.attributes.instanceStart || visualGeometry.attributes.position;
         vertexLength = attr.count * attr.itemSize;
         indexLength = 0;
         normalLength = 0;
      } else {
        throw new Error("Unknown SoftBody type");
      }

      const bufferSize = (indexLength + vertexLength + normalLength) * 4;
      const buffer = allocateCompatibleBuffer(bufferSize);
      
      const isLargeIndex = indexLength > 65535;
      const sharedSoftBodyBuffers: SharedSoftBodyBuffers = {
        uuid,
        indexIntArray: new (isLargeIndex ? Uint32Array : Uint16Array)(buffer as ArrayBuffer, 0, indexLength),
        vertexFloatArray: new Float32Array(buffer as ArrayBuffer, indexLength * 4, vertexLength),
        normalFloatArray: new Float32Array(buffer as ArrayBuffer, (indexLength + vertexLength) * 4, normalLength),
      };

      mesh.updateMatrixWorld(true);
      visualGeometry.applyMatrix4(mesh.matrixWorld);
      if (physicsGeometry) physicsGeometry.applyMatrix4(mesh.matrixWorld);

      mesh.position.set(0, 0, 0);
      mesh.quaternion.set(0, 0, 0, 1);
      mesh.scale.set(1, 1, 1);
      mesh.frustumCulled = false;

      if (options.type === SoftBodyType.TRIMESH) {
        sharedSoftBodyBuffers.vertexFloatArray.set(visualGeometry.attributes.position.array);
        if (visualGeometry.index) {
          sharedSoftBodyBuffers.indexIntArray.set(visualGeometry.index.array);
        }
        sharedSoftBodyBuffers.normalFloatArray.set(visualGeometry.attributes.normal.array);
        
        if (isSharedArrayBufferSupported) {
           visualGeometry.setAttribute('position', new BufferAttribute(sharedSoftBodyBuffers.vertexFloatArray, 3).setUsage(DynamicDrawUsage));
           visualGeometry.setAttribute('normal', new BufferAttribute(sharedSoftBodyBuffers.normalFloatArray, 3).setUsage(DynamicDrawUsage));
        }
      } else {
        const source = visualGeometry.attributes.instanceStart || visualGeometry.attributes.position;
        const srcArr = source.array as Float32Array;
        for(let k = 0; k < source.count * 3; k++) {
           sharedSoftBodyBuffers.vertexFloatArray[k] = srcArr[k];
        }
      }

      softBodies[uuid] = mesh;

      const physicsAttributes = physicsGeometry ? {
        vertexFloatArray: physicsGeometry.attributes.position.array,
        indexIntArray: physicsGeometry.index ? physicsGeometry.index.array : new Uint16Array(0)
      } : undefined;

      workerHelpers.addSoftBody(uuid, sharedSoftBodyBuffers, options, physicsAttributes, mapping);
    }

    function removeSoftBody(uuid: string) {
      delete softBodies[uuid];
      workerHelpers.removeSoftBody(uuid);

      sharedBuffersRef.current.softBodies = sharedBuffersRef.current.softBodies.filter(
        (ssbb) => ssbb.uuid !== uuid
      );
    }

    async function rayTest(options: RaycastOptions): Promise<RaycastHit[]> {
      const { hits } = await workerHelpers.makeAsyncRequest({
        type: MessageType.RAYCAST_REQUEST,
        ...options,
      });

      return hits.map(
        (hit: RaycastHitMessage): RaycastHit => {
          return {
            object: object3Ds[hit.uuid] || softBodies[hit.uuid],

            hitPosition: new Vector3(
              hit.hitPosition.x,
              hit.hitPosition.y,
              hit.hitPosition.z
            ),

            normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
          };
        }
      );
    }

    return () => {
      ammoWorker.terminate();
      setPhysicsState(undefined);
    };
  }, []);

  useEffect(() => {
    if (!isSharedArrayBufferSupported) {
      if (drawDebug) {
        console.warn("debug visuals require SharedArrayBuffer support");
      }
      return;
    }

    if (physicsState) {
      if (drawDebug) {
        workerHelpers.enableDebug(true, physicsState.debugBuffer);
      } else {
        workerHelpers.enableDebug(false, physicsState.debugBuffer);
      }
    }
  }, [drawDebug, physicsState]);

  useEffect(() => {
    if (physicsState?.workerHelpers) {
      workerHelpers.setSimulationSpeed(simulationSpeed);
    }
  }, [physicsState?.workerHelpers, simulationSpeed]);

  if (!physicsState) {
    return null;
  }

  const { workerHelpers, debugGeometry } = physicsState;

  return (
    <AmmoPhysicsContext.Provider
      value={{
        ...workerHelpers,

        // workerHelpers Overrides
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
        {...{
          physicsState,
          sharedBuffersRef,
          threadSafeQueueRef,
          physicsPerformanceInfoRef,
        }}
      />
      {drawDebug && <PhysicsDebug geometry={debugGeometry} />}
      {children}
    </AmmoPhysicsContext.Provider>
  );
}