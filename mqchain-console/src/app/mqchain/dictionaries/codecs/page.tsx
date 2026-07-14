import { U1CatalogTable } from "@/components/mqchain/u1-catalog-table";

export default function CodecsPage() {
  return <U1CatalogTable title="Address codecs" description="Canonical textual, payload, checksum, and normalizer contracts." file="address_codecs.csv" columns={[
    { key: "address_codec_id", label: "ID", mono: true }, { key: "codec_code", label: "Code", mono: true }, { key: "address_family", label: "Family" },
    { key: "payload_rule", label: "Payload" }, { key: "checksum_behavior", label: "Checksum" }, { key: "normalizer_version", label: "Normalizer", mono: true },
    { key: "status", label: "Status" }, { key: "verified_at", label: "Verified", mono: true }, { key: "notes", label: "Notes" },
  ]} />;
}
