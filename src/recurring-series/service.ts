// Business rules of recurring series: when jobs are generated, what a change
// to a series does to the jobs it already generated, and when a series can be
// deleted. The repository only knows SQL.
import { assertAssignable } from "../helpers/assignable.ts";
import { assignmentsOf, sameAssignments } from "../helpers/assigned.ts";
import { ConflictError, ValidationError } from "../http/errors.ts";
import * as organizations from "../organizations/repository.ts";
import { addDays, occurrences } from "./occurrences.ts";
import * as series from "./repository.ts";
import type {
  NewRecurringSeries,
  RecurringSeries,
  RecurringSeriesPatch,
} from "./repository.ts";

// Jobs exist at least this far ahead (project brief, section 3).
const horizonDays = 8 * 7;

// Generates the missing jobs of every series up to `until`, or up to the
// standard horizon when that is later. Safe to call as often as wanted.
export async function materialize(
  organizationId: string,
  until?: string,
): Promise<void> {
  const horizon = addDays(
    await organizations.today(organizationId),
    horizonDays,
  );
  const target = until !== undefined && until > horizon ? until : horizon;

  for (const s of await series.listSeriesToGenerate(organizationId, target)) {
    const from =
      s.generatedUntil === null ? s.startDate : addDays(s.generatedUntil, 1);
    const to = s.endDate !== null && s.endDate < target ? s.endDate : target;
    const dates = occurrences(s, from, to);
    await series.generateJobs(
      organizationId,
      s.id,
      s.generatedUntil,
      dates,
      target,
    );
  }
}

export async function createSeries(
  organizationId: string,
  input: NewRecurringSeries,
): Promise<RecurringSeries | undefined> {
  await assertAssignable(organizationId, input.helpers);
  const created = await series.createSeries(organizationId, input);
  if (created === undefined) {
    return undefined;
  }
  await materialize(organizationId);
  return series.findSeries(organizationId, created.id);
}

export async function updateSeries(
  organizationId: string,
  id: string,
  patch: RecurringSeriesPatch,
): Promise<RecurringSeries | undefined> {
  const before = await series.findSeries(organizationId, id);
  if (before === undefined) {
    return undefined;
  }
  const helpersBefore = assignmentsOf(before.helpers);
  await assertAssignable(
    organizationId,
    patch.helpers,
    helpersBefore.map((assignment) => assignment.helperId),
  );
  if (patch.endDate !== undefined && patch.endDate !== null) {
    if (patch.endDate < before.startDate) {
      throw new ValidationError([
        { path: "endDate", message: "Must not be before startDate" },
      ]);
    }
    // Ending removes the visits after the end, and an invoiced visit is not
    // removed. Checked here for the precise answer; the statement that ends
    // the series fails as a whole if an invoice appears in between.
    if (await series.hasInvoicedJobsAfter(organizationId, id, patch.endDate)) {
      throw new ConflictError(
        "Cannot end the series on that date: a later visit is already invoiced. Delete its invoice or choose a later endDate.",
      );
    }
  }

  const updated = await series.updateSeries(organizationId, id, patch);
  if (updated === undefined) {
    return undefined;
  }

  const today = await organizations.today(organizationId);
  await series.propagateTemplate(
    organizationId,
    id,
    today,
    templateChanges(before, patch),
  );
  if (
    patch.helpers !== undefined &&
    !sameAssignments(helpersBefore, patch.helpers)
  ) {
    await series.propagateHelpers(
      organizationId,
      id,
      today,
      helpersBefore,
      patch.helpers,
    );
  }
  if (patch.endDate === null) {
    // Reopened: generation resumes after the old end.
    await materialize(organizationId);
  }
  return series.findSeries(organizationId, id);
}

// The template fields of the patch, with the value the jobs had before. The
// helpers are not among them: they change together (`propagateHelpers`).
function templateChanges(
  before: RecurringSeries,
  patch: RecurringSeriesPatch,
): series.TemplateChange[] {
  const previous: Record<series.TemplateColumn, unknown> = {
    startTime: before.startTime,
    durationMinutes: before.durationMinutes,
    serviceType: before.serviceType,
    hourlyRateCents: before.hourlyRateCents,
    fixedPriceCents: before.fixedPriceCents,
    notes: before.notes,
  };
  const changes: series.TemplateChange[] = [];
  for (const key of Object.keys(
    series.templateColumns,
  ) as series.TemplateColumn[]) {
    const to = patch[key];
    if (to !== undefined && to !== previous[key]) {
      changes.push({
        column: series.templateColumns[key],
        from: previous[key],
        to,
      });
    }
  }
  return changes;
}

// A series can be deleted while none of its visits happened; afterwards it is
// ended with endDate instead, so the history stays.
export async function deleteSeries(
  organizationId: string,
  id: string,
): Promise<boolean> {
  if (await series.hasHistory(organizationId, id)) {
    throw new ConflictError(
      "Cannot delete: some of its jobs were completed or cancelled. Set endDate instead.",
    );
  }
  return series.deleteSeries(organizationId, id);
}
