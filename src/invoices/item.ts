import type { ServiceType } from "../jobs/repository.ts";

// The item an invoice gets when none is given: the kind of cleaning, as the
// client reads it. The owner picks another one, or writes it, when the
// visit was something else.
const items: Record<ServiceType, string> = {
  regular: "Regular cleaning",
  deep: "Deep cleaning",
  move_in: "Move-in cleaning",
  move_out: "Move-out cleaning",
};

export function defaultItem(serviceType: ServiceType): string {
  return items[serviceType];
}
