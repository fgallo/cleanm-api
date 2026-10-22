import { describe, expect, it } from "vitest";

import type { OrganizationSettings } from "../../organizations/repository.ts";
import type { Invoice } from "../repository.ts";
import { sampleInvoice, sampleOrganization } from "./sample.ts";
import { escape, formatDate, formatMoney, invoiceHtml } from "./template.ts";

// The page is checked as text: what it prints, and what it leaves out.
// Rendering to PDF is covered by the endpoint test.

function page(
  changes: Partial<Invoice> = {},
  settings: Partial<OrganizationSettings> = {},
): string {
  return invoiceHtml({
    invoice: { ...sampleInvoice, ...changes },
    organization: { ...sampleOrganization, ...settings },
    logo: undefined,
  });
}

describe("formatting", () => {
  it("prints money in Canadian dollars and dates in long form", () => {
    expect(formatMoney(19125)).toBe("$191.25");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-1250)).toBe("-$12.50");
    expect(formatDate("2026-10-16")).toBe("October 16, 2026");
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("escapes what comes from the database", () => {
    expect(escape(`<b>"Jane" & Co</b>`)).toBe(
      "&lt;b&gt;&quot;Jane&quot; &amp; Co&lt;/b&gt;",
    );
    expect(page({ description: "<script>alert(1)</script>" })).not.toContain(
      "<script>",
    );
  });
});

describe("invoiceHtml", () => {
  it("prints the business, the client, the dates and the line", () => {
    const html = page();

    for (const text of [
      "Maple Leaf Cleaning",
      "456 Sample Ave",
      "Toronto, ON M4B 1B3",
      "416-555-0100",
      "www.example.com",
      "Jane Doe",
      "123 Example St",
      "Apt 702",
      "Toronto, ON M5V 0A1",
      "<td>134</td>",
      "October 16, 2026",
      "On receipt",
      "Regular cleaning",
      "October 14, 2026",
      "2.5h",
      "$45.00",
      "$112.50",
      "Interac e-Transfer: hello@example.com",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Discount");
    expect(html).not.toContain("Paid");
    expect(html).not.toContain("<img");
  });

  it("prints a fixed price as one unit", () => {
    const html = page({
      fixedPriceCents: 20000,
      subtotalCents: 20000,
      totalCents: 20000,
      amountDueCents: 20000,
    });

    expect(html).toContain('<td class="num">1</td>');
    expect(html).toContain("$200.00");
    expect(html).not.toContain("2.5h");
  });

  it("prints the due date, the discount with its label, the tax and the payments", () => {
    const html = page(
      {
        dueDate: "2026-10-17",
        discountBasisPoints: 1500,
        discountCents: 1688,
        discountDescription: "Referral for 1 cleaning",
        taxName: "HST",
        taxRateBasisPoints: 1300,
        taxCents: 1243,
        totalCents: 10805,
        paidCents: 5000,
        amountDueCents: 5805,
        notes: "Thank you!",
      },
      { taxName: "HST", taxRegistrationNumber: "123456789 RT0001" },
    );

    for (const text of [
      "October 17, 2026",
      "Referral for 1 cleaning (15%)",
      "-$16.88",
      "HST (13%)",
      "$12.43",
      "HST No. 123456789 RT0001",
      "$108.05",
      "<th>Paid</th><td>-$50.00</td>",
      "$58.05",
      "Thank you!",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("On receipt");
  });

  it("labels a fixed discount without a description as Discount", () => {
    const html = page({ fixedDiscountCents: 1000, discountCents: 1000 });

    expect(html).toContain("<th>Discount</th><td>-$10.00</td>");
  });

  it("embeds the logo when there is one", () => {
    const html = invoiceHtml({
      invoice: sampleInvoice,
      organization: sampleOrganization,
      logo: { content: Buffer.from("png-bytes"), contentType: "image/png" },
    });

    expect(html).toContain(
      `<img class="logo" src="data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}"`,
    );
  });

  it("leaves out the notes block when there is nothing to print", () => {
    const html = page({ notes: null }, { paymentInstructions: null });

    expect(html).not.toContain("Notes / Terms");
  });
});
