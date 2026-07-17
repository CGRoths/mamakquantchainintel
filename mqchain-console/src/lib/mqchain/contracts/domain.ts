export type IntakeSummary = {
  sourceJobId: number;
  totalRows: number;
  validAddresses: number;
  invalidAddresses: number;
  duplicates: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  evidenceCreated: number;
  conflictsFound: number;
  errors: string[];
};

export type CexFlowInput = {
  chainCode: string;
  inputAddresses: string[];
  outputAddresses: string[];
  blockNumber?: number | null;
  metricGroupCode?: string;
};
