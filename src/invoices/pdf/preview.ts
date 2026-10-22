// Renders a sample invoice to tmp/invoice-preview.html and .pdf, to adjust
// the layout in template.ts: open the HTML in a browser, edit, run again.
// Run with `npm run pdf:preview`. No database involved.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import puppeteer from "puppeteer";

import { closeBrowser, renderPdf } from "./render.ts";
import { sampleInvoice, sampleOrganization } from "./sample.ts";
import { invoiceHtml } from "./template.ts";

const outDir = path.resolve(import.meta.dirname, "../../../tmp");

// A logo drawn by the browser itself, so the preview needs no image file.
async function sampleLogo(): Promise<Buffer> {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="logo" style="width:120px;height:120px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        background:#1d4ed8;color:#fff;font:700 48px sans-serif">ML</div>`);
    const element = await page.$("#logo");
    if (element === null) {
      throw new Error("Logo element not found");
    }
    return Buffer.from(await element.screenshot({ type: "png" }));
  } finally {
    await browser.close();
  }
}

const html = invoiceHtml({
  invoice: {
    ...sampleInvoice,
    dueDate: "2026-10-17",
    discountBasisPoints: 1500,
    discountCents: 1688,
    discountDescription: "Referral for 1 cleaning",
    totalCents: 9562,
    amountDueCents: 9562,
    notes: "Thank you for your business.",
  },
  organization: sampleOrganization,
  logo: { content: await sampleLogo(), contentType: "image/png" },
});

try {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "invoice-preview.html"), html);
  await writeFile(
    path.join(outDir, "invoice-preview.pdf"),
    await renderPdf(html),
  );
  console.log(`Written to ${outDir}/invoice-preview.{html,pdf}`);
} finally {
  await closeBrowser();
}
