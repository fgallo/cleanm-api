// Invented clients, properties, helpers, visits, invoices and payments for a
// development database: enough for the calendar, the invoices list and the
// revenue page to have something to show. Never real client data (project
// brief, section 8).
//
// Everything goes through the repositories and services, so the data obeys
// the same rules as the API: series materialize their visits, invoices take
// the next number and copy the job's price. Dates are relative to today on
// the organization's calendar, so the calendar is full whenever this runs.
import * as clients from "../clients/repository.ts";
import * as helpers from "../helpers/repository.ts";
import { defaultDescription } from "../invoices/description.ts";
import * as invoices from "../invoices/repository.ts";
import * as jobs from "../jobs/repository.ts";
import type { Job, JobPatch, JobStatus } from "../jobs/repository.ts";
import * as organizations from "../organizations/repository.ts";
import * as payments from "../payments/repository.ts";
import type { PaymentMethod } from "../payments/repository.ts";
import * as properties from "../properties/repository.ts";
import type { NewProperty } from "../properties/repository.ts";
import { addDays } from "../recurring-series/occurrences.ts";
import type { JobTemplate } from "../recurring-series/repository.ts";
import * as recurringSeries from "../recurring-series/service.ts";

export type SampleDataSummary = {
  clients: number;
  properties: number;
  helpers: number;
  recurringSeries: number;
  jobs: number;
  invoices: number;
  payments: number;
};

// --- The data ---------------------------------------------------------------

const sampleHelpers = [
  { name: "Carla Mendes", phone: "416-555-0101", active: true },
  { name: "Diego Alves", phone: "416-555-0102", active: true },
  // Left last month: still on the past visits, not offered for new ones.
  { name: "Fatima Noor", phone: null, active: false },
] as const;

type HelperName = (typeof sampleHelpers)[number]["name"];

type Weekday =
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

// When the visits of a series happen, relative to today: every N weeks on a
// weekday, or on a day of the month, starting some weeks or months back so the
// history has completed visits to invoice.
type Rule =
  | {
      everyWeeks: number;
      weekday: Weekday;
      weeksAgo: number;
      // Set on a series that was ended: no upcoming visits.
      endedWeeksAgo?: number;
    }
  | { dayOfMonth: number; monthsAgo: number };

type Discount = {
  basisPoints?: number;
  fixedCents?: number;
  description: string;
};

type Template = Omit<JobTemplate, "helperId"> & { helper?: HelperName };

type SampleSeries = Template & {
  rule: Rule;
  // Visits edited on their own, as the owner does: so many weeks from the
  // last visit day on or before today (negative is the past).
  visits?: Array<{ weeksFromToday: number; patch: JobPatch }>;
  // Completed visits more recent than this many days have no invoice yet:
  // the owner has not caught up.
  uninvoicedDays?: number;
};

// A visit outside any series: so many days before or after today, or on the
// next given weekday.
type SampleJob = Template & {
  when: number | { next: Weekday };
  status?: JobStatus;
  discount?: Discount;
};

type SampleProperty = {
  address: NewProperty;
  series?: SampleSeries;
  jobs?: SampleJob[];
};

type SampleClient = {
  name: string;
  email?: string;
  phone?: string;
  // How the client usually pays.
  paysBy?: PaymentMethod;
  properties: SampleProperty[];
};

const toronto = { city: "Toronto", province: "ON" };

