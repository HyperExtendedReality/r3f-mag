import Ammo from "../lib/ammo.js/builds/ammo.wasm.js";
// Tsup converts this import into a raw Base64 string
import AmmoWasmBase64 from "../lib/ammo.js/builds/ammo.wasm.wasm";

// Helper: Fast Base64 to Uint8Array converter
const decodeBase64 = (base64: string) => {
  const binaryString = self.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// We cache the binary so we don't decode it twice if this function is called multiple times
let wasmBinaryCache: Uint8Array | null = null;
let ammoInstance: any = null;

export const initializeAmmoWasm = async () => {
  console.log("Worker: initializeAmmoWasm called");
  if (ammoInstance) {
    console.log("Worker: Already initialized, returning instance");
    return ammoInstance;
  }

  if (!wasmBinaryCache) {
    console.log("Worker: Decoding WASM base64");
    wasmBinaryCache = decodeBase64(AmmoWasmBase64);
  }

  console.log("Worker: Calling Ammo() initializer");
  return new Promise<any>((resolve) => {
    // Bind 'self' ensures it works correctly in the Worker global scope
    Ammo.bind(self)({
      // Direct memory injection: No network request, no file paths
      wasmBinary: wasmBinaryCache, 
    }).then((instance: any) => {
      console.log("Worker: Ammo initialized successfully");
      ammoInstance = instance;
      resolve(instance);
    });
  });
};