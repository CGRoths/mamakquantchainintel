export type ResearchRowStatus =
  | "resolved"
  | "review_required"
  | "invalid"
  | "invalid_address"
  | "duplicate"
  | "pending_entity"
  | "pending_protocol"
  | "pending_role"
  | "pending_component"
  | "pending_category"
  | "pending_alias"
  | "pending_network"
  | "pending_codec"
  | "unsupported_identifier_kind"
  | "dictionary_version_mismatch"
  | "source_provenance_missing";

export type ResearchPreflightRecordDto = {
  rowNumber: number;
  status: ResearchRowStatus;
  blockers: readonly string[];
  warnings: readonly string[];
  address: string;
  normalizedAddress: string | null;
  chain: string;
  chainCode: string | null;
  identifierKind: string;
  entityHint: string | null;
  roleHint: string | null;
  sourceUrl: string | null;
  sourceSheet: string | null;
};

export type ResearchPreflightReportDto = {
  schemaVersion: "MQCHAIN-RESEARCH-PREFLIGHT-1";
  csvSchemaVersion: string;
  dictionaryVersion: string;
  suppliedDictionaryVersion: string | null;
  activeDictionaryVersion: string;
  dictionaryVersionMatches: boolean;
  generatedAt: string;
  inputHash: string;
  preflightHash: string;
  legacySchema: boolean;
  canCreateSourceJob: boolean;
  counts: {
    totalRows: number;
    resolvedRows: number;
    unresolvedRows: number;
    invalidRows: number;
    duplicates: number;
  };
  chains: readonly string[];
  entities: readonly string[];
  roles: readonly string[];
  sourceSheets: readonly string[];
  sourceUrls: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  records: readonly ResearchPreflightRecordDto[];
  normalizedCsv: string;
  unresolvedCsv: string;
};

export type ResearchIntakeCreatedDto = {
  sourceJobId: number;
  totalRows: number;
  validAddresses: number;
  invalidAddresses: number;
  duplicates: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  evidenceCreated: number;
  conflictsFound: number;
  errors: string[];
  dictionaryVersion: string;
  preflightHash: string;
  acceptedRows: number;
  unresolvedRowsExcluded: number;
  duplicateRowsExcluded: number;
};
