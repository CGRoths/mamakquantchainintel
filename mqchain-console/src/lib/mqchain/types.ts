export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type NormalizedAddress = {
  chainCode: string | null;
  addressFamily: string | null;
  rawAddress: string;
  normalizedAddress: string;
  prefixCode: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
  payloadHex: string | null;
  isValid: boolean;
  error?: string;
};

export type CsvIntakeRow = {
  address: string;
  chain?: string;
  entity?: string;
  protocol?: string;
  role?: string;
  source_url?: string;
  source_name?: string;
  confidence?: string | number;
  quality_tier?: string | number;
  notes?: string;
  first_seen_block?: string | number;
  last_seen_block?: string | number;
  metric_eligible?: string | boolean;
  evidence_type?: string;
  trust_tier?: string;
  source_input_type?: string;
  contract_name?: string;
  role_source?: string;
  source_role_label?: string;
  source_role_labels?: string[];
  raw_reference?: Record<string, unknown>;
};

export type MetricGroupRule = {
  includeRoles?: string[];
  excludeRoles?: string[];
  includeCategories?: string[];
  excludeCategories?: string[];
  includeEntities?: string[];
  excludeEntities?: string[];
  minConfidence?: number;
  requireMetricEligible?: boolean;
};

export type RegistryMatchInput = {
  chainCode?: string | null;
  roleCode?: string | null;
  categoryCode?: string | null;
  entityCode?: string | null;
  confidenceScore: number;
  flags: number;
};
