const MAX_SOURCE_FETCH_BYTES = 1_000_000;
const MAX_SOURCE_REDIRECTS = 3;
const SOURCE_FETCH_TIMEOUT_MS = 10_000;
const GITHUB_DIRECTORY_MAX_DEPTH = 2;
const GITHUB_DIRECTORY_MAX_FILES = 25;
const GITHUB_DIRECTORY_MAX_FILE_BYTES = 200_000;
const GITHUB_DIRECTORY_ALLOWED_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".ts", ".js", ".sol", ".md"]);
const GITHUB_DIRECTORY_ALLOWED_FOLDERS = new Set(["deployments", "addresses", "config", "configs", "markets", "networks", "chains", "artifacts"]);
const GITHUB_DIRECTORY_PREFERRED_FILES = [
  "configuration.json",
  "roots.json",
  "relations.ts",
  "deploy.ts",
  "deployments.json",
  "addresses.json",
  "deployment.json",
];

export type GitHubTreeUrl = {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  originalUrl: string;
};

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  const first = normalized.split(":").find((part) => part.length > 0) ?? "";

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("::ffff:") ||
    first.startsWith("fc") ||
    first.startsWith("fd") ||
    /^fe[89ab]/.test(first)
  );
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  );
}

export function assertFetchableSourceUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const hostname = normalizedHostname(parsed);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Source URL must use HTTP or HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Source URL must not include embedded credentials.");
  }

  if (isBlockedHostname(hostname)) {
    throw new Error("Source URL cannot target localhost, metadata, or private network addresses.");
  }

  return parsed;
}

