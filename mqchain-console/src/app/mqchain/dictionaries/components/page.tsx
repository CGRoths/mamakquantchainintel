import { RuntimeDictionaryTable } from "@/components/mqchain/runtime-dictionary-table";
import { getRuntimeDictionaryDashboard } from "@/lib/mqchain/origin-client/client";

export default async function ComponentsPage() {
  const data = await getRuntimeDictionaryDashboard();
  return <RuntimeDictionaryTable title="Protocol components" description="Canonical PostgreSQL protocol components and active aliases." dictionaryVersion={data.dictionaryVersion} rows={data.components} columns={[
    { key: "id", label: "ID", mono: true }, { key: "componentCode", label: "Code", mono: true }, { key: "componentName", label: "Component" },
    { key: "protocolCode", label: "Protocol", mono: true }, { key: "componentType", label: "Type" }, { key: "isActive", label: "Active" },
    { key: "aliases", label: "Aliases" }, { key: "updatedAt", label: "Updated", mono: true },
  ]} />;
}
