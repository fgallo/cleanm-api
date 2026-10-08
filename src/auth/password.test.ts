import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "./password.ts";

describe("hashPassword", () => {
  it("produces a self-describing hash with a fresh salt each time", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).toMatch(
      /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects others", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(
      false,
    );
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("rejects a stored value it cannot parse", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$x$y")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$0$8$1$abc$def")).toBe(
      false,
    );
  });
});

describe("needsRehash", () => {
  it("is false for a current hash and true for older parameters", async () => {
    const stored = await hashPassword("pw");
    const older = stored.replace("$131072$", "$16384$");

    expect(needsRehash(stored)).toBe(false);
    expect(needsRehash(older)).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });
});
