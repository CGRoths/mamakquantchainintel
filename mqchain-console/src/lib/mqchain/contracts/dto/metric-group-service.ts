export declare function listMetricGroups(input?: unknown): Promise<{
    rows: {
        rules: {
            id: number;
            metricGroupId: number;
            ruleVersion: number;
            ruleJson: Record<string, unknown>;
            status: string;
            sourceId: number | null;
            contentHash: string | null;
            createdAt: Date;
            updatedAt: Date;
            activatedAt: Date | null;
            retiredAt: Date | null;
        }[];
        previewDiagnostics: {
            evaluatedRows: number;
            memberRows: number;
            excludedInactive: number;
            excludedOutOfChainScope: number;
            excludedMetricIneligible: number;
            excludedRuleMismatch: number;
        };
        id: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        namespaceId: number | null;
        minConfidence: number;
        requireMetricEligible: boolean;
        description: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[];
    dictionaryVersion: string;
    filters: {
        active: "active" | "inactive" | "all";
        sort: "created_at" | "updated_at" | "code" | "confidence";
        page: number;
        pageSize: number;
        q?: string | undefined;
        chain?: string | undefined;
        metricEligible?: "false" | "true" | undefined;
        minConfidence?: number | undefined;
        maxConfidence?: number | undefined;
    };
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}>;
export declare function createMetricGroup(input: unknown): Promise<{
    dictionaryVersion: string;
    group: {
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        chainCode: string | null;
        namespaceId: number | null;
        metricGroupCode: string;
        metricGroupName: string;
        minConfidence: number;
        requireMetricEligible: boolean;
    };
    rule: {
        id: number;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        contentHash: string | null;
        sourceId: number | null;
        activatedAt: Date | null;
        metricGroupId: number;
        ruleVersion: number;
        ruleJson: Record<string, unknown>;
        retiredAt: Date | null;
    };
}>;
export declare function addMetricGroupRule(input: unknown): Promise<{
    group: {
        id: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        namespaceId: number | null;
        minConfidence: number;
        requireMetricEligible: boolean;
        description: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    rule: {
        id: number;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        contentHash: string | null;
        sourceId: number | null;
        activatedAt: Date | null;
        metricGroupId: number;
        ruleVersion: number;
        ruleJson: Record<string, unknown>;
        retiredAt: Date | null;
    };
    dictionaryVersion: string;
}>;
export declare function deactivateMetricGroup(input: unknown): Promise<{
    group: {
        id: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        namespaceId: number | null;
        minConfidence: number;
        requireMetricEligible: boolean;
        description: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    dictionaryVersion: string;
}>;
export declare function previewMetricGroupMembers(metricGroupId: number, focusedRegistryId?: number | null): Promise<{
    group: {
        id: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        namespaceId: number | null;
        minConfidence: number;
        requireMetricEligible: boolean;
        description: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    members: import("../../metric-group-preview").MetricGroupPreviewRow[];
    diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
    rules: {
        id: number;
        metricGroupId: number;
        ruleVersion: number;
        ruleJson: Record<string, unknown>;
        status: string;
        sourceId: number | null;
        contentHash: string | null;
        createdAt: Date;
        updatedAt: Date;
        activatedAt: Date | null;
        retiredAt: Date | null;
    }[];
    focusedMember: import("../../metric-group-preview").MetricGroupPreviewRow | null;
    focusedRegistryId: number | null;
    manifest: {
        artifactType: string;
        artifactStatus: string;
        metricGroupId: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        rowCount: number;
        registryIds: number[];
        focusedRegistryId: number | null;
        focusedRegistryIncluded: boolean | null;
        ruleCount: number;
        minConfidence: number;
        requireMetricEligible: boolean;
        diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
        distributions: {
            roles: {
                label: string;
                count: number;
            }[];
            entities: {
                label: string;
                count: number;
            }[];
            chains: {
                label: string;
                count: number;
            }[];
        };
        note: string;
    };
    kvManifest: {
        reason: string;
        artifactType: string;
        artifactStatus: string;
        source: string;
        note: string;
        metricGroupId: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        rowCount: number;
        registryIds: number[];
        focusedRegistryId: number | null;
        focusedRegistryIncluded: boolean | null;
        ruleCount: number;
        minConfidence: number;
        requireMetricEligible: boolean;
        diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
        distributions: {
            roles: {
                label: string;
                count: number;
            }[];
            entities: {
                label: string;
                count: number;
            }[];
            chains: {
                label: string;
                count: number;
            }[];
        };
    };
} | null>;
export declare function previewMetricGroupMembersByCode(metricGroupCode: string, focusedRegistryId?: number | null): Promise<{
    group: {
        id: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        namespaceId: number | null;
        minConfidence: number;
        requireMetricEligible: boolean;
        description: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    members: import("../../metric-group-preview").MetricGroupPreviewRow[];
    diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
    rules: {
        id: number;
        metricGroupId: number;
        ruleVersion: number;
        ruleJson: Record<string, unknown>;
        status: string;
        sourceId: number | null;
        contentHash: string | null;
        createdAt: Date;
        updatedAt: Date;
        activatedAt: Date | null;
        retiredAt: Date | null;
    }[];
    focusedMember: import("../../metric-group-preview").MetricGroupPreviewRow | null;
    focusedRegistryId: number | null;
    manifest: {
        artifactType: string;
        artifactStatus: string;
        metricGroupId: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        rowCount: number;
        registryIds: number[];
        focusedRegistryId: number | null;
        focusedRegistryIncluded: boolean | null;
        ruleCount: number;
        minConfidence: number;
        requireMetricEligible: boolean;
        diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
        distributions: {
            roles: {
                label: string;
                count: number;
            }[];
            entities: {
                label: string;
                count: number;
            }[];
            chains: {
                label: string;
                count: number;
            }[];
        };
        note: string;
    };
    kvManifest: {
        reason: string;
        artifactType: string;
        artifactStatus: string;
        source: string;
        note: string;
        metricGroupId: number;
        metricGroupCode: string;
        metricGroupName: string;
        chainCode: string | null;
        rowCount: number;
        registryIds: number[];
        focusedRegistryId: number | null;
        focusedRegistryIncluded: boolean | null;
        ruleCount: number;
        minConfidence: number;
        requireMetricEligible: boolean;
        diagnostics: import("../../metric-group-preview").MetricGroupPreviewDiagnostics;
        distributions: {
            roles: {
                label: string;
                count: number;
            }[];
            entities: {
                label: string;
                count: number;
            }[];
            chains: {
                label: string;
                count: number;
            }[];
        };
    };
} | null>;
