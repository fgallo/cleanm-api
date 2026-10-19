import express, { Router } from "express";

import {
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "../http/errors.ts";
import * as invoices from "../invoices/repository.ts";
import * as organizations from "./repository.ts";
import { logoContentTypes } from "./repository.ts";
import type { LogoContentType } from "./repository.ts";
import { updateOrganizationSchema } from "./schemas.ts";

// The signed-in user's organization: a single resource, so no id in the path.
export const organizationRouter = Router();

organizationRouter.get("/", async (_req, res) => {
  res.json(await organizations.findOrganization(res.locals.organizationId));
});

// The next invoice number can only move past the numbers already used, or
// the next invoice would collide with an existing one.
organizationRouter.patch("/", async (req, res) => {
  const patch = updateOrganizationSchema.parse(req.body);
  if (patch.nextInvoiceNumber !== undefined) {
    const highest = await invoices.highestNumber(res.locals.organizationId);
    if (highest !== null && patch.nextInvoiceNumber <= highest) {
      throw new ValidationError([
        {
          path: "nextInvoiceNumber",
          message: `Must be greater than ${highest}, the highest invoice number`,
        },
      ]);
    }
  }
  res.json(
    await organizations.updateOrganization(res.locals.organizationId, patch),
  );
});

// --- Logo -----------------------------------------------------------------

// Images are small, and one per organization: the file is the request body,
// no multipart form. Only the image's own content type is parsed; any other
// leaves req.body empty, which the route answers below.
const logoLimit = "1mb";
const logoBody = express.raw({ type: [...logoContentTypes], limit: logoLimit });

// The first bytes every file of the type starts with.
const signatures: Record<LogoContentType, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

organizationRouter.put("/logo", logoBody, async (req, res) => {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim();
  if (!Buffer.isBuffer(req.body) || !isLogoContentType(contentType)) {
    throw new UnsupportedMediaTypeError(
      `Send the image as the request body, as ${logoContentTypes.join(" or ")}`,
    );
  }
  const content: Buffer = req.body;
  const signature = Buffer.from(signatures[contentType]);
  if (!content.subarray(0, signature.length).equals(signature)) {
    throw new ValidationError([
      { path: "body", message: `Not a ${contentType} image` },
    ]);
  }

  await organizations.setLogo(res.locals.organizationId, {
    content,
    contentType,
  });
  res.json(await organizations.findOrganization(res.locals.organizationId));
});

organizationRouter.get("/logo", async (_req, res) => {
  const logo = await organizations.findLogo(res.locals.organizationId);
  if (logo === undefined) {
    throw new NotFoundError("Logo not found");
  }
  // The browser may keep it, but must ask again (the ETag answers 304 when
  // nothing changed): a replaced logo shows up right away.
  res.set("cache-control", "private, no-cache");
  res.type(logo.contentType).send(logo.content);
});

organizationRouter.delete("/logo", async (_req, res) => {
  const deleted = await organizations.deleteLogo(res.locals.organizationId);
  if (!deleted) {
    throw new NotFoundError("Logo not found");
  }
  res.status(204).end();
});

function isLogoContentType(
  value: string | undefined,
): value is LogoContentType {
  return (logoContentTypes as readonly string[]).includes(value ?? "");
}
