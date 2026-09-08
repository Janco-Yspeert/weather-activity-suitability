export type LocalDate = `${number}-${number}-${number}`;

export interface SnapshotMetadata {
  locationId: string;
  fetchedAt: Date;
  requestedThroughDate: string;
}

const FRESH_MILLISECONDS = 3 * 60 * 60 * 1000;
const STALE_FALLBACK_MILLISECONDS = 24 * 60 * 60 * 1000;

export function getTargetDates(now: Date, timeZone: string): LocalDate[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const localDateAsUtc = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(localDateAsUtc);
    date.setUTCDate(date.getUTCDate() + index + 1);
    return date.toISOString().slice(0, 10) as LocalDate;
  });
}

export function forecastCoverage(localTimestamps: readonly string[]): Set<LocalDate> {
  return new Set(localTimestamps.map((timestamp) => timestamp.slice(0, 10) as LocalDate));
}

function hasCompatibleWindow(
  snapshot: SnapshotMetadata,
  requiredDates: readonly string[],
): boolean {
  const requestedThroughDate = requiredDates.at(-1);
  return (
    requestedThroughDate === undefined ||
    snapshot.requestedThroughDate >= requestedThroughDate
  );
}

function ageAt(snapshot: SnapshotMetadata, now: Date): number {
  return now.getTime() - snapshot.fetchedAt.getTime();
}

export function isFreshSnapshot(
  snapshot: SnapshotMetadata,
  locationId: string,
  requiredDates: readonly string[],
  now: Date,
): boolean {
  const age = ageAt(snapshot, now);
  return (
    snapshot.locationId === locationId &&
    age >= 0 &&
    age < FRESH_MILLISECONDS &&
    hasCompatibleWindow(snapshot, requiredDates)
  );
}

export function isStaleFallbackEligible(
  snapshot: SnapshotMetadata,
  locationId: string,
  now: Date,
): boolean {
  const age = ageAt(snapshot, now);
  return (
    snapshot.locationId === locationId &&
    age >= FRESH_MILLISECONDS &&
    age <= STALE_FALLBACK_MILLISECONDS
  );
}
