import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(__dirname, '../../..');

// Set when this runs from inside another VS Code extension host; it would start VS Code as plain Node.
delete process.env['ELECTRON_RUN_AS_NODE'];

runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
  launchArgs: [
    path.join(root, 'test', 'fixtures'),
    '--disable-extensions',
    '--disable-workspace-trust',
  ],
}).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
