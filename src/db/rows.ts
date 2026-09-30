// For queries that must return exactly one row, such as INSERT ... RETURNING.
export function single<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the query to return one row");
  }
  return row;
}
