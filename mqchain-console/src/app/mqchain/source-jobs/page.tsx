import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSourceJobs } from "@/lib/mqchain/services/source-job-service";

export default async function SourceJobsPage() {
  try {
    const jobs = await listSourceJobs();

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Source jobs</h1>
            <p className="text-sm text-muted-foreground">Intake metadata, parser status, archived source documents, and import summaries.</p>
          </div>
          <Button asChild><Link href="/mqchain/intake/new">New intake</Link></Button>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const metadata = job.metadata as Record<string, unknown>;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono">{job.id}</TableCell>
                      <TableCell>
                        <Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${job.id}`}>{job.sourceName ?? "Untitled source"}</Link>
                        <span className="block max-w-96 truncate text-xs text-muted-foreground">{job.sourceUrl ?? job.archiveStorageUri ?? "-"}</span>
                      </TableCell>
                      <TableCell>{job.sourceType}</TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono text-xs">
                        rows {String(metadata.totalRows ?? 0)} / created {String(metadata.candidatesCreated ?? 0)} / invalid {String(metadata.invalidAddresses ?? 0)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{job.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  );
                })}
                {!jobs.length ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No source jobs yet.</TableCell></TableRow>
                ) : null}
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
