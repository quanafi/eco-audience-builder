// Minimal type declaration for pg-cursor (no @types package is published).
declare module 'pg-cursor' {
  class Cursor {
    constructor(text: string, values?: unknown[]);
    // Structurally a pg `Submittable` so client.query(cursor) type-checks.
    submit(connection: unknown): void;
    read(
      rowCount: number,
      callback: (err: Error | undefined, rows: Record<string, unknown>[]) => void,
    ): void;
    close(callback?: (err?: Error) => void): void;
  }
  export = Cursor;
}
