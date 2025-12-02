import { defineConfig } from 'tsup';
import path from 'path';
import { build as esbuild } from 'esbuild';

const inlineWorkerPlugin = {
  name: 'inline-worker',
  setup(buildPlugin) {
    buildPlugin.onResolve({ filter: /\.worker\.ts$/ }, (args) => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'worker-inline',
      };
    });

    buildPlugin.onLoad({ filter: /.*/, namespace: 'worker-inline' }, async (args) => {
      const result = await esbuild({
        entryPoints: [args.path],
        write: false,
        bundle: true,
        minify: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        loader: {
          '.wasm': 'dataurl',
        },
        external: ['fs', 'path', 'crypto'],
      });

      const workerCode = result.outputFiles[0].text;

      return {
        contents: `export default ${JSON.stringify(workerCode)};`,
        loader: 'js',
      };
    });
  },
};

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'browser',
  loader: {
    '.wasm': 'dataurl',
  },
  esbuildPlugins: [inlineWorkerPlugin],
});