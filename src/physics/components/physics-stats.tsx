import { StatsGl } from "@react-three/drei";
import { useControls, monitor } from "leva";
import { useAmmoPhysicsContext } from "../physics-context";

export function PhysicsStats() {
  const { physicsPerformanceInfoRef } = useAmmoPhysicsContext();

  useControls(
    "Performance",
    {
      "Physics Step (ms)": monitor(
        () => physicsPerformanceInfoRef.current?.lastTickMs ?? 0,
        {
          graph: true,
          interval: 30,
        }
      ),
    },
    { collapsed: false }
  );

  // 0 = FPS, 1 = MS, 2 = MB
  return <StatsGl showPanel={1} />;
}