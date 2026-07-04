import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import {
  AddMetricGroupRuleForm,
  CreateMetricGroupForm,
  CreateMetricGroupKvManifestForm,
  DeactivateMetricGroupForm,
} from "@/components/mqchain/metric-group-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { metricGroupRuleSections } from "@/lib/mqchain/metric-rules";
import { listMetricGroups, previewMetricGroupMembers } from "@/lib/mqchain/services/metric-group-service";
import type { MetricGroupRule } from "@/lib/mqchain/types";

function metricGroupHref(params: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `/mqchain/metric-groups?${query}` : "/mqchain/metric-groups";
}

function RuleSectionBadges({ rule }: { rule: MetricGroupRule }) {
  return (
    <div className="grid gap-1.5">
      {metricGroupRuleSections(rule).map((section) => (
        <div key={section.key} className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-24 text-xs text-muted-foreground">{section.label}</span>
          {section.values.map((value) => (
            <span
              key={`${section.key}:${value}`}
              className={[
                "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                section.intent === "include" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "",
                section.intent === "exclude" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "",
                section.intent === "policy" ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "",
              ].join(" ")}
            >
              {value}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function MetricGroupRuleInventory({ group }: { group: Awaited<ReturnType<typeof listMetricGroups>>["rows"][number] }) {
  if (!group.rules.length) {
    return <span className="text-sm text-muted-foreground">No rules attached</span>;
  }

  return (
    <div className="grid max-w-3xl gap-2">
      <div className="font-mono text-xs text-muted-foreground">{group.rules.length} rule{group.rules.length === 1 ? "" : "s"}</div>
      {group.rules.map((rule) => {
        const ruleJson = rule.ruleJson as MetricGroupRule;

        return (
          <details key={rule.id} className="rounded-md border bg-muted/20 p-2">
            <summary className="cursor-pointer font-mono text-xs text-primary">
              rule #{rule.id} | {rule.createdAt.toISOString()}
            </summary>
            <div className="mt-2 grid gap-2">
              <RuleSectionBadges rule={ruleJson} />
              <pre className="max-h-56 overflow-auto rounded-md bg-background p-2 text-xs">{JSON.stringify(ruleJson, null, 2)}</pre>
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default async function MetricGroupsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const result = await listMetricGroups(params);
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
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find metric universes by code, chain, active state, and eligibility policy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Code, name, description, ID" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="btc, ethereum..." defaultValue={params.chain ?? ""} />
              <Input name="minConfidence" type="number" min="0" max="100" placeholder="Min confidence" defaultValue={params.minConfidence ?? ""} />
              <Input name="maxConfidence" type="number" min="0" max="100" placeholder="Max confidence" defaultValue={params.maxConfidence ?? ""} />
              <select
                name="active"
                defaultValue={params.active ?? "active"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All states</option>
              </select>
              <select
                name="metricEligible"
                defaultValue={params.metricEligible ?? ""}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Any eligibility rule</option>
                <option value="true">Requires metric eligible</option>
                <option value="false">Does not require eligible flag</option>
              </select>
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
                <option value="code">Code</option>
                <option value="confidence">Min confidence</option>
              </select>
              <select
                name="pageSize"
                defaultValue={params.pageSize ?? "50"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 groups</option>
                <option value="50">50 groups</option>
                <option value="100">100 groups</option>
              </select>
              <Button type="submit">Search</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/mqchain/metric-groups">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Definitions</CardTitle>
            <CardDescription>{result.total} metric groups match these filters.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Page {result.page} of {result.totalPages}
              </span>
              <div className="flex gap-2">
                {result.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={metricGroupHref(params, { page: String(result.page - 1) })}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {result.page < result.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={metricGroupHref(params, { page: String(result.page + 1) })}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Min confidence</TableHead>
                  <TableHead>Metric eligible</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-mono">{group.metricGroupCode}</TableCell>
                    <TableCell><MetricGroupRuleInventory group={group} /></TableCell>
                    <TableCell>{group.chainCode ?? "all"}</TableCell>
                    <TableCell className="font-mono">{group.minConfidence}</TableCell>
                    <TableCell>{group.requireMetricEligible ? "required" : "not required"}</TableCell>
                    <TableCell>{String(group.isActive)}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={metricGroupHref(params, { preview: String(group.id) })}>Preview</Link>
                      </Button>
                      <DeactivateMetricGroupForm id={group.id} disabled={!group.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No metric groups match these filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {result.rows.length ? (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Add metric group rule</CardTitle>
              <CardDescription>Append another include/exclude rule without replacing historical rules.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddMetricGroupRuleForm groups={result.rows} />
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
                <div><span className="text-muted-foreground">Compile status</span><div className="font-mono text-xs">{preview.kvManifest.artifactStatus}</div></div>
              </div>
              <div className="mb-4 grid gap-3 text-sm md:grid-cols-6">
                <div><span className="text-muted-foreground">Evaluated</span><div className="font-mono">{preview.diagnostics.evaluatedRows}</div></div>
                <div><span className="text-muted-foreground">Members</span><div className="font-mono">{preview.diagnostics.memberRows}</div></div>
                <div><span className="text-muted-foreground">Inactive</span><div className="font-mono">{preview.diagnostics.excludedInactive}</div></div>
                <div><span className="text-muted-foreground">Wrong chain</span><div className="font-mono">{preview.diagnostics.excludedOutOfChainScope}</div></div>
                <div><span className="text-muted-foreground">Not metric eligible</span><div className="font-mono">{preview.diagnostics.excludedMetricIneligible}</div></div>
                <div><span className="text-muted-foreground">Rule mismatch</span><div className="font-mono">{preview.diagnostics.excludedRuleMismatch}</div></div>
              </div>
              <div className="mb-4 rounded-md border bg-muted/30 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="text-sm font-medium">External KV compile handoff</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Register this member universe as a pending KV/RocksDB compile task, or export the current preview page for a metrics worker.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/api/mqchain/metric-groups/${encodeURIComponent(preview.group.metricGroupCode)}/members?format=csv&pageSize=1000`}>
                        Export CSV
                      </Link>
                    </Button>
                    <CreateMetricGroupKvManifestForm
                      rowCount={preview.kvManifest.rowCount}
                      manifestJson={JSON.stringify(preview.kvManifest)}
                    />
                  </div>
                </div>
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
                <summary className="cursor-pointer text-sm text-primary">Preview and KV handoff manifests</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(preview.manifest, null, 2)}</pre>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(preview.kvManifest, null, 2)}</pre>
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
