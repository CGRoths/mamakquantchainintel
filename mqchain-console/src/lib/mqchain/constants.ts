export const MQCHAIN_ROLES = ["owner", "admin", "analyst", "reviewer", "readonly"] as const;

export type MqUserRole = (typeof MQCHAIN_ROLES)[number];

export const ROLE_PERMISSIONS: Record<MqUserRole, string[]> = {
  owner: [
    "view",
    "intake:create",
    "candidate:review",
    "candidate:evidence",
    "source:verify",
    "batch:commit",
    "registry:edit",
    "dictionary:edit",
    "network:propose",
    "network:review",
    "settings:edit",
    "discovery:create",
  ],
  admin: [
    "view",
    "intake:create",
    "candidate:review",
    "candidate:evidence",
    "source:verify",
    "batch:commit",
    "registry:edit",
    "dictionary:edit",
    "network:propose",
    "network:review",
    "discovery:create",
  ],
  analyst: ["view", "intake:create", "candidate:propose", "candidate:evidence", "discovery:create", "network:propose"],
  reviewer: ["view", "candidate:review", "candidate:evidence", "source:verify"],
  readonly: ["view"],
};

export const SOURCE_TYPES = [
  "csv_upload",
  "manual_input",
  "official_url",
  "pdf",
  "github",
  "explorer",
  "arkham_reference",
  "llm_cleaned_csv",
  "json_evidence",
  "ml_discovery",
  "onchain_discovery",
] as const;

export const CANDIDATE_STATUSES = [
  "pending_review",
  "needs_more_evidence",
  "approved",
  "rejected",
  "conflict_pending",
  "duplicate",
  "superseded",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const SOURCE_JOB_STATUSES = ["draft", "normalized", "extracted", "candidate_created", "failed", "archived"] as const;

export type SourceJobStatus = (typeof SOURCE_JOB_STATUSES)[number];

export const DISCOVERY_JOB_STATUSES = ["draft", "running", "completed", "failed"] as const;

export type DiscoveryJobStatus = (typeof DISCOVERY_JOB_STATUSES)[number];

export const BATCH_STATUSES = ["draft", "pending_approval", "approved", "writing", "committed", "failed", "superseded"] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_LABEL_ACTIONS = ["create", "update", "supersede", "deactivate", "mark_historical"] as const;

export type BatchLabelAction = (typeof BATCH_LABEL_ACTIONS)[number];

export const TRUST_TIERS = ["official", "verified_third_party", "inferred", "weak", "conflict"] as const;

export type TrustTier = (typeof TRUST_TIERS)[number];

export const SOURCE_VERIFICATION_SCOPES = ["source_job", "source_document", "source_sheet", "source_url"] as const;

export type SourceVerificationScope = (typeof SOURCE_VERIFICATION_SCOPES)[number];

export const SOURCE_VERIFICATION_STATUSES = ["verified", "rejected", "revoked"] as const;

export type SourceVerificationStatus = (typeof SOURCE_VERIFICATION_STATUSES)[number];

export const KV_ARTIFACT_STATUSES = ["pending", "compiled", "active", "failed", "superseded"] as const;

export type KvArtifactStatus = (typeof KV_ARTIFACT_STATUSES)[number];

export const KV_BUILD_REGISTRATION_STATUSES = ["pending", "compiled", "failed"] as const;

export type KvBuildRegistrationStatus = (typeof KV_BUILD_REGISTRATION_STATUSES)[number];

export const U1_CAPABILITY_STATUSES = [
  "unsupported",
  "catalogued",
  "planned",
  "partial",
  "test_ready",
  "production_ready",
  "disabled",
] as const;

export type U1CapabilityStatus = (typeof U1_CAPABILITY_STATUSES)[number];

export const NETWORK_CATALOG_STATES = ["catalogued", "disabled"] as const;
export const NETWORK_READINESS_STATES = ["not_ready", "prepared", "test_ready", "production_ready"] as const;
export const NETWORK_CHANGE_TYPES = ["create", "update", "activate", "deactivate", "capability_update"] as const;
export const NETWORK_CHANGE_STATUSES = ["pending", "approved", "rejected", "applied"] as const;

export type NetworkCatalogState = (typeof NETWORK_CATALOG_STATES)[number];
export type NetworkReadinessState = (typeof NETWORK_READINESS_STATES)[number];
export type NetworkChangeType = (typeof NETWORK_CHANGE_TYPES)[number];
export type NetworkChangeStatus = (typeof NETWORK_CHANGE_STATUSES)[number];

export const U1_BUILD_KINDS = ["base", "delta"] as const;
export const U1_MEMBERSHIP_STATUSES = ["active", "removed", "deprecated"] as const;

export const LABEL_STATUS = {
  unknown: 0,
  activeCurrent: 1,
  inactiveHistorical: 2,
  migrated: 3,
  deprecated: 4,
  conflict: 5,
  doNotUse: 6,
  pendingReview: 7,
  sanctionedCurrent: 8,
  sanctionedHistorical: 9,
} as const;

export const LABEL_STATUS_MIN = LABEL_STATUS.unknown;
export const LABEL_STATUS_MAX = LABEL_STATUS.sanctionedHistorical;

export const QUALITY_TIER = {
  unknown: 0,
  officialVerified: 1,
  officialLowConfidence: 2,
  thirdPartyVerified: 3,
  inferredHighConfidence: 4,
  inferredLowConfidence: 5,
  manualReviewed: 6,
  conflictPending: 7,
} as const;

export const QUALITY_TIER_MIN = QUALITY_TIER.unknown;
export const QUALITY_TIER_MAX = QUALITY_TIER.conflictPending;

export const DEFAULT_ACTOR_EMAIL = "owner@mamakquant.local";

export const PARSER_VERSION = "mqchain-console-v1";
