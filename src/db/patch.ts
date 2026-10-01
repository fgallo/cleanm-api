// Builds the SET clause of a partial UPDATE from the keys present in the patch.
// Column names come from the map (the whitelist), never from the input; values
// become $n placeholders starting at firstIndex.
export function buildSetClause<K extends string>(
  patch: Partial<Record<K, unknown>>,
  columns: Record<K, string>,
  firstIndex: number,
): { assignments: string; values: unknown[] } {
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(columns) as K[]) {
    const value = patch[key];
    if (value !== undefined) {
      values.push(value);
      assignments.push(`${columns[key]} = $${firstIndex + values.length - 1}`);
    }
  }
  return { assignments: assignments.join(", "), values };
}
