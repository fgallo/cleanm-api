import { describe, expect, it } from "vitest";

import { createOrganization, startApi } from "../../test/api.ts";
import * as clients from "../clients/repository.ts";

const api = await startApi();

const missingId = "00000000-0000-7000-8000-000000000000";

const address = {
  addressLine1: "123 Example St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 0A1",
};

type PropertyBody = {
  id: string;
  clientId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

async function createClient(): Promise<string> {
  const res = await api.post<{ id: string }>("/clients", { name: "Jane Doe" });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function createProperty(
  clientId: string,
  input: object = {},
): Promise<PropertyBody> {
  const res = await api.post<PropertyBody>(`/clients/${clientId}/properties`, {
    ...address,
    ...input,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// A client that exists, but in an organization the API is not serving.
async function createClientElsewhere(): Promise<string> {
  const other = await createOrganization();
  const client = await clients.createClient(other, { name: "Someone Else" });
  return client.id;
}

describe("POST /clients/:clientId/properties", () => {
  it("creates a property for the client", async () => {
    const clientId = await createClient();

    const res = await api.post(`/clients/${clientId}/properties`, {
      ...address,
      addressLine2: "Unit 4",
      country: "US",
      notes: "Key under the mat",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      clientId,
      ...address,
      addressLine2: "Unit 4",
      country: "US",
      notes: "Key under the mat",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("defaults the country to CA and the optional fields to null", async () => {
    const property = await createProperty(await createClient());

    expect(property).toMatchObject({
      country: "CA",
      addressLine2: null,
      notes: null,
    });
  });

  it("stores the country in upper case", async () => {
    const property = await createProperty(await createClient(), {
      country: "us",
    });

    expect(property.country).toBe("US");
  });

  it("answers 400 with one issue per invalid field", async () => {
    const clientId = await createClient();

    const res = await api.post(`/clients/${clientId}/properties`, {
      city: "Toronto",
      country: "Canada",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "validation_error",
        issues: [
          { path: "addressLine1" },
          { path: "province" },
          { path: "postalCode" },
          { path: "country", message: "Must be a two-letter country code" },
        ],
      },
    });
  });

  it("answers 404 for a client that does not exist", async () => {
    const res = await api.post(`/clients/${missingId}/properties`, address);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Client not found" } },
    });
  });

  it("answers 404 for a client of another organization", async () => {
    const clientId = await createClientElsewhere();

    const res = await api.post(`/clients/${clientId}/properties`, address);

    expect(res.status).toBe(404);
  });
});

describe("GET /clients/:clientId/properties", () => {
  it("lists the properties of the client in creation order", async () => {
    const clientId = await createClient();
    const first = await createProperty(clientId, { city: "Toronto" });
    const second = await createProperty(clientId, { city: "Mississauga" });
    await createProperty(await createClient(), { city: "Ottawa" });

    const res = await api.get(`/clients/${clientId}/properties`);

    expect(res).toEqual({ status: 200, body: [first, second] });
  });

  it("returns an empty list for a client without properties", async () => {
    const clientId = await createClient();

    const res = await api.get(`/clients/${clientId}/properties`);

    expect(res).toEqual({ status: 200, body: [] });
  });

  it("answers 404 for a client that does not exist", async () => {
    const res = await api.get(`/clients/${missingId}/properties`);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Client not found" } },
    });
  });

  it("answers 400 for a client id that is not a UUID", async () => {
    const res = await api.get("/clients/not-a-uuid/properties");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "clientId" }] },
    });
  });
});

describe("GET /properties/:id", () => {
  it("returns the property", async () => {
    const property = await createProperty(await createClient());

    const res = await api.get(`/properties/${property.id}`);

    expect(res).toEqual({ status: 200, body: property });
  });

  it("answers 404 for a property that does not exist", async () => {
    const res = await api.get(`/properties/${missingId}`);

    expect(res).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Property not found" } },
    });
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const res = await api.get("/properties/not-a-uuid");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /properties/:id", () => {
  it("updates only the fields sent", async () => {
    const property = await createProperty(await createClient(), {
      country: "US",
      notes: "Key under the mat",
    });

    const res = await api.patch<PropertyBody>(`/properties/${property.id}`, {
      postalCode: "14202",
    });

    expect(res.status).toBe(200);
    // The country stays: a schema default must not leak into a patch.
    expect(res.body).toEqual({
      ...property,
      postalCode: "14202",
      updatedAt: expect.any(String),
    });
    expect(res.body.updatedAt > property.updatedAt).toBe(true);
  });

  it("clears a field set to null", async () => {
    const property = await createProperty(await createClient(), {
      addressLine2: "Unit 4",
    });

    const res = await api.patch(`/properties/${property.id}`, {
      addressLine2: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ addressLine2: null });
  });

  it("answers 400 when a required field is set to null", async () => {
    const property = await createProperty(await createClient());

    const res = await api.patch(`/properties/${property.id}`, {
      country: null,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "validation_error", issues: [{ path: "country" }] },
    });
  });

  it("answers 400 for an empty patch", async () => {
    const property = await createProperty(await createClient());

    const res = await api.patch(`/properties/${property.id}`, {});

    expect(res.status).toBe(400);
  });

  it("answers 404 for a property that does not exist", async () => {
    const res = await api.patch(`/properties/${missingId}`, { city: "Ottawa" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /properties/:id", () => {
  it("deletes the property", async () => {
    const property = await createProperty(await createClient());

    const res = await api.delete(`/properties/${property.id}`);

    expect(res).toEqual({ status: 204, body: undefined });
    expect((await api.get(`/properties/${property.id}`)).status).toBe(404);
  });

  it("answers 404 for a property that does not exist", async () => {
    const res = await api.delete(`/properties/${missingId}`);

    expect(res.status).toBe(404);
  });

  it("answers 409 when the property has jobs, so history is kept", async () => {
    const property = await createProperty(await createClient());
    const job = await api.post("/jobs", {
      propertyId: property.id,
      scheduledDate: "2026-10-14",
      startTime: "09:00",
      durationMinutes: 60,
      serviceType: "regular",
      hourlyRateCents: 4500,
    });
    expect(job.status).toBe(201);

    const res = await api.delete(`/properties/${property.id}`);

    expect(res).toEqual({
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "Cannot delete: still referenced by jobs",
        },
      },
    });
    expect((await api.get(`/properties/${property.id}`)).status).toBe(200);
  });
});

describe("DELETE /clients/:id", () => {
  it("deletes the properties of the client", async () => {
    const clientId = await createClient();
    const property = await createProperty(clientId);

    await api.delete(`/clients/${clientId}`);

    expect((await api.get(`/properties/${property.id}`)).status).toBe(404);
  });
});
