import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

export type User = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
};

export type Organization = {
  id: string;
  name: string;
  timezone: string;
};

export type Credentials = User & { passwordHash: string };

const userColumns = `
  id,
  organization_id AS "organizationId",
  email,
  name
`;

export async function findCredentials(
  email: string,
): Promise<Credentials | undefined> {
  const { rows } = await pool.query<Credentials>(
    `SELECT ${userColumns}, password_hash AS "passwordHash"
     FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0];
}

export async function createUser(
  organizationId: string,
  input: { email: string; name: string; passwordHash: string },
): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (organization_id, email, name, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING ${userColumns}`,
    [organizationId, input.email, input.name, input.passwordHash],
  );
  return single(rows);
}

export async function countUsers(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) AS count FROM users",
  );
  return Number(single(rows).count);
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(
    "UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1",
    [userId, passwordHash],
  );
}

// --- Sessions -------------------------------------------------------------

export type SessionUser = {
  sessionId: string;
  user: User;
  organization: Organization;
};

export async function createSession(
  organizationId: string,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (organization_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [organizationId, userId, tokenHash, expiresAt],
  );
  return single(rows).id;
}

// The user and organization behind a live session token, if any.
export async function findSessionUser(
  tokenHash: Buffer,
): Promise<SessionUser | undefined> {
  const { rows } = await pool.query<SessionUser>(
    `SELECT
       s.id AS "sessionId",
       json_build_object(
         'id', u.id,
         'organizationId', u.organization_id,
         'email', u.email,
         'name', u.name
       ) AS user,
       json_build_object(
         'id', o.id,
         'name', o.name,
         'timezone', o.timezone
       ) AS organization
     FROM sessions s
     JOIN users u ON u.organization_id = s.organization_id AND u.id = s.user_id
     JOIN organizations o ON o.id = s.organization_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

// Housekeeping, run at sign-in: expired sessions are useless rows.
export async function deleteExpiredSessions(): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
}
