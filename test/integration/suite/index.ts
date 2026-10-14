import * as path from 'node:path';
import { globSync } from 'node:fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 20_000, color: true });
  for (const file of globSync('*.test.js', { cwd: __dirname }))
    mocha.addFile(path.join(__dirname, file));
  return new Promise((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} integration tests failed.`)) : resolve(),
    );
  });
}
