/* Inspector 局部类型(避免与 state/types 循环)。 */
import type { Claim } from '../state/types';

export type { Claim };
import type { InspTab } from '../state/ui';

export type InspTabExt = InspTab;

export interface EvidenceRef {
  evidence_id: string;
  source_id: string;
  locator: string;
  excerpt: string;
}

export interface SpecDiff {
  pages_added: string[];
  pages_removed: string[];
  pages_reordered: string[];
  pages_changed: {
    page_id: string;
    changes: { field: string; locator?: string; before?: string; after?: string }[];
  }[];
  metrics_changed: { metric_id: string; field: string; before?: string; after?: string }[];
  claims_changed: { claim_id: string; field: string; before?: string; after?: string }[];
}
