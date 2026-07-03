import type { CsvIntakeRow } from "./types";
import { normalizeAddress } from "./address/normalize";

type IntakeDefaults = {
  chainCode?: string;
  entityHint?: string;
  protocolHint?: string;
  roleHint?: string;
  sourceUrl?: string;
  sourceName?: string;
  confidenceScore?: number;
  qualityTier?: number;
  notes?: string;
};

type DeploymentExtractionOptions = IntakeDefaults & {
  sourceType?: string;
  sourceInputType?: string;
  evidenceType?: string;
  trustTier?: string;
};

type GithubFileContext = {
  github_owner?: string;
  github_repo?: string;
  github_ref?: string;
  github_directory_path?: string;
  source_file_path?: string;
  source_network?: string;
  market?: string;
};

const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const BTC_ADDRESS_RE = /(?<![A-Za-z0-9])(?:bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})(?![A-Za-z0-9])/gi;
const GENERIC_CHAIN_TOKEN_RE = /\b(?:0x[a-fA-F0-9]{40}|[A-Za-z0-9]{25,100})\b/g;

function maybeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function maybeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function uniqueRows(rows: CsvIntakeRow[]) {
  const seen = new Set<string>();
  const unique: CsvIntakeRow[] = [];

  for (const row of rows) {
    const key = `${row.chain ?? ""}:${row.address}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function githubFileContextFromMarker(line: string): GithubFileContext | null {
  if (!line.startsWith("MQCHAIN_GITHUB_FILE ")) return null;
  const record: Record<string, string> = {};
  for (const part of line.slice("MQCHAIN_GITHUB_FILE ".length).split(/\s+/)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index);
    const value = part.slice(index + 1);
    if (value) record[key] = value;
  }

  return {
    github_owner: record.owner,
    github_repo: record.repo,
    github_ref: record.ref,
    github_directory_path: record.directory,
    source_file_path: record.path,
    source_network: record.network,
    market: record.market,
  };
}

function rowFromAddress(address: string, defaults: IntakeDefaults, extra?: Partial<CsvIntakeRow>): CsvIntakeRow {
  return {
    address,
    chain: extra?.chain ?? defaults.chainCode,
    entity: extra?.entity ?? defaults.entityHint,
    protocol: extra?.protocol ?? defaults.protocolHint,
    role: extra?.role ?? defaults.roleHint,
    source_url: extra?.source_url ?? defaults.sourceUrl,
    source_name: extra?.source_name ?? defaults.sourceName,
    confidence: extra?.confidence ?? defaults.confidenceScore,
    quality_tier: extra?.quality_tier ?? defaults.qualityTier,
    notes: extra?.notes ?? defaults.notes,
    first_seen_block: extra?.first_seen_block,
    last_seen_block: extra?.last_seen_block,
    metric_eligible: extra?.metric_eligible,
    evidence_type: extra?.evidence_type,
    trust_tier: extra?.trust_tier,
    source_input_type: extra?.source_input_type,
    contract_name: extra?.contract_name,
    role_source: extra?.role_source,
    raw_reference: extra?.raw_reference,
  };
}

function candidateTokens(text: string, chainCode?: string) {
  if (chainCode) {
    return Array.from(text.matchAll(GENERIC_CHAIN_TOKEN_RE), (match) => match[0]);
  }

  return [
    ...Array.from(text.matchAll(EVM_ADDRESS_RE), (match) => match[0]),
    ...Array.from(text.matchAll(BTC_ADDRESS_RE), (match) => match[0]),
  ];
}

export function stripHtmlToText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAddressRowsFromText(text: string, defaults: IntakeDefaults = {}) {
  const rows: CsvIntakeRow[] = [];
  const tokens = candidateTokens(text, defaults.chainCode).slice(0, 2000);

  for (const token of tokens) {
    const chains = defaults.chainCode ? [defaults.chainCode] : token.toLowerCase().startsWith("0x") ? ["ethereum"] : ["btc"];
    const normalized = chains.map((chain) => normalizeAddress(token, chain)).find((result) => result.isValid);
    if (!normalized?.chainCode) continue;

    rows.push(rowFromAddress(token, defaults, { chain: normalized.chainCode }));
  }

  return uniqueRows(rows).slice(0, 500);
}

function normalizeLabel(value?: string) {
  return value
    ?.replace(/[`"'{}[\]();]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roleFromLabel(value?: string) {
  const label = normalizeLabel(value)?.toLowerCase();
  if (!label) return undefined;

  if (label.includes("proxy admin")) return "protocol_proxy_admin";
  if (label.includes("implementation")) return "protocol_implementation";
  if (label.includes("address provider") || label.includes("addresses provider") || label.includes("registry") || label.includes("directory")) return "protocol_registry";
  if (label.includes("factory")) return "protocol_factory";
  if (label.includes("router")) return "protocol_router";
  if (label.includes("vault")) return "protocol_vault";
  if (label.includes("pool")) return "protocol_pool";
  if (label.includes("oracle")) return "protocol_oracle";
  if (label.includes("treasury")) return "protocol_treasury";
  if (label.includes("multisig") || label.includes("safe")) return "protocol_multisig";
  if (label.includes("governance") || label.includes("governor")) return "protocol_governance";
  if (label.includes("timelock")) return "protocol_timelock";
  if (label.includes("proxy")) return "protocol_proxy";
  if (label.includes("reward")) return "protocol_reward_distributor";
  if (label.includes("incentive")) return "protocol_incentives_controller";
  if (label.includes("data provider")) return "protocol_data_provider";
  if (label.includes("keeper")) return "protocol_keeper";
  if (label.includes("bridge")) return "protocol_bridge_adapter";

  return undefined;
}

function chainFromContext(value?: string) {
  const label = value?.toLowerCase() ?? "";
  if (/\b(btc|bitcoin)\b/.test(label)) return "btc";
  if (/\b(ethereum|mainnet|eth)\b/.test(label)) return "ethereum";
  if (/\bpolygon\b/.test(label)) return "polygon";
  if (/\bbase\b/.test(label)) return "base";
  if (/\barbitrum\b/.test(label)) return "arbitrum";
  if (/\boptimism\b/.test(label)) return "optimism";
  if (/\b(bsc|bnb|binance smart chain)\b/.test(label)) return "bsc";
  if (/\bsolana\b/.test(label)) return "solana";
  if (/\btron\b/.test(label)) return "tron";
  return undefined;
}

function looksLikeAddress(value: string) {
  resetAddressRegexes();
  const result = EVM_ADDRESS_RE.test(value) || BTC_ADDRESS_RE.test(value);
  resetAddressRegexes();
  return result;
}

function resetAddressRegexes() {
  EVM_ADDRESS_RE.lastIndex = 0;
  BTC_ADDRESS_RE.lastIndex = 0;
}

function lineCells(line: string) {
  if (!line.includes("|")) return [];
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .filter((cell) => !/^:?-{2,}:?$/.test(cell));
}

function contractNameFromLine(line: string, address: string) {
  const cells = lineCells(line);
  if (cells.length) {
    const addressIndex = cells.findIndex((cell) => cell.includes(address));
    const beforeAddress = addressIndex > 0 ? cells.slice(0, addressIndex).reverse() : cells;
    return beforeAddress.find((cell) => !chainFromContext(cell) && !looksLikeAddress(cell) && normalizeLabel(cell));
  }

  const before = line.slice(0, line.indexOf(address));
  const solidity = before.match(/\b(?:address|I[A-Za-z0-9_]+)\s+(?:public\s+|internal\s+|private\s+|external\s+)?(?:constant\s+|immutable\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=?\s*$/);
  if (solidity?.[1]) return solidity[1];

  const jsonKey = before.match(/["']?([A-Za-z_][A-Za-z0-9_ .-]{1,80})["']?\s*:\s*["']?$/);
  if (jsonKey?.[1]) return jsonKey[1];

  const label = before.match(/([A-Za-z_][A-Za-z0-9_ .:/-]{1,80})\s*(?:=|:|-|=>)?\s*$/);
  return normalizeLabel(label?.[1]);
}

function sourceInputTypeFor(sourceType: string | undefined, text: string, contentHint?: string) {
  const prefix = sourceType === "github" ? "github" : "docs";
  const lowerHint = contentHint?.toLowerCase() ?? "";
  const lowerText = text.slice(0, 8192).toLowerCase();

  if (lowerHint.endsWith(".sol") || lowerText.includes("pragma solidity")) return `${prefix}_solidity_address_book`;
  if (lowerHint.endsWith(".json") || lowerText.trim().startsWith("{") || lowerText.trim().startsWith("[")) return `${prefix}_json_deployment_registry`;
  if (lowerHint.endsWith(".md") || text.includes("|")) return `${prefix}_markdown_deployment_table`;
  if (lowerText.includes("<table") || lowerText.includes("<html")) return `${prefix}_html_deployment_table`;
  return `${prefix}_text_deployment_extract`;
}

function evidenceTypeForDeployment(sourceType?: string) {
  if (sourceType === "github") return "github_deployment";
  if (sourceType === "pdf") return "proof_of_reserve";
  if (sourceType === "explorer") return "etherscan_verified_contract";
  return "official_page";
}

function addDeploymentRow(
  rows: CsvIntakeRow[],
  address: string,
  context: string,
  lineNumber: number,
  options: DeploymentExtractionOptions,
  extra?: Partial<CsvIntakeRow> & { githubFile?: GithubFileContext | null },
) {
  const contractName = extra?.contract_name ?? contractNameFromLine(context, address);
  const fileContext = extra?.githubFile;
  const chain =
    extra?.chain ??
    options.chainCode ??
    chainFromContext(context) ??
    chainFromContext(fileContext?.source_file_path) ??
    chainFromContext(fileContext?.source_network) ??
    chainFromContext(options.sourceUrl) ??
    (address.toLowerCase().startsWith("0x") ? "ethereum" : undefined);
  const sourceInputType = extra?.source_input_type ?? options.sourceInputType ?? sourceInputTypeFor(options.sourceType, context, options.sourceUrl);
  const evidenceType = extra?.evidence_type ?? options.evidenceType ?? evidenceTypeForDeployment(options.sourceType);
  const roleSource = extra?.role_source ?? contractName;
  const rawReference = compactRecord({
    source_url: options.sourceUrl,
    source_input_type: sourceInputType,
    evidence_type: evidenceType,
    line_number: lineNumber,
    raw_line: context.slice(0, 1000),
    contract_name: contractName,
    role_source: roleSource,
    github_owner: fileContext?.github_owner,
    github_repo: fileContext?.github_repo,
    github_ref: fileContext?.github_ref,
    github_directory_path: fileContext?.github_directory_path,
    source_file_path: fileContext?.source_file_path,
    source_network: fileContext?.source_network,
    market: fileContext?.market,
    ...extra?.raw_reference,
  });

  rows.push(rowFromAddress(address, options, {
    chain,
    role: extra?.role ?? options.roleHint ?? roleFromLabel(roleSource),
    confidence: extra?.confidence ?? options.confidenceScore,
    quality_tier: extra?.quality_tier ?? options.qualityTier,
    notes: extra?.notes ?? options.notes ?? (contractName ? `Deployment reference for ${contractName}` : "Deployment source reference"),
    evidence_type: evidenceType,
    trust_tier: extra?.trust_tier ?? options.trustTier ?? (options.sourceType === "pdf" ? "verified_third_party" : "official"),
    source_input_type: sourceInputType,
    contract_name: contractName,
    role_source: roleSource,
    raw_reference: rawReference,
  }));
}

export function extractDeploymentRowsFromText(text: string, options: DeploymentExtractionOptions = {}) {
  const sourceInputType = options.sourceInputType ?? sourceInputTypeFor(options.sourceType, text, options.sourceUrl);
  const sourceText = sourceInputType.includes("html") ? stripHtmlToText(text) : text;
  const rows: CsvIntakeRow[] = [];
  const lines = sourceText.split(/\r?\n/);
  let githubFile: GithubFileContext | null = null;

  for (const [index, line] of lines.entries()) {
    const nextGithubFile = githubFileContextFromMarker(line);
    if (nextGithubFile) {
      githubFile = nextGithubFile;
      continue;
    }
    resetAddressRegexes();
    const tokens = candidateTokens(line, options.chainCode);
    for (const token of tokens) {
      addDeploymentRow(rows, token, line, index + 1, { ...options, sourceInputType }, { githubFile });
    }
  }

  if (!rows.length) {
    return extractAddressRowsFromText(sourceText, options).map((row, index) => ({
      ...row,
      evidence_type: options.evidenceType ?? evidenceTypeForDeployment(options.sourceType),
      trust_tier: options.trustTier ?? (options.sourceType === "pdf" ? "verified_third_party" : "official"),
      source_input_type: sourceInputType,
      raw_reference: compactRecord({
        source_url: options.sourceUrl,
        source_input_type: sourceInputType,
        evidence_type: options.evidenceType ?? evidenceTypeForDeployment(options.sourceType),
        row_number: index + 1,
      }),
    }));
  }

  return uniqueRows(rows).slice(0, 500);
}

function jsonRowsRoot(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  for (const key of ["rows", "candidates", "addresses", "evidence", "data", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }

  return [record];
}

function rowFromJsonItem(item: unknown, defaults: IntakeDefaults): CsvIntakeRow[] {
  if (typeof item === "string") {
    return extractAddressRowsFromText(item, defaults);
  }

  if (!item || typeof item !== "object") {
    return [];
  }

  const record = item as Record<string, unknown>;
  const address =
    maybeString(record.address) ??
    maybeString(record.raw_address) ??
    maybeString(record.rawAddress) ??
    maybeString(record.normalized_address) ??
    maybeString(record.normalizedAddress) ??
    maybeString(record.wallet) ??
    maybeString(record.contract_address) ??
    maybeString(record.contractAddress);

  const chain = maybeString(record.chain) ?? maybeString(record.chain_code) ?? maybeString(record.chainCode) ?? maybeString(record.network);

  if (!address) {
    return extractJsonDeploymentRows(item, { ...defaults, chainCode: chain ?? defaults.chainCode });
  }

  return [
    rowFromAddress(address, defaults, {
      chain: chain ?? defaults.chainCode,
      entity: maybeString(record.entity) ?? maybeString(record.entity_hint) ?? defaults.entityHint,
      protocol: maybeString(record.protocol) ?? maybeString(record.protocol_hint) ?? defaults.protocolHint,
      role: maybeString(record.role) ?? maybeString(record.role_hint) ?? maybeString(record.source_role_label) ?? defaults.roleHint,
      source_url: maybeString(record.source_url) ?? maybeString(record.sourceUrl) ?? defaults.sourceUrl,
      source_name: maybeString(record.source_name) ?? maybeString(record.sourceName) ?? defaults.sourceName,
      confidence: maybeNumber(record.confidence) ?? maybeNumber(record.confidence_score) ?? defaults.confidenceScore,
      quality_tier: maybeNumber(record.quality_tier) ?? maybeNumber(record.qualityTier) ?? defaults.qualityTier,
      notes: maybeString(record.notes) ?? maybeString(record.summary) ?? maybeString(record.evidence_summary) ?? defaults.notes,
      first_seen_block: maybeNumber(record.first_seen_block) ?? maybeNumber(record.firstSeenBlock),
      last_seen_block: maybeNumber(record.last_seen_block) ?? maybeNumber(record.lastSeenBlock),
      metric_eligible: record.metric_eligible as CsvIntakeRow["metric_eligible"],
      contract_name: maybeString(record.contract_name) ?? maybeString(record.contractName),
      role_source: maybeString(record.role_source) ?? maybeString(record.source_role_label),
      evidence_type: maybeString(record.evidence_type),
      trust_tier: maybeString(record.trust_tier),
      source_input_type: maybeString(record.source_input_type),
      raw_reference: compactRecord({
        raw_row: record,
        contract_name: maybeString(record.contract_name) ?? maybeString(record.contractName),
        role_source: maybeString(record.role_source) ?? maybeString(record.source_role_label),
        source_url: maybeString(record.source_url) ?? maybeString(record.sourceUrl) ?? defaults.sourceUrl,
      }),
    }),
  ];
}

function extractJsonDeploymentRows(value: unknown, defaults: IntakeDefaults, path: string[] = []): CsvIntakeRow[] {
  if (typeof value === "string") {
    const normalizedPath = path.map(normalizeLabel).filter((item): item is string => Boolean(item));
    const contractName = normalizedPath.slice().reverse().find((item) => !chainFromContext(item) && !["address", "addresses", "contracts", "deployments"].includes(item.toLowerCase()));
    const chainCode = defaults.chainCode ?? normalizedPath.map(chainFromContext).find(Boolean);

    return extractDeploymentRowsFromText(value, {
      ...defaults,
      chainCode,
      roleHint: defaults.roleHint ?? roleFromLabel(contractName),
      sourceInputType: "json_deployment_registry",
      evidenceType: "official_page",
    }).map((row) => ({
      ...row,
      contract_name: row.contract_name ?? contractName,
      role_source: row.role_source ?? contractName,
      raw_reference: {
        ...(row.raw_reference ?? {}),
        json_path: path.join("."),
        contract_name: row.contract_name ?? contractName,
      },
    }));
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => extractJsonDeploymentRows(item, defaults, [...path, String(index)]));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => extractJsonDeploymentRows(nested, defaults, [...path, key]));
}

export function parseJsonEvidenceRows(jsonText: string, defaults: IntakeDefaults = {}) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("JSON evidence input must be valid JSON.");
  }

  const rows = jsonRowsRoot(parsed).flatMap((item) => rowFromJsonItem(item, defaults));
  return uniqueRows(rows).slice(0, 500);
}
