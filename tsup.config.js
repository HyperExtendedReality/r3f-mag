import { defineConfig } from "tsup";
import { build } from "esbuild";

const inlineWorkerPlugin = {
  name: "inline-worker",
  setup(buildContext) {
    buildContext.onLoad({ filter: /\.worker\.ts$/ }, async (args) => {
      const result = await build({
        entryPoints: [args.path],
        write: false,
        bundle: true,
        minify: true,
        format: "iife",
        platform: "browser",
        target: "es2018",
        
        // Loader for WASM files
        loader: {
          ".wasm": "base64",
          ".wasm.wasm": "base64", // Handle double extension if present
        },

        // Plugin to stub Node.js built-ins
        plugins: [{
          name: 'stub-node-modules',
          setup(build) {
            build.onResolve({ filter: /^(fs|path)$/ }, args => {
              return { namespace: 'stub-node-modules', path: args.path }
            })
            build.onLoad({ filter: /.*/, namespace: 'stub-node-modules' }, args => {
              return { contents: 'export default {}', loader: 'js' }
            })
          }
        }],
        
        // Define global objects to prevent ammo.js from thinking it's in Node
        define: {
          "process.env.NODE_ENV": '"production"',
          "__dirname": '""',
          "process.versions.node": "false", // Critical for ammo.js
        }
      });

      const workerCode = result.outputFiles[0].text;
      const workerBase64 = Buffer.from(workerCode).toString("base64");

      return {
        loader: "ts",
        contents: `
          const code = typeof atob !== 'undefined' ? atob("${workerBase64}") : Buffer.from("${workerBase64}", "base64").toString("binary");
          const blob = new Blob([code], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          export default function WorkerFactory() {
            return new Worker(url);
          }
        `,
      };
    });
  },
};

export default defineConfig({
  entry: ["src/index.tsx"], // Ensure this points to .tsx if you have React code
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  
  // Loader for the main thread build
  loader: {
    ".wasm": "base64",
  },
  
  esbuildPlugins: [inlineWorkerPlugin],
  external: ["react", "three", "three-stdlib"],
});