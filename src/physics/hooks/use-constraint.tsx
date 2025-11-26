import { RefObject, useEffect, useState } from "react";
import { useAmmoPhysicsContext } from "../physics-context";
import { MathUtils, Object3D } from "three";
import {
  CommonConstraintConfig,
  SingleBodyConstraintConfig,
  TwoBodyConstraintConfig,
  UUID,
} from "../../three-ammo/lib/types";

type SingleBodyConstraintRefs = {
  bodyARef: RefObject<Object3D>;
  bodyBRef?: undefined;
};

type TwoBodyConstraintRefs = {
  bodyARef: RefObject<Object3D>;
  bodyBRef: RefObject<Object3D>;
};

type UseConstraintProps = CommonConstraintConfig &
  (
    | (SingleBodyConstraintRefs & SingleBodyConstraintConfig)
    | (TwoBodyConstraintRefs & TwoBodyConstraintConfig)
  );

export function useSingleBodyConstraint(
  props: CommonConstraintConfig &
    SingleBodyConstraintRefs &
    SingleBodyConstraintConfig
) {
  return useConstraint(props);
}

export function useTwoBodyConstraint(
  props: CommonConstraintConfig &
    TwoBodyConstraintRefs &
    TwoBodyConstraintConfig
) {
  return useConstraint(props);
}

export function useConstraint(props: UseConstraintProps) {
  const {
    addConstraint,
    // updateConstraint, // Unused? Kept only if needed later
    removeConstraint,
  } = useAmmoPhysicsContext();

  const [constraintId] = useState(() => MathUtils.generateUUID());

  useEffect(() => {
    // Optimization: Add optional chaining to prevent crashes if refs are empty
    const uuidA: UUID | undefined =
      props.bodyARef.current?.userData?.useAmmo?.rigidBody?.uuid;
      
    // Handle optional bodyB
    const uuidB: UUID | undefined =
      props.bodyBRef && props.bodyBRef.current
        ? props.bodyBRef.current.userData?.useAmmo?.rigidBody?.uuid
        : undefined;

    // Guard: UUID A is mandatory
    if (!uuidA) return;

    // Case 1: Single Body Constraint
    if (props.bodyBRef === undefined) {
      const { bodyARef, bodyBRef, ...constraintConfig } = props;

      addConstraint(
        constraintId,
        uuidA,
        undefined,
        constraintConfig as SingleBodyConstraintConfig
      );
    } 
    // Case 2: Two Body Constraint (Requires both UUIDs)
    else if (uuidB) {
      const { bodyARef, bodyBRef, ...constraintConfig } = props;

      addConstraint(
        constraintId,
        uuidA,
        uuidB,
        constraintConfig as TwoBodyConstraintConfig
      );
    }

    return () => {
      removeConstraint(constraintId);
    };
  }, [
    addConstraint,
    removeConstraint,
    constraintId,
    // Dependency optimization: trigger when ref *content* changes
    props.bodyARef.current, 
    props.bodyBRef?.current
  ]);
}