import { DbError } from "@/components/mqchain/db-error";
import { CreateKeyPrefixForm, DeactivateKeyPrefixForm } from "@/components/mqchain/dictionary-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function KeyPrefixesPage() {
  try {
    const { prefixes } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create key prefix</CardTitle></CardHeader>
          <CardContent>
            <CreateKeyPrefixForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Key prefixes</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Prefix</TableHead><TableHead>Chain</TableHead><TableHead>Family</TableHead><TableHead>Codec</TableHead><TableHead>Length</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {prefixes.map((prefix) => <TableRow key={prefix.prefixCode}><TableCell className="font-mono">0x{prefix.prefixCode.toString(16).padStart(4, "0")}</TableCell><TableCell>{prefix.chainCode}</TableCell><TableCell>{prefix.addressFamily}</TableCell><TableCell>{prefix.codec}</TableCell><TableCell className="font-mono">{prefix.payloadLen ?? "var"}</TableCell><TableCell>{String(prefix.isActive)}</TableCell><TableCell className="text-right"><DeactivateKeyPrefixForm id={prefix.prefixCode} disabled={!prefix.isActive} /></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
