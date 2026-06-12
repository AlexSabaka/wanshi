import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { Observation, obsText } from "../../../types/Observation";

/**
 * A `(name, property, value)` knowledge triple — the unit both the KBLaM and LoRA
 * exports build on. KBLaM requires **one value per (name, property)** (its
 * `NoDuplicateKB` invariant; a colliding key makes rectangular attention average
 * unrelated values), so `toKbTriples` guarantees a unique `(name, property)` by
 * construction (KG-09).
 */
export interface KbTriple {
  name: string;
  property: string;
  value: string;
}

/** The property all free-text observations aggregate under (KBLaM-released name). */
export const DESCRIPTION_PROPERTY = "description";

/**
 * Turn a graph into KBLaM-shaped triples with unique `(name, property)` keys:
 *  - **observations** → a single `description` property per entity (free-text facts
 *    have no inherent property), values joined with `"; "`;
 *  - **relations** → `property = predicate`, with same-`(from, predicate)` targets
 *    aggregated into one `", "`-joined value.
 * `keepObservation` lets a caller (LoRA) drop facts before aggregation; KBLaM passes
 * none. Values are de-duplicated and emptiness-checked, so each key maps to exactly
 * one non-empty value.
 */
export function toKbTriples(
  graph: KnowledgeGraph,
  keepObservation?: (obs: Observation | string) => boolean
): KbTriple[] {
  // name → property → values (insertion order preserved for deterministic output).
  const byEntity = new Map<string, Map<string, string[]>>();
  const add = (name: string, property: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    let props = byEntity.get(name);
    if (!props) byEntity.set(name, (props = new Map()));
    const values = props.get(property) ?? [];
    if (values.length === 0) props.set(property, values);
    values.push(v);
  };

  for (const entity of graph.entities) {
    for (const obs of entity.observations || []) {
      if (keepObservation && !keepObservation(obs)) continue;
      add(entity.name, DESCRIPTION_PROPERTY, obsText(obs));
    }
  }

  for (const relation of graph.relations) {
    const types = Array.isArray(relation.relationType)
      ? relation.relationType
      : [relation.relationType];
    for (const type of types) {
      if (!type) continue;
      add(relation.from, String(type), relation.to);
    }
  }

  const triples: KbTriple[] = [];
  for (const [name, props] of byEntity) {
    for (const [property, values] of props) {
      const sep = property === DESCRIPTION_PROPERTY ? "; " : ", ";
      triples.push({ name, property, value: [...new Set(values)].join(sep) });
    }
  }
  return triples;
}
