import { useFrame } from "@react-three/fiber";
import { isSharedArrayBufferSupported } from "../utils/utils";
import { BodyType, BufferState, SharedBuffers } from "../three-ammo/lib/types";
import { BUFFER_CONFIG } from "../three-ammo/lib/constants";
import { PhysicsPerformanceInfo, PhysicsState } from "./physics-context";
import { BufferAttribute, Matrix4, Vector3 } from "three";
import { MutableRefObject } from "react";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";

interface PhysicsUpdateProps {
  physicsState: PhysicsState;
  sharedBuffersRef: MutableRefObject<SharedBuffers>;
  threadSafeQueueRef: MutableRefObject<(() => void)[]>;
  physicsPerformanceInfoRef: MutableRefObject<PhysicsPerformanceInfo>;
}

const transform = new Matrix4();
const inverse = new Matrix4();
const matrix = new Matrix4();
const scale = new Vector3();

export function PhysicsUpdate({
  physicsState,
  sharedBuffersRef,
  threadSafeQueueRef,
  physicsPerformanceInfoRef,
}: PhysicsUpdateProps) {
  useFrame(() => {
    if (!physicsState) return;

    const {
      workerHelpers,
      debugGeometry,
      bodyOptions,
      uuids,
      object3Ds,
      uuidToIndex,
      debugIndex,
      softBodies,
    } = physicsState;

    const sharedBuffers = sharedBuffersRef.current;

    // Check buffer state
    const isReady = isSharedArrayBufferSupported
      ? Atomics.load(sharedBuffers.rigidBodies.headerIntArray, 0) ===
        BufferState.READY
      : sharedBuffers.rigidBodies.objectMatricesFloatArray.byteLength !== 0;

    if (isReady) {
      const lastSubstep = physicsPerformanceInfoRef.current.substepCounter;
      physicsPerformanceInfoRef.current.lastTickMs =
        sharedBuffers.rigidBodies.headerFloatArray[1];
      physicsPerformanceInfoRef.current.substepCounter =
        sharedBuffers.rigidBodies.headerIntArray[2];

      while (threadSafeQueueRef.current.length) {
        threadSafeQueueRef.current.shift()!();
      }

      // Update Scene if physics advanced
      if (lastSubstep !== physicsPerformanceInfoRef.current.substepCounter) {
        // 1. Rigid Bodies
        for (let i = 0; i < uuids.length; i++) {
          const uuid = uuids[i];
          const type = bodyOptions[uuid].type ?? BodyType.DYNAMIC;
          const object3D = object3Ds[uuid];

          if (object3D && type === BodyType.DYNAMIC) {
            matrix.fromArray(
              sharedBuffers.rigidBodies.objectMatricesFloatArray,
              uuidToIndex[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE
            );

            if (object3D.parent) {
              inverse.copy(object3D.parent.matrixWorld).invert();
              transform.multiplyMatrices(inverse, matrix);
            } else {
              transform.copy(matrix);
            }
            transform.decompose(object3D.position, object3D.quaternion, scale);
          }
        }

        // 2. Soft Bodies
        for (const softBodyBuffers of sharedBuffers.softBodies) {
          const softBodyMesh = softBodies[softBodyBuffers.uuid];
          if (softBodyMesh) {
            // A. LineGeometry (Ropes)
            if ((softBodyMesh.geometry as any).isLineGeometry) {
              const lineGeo = softBodyMesh.geometry as LineGeometry;
              lineGeo.setPositions(softBodyBuffers.vertexFloatArray);
              if (lineGeo.attributes.instanceStart)
                lineGeo.attributes.instanceStart.needsUpdate = true;
              if (lineGeo.attributes.instanceEnd)
                lineGeo.attributes.instanceEnd.needsUpdate = true;
            }
            // B. TriMesh (Cloth) with Mapper
            else {
              const geometry = softBodyMesh.geometry;
              const posAttr = geometry.attributes.position as BufferAttribute;
              const normAttr = geometry.attributes.normal as BufferAttribute;
              const mapper = softBodyMesh.userData.physicsMapper as Int32Array;

              const physPos = softBodyBuffers.vertexFloatArray;
              const physNorm = softBodyBuffers.normalFloatArray;

              if (mapper && posAttr) {
                // Apply mapping: VisualIndex -> PhysicsIndex -> Data
                const visArray = posAttr.array as Float32Array;
                const normArray = normAttr
                  ? (normAttr.array as Float32Array)
                  : null;
                const count = mapper.length;

                for (let i = 0; i < count; i++) {
                  const physIdx = mapper[i] * 3;
                  const visIdx = i * 3;

                  // Copy Position
                  visArray[visIdx] = physPos[physIdx];
                  visArray[visIdx + 1] = physPos[physIdx + 1];
                  visArray[visIdx + 2] = physPos[physIdx + 2];

                  // Copy Normal (if exists)
                  if (normArray && physNorm.length > 0) {
                    normArray[visIdx] = physNorm[physIdx];
                    normArray[visIdx + 1] = physNorm[physIdx + 1];
                    normArray[visIdx + 2] = physNorm[physIdx + 2];
                  }
                }
              } else if (!isSharedArrayBufferSupported) {
                // Fallback for non-mapped, non-shared (e.g. dense ropes or simple meshes)
                if (posAttr) posAttr.copyArray(physPos);
                if (normAttr) normAttr.copyArray(physNorm);
              }

              if (posAttr) posAttr.needsUpdate = true;
              if (normAttr) normAttr.needsUpdate = true;
            }
          }
        }
      }

      if (isSharedArrayBufferSupported) {
        Atomics.store(
          sharedBuffers.rigidBodies.headerIntArray,
          0,
          BufferState.CONSUMED
        );
      } else {
        workerHelpers.transferSharedBuffers(sharedBuffers);
      }
    }

    if (isSharedArrayBufferSupported && debugGeometry) {
      const index = Atomics.load(debugIndex, 0);
      if (index > 0) {
        debugGeometry.setDrawRange(0, index);
        debugGeometry.attributes.position.needsUpdate = true;
        debugGeometry.attributes.color.needsUpdate = true;
      }
      Atomics.store(debugIndex, 0, 0);
    }
  });

  return null;
}
