import { RuntimeDictionaryTable } from "@/components/mqchain/runtime-dictionary-table";
import { getRuntimeDictionaryDashboard } from "@/lib/mqchain/origin-client/client";

export default async function NetworksPage() {
  const data = await getRuntimeDictionaryDashboard();
  return <RuntimeDictionaryTable title="Chain networks" description="Canonical PostgreSQL network identities; catalog presence does not imply runtime readiness." dictionaryVersion={data.dictionaryVersion} rows={data.networks} columns={[
    { key: "id", label: "ID", mono: true }, { key: "networkCode", label: "Code", mono: true }, { key: "networkName", label: "Network" },
    { key: "chainFamily", label: "Family" }, { key: "environment", label: "Environment" }, { key: "caip2", label: "CAIP-2", mono: true },
    { key: "evmChainId", label: "EVM ID", mono: true }, { key: "isActive", label: "Active" }, { key: "updatedAt", label: "Updated", mono: true },
  ]} />;
}
