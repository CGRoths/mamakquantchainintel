# MQCHAIN and MQASSET Boundary

MQCHAIN labels an address controller/function: entity, protocol, component, category, primary role, tags, validity, and metric membership.

MQASSET identifies economic assets: native asset by namespace, token contract/mint/denom, token standard, decimals, and issuer entity. MQASSET has separate catalog tables and binary values. Asset fields are not embedded in every MQCHAIN label.

The systems connect through namespace IDs, shared entity IDs for issuers, catalog sources, dictionary versions, and compatible build manifests. A protocol pool address may have an MQCHAIN role while its underlying token contracts resolve independently through MQASSET.

MQNODE may later consume both serving surfaces, but parser or metric integration is explicitly outside this application migration.
