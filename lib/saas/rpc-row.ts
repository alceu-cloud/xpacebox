// PostgREST can represent a composite result as a record or a one-row array.
export function rpcRow<T extends { id: string }>(value: unknown): T {
  const row = Array.isArray(value) ? value.length === 1 ? value[0] : null : value;
  if (!row || typeof row !== "object" || typeof row.id !== "string") throw new Error("RPC_RESULT_UNCERTAIN");
  return row as T;
}
