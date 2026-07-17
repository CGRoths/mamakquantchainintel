const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function serializeOriginBody(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString(10) : item);
}

export function parseOriginJson(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown) => typeof value === "string" && ISO_DATE_PATTERN.test(value) ? new Date(value) : value) as unknown;
}
