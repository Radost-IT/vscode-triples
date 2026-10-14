import * as esbuild from 'esbuild';
import { globSync } from 'node:fs';

await esbuild.build({
  entryPoints: globSync('test/integration/**/*.ts'),
  outbase: 'test/integration',
  outdir: 'out/test/integration',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'inline',
  logLevel: 'warning',
});
