import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildResolverLookupSummary } from "@/lib/mqchain/resolver-detail";
import { classifyCexTransactionFlow, parseTransactionAddressSet } from "@/lib/mqchain/services/cex-flow-service";
import { getAddressResolver } from "@/lib/mqchain/services/resolver-service";
import { resolverSchema, transactionFlowSchema } from "@/lib/mqchain/validators/registry";

function SummaryMap({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  if (!entries.length) return <span>-</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([label, count]) => (
        <span key={label} className="rounded-md border px-2 py-1 font-mono text-xs">
          {label}:{count}
        </span>
      ))}
    </div>
  );
}

function formatResolverOutcome(value: string) {
  return value.replace(/_/g, " ");
}

export default async function ResolverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const hasQuery = Boolean(params.address && params.chainCode);
  const hasTxQuery = Boolean(params.inputAddresses && params.outputAddresses && params.txChainCode);

  try {
    const resolverInput = hasQuery
      ? resolverSchema.parse({
        chainCode: params.chainCode,
        address: params.address,
        blockNumber: params.blockNumber ?? "",
        metricGroupCode: params.metricGroupCode,
      })
      : null;
    const txInput = hasTxQuery
      ? transactionFlowSchema.parse({
        txChainCode: params.txChainCode,
        inputAddresses: params.inputAddresses,
        outputAddresses: params.outputAddresses,
        txBlockNumber: params.txBlockNumber ?? "",
        txMetricGroupCode: params.txMetricGroupCode || "btc_cex_flow_boundary",
      })
      : null;

    const resolver = getAddressResolver();
    const resolverBlockNumber = typeof resolverInput?.blockNumber === "number" ? resolverInput.blockNumber : null;
    const result = resolverInput
      ? resolverInput.metricGroupCode
        ? await resolver.checkMetricGroup(resolverInput.chainCode, resolverInput.address, resolverInput.metricGroupCode, resolverBlockNumber)
        : await resolver.resolveAt(resolverInput.chainCode, resolverInput.address, resolverBlockNumber)
      : null;
    const lookupSummary = result
      ? buildResolverLookupSummary({
        isValid: result.normalized.isValid,
        hasLabel: Boolean(result.label),
        blockNumber: result.blockNumber,
        labelStatus: result.label?.status ?? null,
        labelRegistryId: result.label?.registry.id ?? null,
        currentRegistryId: result.currentLabel?.registry.id ?? null,
        metricGroupCode: result.metricGroupCode,
        metricGroupMatch: result.metricGroupMatch,
      })
      : null;

    const txBlockNumber = typeof txInput?.txBlockNumber === "number" ? txInput.txBlockNumber : null;
    const txResult = txInput
      ? await classifyCexTransactionFlow({
        chainCode: txInput.txChainCode,
        inputAddresses: parseTransactionAddressSet(txInput.inputAddresses),
        outputAddresses: parseTransactionAddressSet(txInput.outputAddresses),
        blockNumber: txBlockNumber,
        metricGroupCode: txInput.txMetricGroupCode,
      }, resolver)
      : null;

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Resolver test</h1>
          <p className="text-sm text-muted-foreground">Postgres-backed resolver now, RocksDB-backed resolver later behind the same interface.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Lookup</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5">
              <div className="grid gap-2">
                <Label>Chain</Label>
                <Input name="chainCode" placeholder="btc" defaultValue={params.chainCode ?? ""} required />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Address</Label>
                <Input name="address" placeholder="Paste address" defaultValue={params.address ?? ""} required />
              </div>
              <div className="grid gap-2">
                <Label>Block</Label>
                <Input name="blockNumber" placeholder="optional" defaultValue={params.blockNumber ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label>Metric group</Label>
                <Input name="metricGroupCode" placeholder="btc_cex_flow_boundary" defaultValue={params.metricGroupCode ?? ""} />
              </div>
              <Button type="submit" className="md:col-span-5">Resolve</Button>
            </form>
          </CardContent>
        </Card>
        {result ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {lookupSummary ? (
              <Card className="rounded-lg xl:col-span-2">
                <CardHeader><CardTitle>Lookup summary</CardTitle></CardHeader>
                <CardContent className="grid gap-3 text-sm md:grid-cols-4">
                  <div><span className="text-muted-foreground">Mode</span><div className="font-mono">{formatResolverOutcome(lookupSummary.mode)}</div></div>
                  <div><span className="text-muted-foreground">Outcome</span><div className="font-mono">{formatResolverOutcome(lookupSummary.outcome)}</div></div>
                  <div><span className="text-muted-foreground">Timeline differs from current</span><div>{String(lookupSummary.timelineDiverged)}</div></div>
                  <div><span className="text-muted-foreground">Metric group</span><div className="font-mono">{formatResolverOutcome(lookupSummary.metricGroupOutcome)}</div></div>
                </CardContent>
              </Card>
            ) : null}
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Normalized key</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div><span className="text-muted-foreground">Valid</span><div>{String(result.normalized.isValid)}</div></div>
                <div><span className="text-muted-foreground">Normalized</span><div className="break-all font-mono">{result.normalized.normalizedAddress}</div></div>
                <div><span className="text-muted-foreground">Prefix</span><div className="font-mono">{result.normalized.prefixCode}</div></div>
                <div><span className="text-muted-foreground">Payload</span><div className="break-all font-mono">{result.normalized.payloadHex}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Label output</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {result.label ? (
                  <>
                    <div><span className="text-muted-foreground">Registry row</span><div className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/registry/${result.label.registry.id}`}>{result.label.registry.id}</Link></div></div>
                    <div><span className="text-muted-foreground">Entity</span><div>{result.label.entity?.entityName}</div></div>
                    <div><span className="text-muted-foreground">Protocol</span><div>{result.label.protocol?.protocolName ?? "-"}</div></div>
                    <div><span className="text-muted-foreground">Role</span><div>{result.label.role?.roleCode}</div></div>
                    <div><span className="text-muted-foreground">Category</span><div>{result.label.category?.categoryCode}</div></div>
                    <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={result.label.status} /></div></div>
                    <div><span className="text-muted-foreground">Quality tier</span><div className="font-mono">{result.label.registry.qualityTier}</div></div>
                    <div><span className="text-muted-foreground">Confidence</span><div className="font-mono">{result.label.registry.confidenceScore}</div></div>
                    <div className="md:col-span-2"><span className="text-muted-foreground">Flags</span><div className="mt-1"><FlagBadges flags={result.label.registry.flags} /></div></div>
                    <div><span className="text-muted-foreground">Metric eligible</span><div>{String(result.label.metricEligible)}</div></div>
                    <div><span className="text-muted-foreground">Metric group match</span><div>{result.metricGroupMatch === null ? "-" : String(result.metricGroupMatch)}</div></div>
                    <div><span className="text-muted-foreground">Source batch</span><div className="font-mono">{result.label.sourceBatch ? <Link className="text-primary hover:underline" href={`/mqchain/batches/${result.label.sourceBatch.id}`}>{result.label.sourceBatch.id}</Link> : "-"}</div></div>
                    <div><span className="text-muted-foreground">Timeline</span><div className="font-mono">{result.label.registry.validFromBlock ?? "*"} / {result.label.registry.validToBlock ?? "*"}</div></div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No registry label found.</div>
                )}
              </CardContent>
            </Card>
            {result.label ? (
              <Card className="rounded-lg">
                <CardHeader><CardTitle>Evidence summary</CardTitle></CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div><span className="text-muted-foreground">Evidence rows</span><div className="font-mono">{result.label.evidenceSummary.count}</div></div>
                  <div><span className="text-muted-foreground">Net confidence delta</span><div className="font-mono">{result.label.evidenceSummary.netConfidenceDelta}</div></div>
                  <div><span className="text-muted-foreground">By type</span><SummaryMap values={result.label.evidenceSummary.byType} /></div>
                  <div><span className="text-muted-foreground">By trust</span><SummaryMap values={result.label.evidenceSummary.byTrust} /></div>
                  <div className="grid gap-2">
                    <span className="text-muted-foreground">Recent evidence</span>
                    {result.label.evidence.slice(0, 5).map((evidence) => (
                      <div key={evidence.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="font-mono">{evidence.evidenceType}</span>
                          <span>{evidence.trustTier}</span>
                          <span className="font-mono">delta {evidence.confidenceDelta}</span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{evidence.summary ?? "-"}</div>
                      </div>
                    ))}
                    {!result.label.evidence.length ? <span className="text-muted-foreground">No evidence linked to this registry row.</span> : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {result.blockNumber !== undefined && result.blockNumber !== null && result.currentLabel && result.currentLabel.registry.id !== result.label?.registry.id ? (
              <Card className="rounded-lg">
                <CardHeader><CardTitle>Current label</CardTitle></CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div><span className="text-muted-foreground">Registry row</span><div className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/registry/${result.currentLabel.registry.id}`}>{result.currentLabel.registry.id}</Link></div></div>
                  <div><span className="text-muted-foreground">Entity</span><div>{result.currentLabel.entity?.entityName ?? "-"}</div></div>
                  <div><span className="text-muted-foreground">Role</span><div>{result.currentLabel.role?.roleCode ?? "-"}</div></div>
                  <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={result.currentLabel.status} /></div></div>
                  <div><span className="text-muted-foreground">Timeline</span><div className="font-mono">{result.currentLabel.registry.validFromBlock ?? "*"} / {result.currentLabel.registry.validToBlock ?? "*"}</div></div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader><CardTitle>BTC CEX flow classifier</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-2">
                <Label>Chain</Label>
                <Input name="txChainCode" placeholder="btc" defaultValue={params.txChainCode ?? "btc"} required />
              </div>
              <div className="grid gap-2">
                <Label>Block</Label>
                <Input name="txBlockNumber" placeholder="optional" defaultValue={params.txBlockNumber ?? ""} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Metric group</Label>
                <Input name="txMetricGroupCode" defaultValue={params.txMetricGroupCode ?? "btc_cex_flow_boundary"} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Input addresses</Label>
                <Textarea name="inputAddresses" rows={7} placeholder="One input address per line" defaultValue={params.inputAddresses ?? ""} required />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Output addresses</Label>
                <Textarea name="outputAddresses" rows={7} placeholder="One output address per line" defaultValue={params.outputAddresses ?? ""} required />
              </div>
              <Button type="submit" className="md:col-span-4">Classify transaction</Button>
            </form>
          </CardContent>
        </Card>
        {txResult ? (
          <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Classification</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div><span className="text-muted-foreground">Flow</span><div className="font-mono text-lg">{txResult.classification}</div></div>
                <div><span className="text-muted-foreground">Metric group</span><div className="font-mono">{txResult.metricGroupCode}</div></div>
                <div><span className="text-muted-foreground">Block</span><div className="font-mono">{txResult.blockNumber ?? "-"}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Resolved sides</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {[
                  ["Inputs", txResult.inputs],
                  ["Outputs", txResult.outputs],
                ].map(([title, labels]) => (
                  <div key={title as string} className="grid gap-2">
                    <div className="text-sm font-medium">{title as string}</div>
                    {(labels as typeof txResult.inputs).map((label) => (
                      <div key={`${title}-${label.address}`} className="rounded-md border p-3 text-xs">
                        <div className="break-all font-mono">{label.normalizedAddress ?? label.address}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <span className="text-muted-foreground">Matched</span><span>{String(label.matched)}</span>
                          <span className="text-muted-foreground">Entity</span><span>{label.entityName ?? "-"}</span>
                          <span className="text-muted-foreground">Role</span><span>{label.roleCode ?? "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
