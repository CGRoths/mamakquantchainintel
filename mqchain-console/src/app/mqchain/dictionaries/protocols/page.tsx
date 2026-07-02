import { createProtocolAction, deactivateProtocolAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function ProtocolsPage() {
  try {
    const { protocols, entities } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create protocol</CardTitle></CardHeader>
          <CardContent>
            <form action={createProtocolAction} className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2"><Label>Entity</Label><select name="entityId" className="h-10 rounded-md border bg-background px-3 text-sm" required>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityName}</option>)}</select></div>
              <div className="grid gap-2"><Label>Code</Label><Input name="protocolCode" placeholder="aave_v4" required /></div>
              <div className="grid gap-2"><Label>Name</Label><Input name="protocolName" placeholder="Aave V4" required /></div>
              <div className="grid gap-2"><Label>Type</Label><Input name="protocolType" placeholder="lending" /></div>
              <div className="grid gap-2 md:col-span-2"><Label>Chains</Label><Input name="chainScope" placeholder="ethereum, base" /></div>
              <div className="grid gap-2 md:col-span-3"><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <Button type="submit" className="md:col-span-3">Create protocol</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Protocols</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Chains</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {protocols.map((protocol) => <TableRow key={protocol.id}><TableCell className="font-mono">{protocol.protocolCode}</TableCell><TableCell>{protocol.protocolName}</TableCell><TableCell>{protocol.protocolType}</TableCell><TableCell>{protocol.chainScope?.join(", ")}</TableCell><TableCell>{String(protocol.isActive)}</TableCell><TableCell className="text-right"><form action={deactivateProtocolAction}><input type="hidden" name="id" value={protocol.id} /><Button size="sm" variant="outline" type="submit" disabled={!protocol.isActive}>Deactivate</Button></form></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
