# MQCHAIN Universal U1 Final Specification

U1 separates canonical intelligence from serving artifacts. PostgreSQL owns dictionaries, provenance, candidates, evidence, verification, approvals, batches, registry intervals, metric rules, and manifests. KV stores and filters are immutable, rebuildable outputs.

The only promotion path is `source/discovery -> candidate -> evidence and source verification -> review -> approved batch -> registry -> compiler`. Discovery, intake, and LLM output cannot write registry or active KV state.

Address identity is `(namespace_id, address_codec_id, address_payload)`. Namespace identifies a chain network; codec defines textual validation and canonical payload extraction. The legacy `prefix_code` remains available during additive migration but is not part of U1 keys.

MQCHAIN answers who or what controls an address, including entity, protocol, component, category, primary role, tags, validity, and metric membership. MQASSET separately answers what native or token asset an identifier represents. MQNODE integration is outside U1 application scope.

Capability status is explicit per network and subsystem. `catalogued` never implies normalizer, KV, MQASSET, MQNODE parser, or metric production readiness.
