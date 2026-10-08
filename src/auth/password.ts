// Password hashing with scrypt from node:crypto, the parameters OWASP
// recommends (N = 2^17, r = 8, p = 1). Each hash takes a noticeable fraction
// of a second on purpose: that is what makes guessing expensive.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const current = { N: 2 ** 17, r: 8, p: 1 };
const saltBytes = 16;
const hashBytes = 64;

// The async scrypt runs in the thread pool and keeps the event loop free.
function derive(
  password: string,
  salt: Buffer,
  params: typeof current,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      hashBytes,
      // scrypt needs about 128 * N * r bytes; the default limit is 32 MiB.
      { ...params, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

// Self-describing: "scrypt$N$r$p$salt$hash", all parts base64url. Stored
// hashes keep working when the parameters above change.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes);
  const hash = await derive(password, salt, current);
  return [
    "scrypt",
    current.N,
    current.r,
    current.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);
  if (parsed === undefined) {
    return false;
  }
  const hash = await derive(password, parsed.salt, parsed.params);
  return (
    hash.length === parsed.hash.length && timingSafeEqual(hash, parsed.hash)
  );
}

// True when the stored hash uses older parameters and should be replaced
// after a successful sign-in.
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return (
    parsed === undefined ||
    parsed.params.N !== current.N ||
    parsed.params.r !== current.r ||
    parsed.params.p !== current.p
  );
}

function parse(stored: string) {
  const [algorithm, N, r, p, salt, hash, ...rest] = stored.split("$");
  if (
    algorithm !== "scrypt" ||
    N === undefined ||
    r === undefined ||
    p === undefined ||
    salt === undefined ||
    hash === undefined ||
    rest.length > 0
  ) {
    return undefined;
  }
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every((n) => Number.isInteger(n) && n > 0)) {
    return undefined;
  }
  return {
    params,
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  };
}
