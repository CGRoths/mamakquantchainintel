import { U1CatalogTable } from "@/components/mqchain/u1-catalog-table";

export default function TokenStandardsPage() {
  return <U1CatalogTable title="Token standards" description="Controlled uint16 standards used by MQA-U1 and MQAN-U1." file="token_standards.csv" columns={[
    { key: "standard_id", label: "ID", mono: true }, { key: "standard_code", label: "Code", mono: true }, { key: "standard_name", label: "Standard" },
    { key: "chain_family", label: "Family" }, { key: "is_active", label: "Active" }, { key: "source_id", label: "Source", mono: true },
    { key: "verified_at", label: "Verified", mono: true }, { key: "notes", label: "Notes" },
  ]} />;
}
