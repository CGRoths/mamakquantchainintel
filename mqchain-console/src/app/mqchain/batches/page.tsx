import Link from "next/link";

import { CreateBatchForm } from "@/components/mqchain/batch-forms";
import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listApprovedCandidateIds } from "@/lib/mqchain/services/candidate-service";
import { listBatches } from "@/lib/mqchain/services/batch-service";

export default async function BatchesPage() {
  try {
    const [batches, approvedIds] = await Promise.all([listBatches(), listApprovedCandidateIds()]);

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Label batches</h1>
          <p className="text-sm text-muted-foreground">Batch approval and commit units for auditable registry writes.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create batch</CardTitle>
            <CardDescription>Approved candidate IDs available: {approvedIds.map((row) => row.id).join(", ") || "none"}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateBatchForm approvedCandidateIds={approvedIds.map((row) => row.id)} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Batches</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono">{batch.id}</TableCell>
                    <TableCell><Link className="text-primary hover:underline" href={`/mqchain/batches/${batch.id}`}>{batch.sourceName ?? `Batch ${batch.id}`}</Link></TableCell>
                    <TableCell><StatusBadge status={batch.status} /></TableCell>
                    <TableCell className="font-mono">{batch.acceptedCount}</TableCell>
                    <TableCell className="max-w-80 truncate font-mono text-xs">{batch.batchHash}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
