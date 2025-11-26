// Worker Handling
declare module "*.worker.ts" {
  const createWorker: () => Worker;
  export default createWorker;
}

// WASM Handling
declare module "*.wasm" {
  const content: string;
  export default content;
}

declare namespace Ammo {
  const getPointer: (obj: any) => number;
  const castObject: <T>(obj: any, target: any) => T;
}