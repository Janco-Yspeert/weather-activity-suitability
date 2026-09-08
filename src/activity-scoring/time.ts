export function alignToExpectedSlots<Hour extends { timestamp: string }>(
  points: Hour[],
  expectedSlots: readonly string[],
): (Hour | undefined)[] {
  const pointsByTimestamp = new Map(
    points.map((point) => [point.timestamp, point]),
  );
  return expectedSlots.map((timestamp) => pointsByTimestamp.get(timestamp));
}

// Expected slots come from the destination-local activity period, independent
// of provider records. Clock transitions receive ordinary timestamp treatment:
// a missing local hour is missing evidence and a repeated timestamp has one
// wall-clock identity.
export function expectedHourlySlots(start: string, end: string): string[] {
  let timestamp = `${start.slice(0, 13)}:00`;
  if (timestamp < start) timestamp = shiftHours(timestamp, 1);
  const slots: string[] = [];
  while (timestamp <= end) {
    slots.push(timestamp);
    timestamp = shiftHours(timestamp, 1);
  }
  return slots;
}

export function contiguousBlocks<Hour extends { timestamp: string }>(
  hours: Hour[],
  size: number,
): Hour[][] {
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
  left: { timestamp: string },
  right: { timestamp: string },
): boolean {
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