const sampleClients: SampleClient[] = [
  {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "416-555-0111",
    properties: [
      {
        address: {
          addressLine1: "123 Maple Grove Ave",
          ...toronto,
          postalCode: "M5V 0A1",
          notes: "Spare key in the lockbox by the side door. Two cats.",
        },
        series: {
          rule: { everyWeeks: 1, weekday: "tuesday", weeksAgo: 12 },
          startTime: "09:00",
          durationMinutes: 150,
          serviceType: "regular",
          hourlyRateCents: 4500,
          helper: "Carla Mendes",
          visits: [
            {
              weeksFromToday: -3,
              patch: { status: "cancelled", notes: "Client away" },
            },
            {
              weeksFromToday: 1,
              patch: { durationMinutes: 210, notes: "Windows too this time" },
            },
          ],
        },
      },
    ],
  },
  {
    name: "John Smith",
    email: "john@example.com",
    phone: "647-555-0112",
    properties: [
      {
        address: {
          addressLine1: "88 Birchwood Crescent",
          addressLine2: "Apt 1203",
          ...toronto,
          postalCode: "M4Y 0B2",
          notes: "Buzz 1203. Visitor parking, spot 4.",
        },
        series: {
          rule: { everyWeeks: 2, weekday: "thursday", weeksAgo: 12 },
          startTime: "13:00",
          durationMinutes: 180,
          serviceType: "regular",
          hourlyRateCents: 4500,
        },
        jobs: [
          {
            when: { next: "saturday" },
            startTime: "10:00",
            durationMinutes: 120,
            serviceType: "regular",
            hourlyRateCents: 4500,
            notes: "Extra visit before a party",
          },
        ],
      },
    ],
  },
  {
    name: "Maria Garcia",
    email: "maria@example.com",
    phone: "416-555-0113",
    properties: [
      {
        address: {
          addressLine1: "15 Oakridge Rd",
          city: "Etobicoke",
          province: "ON",
          postalCode: "M9C 0C3",
          notes: "Dog in the backyard, friendly.",
        },
        series: {
          rule: { everyWeeks: 4, weekday: "monday", weeksAgo: 12 },
          startTime: "10:00",
          durationMinutes: 240,
          serviceType: "regular",
          hourlyRateCents: 4500,
          fixedPriceCents: 22000,
          helper: "Diego Alves",
        },
      },
      {
        address: {
          addressLine1: "7 Cedar Lane",
          city: "Mississauga",
          province: "ON",
          postalCode: "L5B 0D4",
          notes: "Rental unit, tenants moved out.",
        },
        jobs: [
          {
            when: -10,
            startTime: "09:00",
            durationMinutes: 300,
            serviceType: "move_out",
            hourlyRateCents: 5000,
            fixedPriceCents: 38000,
            helper: "Diego Alves",
            discount: { fixedCents: 3000, description: "Returning client" },
          },
        ],
      },
    ],
  },
  {
    name: "Wei Chen",
    email: "wei@example.com",
    phone: "416-555-0114",
    paysBy: "cash",
    properties: [
      {
        address: {
          addressLine1: "300 Willow Court",
          addressLine2: "Unit 5",
          city: "North York",
          province: "ON",
          postalCode: "M2N 0E5",
          notes: "Shoes off. Hardwood floors, no vinegar.",
        },
        series: {
          rule: { dayOfMonth: 14, monthsAgo: 3 },
          startTime: "09:00",
          durationMinutes: 180,
          serviceType: "regular",
          hourlyRateCents: 5000,
          helper: "Carla Mendes",
        },
      },
    ],
  },
  {
    name: "Priya Patel",
    email: "priya@example.com",
    phone: "647-555-0115",
    properties: [
      {
        address: {
          addressLine1: "42 Pinehurst Blvd",
          city: "Scarborough",
          province: "ON",
          postalCode: "M1B 0F6",
        },
        jobs: [
          {
            when: 9,
            startTime: "08:00",
            durationMinutes: 360,
            serviceType: "move_out",
            hourlyRateCents: 5000,
            fixedPriceCents: 42000,
            status: "estimated",
            notes: "Quote sent, waiting for the key handover date",
          },
        ],
      },
    ],
  },
  {
    name: "Olivia Brown",
    email: "olivia@example.com",
    phone: "416-555-0116",
    properties: [
      {
        address: {
          addressLine1: "9 Elmwood Place",
          ...toronto,
          postalCode: "M6G 0G7",
          notes: "Alarm code with the owner. Call before arriving.",
        },
        series: {
          rule: { everyWeeks: 1, weekday: "friday", weeksAgo: 12 },
          startTime: "08:30",
          durationMinutes: 120,
          serviceType: "regular",
          hourlyRateCents: 4500,
          helper: "Diego Alves",
          uninvoicedDays: 14,
        },
      },
    ],
  },
  {
    name: "Ahmed Hassan",
    email: "ahmed@example.com",
    phone: "416-555-0117",
    paysBy: "cash",
    properties: [
      {
        address: {
          addressLine1: "210 Spruce Parkway",
          addressLine2: "Apt 8",
          ...toronto,
          postalCode: "M5A 0H8",
        },
        jobs: [
          {
            when: -35,
            startTime: "09:00",
            durationMinutes: 240,
            serviceType: "deep",
            hourlyRateCents: 4500,
            helper: "Carla Mendes",
            discount: {
              basisPoints: 1000,
              description: "Referral for 1 cleaning",
            },
          },
          {
            when: 21,
            startTime: "09:00",
            durationMinutes: 150,
            serviceType: "regular",
            hourlyRateCents: 4500,
          },
        ],
      },
    ],
  },
  {
    name: "Sophie Martin",
    phone: "647-555-0118",
    properties: [
      {
        address: {
          addressLine1: "64 Aspen St",
          ...toronto,
          postalCode: "M6K 0J9",
        },
        series: {
          rule: {
            everyWeeks: 2,
            weekday: "wednesday",
            weeksAgo: 20,
            endedWeeksAgo: 3,
          },
          startTime: "12:00",
          durationMinutes: 150,
          serviceType: "regular",
          hourlyRateCents: 4800,
          helper: "Fatima Noor",
          notes: "Moved out of the city",
        },
      },
    ],
  },
];

