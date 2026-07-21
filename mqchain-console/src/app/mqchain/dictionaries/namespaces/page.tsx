import { RuntimeDictionaryTable } from "@/components/mqchain/runtime-dictionary-table";
import { getRuntimeDictionaryDashboard } from "@/lib/mqchain/origin-client/client";

export default async function NamespacesPage() {
  const data = await getRuntimeDictionaryDashboard();
  return <RuntimeDictionaryTable title="Address namespaces" description="Canonical network and identifier profiles selected before codec execution." dictionaryVersion={data.dictionaryVersion} rows={data.namespaces} columns={[
    { key: "id", label: "ID", mono: true }, { key: "namespaceCode", label: "Code", mono: true }, { key: "namespaceName", label: "Namespace" },
    { key: "chainNetworkId", label: "Network", mono: true }, { key: "addressCodecId", label: "Codec", mono: true }, { key: "addressType", label: "Identifier" },
    { key: "legacyPrefixCode", label: "Legacy prefix", mono: true }, { key: "isActive", label: "Active" }, { key: "updatedAt", label: "Updated", mono: true },
  ]} />;
}
