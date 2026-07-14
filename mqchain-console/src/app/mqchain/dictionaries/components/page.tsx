import { U1CatalogTable } from "@/components/mqchain/u1-catalog-table";

export default function ComponentsPage() {
  return <U1CatalogTable title="Protocol components" description="Source-backed root contracts and protocol graph components." file="protocol_components.csv" columns={[
    { key: "component_id", label: "ID", mono: true }, { key: "component_code", label: "Code", mono: true }, { key: "component_name", label: "Component" },
    { key: "component_type", label: "Type" }, { key: "protocol_id", label: "Protocol", mono: true }, { key: "namespace_id", label: "Namespace", mono: true },
    { key: "normalized_payload_hex", label: "Payload", mono: true }, { key: "role_id", label: "Role", mono: true }, { key: "confidence_score", label: "Confidence" },
    { key: "source_id", label: "Source", mono: true }, { key: "verified_at", label: "Verified", mono: true },
  ]} />;
}
