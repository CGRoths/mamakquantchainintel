# MQCHAIN U1 Cuckoo Filter Benchmark

Date: 2026-07-14  
Runtime: Node.js 24 on Windows  
Implementation: `bloom-filters/CuckooFilter` 3.0.4 (MIT) behind the MQCHAIN adapter

| Measure | Result |
|---|---:|
| Inserted keys | 100,000 |
| Build and serialize | 1,654.27 ms |
| Serialized bytes | 8,326,768 |
| Serialized bytes per key | 83.268 |
| Membership lookups | 1,000,000 |
| Lookup throughput | 141,863/second |
| False negatives | 0 |
| Absent probes | 100,000 |
| False positives | 2 |
| Observed false-positive rate | 0.00002 |
| Configured target | 0.001 |

The package's nominal high-load sizing failed no-false-negative acceptance. MQCHAIN uses power-of-two bucket counts, four hexadecimal fingerprint characters for the default target, a deterministic seed, sorted insertion, and a maximum planned load of 20%. Compilation verifies every inserted key before and after serialization and fails closed on any false negative.
