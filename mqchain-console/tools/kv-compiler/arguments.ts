export function argument(name: string) {
  const position = process.argv.indexOf(name);
  return position < 0 ? null : process.argv[position + 1] ?? null;
}

export function requiredArtifactDirectory() {
  const value = argument("--artifact");
  if (!value) throw new Error("--artifact is required");
  return value;
}
