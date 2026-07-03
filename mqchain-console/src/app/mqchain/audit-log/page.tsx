import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditTimeline } from "@/lib/mqchain/services/audit-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/audit-log?${query}` : "/mqchain/audit-log";
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const timeline = await listAuditTimeline(params);
    const auditRows = timeline.auditRows;
    const events = timeline.approvalEvents;

    return (
      <>
        <div><h1 className="text-2xl font-semibold">Audit log</h1><p className="text-sm text-muted-foreground">Unified control-plane timeline for approval decisions, registry edits, dictionary changes, settings mutations, discovery jobs, and KV manifests.</p></div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="q" placeholder="Search event text" defaultValue={params.q ?? ""} />
              <select
                name="source"
                defaultValue={params.source ?? "all"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All sources</option>
                <option value="approval">Approval only</option>
                <option value="system">System only</option>
              </select>
              <Input name="action" placeholder="Action" defaultValue={params.action ?? ""} />
              <Input name="actor" placeholder="Actor email/name" defaultValue={params.actor ?? ""} />
              <Input name="target" placeholder="Target table or ID" defaultValue={params.target ?? ""} />
              <select
                name="pageSize"
                defaultValue={params.pageSize ?? "50"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
              <div className="flex gap-2">
                <Button type="submit">Search</Button>
                <Button asChild type="button" variant="outline">
                  <Link href="/mqchain/audit-log">Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Unified timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {timeline.total} events | {timeline.approvalTotal} approval | {timeline.systemTotal} system | page {timeline.page} of {timeline.totalPages}
              </span>
              <div className="flex gap-2">
                {timeline.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, timeline.page - 1)}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {timeline.page < timeline.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, timeline.page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Source</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>
              {timeline.rows.map((row) => <TableRow key={row.key}><TableCell className="font-mono text-xs">{row.createdAt.toISOString()}</TableCell><TableCell><StatusBadge status={row.source} /></TableCell><TableCell>{row.action}</TableCell><TableCell className="font-mono text-xs">{row.target}</TableCell><TableCell className="max-w-48 truncate text-xs">{row.actor}</TableCell><TableCell className="max-w-md truncate text-xs">{row.reason}</TableCell></TableRow>)}
              {!timeline.rows.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No audit events match these filters.</TableCell></TableRow> : null}
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>System audit events</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Payload</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
              {auditRows.map((row) => <TableRow key={row.id}><TableCell className="font-mono">{row.id}</TableCell><TableCell>{row.action}</TableCell><TableCell className="font-mono text-xs">{row.targetTable}:{row.targetId}</TableCell><TableCell className="max-w-md truncate text-xs">{JSON.stringify(row.payload)}</TableCell><TableCell className="font-mono text-xs">{row.createdAt.toISOString()}</TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Approval events</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Action</TableHead><TableHead>Candidate</TableHead><TableHead>Batch</TableHead><TableHead>Reason</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
              {events.map((event) => <TableRow key={event.id}><TableCell className="font-mono">{event.id}</TableCell><TableCell>{event.action}</TableCell><TableCell className="font-mono">{event.candidateId ?? "-"}</TableCell><TableCell className="font-mono">{event.batchId ?? "-"}</TableCell><TableCell>{event.reason}</TableCell><TableCell className="font-mono text-xs">{event.createdAt.toISOString()}</TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
