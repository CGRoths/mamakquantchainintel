# MQCHAIN Research Normalization Skill

This bundle defines the deterministic research CSV contract consumed by MQCHAIN preflight. Generate a fresh governed dictionary bundle before each research run:

`npm.cmd run mqchain:dictionary-bundle -- --output <directory>`

Use `schema.json` for row validation, `canonical-columns.csv` for header order, and the files under `examples/` as formatting examples only. Example addresses and URLs are documentation placeholders, not ownership evidence and must never be uploaded as verified research.

The platform preflight is authoritative for normalization and dictionary resolution. Only rows reported as `resolved` are eligible for source-job creation; verification, approval, batching, registry writes, and KV activation remain separate operator-controlled steps.
