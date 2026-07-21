export type RuntimeDictionaryRow = Readonly<Record<string, unknown>>;

export type RuntimeDictionaryDashboardDto = Readonly<{
  dictionaryVersion: string;
  networks: readonly RuntimeDictionaryRow[];
  namespaces: readonly RuntimeDictionaryRow[];
  codecs: readonly RuntimeDictionaryRow[];
  components: readonly RuntimeDictionaryRow[];
}>;
