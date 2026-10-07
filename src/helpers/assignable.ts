import { ValidationError } from "../http/errors.ts";
import * as helpers from "./repository.ts";

// A job or a series can only be assigned to a helper that exists in the
// organization and is active. Nothing to check when no helper is given.
export async function assertAssignable(
  organizationId: string,
  helperId: string | null | undefined,
): Promise<void> {
  if (helperId === undefined || helperId === null) {
    return;
  }
  const helper = await helpers.findHelper(organizationId, helperId);
  if (helper === undefined) {
    throw new ValidationError([
      { path: "helperId", message: "Helper not found" },
    ]);
  }
  if (!helper.active) {
    throw new ValidationError([
      { path: "helperId", message: "Helper is not active" },
    ]);
  }
}
