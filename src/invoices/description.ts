import type { ServiceType } from "../jobs/repository.ts";

// The line an invoice gets when none is given: the kind of cleaning, as the
// client reads it. The owner edits it afterwards when the visit needs more
// words.
const descriptions: Record<ServiceType, string> = {
  regular: "Regular cleaning",
  deep: "Deep cleaning",
  move_in: "Move-in cleaning",
  move_out: "Move-out cleaning",
};

export function defaultDescription(serviceType: ServiceType): string {
  return descriptions[serviceType];
}
