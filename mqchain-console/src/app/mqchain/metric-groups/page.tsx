import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { AddMetricGroupRuleForm, CreateMetricGroupForm, DeactivateMetricGroupForm } from "@/components/mqchain/metric-group-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMetricGroups, previewMetricGroupMembers } from "@/lib/mqchain/services/metric-group-service";

export default async function MetricGroupsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const groups = await listMetricGroups();
    const focusedRegistryId = params.registry ? Number(params.registry) : null;
    const preview = params.preview ? await previewMetricGroupMembers(Number(params.preview), focusedRegistryId) : null;

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Metric groups</h1>
          <p className="text-sm text-muted-foreground">Countable universes for CEX flow, reserve, protocol graph, and future metrics.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create metric group</CardTitle>
            <CardDescription>Define the countable universe that resolver and metrics code can test against.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateMetricGroupForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Definitions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Chain</TableHead><TableHead>Min confidence</TableHead><TableHead>Metric eligible</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-mono">{group.metricGroupCode}</TableCell>
                    <TableCell>{group.chainCode}</TableCell>
                    <TableCell className="font-mono">{group.minConfidence}</TableCell>
                    <TableCell>{group.requireMetricEligible ? "required" : "not required"}</TableCell>
                    <TableCell>{String(group.isActive)}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={`/mqchain/metric-groups?preview=${group.id}`}>Preview</Link></Button>
                      <DeactivateMetricGroupForm id={group.id} disabled={!group.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
                {!groups.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No metric groups have been created yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {groups.length ? (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Add metric group rule</CardTitle>
              <CardDescription>Append another include/exclude rule without replacing historical rules.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddMetricGroupRuleForm groups={groups} />
            </CardContent>
          </Card>
        ) : null}
        {preview ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>{preview.group.metricGroupName} members</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">Rows</span><div className="font-mono text-lg">{preview.manifest.rowCount}</div></div>
                <div><span className="text-muted-foreground">Rules</span><div className="font-mono text-lg">{preview.manifest.ruleCount}</div></div>
                <div><span className="text-muted-foreground">Chain scope</span><div className="font-mono text-lg">{preview.manifest.chainCode ?? "all"}</div></div>
                <div><span className="text-muted-foreground">Artifact</span><div className="font-mono text-xs">{preview.manifest.artifactStatus}</div></div>
              </div>
              {preview.focusedRegistryId ? (
                <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="text-muted-foreground">Focused registry row</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <Link className="font-mono text-primary hover:underline" href={`/mqchain/registry/${preview.focusedRegistryId}`}>
                      #{preview.focusedRegistryId}
                    </Link>
                    <span>{preview.focusedMember ? "Included in this metric group preview." : "Not included in this metric group preview."}</span>
                    {preview.focusedMember ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {preview.focusedMember.registry.chainCode}:{preview.focusedMember.registry.normalizedAddress}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <Table>
                <TableHeader><TableRow><TableHead>Address</TableHead><TableHead>Chain</TableHead><TableHead>Entity</TableHead><TableHead>Role</TableHead><TableHead>Confidence</TableHead><TableHead>Flags</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.members.map((member) => (
                    <TableRow key={member.registry.id} className={member.registry.id === preview.focusedRegistryId ? "bg-primary/10" : undefined}>
                      <TableCell className="max-w-96 truncate font-mono text-xs">{member.registry.normalizedAddress}</TableCell>
                      <TableCell className="font-mono">{member.registry.chainCode}</TableCell>
                      <TableCell>{member.entity?.entityName}</TableCell>
                      <TableCell>{member.role?.roleCode}</TableCell>
                      <TableCell className="font-mono">{member.registry.confidenceScore}</TableCell>
                      <TableCell className="min-w-48"><FlagBadges flags={member.registry.flags} showValue={false} showEmpty={false} compact /></TableCell>
                    </TableRow>
                  ))}
                  {!preview.members.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No approved registry rows match this metric group yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-primary">Compile preview manifest</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(preview.manifest, null, 2)}</pre>
              </details>
            </CardContent>
          </Card>
        ) : null}
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
