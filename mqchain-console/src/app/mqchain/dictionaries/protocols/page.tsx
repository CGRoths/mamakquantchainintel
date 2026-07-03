import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateProtocolForm, DeactivateProtocolForm, UpdateProtocolForm } from "@/components/mqchain/dictionary-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function ProtocolsPage() {
  try {
    const { protocols, entities } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create protocol</CardTitle></CardHeader>
          <CardContent>
            <CreateProtocolForm entities={entities} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Protocols</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Chains</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {protocols.map((protocol) => (
                <Fragment key={protocol.id}>
                  <TableRow><TableCell className="font-mono">{protocol.protocolCode}</TableCell><TableCell>{protocol.protocolName}</TableCell><TableCell>{protocol.protocolType}</TableCell><TableCell>{protocol.chainScope?.join(", ")}</TableCell><TableCell>{String(protocol.isActive)}</TableCell><TableCell className="text-right"><DeactivateProtocolForm id={protocol.id} disabled={!protocol.isActive} /></TableCell></TableRow>
                  <TableRow>
                    <TableCell colSpan={6}>
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground">Edit protocol metadata</summary>
                        <div className="pt-3">
                          <UpdateProtocolForm protocol={protocol} entities={entities} />
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
