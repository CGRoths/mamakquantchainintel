declare module "rocksdb" {
  type Callback<T = void> = (error?: Error | null, value?: T) => void;
  type BatchOperation = { type: "put"; key: Buffer; value: Buffer } | { type: "del"; key: Buffer };
  type Iterator = {
    next(callback: (error: Error | null | undefined, key?: Buffer, value?: Buffer) => void): void;
    end(callback: Callback): void;
  };
  type RocksDb = {
    open(options: Record<string, unknown>, callback: Callback): void;
    close(callback: Callback): void;
    batch(operations: BatchOperation[], options: Record<string, unknown>, callback: Callback): void;
    get(key: Buffer, options: { asBuffer: true }, callback: (error: Error | null | undefined, value?: Buffer) => void): void;
    iterator(options: { keyAsBuffer: true; valueAsBuffer: true }): Iterator;
  };
  export default function rocksdb(location: string): RocksDb;
}
