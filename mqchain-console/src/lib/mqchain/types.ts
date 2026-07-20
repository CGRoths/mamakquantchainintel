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
  schema_version?: string;
  dictionary_version?: string;
  normalization_status?: string;
  chain?: string;
  identifier_kind?: string;
  address_type?: string;
  source_chain_label?: string;
  entity?: string;
  entity_code?: string;
  protocol?: string;
  protocol_code?: string;
  role?: string;
  role_code?: string;
  component?: string;
  component_code?: string;
  component_name?: string;
  component_type?: string;
  category_code?: string;
  tags?: string;
  source_url?: string;
  source_sheet?: string;
  source_row?: string | number;
  source_section?: string;
  source_document_hash?: string;
  retrieved_at?: string;
  source_name?: string;
  confidence?: string | number;
  quality_tier?: string | number;
  notes?: string;
  first_seen_block?: string | number;
  last_seen_block?: string | number;
  metric_eligible?: string | boolean;
  evidence_type?: string;
  trust_tier?: string;
  verification_scope?: string;
  proposed_entity_code?: string;
  proposed_protocol_code?: string;
  proposed_role_code?: string;
  proposed_component_code?: string;
  proposal_reason?: string;
  source_input_type?: string;
  contract_name?: string;
  role_source?: string;
  source_role_label?: string;
  source_role_labels?: string[];
  raw_reference?: Record<string, unknown>;
  raw_row?: Record<string, string>;
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
