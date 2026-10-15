/**
 * Writes a Turtle ontology with `classCount` classes in a four-way subclass tree,
 * plus properties and individuals in the proportions of a typical domain ontology.
 */
export function largeOntology(classCount: number): string {
  const lines = [
    '@prefix : <http://example.org/large#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
  ];
  for (let index = 0; index < classCount; index++) {
    const parent = index === 0 ? '' : ` rdfs:subClassOf :C${Math.floor((index - 1) / 4)} ;`;
    lines.push(
      `:C${index} a owl:Class ;${parent} rdfs:label "Class ${index}"@en ; rdfs:comment "Generated class."@en .`,
    );
  }
  for (let index = 0; index < classCount / 10; index++) {
    lines.push(
      `:p${index} a owl:ObjectProperty ; rdfs:label "property ${index}"@en ; rdfs:domain :C${index * 7} ; rdfs:range :C${index * 3 + 1} .`,
    );
  }
  for (let index = 0; index < classCount / 5; index++) {
    lines.push(
      `:i${index} a owl:NamedIndividual, :C${index * 4} ; rdfs:label "Individual ${index}"@en .`,
    );
  }
  return lines.join('\n');
}
