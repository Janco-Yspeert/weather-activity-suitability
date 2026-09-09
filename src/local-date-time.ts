import { z } from "zod";

export const localDateSchema = z.iso.date();

// These are nominal destination-local values, not instants. Validate their
// calendar/clock shape without asking a timezone whether the wall time existed.
export const localTimestampSchema = z.templateLiteral([
  z.iso.date(),
  "T",
  z.iso.time({ precision: -1 }),
]);
