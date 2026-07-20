"use client";

import { Database, Download, FileSearch, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { ResearchIntakeCreatedDto, ResearchPreflightReportDto, ResearchRowStatus } from "@/lib/mqchain/contracts/research-intake";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const FILTERS = ["all", "resolved", "unresolved", "invalid", "duplicate", "pending_role", "pending_alias", "pending_codec", "source_provenance_missing"] as const;
type Filter = (typeof FILTERS)[number];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isUnresolved(status: ResearchRowStatus) {
  return status.startsWith("pending_") || status === "unsupported_identifier_kind" || status === "review_required";
}

function isInvalid(status: ResearchRowStatus) {
  return ["invalid", "invalid_address", "dictionary_version_mismatch", "source_provenance_missing"].includes(status);
}

export function ResearchIntakeWorkflow() {
  const router = useRouter();
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [report, setReport] = useState<ResearchPreflightReportDto | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<"preflight" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const records = useMemo(() => report?.records.filter(record => {
    if (filter === "all") return true;
    if (filter === "unresolved") return isUnresolved(record.status);
    if (filter === "invalid") return isInvalid(record.status);
    return record.status === filter;
  }) ?? [], [filter, report]);

  async function parseResponse(response: Response) {
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function runPreflight() {
    setPending("preflight");
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/mqchain/intake/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceType: "llm_cleaned_csv", sourceName, sourceUrl, localFileName: fileName, csvText, csvInputMode: fileName ? "file_upload" : "pasted_text" }),
      });
      setReport(await parseResponse(response) as ResearchPreflightReportDto);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preflight failed.");
    } finally {
      setPending(null);
    }
  }

  async function createSourceJob() {
    if (!report) return;
    setPending("create");
    setError(null);
    try {
      const response = await fetch("/api/mqchain/intake/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceType: "llm_cleaned_csv", sourceName, sourceUrl, localFileName: fileName, csvText, expectedDictionaryVersion: report.dictionaryVersion, preflightHash: report.preflightHash, csvInputMode: fileName ? "file_upload" : "pasted_text" }),
      });
      const created = await parseResponse(response) as ResearchIntakeCreatedDto;
      router.push(`/mqchain/source-jobs/${created.sourceJobId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Source-job creation failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-5 border-y py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Research CSV intake</h2>
          <p className="text-sm text-muted-foreground">Preflight and stage provenance-backed address research.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">1 Preflight</Badge>
          <Badge variant={report ? "default" : "outline"}>2 Create source job</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="research-source-name">Source name</Label><Input id="research-source-name" value={sourceName} onChange={event => setSourceName(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="research-source-url">Source URL</Label><Input id="research-source-url" type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="research-file">CSV file</Label>
        <Input id="research-file" type="file" accept=".csv,text/csv" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          setCsvText(await file.text());
          setReport(null);
        }} />
      </div>
      <div className="space-y-2"><Label htmlFor="research-csv">CSV</Label><Textarea id="research-csv" className="min-h-48 font-mono text-xs" value={csvText} onChange={event => { setCsvText(event.target.value); setReport(null); }} /></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runPreflight} disabled={pending !== null || !sourceName.trim() || !csvText.trim()}>
          {pending === "preflight" ? <Loader2 className="animate-spin" /> : <FileSearch />} Preflight
        </Button>
        <Button type="button" variant="destructive" onClick={createSourceJob} disabled={pending !== null || !report?.canCreateSourceJob}>
          {pending === "create" ? <Loader2 className="animate-spin" /> : <Database />} Create source job
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {report ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Total", report.counts.totalRows], ["Resolved", report.counts.resolvedRows], ["Unresolved", report.counts.unresolvedRows],
              ["Invalid", report.counts.invalidRows], ["Duplicates", report.counts.duplicates],
            ].map(([label, value]) => <div className="border-l-2 pl-3" key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div>)}
          </div>
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div><span className="text-muted-foreground">File</span><div>{fileName || "pasted.csv"}</div></div>
            <div><span className="text-muted-foreground">Schema</span><div className="font-mono">{report.csvSchemaVersion}</div></div>
            <div><span className="text-muted-foreground">Dictionary</span><div className="truncate font-mono">{report.dictionaryVersion}</div></div>
            <div><span className="text-muted-foreground">Chains</span><div>{report.chains.join(", ") || "-"}</div></div>
            <div><span className="text-muted-foreground">Entities / roles</span><div>{[...report.entities, ...report.roles].join(", ") || "-"}</div></div>
            <div><span className="text-muted-foreground">Sheets / URLs</span><div>{report.sourceSheets.length} / {report.sourceUrls.length}</div></div>
          </div>
          {report.blockers.length ? <div className="border-l-2 border-destructive pl-3 text-sm text-destructive">{report.blockers.join(", ")}</div> : null}
          {report.warnings.length ? <div className="border-l-2 border-amber-500 pl-3 text-sm">{report.warnings.join(", ")}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => download("mqchain-normalized.csv", report.normalizedCsv, "text/csv")}><Download /> Normalized CSV</Button>
            <Button variant="outline" size="sm" onClick={() => download("mqchain-unresolved.csv", report.unresolvedCsv, "text/csv")}><Download /> Unresolved/proposal CSV</Button>
            <Button variant="outline" size="sm" onClick={() => download("mqchain-preflight.json", JSON.stringify(report, null, 2), "application/json")}><Download /> Preflight JSON</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(value => <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>{value.replaceAll("_", " ")}</Button>)}
          </div>
          <div className="overflow-x-auto border-y">
            <Table>
              <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Status</TableHead><TableHead>Chain</TableHead><TableHead>Address</TableHead><TableHead>Entity</TableHead><TableHead>Role</TableHead><TableHead>Provenance</TableHead></TableRow></TableHeader>
              <TableBody>{records.map(record => (
                <TableRow key={record.rowNumber}>
                  <TableCell>{record.rowNumber}</TableCell><TableCell><Badge variant="outline">{record.status}</Badge></TableCell>
                  <TableCell>{record.chainCode ?? record.chain}</TableCell><TableCell className="max-w-56 truncate font-mono text-xs">{record.normalizedAddress ?? record.address}</TableCell>
                  <TableCell>{record.entityHint ?? "-"}</TableCell><TableCell>{record.roleHint ?? "-"}</TableCell>
                  <TableCell className="max-w-64 truncate text-xs">{record.sourceSheet ?? record.sourceUrl ?? "missing"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
