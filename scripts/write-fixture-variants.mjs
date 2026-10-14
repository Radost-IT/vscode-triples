// Regenerates the N-Triples and TriG fixtures from pizza.ttl.
import { readFileSync, writeFileSync } from 'node:fs';
import { Parser, Writer } from 'n3';

const fixtures = new URL('../test/fixtures/', import.meta.url);
const quads = new Parser().parse(readFileSync(new URL('pizza.ttl', fixtures), 'utf8'));

const write = (name, format, prefixes) => {
  const writer = new Writer({ format, prefixes });
  writer.addQuads(quads);
  writer.end((error, result) => {
    if (error) throw error;
    writeFileSync(new URL(name, fixtures), result);
  });
};

write('pizza.nt', 'N-Triples');
write('pizza.trig', 'TriG', {
  pz: 'http://example.org/pizza#',
  owl: 'http://www.w3.org/2002/07/owl#',
});
