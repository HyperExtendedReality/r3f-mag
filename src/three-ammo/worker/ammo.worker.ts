import { MessageType } from "../lib/types";
import {
  copyToRigidBodyBuffer,
  rigidBodyEventReceivers,
} from "./managers/rigid-body-manager";
import {
  isBufferConsumed,
  releaseBuffer,
  sharedBuffers,
  world,
  worldEventReceivers,
} from "./managers/world-manager";
import { debugEventReceivers } from "./managers/debug-manager";
import { constraintEventReceivers } from "./managers/constraint-manager";
import {
  copyToSoftBodyBuffers,
  softBodyEventReceivers,
} from "./managers/soft-body-manager";
import { raycastEventReceivers } from "./managers/raycast-manager";
import { DEFAULT_TIMESTEP } from "../lib/constants";

// Optimization: Initialize with number to avoid hidden class changes in V8
let lastTick = 0; 
let substepCounter = 0;
let tickInterval: any; // Type 'any' handles NodeJS.Timer vs number differences

// Optimization: Pre-calculate the ms-to-seconds multiplier
// default speed 1 / 1000ms = 0.001
let simulationScale = 0.001; 

function tick() {
  // Synchronization Lock: Only step if the main thread has read the previous data
  if (isBufferConsumed()) {
    const now = performance.now();
    
    // Calculate delta time in milliseconds
    const dtMs = now - lastTick;
    
    // Safety clamp: prevent spiral of death if tab was backgrounded
    // If dt > 100ms (10fps), cap it.
    const clampedDt = dtMs > 100 ? 100 : dtMs;

    try {
      // Step the physics world
      // clampedDt * simulationScale converts ms -> seconds and applies speed factor
      const numSubsteps = world.step(clampedDt * simulationScale);

      const stepDuration = performance.now() - now;
      lastTick = now;
      
      // Keep counter within 32-bit integer range
      substepCounter = (substepCounter + numSubsteps) | 0; 
      if (substepCounter < 0) substepCounter = 0; // Handle wrapping if it ever happens

      if (numSubsteps > 0) {
        // Write performance metrics
        sharedBuffers.rigidBodies.headerFloatArray[1] = stepDuration;
        sharedBuffers.rigidBodies.headerIntArray[2] = substepCounter;

        // Sync physics transforms to shared memory
        copyToRigidBodyBuffer();
        copyToSoftBodyBuffers();
      }
    } catch (err) {
      console.error("Ammo worker crashed:", err);
      clearInterval(tickInterval);
      self.onmessage = null; // Stop accepting messages
    }

    // Release the lock so main thread can read
    releaseBuffer();
  }
}

function setSimulationSpeed({ simulationSpeed }: { simulationSpeed: number }) {
  // Pre-calculate to avoid division in the hot loop
  simulationScale = simulationSpeed / 1000;
}

const eventReceivers: Record<MessageType, (eventData: any) => void> = {
  [MessageType.SET_SIMULATION_SPEED]: setSimulationSpeed,
  ...worldEventReceivers,
  ...debugEventReceivers,
  ...rigidBodyEventReceivers,
  ...softBodyEventReceivers,
  ...constraintEventReceivers,
  ...raycastEventReceivers,
};

export default {} as any;

onmessage = async (event) => {
  console.log("Worker: Message received", event.data.type);
  const data = event.data;

  if (data.type === undefined) return;

  const handler = eventReceivers[data.type];

  if (!handler) {
    // Only log unknown if it's not a transfer (transfers can be noisy)
    if (data.type !== MessageType.TRANSFER_BUFFERS) {
       console.error("Unknown worker event:", data.type);
    }
    return;
  }

  if (world) {
    // If world exists, process normal events
    if (data.type === MessageType.INIT) {
      console.warn("Physics world already initialized. Ignoring INIT.");
    } else {
      handler(data);
    }
  } else {
    // If world doesn't exist, only allow INIT
    if (data.type === MessageType.INIT) {
      console.log("Worker: INIT received, starting initialization");
      await handler(data);
      console.log("Worker: Initialization handler completed");

      lastTick = performance.now();
      tickInterval = self.setInterval(
        tick,
        data.fixedTimeStep ? data.fixedTimeStep * 1000 : DEFAULT_TIMESTEP * 1000
      );
    } else {
      console.warn("Physics world not yet initialized. Dropping message:", data.type);
    }
  }
};
