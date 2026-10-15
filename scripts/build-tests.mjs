import * as esbuild from 'esbuild';
import { globSync } from 'node:fs';

await esbuild.build({
  entryPoints: globSync('test/integration/**/*.ts'),
  outbase: 'test/integration',
  outdir: 'out/test/integration',
  bundle: true,
  // Tests that import extension modules get their own copy; the host APIs and test runners stay external.
  external: ['vscode', 'mocha', '@vscode/test-electron'],
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'inline',
  logLevel: 'warning',
});
