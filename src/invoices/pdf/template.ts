// The invoice as a page: plain HTML and CSS, rendered to PDF by render.ts.
// To adjust the layout, write the output of invoiceHtml to a file and open it
// in a browser; what the browser prints is what the PDF shows.
import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  Logo,
  OrganizationSettings,
} from "../../organizations/repository.ts";
import type { Invoice } from "../repository.ts";

// One business, in Canada: the organization has no currency or locale yet.
const locale = "en-CA";
const currency = "CAD";

// Embedded so the PDF looks the same on every machine. Inter, SIL Open Font
// License (fonts/OFL.txt); swap the file to change the typeface.
const font = readFileSync(
  path.resolve(import.meta.dirname, "fonts/Inter-Variable.ttf"),
).toString("base64");

const money = new Intl.NumberFormat(locale, { style: "currency", currency });
const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat(locale, {
  dateStyle: "long",
  timeZone: "UTC",
});

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

// A calendar date (YYYY-MM-DD) as "October 16, 2026".
export function formatDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}

export type InvoicePage = {
  invoice: Invoice;
  organization: OrganizationSettings;
  logo: Logo | undefined;
};

export function invoiceHtml({
  invoice,
  organization,
  logo,
}: InvoicePage): string {
  const hourly = invoice.fixedPriceCents === null;
  const line = {
    quantity: hourly ? quantity.format(invoice.durationMinutes / 60) : "1",
    unit: hourly ? "h" : "",
    price: formatMoney(
      hourly ? invoice.hourlyRateCents : (invoice.fixedPriceCents ?? 0),
    ),
  };
  const taxRate = invoice.taxRateBasisPoints / 100;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${invoice.number}</title>
<style>
  @font-face {
    font-family: "Inter";
    src: url(data:font/ttf;base64,${font}) format("truetype");
    font-weight: 100 900;
  }
  @page { size: letter; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Inter", sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1f2937;
  }
  h1 {
    margin: 0;
    font-size: 30pt;
    font-weight: 300;
    letter-spacing: 0.08em;
    color: #111827;
  }
  .muted { color: #6b7280; }
  .right { text-align: right; }
  .strong { font-weight: 600; }
  .row { display: flex; justify-content: space-between; gap: 24px; }
  .header { align-items: flex-start; padding-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
  .logo { max-height: 90px; max-width: 220px; }
  .parties { margin-top: 22px; }
  .label { font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; }
  .facts { border-collapse: collapse; }
  .facts th { padding: 2px 12px 2px 0; text-align: right; font-weight: 600; white-space: nowrap; }
  .facts td { padding: 2px 0; }
  .facts .due th, .facts .due td { background: #f3f4f6; padding-top: 5px; padding-bottom: 5px; }
  .facts .due td { padding-right: 10px; }
  table.items { width: 100%; margin-top: 28px; border-collapse: collapse; }
  table.items th {
    padding: 8px 10px;
    background: #374151;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
  }
  table.items td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
  table.items .num { text-align: right; white-space: nowrap; }
  table.totals { margin-top: 14px; margin-left: auto; border-collapse: collapse; min-width: 300px; }
  table.totals th { padding: 5px 16px 5px 0; text-align: right; font-weight: 400; }
  table.totals td { padding: 5px 10px; text-align: right; white-space: nowrap; }
  table.totals .strong th, table.totals .strong td { font-weight: 600; border-top: 1px solid #d1d5db; }
  table.totals .due th, table.totals .due td { background: #f3f4f6; font-weight: 600; }
  .notes { margin-top: 36px; }
  .notes h2 { margin: 0 0 4px; font-size: 10.5pt; font-weight: 600; color: #6b7280; }
  .notes div { white-space: pre-line; }
</style>
</head>
<body>
  <div class="row header">
    <div>${logo === undefined ? "" : `<img class="logo" src="${dataUrl(logo)}" alt="">`}</div>
    <div class="right">
      <h1>INVOICE</h1>
      <div class="strong">${escape(organization.name)}</div>
      ${lines([
        organization.addressLine1,
        organization.addressLine2,
        joinPresent([organization.city, organization.province], ", ") +
          (organization.postalCode === null
            ? ""
            : ` ${organization.postalCode}`),
        organization.phone,
        organization.email,
        organization.website,
        organization.taxRegistrationNumber === null
          ? null
          : `${organization.taxName ?? "Tax"} No. ${organization.taxRegistrationNumber}`,
      ])}
    </div>
  </div>

  <div class="row parties">
    <div>
      <div class="label">Bill to</div>
      <div class="strong">${escape(invoice.client.name)}</div>
      ${lines([
        invoice.property.addressLine1,
        invoice.property.addressLine2,
        `${invoice.property.city}, ${invoice.property.province} ${invoice.property.postalCode}`,
        invoice.client.email,
      ])}
    </div>
    <table class="facts">
      <tr><th>Invoice number</th><td>${invoice.number}</td></tr>
      <tr><th>Invoice date</th><td>${formatDate(invoice.issueDate)}</td></tr>
      <tr><th>Payment due</th><td>${invoice.dueDate === null ? "On receipt" : formatDate(invoice.dueDate)}</td></tr>
      <tr class="due"><th>Amount due (${currency})</th><td>${formatMoney(invoice.amountDueCents)}</td></tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Description</th>
        <th>Date</th>
        <th class="num">Quantity</th>
        <th class="num">Price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escape(invoice.description)}</td>
        <td>${formatDate(invoice.serviceDate)}</td>
        <td class="num">${line.quantity}${line.unit}</td>
        <td class="num">${line.price}</td>
        <td class="num">${formatMoney(invoice.subtotalCents)}</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <tr><th>Subtotal</th><td>${formatMoney(invoice.subtotalCents)}</td></tr>
    ${
      invoice.discountCents === 0
        ? ""
        : `<tr><th>${escape(discountLabel(invoice))}</th><td>-${formatMoney(invoice.discountCents)}</td></tr>`
    }
    ${
      invoice.taxRateBasisPoints === 0
        ? ""
        : `<tr><th>${escape(invoice.taxName ?? "Tax")} (${quantity.format(taxRate)}%)</th><td>${formatMoney(invoice.taxCents)}</td></tr>`
    }
    <tr class="strong"><th>Total</th><td>${formatMoney(invoice.totalCents)}</td></tr>
    ${
      invoice.paidCents === 0
        ? ""
        : `<tr><th>Paid</th><td>-${formatMoney(invoice.paidCents)}</td></tr>`
    }
    <tr class="due"><th>Amount due (${currency})</th><td>${formatMoney(invoice.amountDueCents)}</td></tr>
  </table>

  ${
    invoice.notes === null && organization.paymentInstructions === null
      ? ""
      : `<div class="notes">
    <h2>Notes / Terms</h2>
    ${lines([invoice.notes, organization.paymentInstructions])}
  </div>`
  }
</body>
</html>
`;
}

// "Discount", or what the owner wrote, with the percentage when it is one.
function discountLabel(invoice: Invoice): string {
  const what = invoice.discountDescription ?? "Discount";
  return invoice.discountBasisPoints === null
    ? what
    : `${what} (${quantity.format(invoice.discountBasisPoints / 100)}%)`;
}

function dataUrl(logo: Logo): string {
  return `data:${logo.contentType};base64,${logo.content.toString("base64")}`;
}

// One <div> per present value, escaped.
function lines(values: Array<string | null | undefined>): string {
  return values
    .filter(
      (value): value is string =>
        value !== null && value !== undefined && value !== "",
    )
    .map((value) => `<div>${escape(value)}</div>`)
    .join("\n      ");
}

function joinPresent(values: Array<string | null>, separator: string): string {
  return values.filter((value) => value !== null).join(separator);
}

// Everything that comes from the database goes through here: a client named
// "<b>" stays text.
export function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
