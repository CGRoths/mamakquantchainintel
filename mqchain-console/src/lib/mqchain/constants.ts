export const MQCHAIN_ROLES = ["owner", "admin", "analyst", "reviewer", "readonly"] as const;

export type MqUserRole = (typeof MQCHAIN_ROLES)[number];

export const ROLE_PERMISSIONS: Record<MqUserRole, string[]> = {
  owner: ["view", "intake:create", "candidate:review", "candidate:evidence", "batch:commit", "dictionary:edit", "settings:edit", "discovery:create"],
  admin: ["view", "intake:create", "candidate:review", "candidate:evidence", "batch:commit", "dictionary:edit", "discovery:create"],
  analyst: ["view", "intake:create", "candidate:propose", "candidate:evidence", "discovery:create"],
  reviewer: ["view", "candidate:review", "candidate:evidence"],
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

export const BATCH_STATUSES = ["draft", "pending_approval", "approved", "writing", "committed", "failed", "superseded"] as const;

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

export const DEFAULT_ACTOR_EMAIL = "owner@mamakquant.local";

export const PARSER_VERSION = "mqchain-console-v1";
