import { ClassificationResult, ContentClass } from '../../types';
import { NER_DOMAIN_EXAMPLES } from '../processor/classifier/NER_DOMAIN_EXAMPLES';

/**
 * Single source of truth for the v5 closed vocabularies (KG-05).
 *
 * The base sets mirror the `{{else}}` lists in `templates/v5/system.hbs`
 * (a test in `vocabulary.test.ts` asserts they stay equal), and the same
 * `allowed*` helpers feed *both* the Zod enum (`KnowledgeGraphBuilder`) and the
 * prompt hints (`PromptManager.buildDomainHints`) — so the enum, the hints, and
 * the gold examples can never drift into the three-way disagreement KG-05
 * describes (entity enum scoped to a domain, relation enum not).
 */

/**
 * Domain-agnostic entity types, always offered alongside any detected domain's
 * vocabulary, plus an `other` escape hatch so the model is never forced to
 * mislabel when nothing fits.
 */
export const BASE_ENTITY_TYPES = [
  "person", "organization", "location", "role", "event", "time", "metric",
  "concept", "term", "document", "product", "technology", "standard",
  "class", "interface", "function", "module", "service", "dependency",
  "data_structure", "config", "file",
];

/** Base relation predicates, always offered alongside any detected domain. */
export const BASE_RELATION_TYPES = [
  "uses", "depends_on", "calls", "implements", "extends", "contains", "part_of",
  "produces", "consumes", "configures", "references", "defines", "targets",
  "located_in", "works_at", "member_of", "precedes", "causes", "has_attribute",
  "related_to",
];

/** Escape hatches: keep the model from being forced to invent a one-off label. */
export const ENTITY_TYPE_ESCAPE = "other";
export const RELATION_TYPE_ESCAPE = "related_to";

/** Minimum confidence to treat a classification as a domain signal. */
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

/** If the top-2 class confidences are within this delta, treat as mixed domain. */
export const MIXED_DOMAIN_THRESHOLD = 0.2;

/**
 * The domain class(es) a classification actually activates: the top class (when
 * it clears {@link LOW_CONFIDENCE_THRESHOLD}), plus a close second within
 * {@link MIXED_DOMAIN_THRESHOLD}. This is the *one* selection both the enum and
 * the prompt hints use, so they can't disagree about which domain is active.
 */
export function activeDomainClasses(
  contentClasses?: ClassificationResult[]
): ContentClass[] {
  if (!contentClasses || contentClasses.length === 0) return [];
  const sorted = [...contentClasses].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  if (top.confidence < LOW_CONFIDENCE_THRESHOLD) return [];
  const active: ContentClass[] = [top.class];
  if (
    sorted.length > 1 &&
    sorted[1].confidence >= LOW_CONFIDENCE_THRESHOLD &&
    top.confidence - sorted[1].confidence <= MIXED_DOMAIN_THRESHOLD
  ) {
    active.push(sorted[1].class);
  }
  return active;
}

/**
 * The union of primary entity/relation types across the active domain class(es),
 * in active-class order. Empty when no class clears the threshold.
 */
export function domainVocabulary(
  contentClasses?: ClassificationResult[]
): { entityTypes: string[]; relationTypes: string[] } {
  const entityTypes: string[] = [];
  const relationTypes: string[] = [];
  for (const cls of activeDomainClasses(contentClasses)) {
    const ner = NER_DOMAIN_EXAMPLES[cls];
    if (!ner) continue;
    entityTypes.push(...ner.primaryEntityTypes);
    relationTypes.push(...ner.primaryRelationTypes);
  }
  return { entityTypes, relationTypes };
}

/**
 * Closed entity-type set for the Zod enum: active-domain primary types ∪ corpus
 * glossary types ∪ base set ∪ `other`. Always non-empty (the base set is the
 * floor), so `entityType` is an enforced enum even with no class and no glossary.
 */
export function allowedEntityTypes(
  contentClasses?: ClassificationResult[],
  glossaryTypes: string[] = []
): string[] {
  return Array.from(
    new Set([
      ...domainVocabulary(contentClasses).entityTypes,
      ...glossaryTypes,
      ...BASE_ENTITY_TYPES,
      ENTITY_TYPE_ESCAPE,
    ])
  );
}

/**
 * Closed relation-predicate set for the Zod enum: active-domain primary
 * predicates ∪ corpus glossary predicates ∪ base set ∪ `related_to`. Unlike the
 * pre-Phase-2 resolver this DOES include the domain predicates, closing the
 * KG-05 gap where the relation enum excluded exactly the predicates the hints
 * and gold examples taught.
 */
export function allowedRelationTypes(
  contentClasses?: ClassificationResult[],
  glossaryTypes: string[] = []
): string[] {
  return Array.from(
    new Set([
      ...domainVocabulary(contentClasses).relationTypes,
      ...glossaryTypes,
      ...BASE_RELATION_TYPES,
      RELATION_TYPE_ESCAPE,
    ])
  );
}