// How the history is settled, in days before today: invoices older than
// `paidDays` are paid in full; between that and `partlyPaidDays`, the oldest
// one is paid in part; the rest are outstanding. Payments arrive a few days
// after the invoice, and the invoice is due the day after it is issued.
const paidDays = 14;
const partlyPaidDays = 7;
const paymentDelayDays = 3;
const dueDays = 1;

// The jobs to look at: the oldest series starts 20 weeks back, and series
// reach at least 8 weeks ahead.
const lookBackDays = 21 * 7;
const lookAheadDays = 10 * 7;

// --- Dates ------------------------------------------------------------------

const weekdayNumbers: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// The last `weekday` on or before `today`.
function lastWeekday(today: string, weekday: Weekday): string {
  return addDays(
    today,
    -((weekdayOf(today) - weekdayNumbers[weekday] + 7) % 7),
  );
}

// The first `weekday` after `today`.
function nextWeekday(today: string, weekday: Weekday): string {
  const ahead = (weekdayNumbers[weekday] - weekdayOf(today) + 7) % 7;
  return addDays(today, ahead === 0 ? 7 : ahead);
}

// The given day of the month, `monthsAgo` months back. Days up to 28 exist
// in every month.
function dayOfMonthMonthsAgo(
  today: string,
  monthsAgo: number,
  day: number,
): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return new Date(Date.UTC(year, month - 1 - monthsAgo, day))
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      dayMs,
  );
}

function seriesDates(
  rule: Rule,
  today: string,
): { startDate: string; endDate: string | null } {
  if ("dayOfMonth" in rule) {
    return {
      startDate: dayOfMonthMonthsAgo(today, rule.monthsAgo, rule.dayOfMonth),
      endDate: null,
    };
  }
  const last = lastWeekday(today, rule.weekday);
  return {
    startDate: addDays(last, -rule.weeksAgo * 7),
    endDate:
      rule.endedWeeksAgo === undefined
        ? null
        : addDays(last, -rule.endedWeeksAgo * 7),
  };
}

// --- Creation ---------------------------------------------------------------

// The repositories return undefined when a parent row is missing; here every
// parent was just created.
function created<T>(row: T | undefined, what: string): T {
  if (row === undefined) {
    throw new Error(`Could not create the sample ${what}`);
  }
  return row;
}

// What settling the history needs to know about the rows created.
type Context = {
  today: string;
  helperIds: Map<HelperName, string>;
  // Per client id: how they pay.
  paysBy: Map<string, PaymentMethod>;
  // Per property id: its series, for the visits to edit and the invoicing lag.
  series: Map<string, SampleSeries>;
  // Per one-off job id: its discount.
  discounts: Map<string, Discount>;
};

export async function createSampleData(
  organizationId: string,
): Promise<SampleDataSummary> {
  const context: Context = {
    today: await organizations.today(organizationId),
    helperIds: new Map(),
    paysBy: new Map(),
    series: new Map(),
    discounts: new Map(),
  };

  for (const helper of sampleHelpers) {
    const row = await helpers.createHelper(organizationId, helper);
    context.helperIds.set(helper.name, row.id);
  }

  let propertyCount = 0;
  for (const sample of sampleClients) {
    const client = await clients.createClient(organizationId, {
      name: sample.name,
      email: sample.email,
      phone: sample.phone,
    });
    context.paysBy.set(client.id, sample.paysBy ?? "e_transfer");

    for (const sampleProperty of sample.properties) {
      const property = created(
        await properties.createProperty(
          organizationId,
          client.id,
          sampleProperty.address,
        ),
        "property",
      );
      propertyCount++;

      if (sampleProperty.series !== undefined) {
        await createSeries(
          organizationId,
          property.id,
          sampleProperty.series,
          context,
        );
      }
      for (const sampleJob of sampleProperty.jobs ?? []) {
        await createJob(organizationId, property.id, sampleJob, context);
      }
    }
  }

  // Retired after the visits were assigned: an inactive helper keeps the
  // history, and is only left out of new assignments.
  for (const helper of sampleHelpers) {
    if (!helper.active) {
      await helpers.updateHelper(
        organizationId,
        context.helperIds.get(helper.name) ?? "",
        { active: false },
      );
    }
  }

  const allJobs = await jobs.listJobs(organizationId, {
    from: addDays(context.today, -lookBackDays),
    to: addDays(context.today, lookAheadDays),
  });
  const completed = await settleVisits(organizationId, allJobs, context);
  const settled = await invoiceAndPay(organizationId, completed, context);

  return {
    clients: sampleClients.length,
    properties: propertyCount,
    helpers: sampleHelpers.length,
    recurringSeries: context.series.size,
    jobs: allJobs.length,
    ...settled,
  };
}

