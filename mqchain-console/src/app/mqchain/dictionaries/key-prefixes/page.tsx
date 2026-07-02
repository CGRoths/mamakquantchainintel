import { createKeyPrefixAction, deactivateKeyPrefixAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function KeyPrefixesPage() {
  try {
    const { prefixes } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create key prefix</CardTitle></CardHeader>
          <CardContent>
            <form action={createKeyPrefixAction} className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-2"><Label>Prefix code</Label><Input name="prefixCode" type="number" placeholder="257" required /></div>
              <Input name="chainCode" placeholder="ethereum" required />
              <Input name="chainName" placeholder="Ethereum" />
              <Input name="chainFamily" placeholder="evm" required />
              <Input name="addressFamily" placeholder="evm20" required />
              <Input name="codec" placeholder="hex" required />
              <Input name="payloadLen" type="number" placeholder="20" />
              <Input name="evmChainId" type="number" placeholder="1" />
              <div className="grid gap-2 md:col-span-4"><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <Button type="submit" className="md:col-span-4">Create prefix</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Key prefixes</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Prefix</TableHead><TableHead>Chain</TableHead><TableHead>Family</TableHead><TableHead>Codec</TableHead><TableHead>Length</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {prefixes.map((prefix) => <TableRow key={prefix.prefixCode}><TableCell className="font-mono">0x{prefix.prefixCode.toString(16).padStart(4, "0")}</TableCell><TableCell>{prefix.chainCode}</TableCell><TableCell>{prefix.addressFamily}</TableCell><TableCell>{prefix.codec}</TableCell><TableCell className="font-mono">{prefix.payloadLen ?? "var"}</TableCell><TableCell>{String(prefix.isActive)}</TableCell><TableCell className="text-right"><form action={deactivateKeyPrefixAction}><input type="hidden" name="id" value={prefix.prefixCode} /><Button size="sm" variant="outline" type="submit" disabled={!prefix.isActive}>Deactivate</Button></form></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
