import Link from "next/link";

import { createDiscoveryJobResultAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { DiscoveryJobForm } from "@/components/mqchain/discovery-job-form";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDiscoveryJobs } from "@/lib/mqchain/services/discovery-service";

export default async function DiscoveryJobsPage() {
  try {
    const jobs = await listDiscoveryJobs();
    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Discovery jobs</h1>
          <p className="text-sm text-muted-foreground">Discovery creates candidates and evidence only. It never commits labels.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create discovery job</CardTitle>
            <CardDescription>Factory, registry, proxy, pool, vault, tx graph, or LLM evidence reviewer stubs.</CardDescription>
          </CardHeader>
          <CardContent>
            <DiscoveryJobForm action={createDiscoveryJobResultAction} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Type</TableHead><TableHead>Seed</TableHead><TableHead>Status</TableHead><TableHead>Candidates</TableHead></TableRow></TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono">{job.id}</TableCell>
                    <TableCell><Link className="text-primary hover:underline" href={`/mqchain/discovery/jobs/${job.id}`}>{job.discoveryType}</Link></TableCell>
                    <TableCell className="font-mono text-xs">{job.seedAddress ?? "-"}</TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell className="font-mono">{job.candidatesCreated}</TableCell>
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
