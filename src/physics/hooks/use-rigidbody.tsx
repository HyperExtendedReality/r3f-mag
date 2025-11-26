import { Euler, EulerOrder, MathUtils, Object3D, Quaternion, Vector3 } from "three";
import React, { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useAmmoPhysicsContext } from "../physics-context";
import { BodyConfig, BodyType, ShapeConfig, ShapeType } from "../../three-ammo/lib/types";
import { createRigidBodyApi, RigidbodyApi } from "../api/rigidbody-api";
import { isEuler, isQuaternion, isVector3 } from "../../three-ammo/worker/utils";

type UseRigidBodyOptions = Omit<BodyConfig, "type"> & {
  shapeType: ShapeType;
  bodyType?: BodyType;
  mesh?: Object3D;
  shapeConfig?: Omit<ShapeConfig, "type">;
  position?: Vector3 | [number, number, number];
  rotation?:
    | Euler
    | [number, number, number]
    | [number, number, number, EulerOrder]
    | Quaternion;
};

export function useRigidBody<T extends Object3D = Object3D>(
  options: UseRigidBodyOptions | (() => UseRigidBodyOptions),
  externalObjectOrRef?: T | RefObject<T>
): [RefObject<T>, RigidbodyApi] {
  const localRef = useRef<T>(null);

  const physicsContext = useAmmoPhysicsContext();
  const { addRigidBody, removeRigidBody } = physicsContext;

  const [bodyUUID] = useState(() => MathUtils.generateUUID());

  useEffect(() => {
    // 1. Resolve Object: External Instance -> External Ref -> Local Ref
    let objectToUse: T | null | undefined;

    if (externalObjectOrRef) {
      if ("current" in externalObjectOrRef) {
        objectToUse = externalObjectOrRef.current;
      } else {
        objectToUse = externalObjectOrRef;
      }
    } else {
      objectToUse = localRef.current;
    }

    if (!objectToUse) {
      console.warn("useRigidBody: Object not found in ref");
      return;
    }

    // 2. Resolve Options
    const finalOptions = typeof options === "function" ? options() : options;
    const {
      bodyType,
      shapeType,
      shapeConfig,
      position,
      rotation,
      mesh,
      ...rest
    } = finalOptions;

    // 3. Apply Initial Transforms
    if (position) {
      if (isVector3(position)) {
        objectToUse.position.set(position.x, position.y, position.z);
      } else if (position.length === 3) {
        objectToUse.position.set(position[0], position[1], position[2]);
      } else {
        throw new Error("invalid position: expected Vector3 or VectorTuple");
      }
      objectToUse.updateMatrixWorld();
    }

    if (rotation) {
      if (isEuler(rotation)) {
        objectToUse.rotation.copy(rotation);
      } else if (isQuaternion(rotation)) {
        objectToUse.rotation.setFromQuaternion(rotation);
      } else if (rotation.length === 3 || rotation.length === 4) {
        objectToUse.rotation.set(
          rotation[0],
          rotation[1],
          rotation[2],
          rotation[3] as any
        );
      } else {
        throw new Error("invalid rotation: expected Euler or EulerTuple");
      }
      objectToUse.updateMatrixWorld();
    }

    const meshToUse = mesh ? mesh : objectToUse;

    addRigidBody(
      bodyUUID,
      objectToUse,
      {
        meshToUse,
        shapeConfig: {
          type: shapeType,
          ...shapeConfig,
        },
      },
      {
        type: bodyType,
        ...rest,
      }
    );

    return () => {
      removeRigidBody(bodyUUID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // 4. Memoize API to prevent re-renders
  const api = useMemo(
    () => createRigidBodyApi(physicsContext, bodyUUID),
    [physicsContext, bodyUUID]
  );

  return [localRef as RefObject<T>, api];
}

/**
 * @deprecated use useRigidBody instead
 */
export const usePhysics = useRigidBody;