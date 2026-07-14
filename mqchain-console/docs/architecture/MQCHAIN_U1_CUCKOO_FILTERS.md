# MQCHAIN U1 Cuckoo Filters

Every keyed KV artifact has a version-matched membership filter. The resolver checks delta filters before base filters and reads KV only on `maybe present`. False positives are permitted; false negatives fail compilation and activation.

The filter interface must support deterministic construction, binary serialization/deserialization, membership lookup, and implementation metadata. Dependency acceptance requires a maintained package, compatible license, stable serialization, documented deletion behavior, and benchmark evidence.

Builds sort canonical binary keys before insertion, use a recorded deterministic seed, verify every inserted key after serialization round-trip, sample absent keys, and report observed false-positive rate. The default target is 0.001. Filter manifests store implementation/version, item count, target, observed rate, seed, content hash, and storage URI.

The U1 implementation uses `bloom-filters` 3.0.4 (`CuckooFilter`) behind the MQCHAIN membership-filter interface. The package is MIT licensed, supports deletion, exposes a deterministic seed, and serializes its bucket state. MQCHAIN wraps that state in a canonical versioned envelope and rejects implementation-version drift during deserialization.

Representative testing found that the package's nominal 95.5% sizing can displace fingerprints into locations that produce false negatives. Its sizing helper also interprets hexadecimal fingerprint characters as though they were bytes. MQCHAIN therefore computes fingerprint characters directly from the false-positive target, uses a power-of-two bucket count, caps planned load at 20%, and independently verifies every key after construction and deserialization. A 100,000-key benchmark at 19.1% load had zero false negatives and a 0.00004 observed false-positive rate over 100,000 absent probes. This is an explicit reliability-over-space decision. A build fails closed if any false negative remains; activation never relies on the package's successful-insert return value alone.

Acceptance tests build byte-identical filters from differently ordered inputs, round-trip 5,000 keys without false negatives, and sample 20,000 absent keys against a 10,000-key filter. The observed false-positive rate must remain at or below 0.003 in the test, a conservative ceiling around the 0.001 configured target. Production compilation must record the actual sample count and observed rate in the filter manifest.
