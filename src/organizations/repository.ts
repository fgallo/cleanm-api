import { buildSetClause } from "../db/patch.ts";
import { pool } from "../db/pool.ts";
import { single } from "../db/rows.ts";

export type OrganizationSettings = {
  id: string;
  name: string;
  timezone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  paymentInstructions: string | null;
  taxName: string | null;
  // 1300 means 13.00%; 0 with no registration number is "no tax".
  taxRateBasisPoints: number;
  taxRegistrationNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Only the keys present are updated; null clears a field.
export type OrganizationPatch = Partial<
  Omit<OrganizationSettings, "id" | "createdAt" | "updatedAt">
>;

const patchableColumns: Record<keyof OrganizationPatch, string> = {
  name: "name",
  timezone: "timezone",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  province: "province",
  postalCode: "postal_code",
  country: "country",
  phone: "phone",
  email: "email",
  paymentInstructions: "payment_instructions",
  taxName: "tax_name",
  taxRateBasisPoints: "tax_rate_basis_points",
  taxRegistrationNumber: "tax_registration_number",
};

const columns = `
  id,
  name,
  timezone,
  address_line1 AS "addressLine1",
  address_line2 AS "addressLine2",
  city,
  province,
  postal_code AS "postalCode",
  country,
  phone,
  email,
  payment_instructions AS "paymentInstructions",
  tax_name AS "taxName",
  tax_rate_basis_points AS "taxRateBasisPoints",
  tax_registration_number AS "taxRegistrationNumber",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function findOrganization(
  organizationId: string,
): Promise<OrganizationSettings> {
  const { rows } = await pool.query<OrganizationSettings>(
    `SELECT ${columns} FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return single(rows);
}

export async function updateOrganization(
  organizationId: string,
  patch: OrganizationPatch,
): Promise<OrganizationSettings> {
  const set = buildSetClause(patch, patchableColumns, 2);
  if (set.values.length === 0) {
    return findOrganization(organizationId);
  }

  const { rows } = await pool.query<OrganizationSettings>(
    `UPDATE organizations
     SET ${set.assignments}, updated_at = now()
     WHERE id = $1
     RETURNING ${columns}`,
    [organizationId, ...set.values],
  );
  return single(rows);
}

// Today's date on the organization's calendar, as YYYY-MM-DD. "Today" depends
// on the time zone: late evening in Toronto is already tomorrow in UTC.
export async function today(organizationId: string): Promise<string> {
  const { rows } = await pool.query<{ today: string }>(
    `SELECT (now() AT TIME ZONE timezone)::date AS today
     FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return single(rows).today;
}
