import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReviewGroupsWorkspace } from "@/lib/mqchain/services/review-service";

export default async function ReviewGroupsPage() {
  try {
    const workspace = await getReviewGroupsWorkspace();

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Review groups</h1>
            <p className="text-sm text-muted-foreground">Entity, chain, and role groupings for batch-oriented review.</p>
          </div>
          <Button asChild variant="outline"><Link href="/mqchain/review">Review queue</Link></Button>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Candidate groups</CardTitle>
            <CardDescription>{workspace.rows.length} pending candidates across {workspace.groups.length} groups.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Avg confidence</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Candidate IDs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.groups.map((group) => (
                  <TableRow key={group.slug}>
                    <TableCell>
                      <Button asChild variant="link" className="h-auto p-0 text-left">
                        <Link href={`/mqchain/review/groups/${group.slug}`}>
                          <span className="block">{group.entity}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{group.chain} / {group.role}</span>
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono">{group.count}</TableCell>
                    <TableCell className="font-mono">{group.averageConfidence}</TableCell>
                    <TableCell className="font-mono">{group.evidenceCount}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{group.candidateIds.join(", ")}</TableCell>
                  </TableRow>
                ))}
                {!workspace.groups.length ? (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No pending review groups.</TableCell></TableRow>
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
