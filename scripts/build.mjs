import { rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
  legalComments: 'linked',
};

const browser = {
  ...shared,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  // Parser dependencies reference the Node global object.
  define: { global: 'globalThis' },
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['vscode'],
  },
  { ...browser, entryPoints: ['src/webview/main.ts'], outfile: 'dist/webview/main.js' },
  { ...browser, entryPoints: ['src/webview/worker.ts'], outfile: 'dist/webview/worker.js' },
];

// Source maps from an earlier development build must not end up in the package.
if (production) rmSync('dist', { recursive: true, force: true });

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
