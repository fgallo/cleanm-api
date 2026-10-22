// HTML to PDF through Chromium. One browser per process, launched on the
// first PDF and kept: launching takes longer than rendering a page.
import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";

let browserPromise: Promise<Browser> | undefined;

function browser(): Promise<Browser> {
  browserPromise ??= puppeteer.launch().catch((error: unknown) => {
    // A failed launch (no Chromium installed, for instance) is not final:
    // the next request tries again.
    browserPromise = undefined;
    throw error;
  });
  return browserPromise;
}

// The page sizes itself with @page in its CSS.
export async function renderPdf(html: string): Promise<Buffer> {
  const page = await (await browser()).newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// For tests and orderly shutdowns; a process that just exits takes the
// browser with it.
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = undefined;
  if (pending !== undefined) {
    await (await pending).close();
  }
}