// The template with the helper's name replaced by its id.
function templateOf(template: Template, context: Context): JobTemplate {
  const { helper, ...rest } = template;
  return {
    ...rest,
    helperId:
      helper === undefined ? null : (context.helperIds.get(helper) ?? null),
  };
}

async function createSeries(
  organizationId: string,
  propertyId: string,
  sample: SampleSeries,
  context: Context,
): Promise<void> {
  const { rule, visits: _visits, uninvoicedDays: _lag, ...template } = sample;
  const { startDate, endDate } = seriesDates(rule, context.today);
  created(
    await recurringSeries.createSeries(organizationId, {
      ...templateOf(template, context),
      propertyId,
      everyWeeks: "everyWeeks" in rule ? rule.everyWeeks : null,
      dayOfMonth: "dayOfMonth" in rule ? rule.dayOfMonth : null,
      startDate,
      endDate,
    }),
    "series",
  );
  context.series.set(propertyId, sample);
}

async function createJob(
  organizationId: string,
  propertyId: string,
  sample: SampleJob,
  context: Context,
): Promise<void> {
  const { when, status, discount, ...template } = sample;
  const job = created(
    await jobs.createJob(organizationId, {
      ...templateOf(template, context),
      propertyId,
      scheduledDate:
        typeof when === "number"
          ? addDays(context.today, when)
          : nextWeekday(context.today, when.next),
      status,
    }),
    "job",
  );
  if (discount !== undefined) {
    context.discounts.set(job.id, discount);
  }
}

// --- History ----------------------------------------------------------------

// What happened to the visits before today: completed, unless the data edits
// the visit (a cancelled one stays cancelled). Returns the completed ones,
// oldest first.
async function settleVisits(
  organizationId: string,
  allJobs: Job[],
  context: Context,
): Promise<Job[]> {
  const edited = new Map<string, Job>();
  for (const [propertyId, sample] of context.series) {
    for (const visit of sample.visits ?? []) {
      if ("dayOfMonth" in sample.rule) {
        throw new Error("Sample visits are only placed on weekly series");
      }
      const date = addDays(
        lastWeekday(context.today, sample.rule.weekday),
        visit.weeksFromToday * 7,
      );
      const job = allJobs.find(
        (j) => j.property.id === propertyId && j.scheduledDate === date,
      );
      if (job === undefined) {
        throw new Error(`No sample visit on ${date} to edit`);
      }
      edited.set(
        job.id,
        created(
          await jobs.updateJob(organizationId, job.id, visit.patch),
          "visit edit",
        ),
      );
    }
  }

  const completed: Job[] = [];
  for (const listed of allJobs) {
    const job = edited.get(listed.id) ?? listed;
    if (job.scheduledDate >= context.today || job.status !== "scheduled") {
      continue;
    }
    completed.push(
      created(
        await jobs.updateJob(organizationId, job.id, { status: "completed" }),
        "completed visit",
      ),
    );
  }
  return completed;
}

// One invoice per completed visit, issued on the day of the visit, and the
// payments the history says arrived.
async function invoiceAndPay(
  organizationId: string,
  completed: Job[],
  context: Context,
): Promise<{ invoices: number; payments: number }> {
  let invoiceCount = 0;
  let paymentCount = 0;
  let partlyPaid = false;

  for (const job of completed) {
    const lag = context.series.get(job.property.id)?.uninvoicedDays ?? 0;
    if (daysBetween(job.scheduledDate, context.today) < lag) {
      continue;
    }

    const discount = context.discounts.get(job.id);
    const invoice = created(
      await invoices.createInvoice(organizationId, {
        jobId: job.id,
        issueDate: job.scheduledDate,
        dueDate: addDays(job.scheduledDate, dueDays),
        description: defaultDescription(job.serviceType),
        fixedDiscountCents: discount?.fixedCents,
        discountBasisPoints: discount?.basisPoints,
        discountDescription: discount?.description,
      }),
      "invoice",
    );
    invoiceCount++;

    const age = daysBetween(invoice.issueDate, context.today);
    let amountCents = 0;
    if (age > paidDays) {
      amountCents = invoice.totalCents;
    } else if (age > partlyPaidDays && !partlyPaid) {
      amountCents = Math.floor(invoice.totalCents / 2);
      partlyPaid = true;
    }
    if (amountCents > 0) {
      created(
        await payments.createPayment(organizationId, invoice.id, {
          paidOn: addDays(invoice.issueDate, paymentDelayDays),
          method: context.paysBy.get(job.client.id) ?? "e_transfer",
          amountCents,
        }),
        "payment",
      );
      paymentCount++;
    }
  }
  return { invoices: invoiceCount, payments: paymentCount };
}
