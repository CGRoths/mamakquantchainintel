import { U1CatalogTable } from "@/components/mqchain/u1-catalog-table";

export default function NetworksPage() {
  return <U1CatalogTable title="Chain networks" description="Explicit network identities; catalog presence does not imply production support." file="chain_networks.csv" columns={[
    { key: "chain_network_id", label: "ID", mono: true }, { key: "network_code", label: "Code", mono: true }, { key: "network_name", label: "Network" },
    { key: "chain_family", label: "Family" }, { key: "environment", label: "Environment" }, { key: "caip2", label: "CAIP-2", mono: true },
    { key: "evm_chain_id", label: "EVM ID", mono: true }, { key: "is_active", label: "Active" }, { key: "verified_at", label: "Verified", mono: true },
  ]} />;
}
