export declare function listNetworkSupportMatrix(): Promise<{
    rows: {
        network: {
            id: number;
            networkCode: string;
            networkName: string;
            chainFamily: string;
            environment: string;
            caip2: string | null;
            evmChainId: number | null;
            slip44: number | null;
            isActive: boolean;
            sourceId: number | null;
            verifiedAt: Date | null;
            notes: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        capability: {
            chainNetworkId: number;
            supportTier: number | null;
            catalogState: string;
            labelReadiness: string;
            runtimeReadiness: string;
            catalogStatus: string;
            normalizerStatus: string;
            mqnodeParserStatus: string;
            assetResolverStatus: string;
            currentLabelStatus: string;
            timelineStatus: string;
            metricStatus: string;
            mqnodeIntegrationTestRef: string | null;
            metricIntegrationTestRef: string | null;
            notes: string | null;
            lastVerifiedAt: Date | null;
            updatedAt: Date;
        } | null;
        namespaceCount: number;
    }[];
    proposals: {
        id: number;
        changeType: string;
        networkId: number | null;
        proposedValues: Record<string, unknown>;
        reason: string;
        status: string;
        requestedBy: string;
        reviewedBy: string | null;
        reviewNotes: string | null;
        createdAt: Date;
        reviewedAt: Date | null;
        appliedAt: Date | null;
    }[];
    summary: {
        total: number;
        tier1: number;
        tier2: number;
        labelReady: number;
        runtimeReady: number;
        pendingProposals: number;
    };
}>;
export type NetworkCatalogDrift = {
    scope: "network" | "capability" | "allocation";
    key: string;
    field: string;
    catalogValue: unknown;
    databaseValue: unknown;
    severity: "error" | "warning";
};
export declare function getNetworkCatalogDrift(): Promise<{
    dictionaryVersion: string;
    generatedAt: string;
    drift: NetworkCatalogDrift[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
    };
}>;
export declare function createNetworkChangeProposal(input: unknown): Promise<{
    id: number;
    createdAt: Date;
    status: string;
    changeType: string;
    networkId: number | null;
    proposedValues: Record<string, unknown>;
    reason: string;
    requestedBy: string;
    reviewedBy: string | null;
    reviewNotes: string | null;
    reviewedAt: Date | null;
    appliedAt: Date | null;
}>;
export declare function reviewNetworkChangeProposal(input: unknown): Promise<{
    id: number;
    changeType: string;
    networkId: number | null;
    proposedValues: Record<string, unknown>;
    reason: string;
    status: string;
    requestedBy: string;
    reviewedBy: string | null;
    reviewNotes: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    appliedAt: Date | null;
}>;
