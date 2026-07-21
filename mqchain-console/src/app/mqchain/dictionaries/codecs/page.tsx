import { RuntimeDictionaryTable } from "@/components/mqchain/runtime-dictionary-table";
import { getRuntimeDictionaryDashboard } from "@/lib/mqchain/origin-client/client";

export default async function CodecsPage() {
  const data = await getRuntimeDictionaryDashboard();
  return <RuntimeDictionaryTable title="Address codecs" description="Canonical PostgreSQL codec metadata; runtime implementations remain static code." dictionaryVersion={data.dictionaryVersion} rows={data.codecs} columns={[
    { key: "id", label: "ID", mono: true }, { key: "codecCode", label: "Code", mono: true }, { key: "codecName", label: "Codec" },
    { key: "identifierKind", label: "Identifier" }, { key: "payloadRule", label: "Payload" }, { key: "checksumBehavior", label: "Checksum" },
    { key: "normalizerVersion", label: "Normalizer", mono: true }, { key: "status", label: "Status" }, { key: "updatedAt", label: "Updated", mono: true },
  ]} />;
}
