export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

export function isValidLocalTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return false;
  const [, date, hourText, minuteText] = match;
  return (
    date !== undefined &&
    isValidLocalDate(date) &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59
  );
}

export function createLocalTimestampValidator(
  timeZone: string,
): (value: string) => boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (value) => {
    if (!isValidLocalTimestamp(value)) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (match === null) return false;
    const [, yearText, monthText, dayText, hourText, minuteText] = match;
    const localAsUtc = Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
      Number(minuteText),
    );
    let candidate = localAsUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(candidate))
          .map(({ type, value: partValue }) => [type, partValue]),
      );
      const representedLocal = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      );
      const correction = localAsUtc - representedLocal;
      if (correction === 0) return true;
      candidate += correction;
    }
    return false;
  };
}
