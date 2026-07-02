const MAX_SOURCE_FETCH_BYTES = 1_000_000;
const MAX_SOURCE_REDIRECTS = 3;
const SOURCE_FETCH_TIMEOUT_MS = 10_000;

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
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname === "metadata.google.internal" ||
    isPrivateIpv4(hostname)
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
}> {
  if (redirectCount > MAX_SOURCE_REDIRECTS) {
    throw new Error(`Source URL exceeded ${MAX_SOURCE_REDIRECTS} redirects.`);
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
