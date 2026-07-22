"use client";

import { useCallback, useState } from "react";

import { BulkApprovalPanel, type BulkApprovalRow } from "@/components/mqchain/bulk-approval-panel";
import { SourceVerificationForm } from "@/components/mqchain/source-job-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SourceJobApprovalCoverageDto } from "@/lib/mqchain/contracts/source-approval-coverage";

export function SourceJobApprovalWorkflow({
  canVerifySource,
  defaultSourceUrl,
  initialCoverage,
  rows,
  sourceJobId,
}: {
  canVerifySource: boolean;
  defaultSourceUrl?: string | null;
  initialCoverage: SourceJobApprovalCoverageDto | null;
  rows: BulkApprovalRow[];
  sourceJobId: number;
}) {
  const [coverage, setCoverage] = useState(initialCoverage);
  const updateCoverage = useCallback((next: SourceJobApprovalCoverageDto) => setCoverage(next), []);

  return (
    <>
      {canVerifySource ? (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Record source verification</CardTitle></CardHeader>
          <CardContent>
            <SourceVerificationForm
              defaultSourceUrl={defaultSourceUrl}
              onApprovalCoverage={updateCoverage}
              returnApprovalCoverage={Boolean(initialCoverage)}
              sourceJobId={sourceJobId}
            />
          </CardContent>
        </Card>
      ) : null}
      {coverage ? (
        <>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Verification coverage and approval</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead>Candidates</TableHead><TableHead>Verification</TableHead><TableHead>Eligible</TableHead><TableHead>Blocked</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>{coverage.sheets.map(sheet => (
                  <TableRow key={sheet.sourceSheet}>
                    <TableCell>{sheet.sourceSheet}</TableCell>
                    <TableCell className="font-mono">{sheet.candidateCount}</TableCell>
                    <TableCell><StatusBadge status={sheet.verification} /></TableCell>
                    <TableCell className="font-mono">{sheet.eligibleCount}</TableCell>
                    <TableCell className="font-mono">{sheet.blockedCount}</TableCell>
                    <TableCell><Button asChild size="sm" variant="outline"><a href="#bulk-approval">Select all below</a></Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
          <div id="bulk-approval">
            <BulkApprovalPanel
              rows={rows}
              selectionGroups={[{
                label: "source job",
                sourceJobId,
                sourceSheet: null,
                candidateCount: coverage.candidateCount,
                eligibleCount: coverage.eligibleCount,
                blockedCount: coverage.blockedCount,
              }, ...coverage.sheets.map(sheet => ({
                label: sheet.sourceSheet,
                sourceJobId,
                sourceSheet: sheet.sourceSheet,
                candidateCount: sheet.candidateCount,
                eligibleCount: sheet.eligibleCount,
                blockedCount: sheet.blockedCount,
              }))]}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
