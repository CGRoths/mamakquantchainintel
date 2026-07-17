export declare function listAuditLog(input?: unknown): Promise<{
    id: number;
    actorId: string | null;
    action: string;
    targetTable: string;
    targetId: string | null;
    payload: Record<string, unknown>;
    createdAt: Date;
}[]>;
export declare function listAuditTimeline(input?: unknown): Promise<{
    rows: import("../../audit").AuditTimelineRow[];
    filters: {
        source: "approval" | "system" | "all";
        page: number;
        pageSize: number;
        q?: string | undefined;
        action?: string | undefined;
        actor?: string | undefined;
        target?: string | undefined;
    };
    total: number;
    approvalTotal: number;
    systemTotal: number;
    page: number;
    pageSize: number;
    totalPages: number;
    approvalEvents: never[] | {
        id: number;
        candidateId: number | null;
        registryId: number | null;
        batchId: number | null;
        action: string;
        actorId: string | null;
        reason: string | null;
        beforeJson: Record<string, unknown> | null;
        afterJson: Record<string, unknown> | null;
        metadata: Record<string, unknown>;
        createdAt: Date;
    }[];
    auditRows: never[] | {
        id: number;
        actorId: string | null;
        action: string;
        targetTable: string;
        targetId: string | null;
        payload: Record<string, unknown>;
        createdAt: Date;
    }[];
}>;
