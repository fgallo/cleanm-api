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
  // Printed as it is, e.g. "www.example.com".
  website: string | null;
  paymentInstructions: string | null;
  taxName: string | null;
  // 1300 means 13.00%; 0 with no registration number is "no tax".
  taxRateBasisPoints: number;
  taxRegistrationNumber: string | null;
  // The number the next invoice gets. Set once when moving from another
  // tool, so the sequence continues.
  nextInvoiceNumber: number;
  // The logo itself is served by GET /organization/logo.
  hasLogo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Only the keys present are updated; null clears a field.
export type OrganizationPatch = Partial<
  Omit<OrganizationSettings, "id" | "hasLogo" | "createdAt" | "updatedAt">
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
  website: "website",
  paymentInstructions: "payment_instructions",
  taxName: "tax_name",
  taxRateBasisPoints: "tax_rate_basis_points",
  taxRegistrationNumber: "tax_registration_number",
  nextInvoiceNumber: "next_invoice_number",
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
  website,
  payment_instructions AS "paymentInstructions",
  tax_name AS "taxName",
  tax_rate_basis_points AS "taxRateBasisPoints",
  tax_registration_number AS "taxRegistrationNumber",
  next_invoice_number AS "nextInvoiceNumber",
  logo IS NOT NULL AS "hasLogo",
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

// --- Logo -----------------------------------------------------------------

export const logoContentTypes = ["image/png", "image/jpeg"] as const;
export type LogoContentType = (typeof logoContentTypes)[number];

export type Logo = { content: Buffer; contentType: LogoContentType };

// Read apart from the settings: the image is the one large column.
export async function findLogo(
  organizationId: string,
): Promise<Logo | undefined> {
  const { rows } = await pool.query<{
    content: Buffer | null;
    contentType: LogoContentType | null;
  }>(
    `SELECT logo AS content, logo_content_type AS "contentType"
     FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const row = single(rows);
  if (row.content === null || row.contentType === null) {
    return undefined;
  }
  return { content: row.content, contentType: row.contentType };
}

export async function setLogo(
  organizationId: string,
  logo: Logo,
): Promise<void> {
  await pool.query(
    `UPDATE organizations
     SET logo = $2, logo_content_type = $3, updated_at = now()
     WHERE id = $1`,
    [organizationId, logo.content, logo.contentType],
  );
}

// True when there was a logo to remove.
export async function deleteLogo(organizationId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE organizations
     SET logo = NULL, logo_content_type = NULL, updated_at = now()
     WHERE id = $1 AND logo IS NOT NULL`,
    [organizationId],
  );
  return (rowCount ?? 0) > 0;
}