export function githubBlobToRawUrl(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  const parsed = assertFetchableSourceUrl(sourceUrl);
  if (parsed.hostname === "raw.githubusercontent.com") return parsed.toString();
  if (!["github.com", "www.github.com"].includes(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") return null;

  const [owner, repo, , ref, ...pathParts] = parts;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathParts.join("/")}`;
}

export function parseGithubTreeUrl(sourceUrl?: string | null): GitHubTreeUrl | null {
  if (!sourceUrl) return null;
  const parsed = assertFetchableSourceUrl(sourceUrl);
  if (!["github.com", "www.github.com"].includes(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "tree") return null;

  const [owner, repo, , ref, ...pathParts] = parts;
  const path = pathParts.join("/").replace(/^\/+|\/+$/g, "");
  if (!path) return null;

  return { owner, repo, ref, path, originalUrl: parsed.toString() };
}

function githubHeaders() {
  const token = process.env.MQCHAIN_GITHUB_API_TOKEN || process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "user-agent": "mqchain-console",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function githubContentsApiUrl(tree: GitHubTreeUrl, path: string) {
  return `https://api.github.com/repos/${tree.owner}/${tree.repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}?ref=${encodeURIComponent(tree.ref)}`;
}

function extensionOf(path: string) {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function allowGithubDirectory(path: string) {
  return path
    .split("/")
    .map((part) => part.toLowerCase())
    .some((part) => GITHUB_DIRECTORY_ALLOWED_FOLDERS.has(part));
}

function priorityRank(path: string) {
  const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  const preferred = GITHUB_DIRECTORY_PREFERRED_FILES.indexOf(name);
  if (preferred >= 0) return preferred;
  if (/\.(deployment|deploy|addresses)\.json$/i.test(name)) return GITHUB_DIRECTORY_PREFERRED_FILES.length;
  return GITHUB_DIRECTORY_PREFERRED_FILES.length + 10;
}

function inferNetworkMarketFromGithubPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const lowered = parts.map((part) => part.toLowerCase());
  for (const marker of ["deployments", "addresses", "networks", "chains"]) {
    const index = lowered.indexOf(marker);
    if (index < 0) continue;
    const network = parts[index + 1];
    const market = marker === "deployments" && parts[index + 2] && !parts[index + 2].includes(".") ? parts[index + 2] : undefined;
    return { network, market };
  }
  return { network: undefined, market: undefined };
}

async function fetchGithubJson(url: string) {
  const parsed = assertFetchableSourceUrl(url);
  const response = await fetch(parsed, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if ((response.status === 403 || response.status === 429) && remaining === "0") {
      throw new Error("GitHub directory fetch failed: rate limited by GitHub API.");
    }
    throw new Error(`GitHub directory fetch failed with HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

function githubFileDownloadUrl(tree: GitHubTreeUrl, path: string) {
  return `https://raw.githubusercontent.com/${tree.owner}/${tree.repo}/${tree.ref}/${path}`;
}

async function fetchGithubFileText(tree: GitHubTreeUrl, item: Record<string, unknown>) {
  const path = String(item.path ?? "");
  const size = Number(item.size ?? 0);
  if (size > GITHUB_DIRECTORY_MAX_FILE_BYTES) {
    return { path, text: "", skipped: "github_directory_file_too_large" };
  }

  const downloadUrl = typeof item.download_url === "string" && item.download_url ? item.download_url : githubFileDownloadUrl(tree, path);
  const response = await fetch(assertFetchableSourceUrl(downloadUrl), {
    signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    return { path, text: "", skipped: `github_directory_file_fetch_http_${response.status}` };
  }

  const text = await boundedResponseText(response);
  if (Buffer.byteLength(text) > GITHUB_DIRECTORY_MAX_FILE_BYTES) {
    return { path, text: "", skipped: "github_directory_file_too_large" };
  }
  return { path, text, skipped: "" };
}

async function collectGithubDirectoryFiles(tree: GitHubTreeUrl) {
  const files: Record<string, unknown>[] = [];
  const warnings = new Set<string>();
  const apiUrls: string[] = [];

  async function crawl(path: string, depth: number): Promise<void> {
    if (depth > GITHUB_DIRECTORY_MAX_DEPTH) {
      warnings.add("github_directory_depth_limit_reached");
      return;
    }
    if (files.length >= GITHUB_DIRECTORY_MAX_FILES) {
      warnings.add("github_directory_file_limit_reached");
      return;
    }

    const apiUrl = githubContentsApiUrl(tree, path);
    apiUrls.push(apiUrl);
    const payload = await fetchGithubJson(apiUrl);
    const items = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
    const sorted = items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .sort((a, b) => {
        const aType = String(a.type ?? "");
        const bType = String(b.type ?? "");
        if (aType !== bType) return aType === "dir" ? -1 : 1;
        return priorityRank(String(a.path ?? a.name ?? "")) - priorityRank(String(b.path ?? b.name ?? ""));
      });

    for (const item of sorted) {
      if (files.length >= GITHUB_DIRECTORY_MAX_FILES) {
        warnings.add("github_directory_file_limit_reached");
        return;
      }
      const itemPath = String(item.path ?? "");
      if (item.type === "dir") {
        if (allowGithubDirectory(itemPath)) {
          await crawl(itemPath, depth + 1);
        }
        continue;
      }
      if (item.type !== "file") continue;
      if (!GITHUB_DIRECTORY_ALLOWED_EXTENSIONS.has(extensionOf(itemPath))) {
        warnings.add("github_directory_unsupported_file_skipped");
        continue;
      }
      files.push(item);
    }
  }

  await crawl(tree.path, 0);
  if (!files.length) warnings.add("github_directory_no_supported_files");
  return { files, warnings, apiUrls };
}

async function fetchGithubDirectorySourceText(tree: GitHubTreeUrl) {
  const { files, warnings, apiUrls } = await collectGithubDirectoryFiles(tree);
  const chunks: string[] = [];
  const fileSummaries: Array<Record<string, unknown>> = [];
  let totalBytes = 0;

  for (const item of files) {
    const fetched = await fetchGithubFileText(tree, item);
    if (fetched.skipped) {
      warnings.add(fetched.skipped);
      continue;
    }
    const path = fetched.path;
    const { network, market } = inferNetworkMarketFromGithubPath(path);
    const fileBytes = Buffer.byteLength(fetched.text);
    if (totalBytes + fileBytes > MAX_SOURCE_FETCH_BYTES) {
      warnings.add("github_directory_total_bytes_limit_reached");
      break;
    }
    totalBytes += fileBytes;
    fileSummaries.push({ path, network, market, bytes: fileBytes });
    chunks.push(
      [
        `MQCHAIN_GITHUB_FILE owner=${tree.owner} repo=${tree.repo} ref=${tree.ref} path=${path} directory=${tree.path} network=${network ?? ""} market=${market ?? ""}`,
        fetched.text,
      ].join("\n"),
    );
  }

  return {
    rawText: chunks.join("\n\n"),
    contentType: "text/x-mqchain-github-directory",
    fetchedUrl: tree.originalUrl,
    metadata: {
      githubDirectory: true,
      githubOwner: tree.owner,
      githubRepo: tree.repo,
      githubRef: tree.ref,
      githubDirectoryPath: tree.path,
      githubApiUrls: apiUrls,
      githubDirectoryFiles: fileSummaries,
      githubDirectoryWarnings: Array.from(warnings),
    },
  };
}

async function boundedResponseText(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SOURCE_FETCH_BYTES) {
    throw new Error(`Source URL response exceeds ${MAX_SOURCE_FETCH_BYTES} bytes.`);
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_SOURCE_FETCH_BYTES) {
      throw new Error(`Source URL response exceeds ${MAX_SOURCE_FETCH_BYTES} bytes.`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_SOURCE_FETCH_BYTES) {
      await reader.cancel();
      throw new Error(`Source URL response exceeds ${MAX_SOURCE_FETCH_BYTES} bytes.`);
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());

  return chunks.join("");
}

export async function fetchSourceText(sourceUrl: string, redirectCount = 0): Promise<{
  rawText: string;
  contentType: string;
  fetchedUrl: string;
  metadata?: Record<string, unknown>;
}> {
  if (redirectCount > MAX_SOURCE_REDIRECTS) {
    throw new Error(`Source URL exceeded ${MAX_SOURCE_REDIRECTS} redirects.`);
  }

  const githubTree = parseGithubTreeUrl(sourceUrl);
  if (githubTree) {
    return fetchGithubDirectorySourceText(githubTree);
  }

  const requestedUrl = githubBlobToRawUrl(sourceUrl) ?? sourceUrl;
  const parsed = assertFetchableSourceUrl(requestedUrl);
  const response = await fetch(parsed, {
    redirect: "manual",
    signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Source URL redirect missing Location header.`);
    }
    return fetchSourceText(new URL(location, parsed).toString(), redirectCount + 1);
  }

  if (!response.ok) {
    throw new Error(`Source URL fetch failed with HTTP ${response.status}.`);
  }

  return {
    rawText: await boundedResponseText(response),
    contentType: response.headers.get("content-type") ?? "text/plain",
    fetchedUrl: response.url,
  };
}
