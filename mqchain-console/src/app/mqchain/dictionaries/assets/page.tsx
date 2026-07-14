import { U1CatalogTable } from "@/components/mqchain/u1-catalog-table";

export default function AssetsPage() {
  return <U1CatalogTable title="Assets" description="MQASSET identities remain logically separate from MQCHAIN address labels." file="assets.csv" columns={[
    { key: "asset_id", label: "ID", mono: true }, { key: "asset_code", label: "Code", mono: true }, { key: "asset_name", label: "Asset" },
    { key: "symbol", label: "Symbol", mono: true }, { key: "asset_type", label: "Type" }, { key: "is_active", label: "Active" },
    { key: "source_id", label: "Source", mono: true }, { key: "verified_at", label: "Verified", mono: true },
  ]} />;
}
