function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function integer(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      `Environment variable ${name} must be an integer, got "${value}"`,
    );
  }
  return parsed;
}

export const config = {
  port: integer("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
};
