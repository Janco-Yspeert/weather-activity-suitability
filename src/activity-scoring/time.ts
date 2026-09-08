// Match repeated local timestamps by occurrence, retaining their separate
// expected indices across a fall-back DST transition.
export function alignToExpectedSlots<Hour extends { timestamp: string }>(
  points: Hour[],
  expectedSlots: readonly string[],
): ((Hour & { expectedIndex: number }) | undefined)[] {
  const pointsByTimestamp = new Map<string, Hour[]>();
  for (const point of points) {
    const matches = pointsByTimestamp.get(point.timestamp) ?? [];
    matches.push(point);
    pointsByTimestamp.set(point.timestamp, matches);
  }

  return expectedSlots.map((timestamp, expectedIndex) => {
    const point = pointsByTimestamp.get(timestamp)?.shift();
    return point === undefined ? undefined : { ...point, expectedIndex };
  });
}

// Walk real instants so DST gaps/repeats and fractional UTC offsets retain
// their existing meaning. Returned observations never define this timeline.
export function expectedHourlySlots(
  start: string,
  end: string,
  timeZone: string,
): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const approximateStart = Date.parse(`${start}:00Z`) - 18 * 60 * 60 * 1_000;
  const approximateEnd = Date.parse(`${end}:00Z`) + 18 * 60 * 60 * 1_000;
  const slots: string[] = [];

  for (
    let instant = approximateStart;
    instant <= approximateEnd;
    instant += 15 * 60 * 1_000
  ) {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
    );
    if (parts.minute !== "00") continue;
    const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    if (local >= start && local <= end) slots.push(local);
  }

  return slots;
}

export function contiguousBlocks<
  Hour extends { timestamp: string; expectedIndex?: number },
>(hours: Hour[], size: number): Hour[][] {
  const blocks: Hour[][] = [];
  for (let index = 0; index <= hours.length - size; index += 1) {
    const block = hours.slice(index, index + size);
    if (
      block
        .slice(1)
        .every((hour, offset) => areConsecutive(block[offset]!, hour))
    ) {
      blocks.push(block);
    }
  }
  return blocks;
}

export function hasConsecutive<Hour extends { timestamp: string }>(
  points: Hour[],
  count: number,
  predicate: (point: Hour) => boolean,
): boolean {
  let run = 0;
  let previous: Hour | undefined;
  for (const point of points) {
    if (!predicate(point)) {
      run = 0;
    } else if (
      previous === undefined ||
      isNextHour(previous.timestamp, point.timestamp)
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run >= count) return true;
    previous = point;
  }
  return false;
}

export function inHourRange(
  timestamp: string,
  start: number,
  end: number,
): boolean {
  const hour = Number(timestamp.slice(11, 13));
  return hour >= start && hour <= end;
}

export function isNextHour(left: string, right: string): boolean {
  return shiftHours(left, 1) === right;
}

export function areConsecutive(
  left: { timestamp: string; expectedIndex?: number },
  right: { timestamp: string; expectedIndex?: number },
): boolean {
  if (left.expectedIndex !== undefined && right.expectedIndex !== undefined) {
    return right.expectedIndex === left.expectedIndex + 1;
  }
  return isNextHour(left.timestamp, right.timestamp);
}

export function shiftHours(timestamp: string, amount: number): string {
  return shiftMinutes(timestamp, amount * 60);
}

export function shiftMinutes(timestamp: string, amount: number): string {
  const value = new Date(`${timestamp}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + amount);
  return value.toISOString().slice(0, 16);
}
