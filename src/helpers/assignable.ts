import { ValidationError } from "../http/errors.ts";
import type { Issue } from "../http/errors.ts";
import type { HelperAssignment } from "./assigned.ts";
import * as helpers from "./repository.ts";

// A job or a series can only be given helpers that exist in the organization
// and are active. A helper it already has stays assignable to it after they
// are deactivated (`alreadyAssigned`, their ids): the list in an update
// carries every helper, so changing one must not refuse the others. Nothing
// to check when no list is given. Each issue names the place in the list.
export async function assertAssignable(
  organizationId: string,
  assignments: HelperAssignment[] | undefined,
  alreadyAssigned: string[] = [],
): Promise<void> {
  const issues: Issue[] = [];
  for (const [index, { helperId }] of (assignments ?? []).entries()) {
    const helper = await helpers.findHelper(organizationId, helperId);
    const path = `helpers.${index}.helperId`;
    if (helper === undefined) {
      issues.push({ path, message: "Helper not found" });
    } else if (!helper.active && !alreadyAssigned.includes(helperId)) {
      issues.push({ path, message: "Helper is not active" });
    }
  }
  if (issues.length > 0) {
    throw new ValidationError(issues);
  }
}
