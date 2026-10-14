import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../../src/core/model/build';
import { parseRdf } from '../../src/core/parse';

export const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

export const readFixture = (name: string): string => readFileSync(fixturePath(name), 'utf8');

export async function parseFixture(name: string) {
  return parseRdf(readFixture(name), name, `file:///fixtures/${name}`);
}

export async function modelOfFixture(name: string, language = 'en') {
  return buildModel(await parseFixture(name), { language });
}
