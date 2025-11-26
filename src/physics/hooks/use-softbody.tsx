import { MathUtils, Mesh } from "three";
import React, { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useAmmoPhysicsContext } from "../physics-context";
import { SoftBodyAnchorRef, SoftBodyConfig } from "../../three-ammo/lib/types";
import { createSoftbodyApi, SoftbodyApi } from "../api/softbody-api";
import { isSoftBodyRigidBodyAnchorRef } from "../../three-ammo/worker/utils";

type UseSoftBodyOptions = Omit<SoftBodyConfig, "anchors"> & {
  anchors?: SoftBodyAnchorRef[];
};

export function useSoftBody<T extends Mesh = Mesh>(
  options: UseSoftBodyOptions | (() => UseSoftBodyOptions),
  // Optimization: Allow passing a RefObject OR a direct Mesh
  externalMeshOrRef?: T | RefObject<T>
): [RefObject<T>, SoftbodyApi] {
  const localRef = useRef<T>(null);

  const physicsContext = useAmmoPhysicsContext();
  const { addSoftBody, removeSoftBody } = physicsContext;

  // UUID should never change for the lifespan of the component
  const [bodyUUID] = useState(() => MathUtils.generateUUID());

  useEffect(() => {
    // Resolve the mesh: Check External Ref -> External Instance -> Local Ref
    let meshToUse: T | null | undefined;

    if (externalMeshOrRef) {
      if ("current" in externalMeshOrRef) {
        meshToUse = externalMeshOrRef.current;
      } else {
        meshToUse = externalMeshOrRef;
      }
    } else {
      meshToUse = localRef.current;
    }

    if (!meshToUse) {
      // This might happen if the ref wasn't attached. Fail silently or warn.
      console.warn("useSoftBody: No mesh found. Ensure the ref is attached.");
      return;
    }

    // Handle lazy options
    const finalOptions = typeof options === "function" ? options() : options;
    const { anchors, ...rest } = finalOptions;

    // Process anchors
    const processedAnchors =
      anchors &&
      anchors.map((anchor) => {
        if (isSoftBodyRigidBodyAnchorRef(anchor)) {
          const { rigidBodyRef, ...anchorProps } = anchor;
          return {
            ...anchorProps,
            // Optimization: Optional chaining prevents crash if other body isn't ready
            rigidBodyUUID:
              rigidBodyRef.current?.userData?.useAmmo?.rigidBody?.uuid,
          };
        }
        return anchor;
      });

    addSoftBody(bodyUUID, meshToUse, {
      anchors: processedAnchors,
      ...rest,
    });

    return () => {
      removeSoftBody(bodyUUID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PERFORMANCE OPTIMIZATION:
  // Memoize the API object.
  // Previously, this created a new object on every render, causing GC churn.
  const api = useMemo(
    () => createSoftbodyApi(physicsContext, bodyUUID),
    [physicsContext, bodyUUID]
  );

  // TypeScript Fix: Cast to RefObject<T> to satisfy strict null checks
  return [localRef as RefObject<T>, api];
}