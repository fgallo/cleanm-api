import { afterEach, describe, expect, it } from "vitest";

import {
  createOrganization,
  createSessionCookie,
  createUser,
  startApi,
} from "../../test/api.ts";

const api = await startApi();
// For the raw requests below, which the JSON helpers of test/api.ts cannot
// send.
const cookie = await createSessionCookie(api.user);

type Settings = {
  nextInvoiceNumber: number;
  hasLogo: boolean;
  updatedAt: string;
};

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
      website: null,
      paymentInstructions: null,
      taxName: null,
      taxRateBasisPoints: 0,
      taxRegistrationNumber: null,
      nextInvoiceNumber: expect.any(Number),
      hasLogo: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});

describe("PATCH /organization", () => {
  it("updates only the fields sent", async () => {
    const res = await api.patch<Settings>("/organization", {
      addressLine1: "456 Sample Ave",
      city: "Toronto",
      province: "ON",
      postalCode: "M4B 1B3",
      website: "www.example.com",
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
      website: "www.example.com",
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
      nextInvoiceNumber: 0,
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
          { path: "nextInvoiceNumber" },
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

describe("next invoice number", () => {
  async function createInvoice(): Promise<{ number: number }> {
    const client = await api.post<{ id: string }>("/clients", {
      name: "Jane Doe",
    });
    const property = await api.post<{ id: string }>(
      `/clients/${client.body.id}/properties`,
      {
        addressLine1: "123 Example St",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 0A1",
      },
    );
    const job = await api.post<{ id: string }>("/jobs", {
      propertyId: property.body.id,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    const invoice = await api.post<{ number: number }>("/invoices", {
      jobId: job.body.id,
    });
    expect(invoice.status).toBe(201);
    return invoice.body;
  }

  it("moves the sequence forward, so it continues from another tool", async () => {
    const current = (await api.get<Settings>("/organization")).body
      .nextInvoiceNumber;
    const next = current + 134;

    const res = await api.patch<Settings>("/organization", {
      nextInvoiceNumber: next,
    });

    expect(res.status).toBe(200);
    expect(res.body.nextInvoiceNumber).toBe(next);
    expect((await createInvoice()).number).toBe(next);
    expect(
      (await api.get<Settings>("/organization")).body.nextInvoiceNumber,
    ).toBe(next + 1);
  });

  it("answers 400 for a number already used", async () => {
    const { number } = await createInvoice();

    const same = await api.patch("/organization", {
      nextInvoiceNumber: number,
    });
    const below = await api.patch("/organization", {
      nextInvoiceNumber: 1,
    });

    for (const res of [same, below]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: {
          issues: [
            {
              path: "nextInvoiceNumber",
              message: `Must be greater than ${number}, the highest invoice number`,
            },
          ],
        },
      });
    }
    expect(
      (await api.patch("/organization", { nextInvoiceNumber: number + 1 }))
        .status,
    ).toBe(200);
  });
});

describe("logo", () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  function upload(
    body: Buffer | string,
    contentType: string,
    sessionCookie: string | null = cookie,
  ): Promise<Response> {
    const headers: Record<string, string> = { "content-type": contentType };
    if (sessionCookie !== null) {
      headers.cookie = sessionCookie;
    }
    return fetch(api.url("/organization/logo"), {
      method: "PUT",
      headers,
      body,
    });
  }

  function download(sessionCookie = cookie): Promise<Response> {
    return fetch(api.url("/organization/logo"), {
      headers: { cookie: sessionCookie },
    });
  }

  afterEach(async () => {
    await api.delete("/organization/logo");
  });

  it("stores a PNG and serves it back", async () => {
    const res = await upload(png, "image/png");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasLogo: true });

    const logo = await download();
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/png");
    expect(logo.headers.get("cache-control")).toBe("private, no-cache");
    expect(Buffer.from(await logo.arrayBuffer())).toEqual(png);
  });

  it("replaces the logo with a JPEG", async () => {
    await upload(png, "image/png");

    const res = await upload(jpeg, "image/jpeg");

    expect(res.status).toBe(200);
    const logo = await download();
    expect(logo.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await logo.arrayBuffer())).toEqual(jpeg);
  });

  it("deletes the logo", async () => {
    await upload(png, "image/png");

    const res = await api.delete("/organization/logo");

    expect(res.status).toBe(204);
    expect((await download()).status).toBe(404);
    expect((await api.get<Settings>("/organization")).body.hasLogo).toBe(false);
    expect((await api.delete("/organization/logo")).status).toBe(404);
  });

  it("answers 404 while there is no logo", async () => {
    const res = await download();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Logo not found" },
    });
  });

  it("answers 415 for a type other than PNG or JPEG", async () => {
    const gif = await upload(Buffer.from("GIF89a"), "image/gif");
    const json = await upload(
      JSON.stringify({ logo: "x" }),
      "application/json",
    );

    for (const res of [gif, json]) {
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({
        error: {
          code: "unsupported_media_type",
          message:
            "Send the image as the request body, as image/png or image/jpeg",
        },
      });
    }
    expect((await download()).status).toBe(404);
  });

  it("answers 400 when the bytes are not the declared image", async () => {
    const mislabelled = await upload(png, "image/jpeg");
    const empty = await upload(Buffer.alloc(0), "image/png");

    expect(mislabelled.status).toBe(400);
    expect(await mislabelled.json()).toMatchObject({
      error: {
        code: "validation_error",
        issues: [{ path: "body", message: "Not a image/jpeg image" }],
      },
    });
    expect(empty.status).toBe(400);
    expect((await download()).status).toBe(404);
  });

  it("answers 413 above one megabyte", async () => {
    const big = Buffer.concat([png, Buffer.alloc(1024 * 1024)]);

    const res = await upload(big, "image/png");

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: "payload_too_large",
        message: "Request body is too large",
      },
    });
  });

  it("needs a session", async () => {
    const res = await upload(png, "image/png", null);

    expect(res.status).toBe(401);
  });

  it("is the signed-in user's organization's", async () => {
    await upload(png, "image/png");
    const otherId = await createOrganization();
    const other = await createUser(otherId, `other-${otherId}@example.com`);
    const otherCookie = await createSessionCookie(other);

    expect((await download(otherCookie)).status).toBe(404);
    expect(
      (await api.get<Settings>("/organization", { cookie: otherCookie })).body
        .hasLogo,
    ).toBe(false);
  });
});
