import { describe, expect, it } from "vitest";

import {
  createOrganization,
  createSessionCookie,
  createUser,
  startApi,
} from "../../test/api.ts";

const api = await startApi();

describe("GET /organization", () => {
  it("returns the settings of the signed-in user's organization", async () => {
    const res = await api.get("/organization");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: api.organizationId,
      name: "Test Organization",
      timezone: "America/Toronto",
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: "CA",
      phone: null,
      email: null,
      paymentInstructions: null,
      taxName: null,
      taxRateBasisPoints: 0,
      taxRegistrationNumber: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});

describe("PATCH /organization", () => {
  it("updates only the fields sent", async () => {
    const res = await api.patch<{ updatedAt: string }>("/organization", {
      addressLine1: "456 Sample Ave",
      city: "Toronto",
      province: "ON",
      postalCode: "M4B 1B3",
      paymentInstructions: "Interac e-Transfer: hello@example.com",
      taxName: "HST",
      taxRateBasisPoints: 1300,
      taxRegistrationNumber: "123456789 RT0001",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Test Organization",
      addressLine1: "456 Sample Ave",
      city: "Toronto",
      taxName: "HST",
      taxRateBasisPoints: 1300,
      taxRegistrationNumber: "123456789 RT0001",
    });
    expect((await api.get("/organization")).body).toEqual(res.body);
  });

  it("clears a field set to null and goes back to no tax", async () => {
    await api.patch("/organization", {
      taxRateBasisPoints: 1300,
      taxName: "HST",
    });

    const res = await api.patch("/organization", {
      taxRateBasisPoints: 0,
      taxName: null,
      taxRegistrationNumber: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taxRateBasisPoints: 0,
      taxName: null,
      taxRegistrationNumber: null,
    });
  });

  it("answers 400 for invalid values", async () => {
    const res = await api.patch("/organization", {
      name: null,
      timezone: "Mars/Olympus_Mons",
      country: "Canada",
      email: "not-an-email",
      taxRateBasisPoints: 12.5,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "name" },
          { path: "timezone", message: "Must be an IANA time zone" },
          { path: "country" },
          { path: "email" },
          { path: "taxRateBasisPoints" },
        ],
      },
    });
  });

  it("answers 400 for an empty patch", async () => {
    const res = await api.patch("/organization", {});

    expect(res.status).toBe(400);
  });

  it("only touches the signed-in user's organization", async () => {
    const otherId = await createOrganization();
    const other = await createUser(otherId, `other-${otherId}@example.com`);
    const cookie = await createSessionCookie(other);

    await api.patch("/organization", { name: "Renamed" }, { cookie });

    expect((await api.get<{ name: string }>("/organization")).body.name).toBe(
      "Test Organization",
    );
    expect(
      (await api.get<{ name: string }>("/organization", { cookie })).body.name,
    ).toBe("Renamed");
  });
});
