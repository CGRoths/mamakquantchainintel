import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditLog, listAuditTimeline } from "@/lib/mqchain/services/audit-service";
import { listApprovalEvents } from "@/lib/mqchain/services/approval-service";

export default async function AuditLogPage() {
  try {
    const [timeline, events, auditRows] = await Promise.all([listAuditTimeline(200), listApprovalEvents(200), listAuditLog(200)]);
    return (
      <>
        <div><h1 className="text-2xl font-semibold">Audit log</h1><p className="text-sm text-muted-foreground">Unified control-plane timeline for approval decisions, registry edits, dictionary changes, settings mutations, discovery jobs, and KV manifests.</p></div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Unified timeline</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Source</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>
              {timeline.map((row) => <TableRow key={row.key}><TableCell className="font-mono text-xs">{row.createdAt.toISOString()}</TableCell><TableCell><StatusBadge status={row.source} /></TableCell><TableCell>{row.action}</TableCell><TableCell className="font-mono text-xs">{row.target}</TableCell><TableCell className="max-w-48 truncate text-xs">{row.actor}</TableCell><TableCell className="max-w-md truncate text-xs">{row.reason}</TableCell></TableRow>)}
              {!timeline.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No audit events recorded yet.</TableCell></TableRow> : null}
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
