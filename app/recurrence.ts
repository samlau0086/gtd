export type RecurrenceUnit = "day" | "week" | "month" | "year";
export type RecurrenceRule =
  | { type: "daily"; anchorDay?: number; anchorMonth?: number }
  | { type: "weekdays"; anchorDay?: number; anchorMonth?: number }
  | { type: "weekly"; anchorDay?: number; anchorMonth?: number }
  | { type: "monthly"; anchorDay?: number; anchorMonth?: number }
  | { type: "yearly"; anchorDay?: number; anchorMonth?: number }
  | {
      type: "custom";
      interval: number;
      unit: RecurrenceUnit;
      anchorDay?: number;
      anchorMonth?: number;
    };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) throw new Error("日期格式无效");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("日期无效");
  }
  return date;
};

const formatDate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

const addDays = (value: string, amount: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const addMonths = (value: string, amount: number, preferredDay?: number) => {
  const date = parseDate(value);
  const absoluteMonth = date.getUTCFullYear() * 12 + date.getUTCMonth() + amount;
  const year = Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  const day = Math.min(preferredDay || date.getUTCDate(), daysInMonth(year, month));
  return formatDate(new Date(Date.UTC(year, month, day)));
};

export const normalizeRecurrence = (
  value: unknown,
  anchorDate?: string,
): RecurrenceRule | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const allowed = ["daily", "weekdays", "weekly", "monthly", "yearly", "custom"];
  if (!allowed.includes(String(input.type))) return undefined;
  const anchor = anchorDate ? parseDate(anchorDate) : undefined;
  const anchorDay = Math.max(
    1,
    Math.min(31, Number(input.anchorDay) || anchor?.getUTCDate() || 1),
  );
  const anchorMonth = Math.max(
    1,
    Math.min(12, Number(input.anchorMonth) || (anchor ? anchor.getUTCMonth() + 1 : 1)),
  );
  if (input.type === "custom") {
    const unit = String(input.unit) as RecurrenceUnit;
    if (!["day", "week", "month", "year"].includes(unit)) return undefined;
    return {
      type: "custom",
      interval: Math.max(1, Math.min(999, Math.floor(Number(input.interval) || 1))),
      unit,
      anchorDay,
      anchorMonth,
    };
  }
  return { type: input.type as Exclude<RecurrenceRule["type"], "custom">, anchorDay, anchorMonth };
};

export const nextOccurrenceDate = (
  scheduledDate: string,
  recurrence: RecurrenceRule,
  completedOn: string,
) => {
  const base = scheduledDate < completedOn ? completedOn : scheduledDate;
  const interval = recurrence.type === "custom" ? recurrence.interval : 1;
  const unit =
    recurrence.type === "custom"
      ? recurrence.unit
      : recurrence.type === "daily" || recurrence.type === "weekdays"
        ? "day"
        : recurrence.type === "weekly"
          ? "week"
          : recurrence.type === "monthly"
            ? "month"
            : "year";

  if (recurrence.type === "weekdays") {
    let next = addDays(base, 1);
    while ([0, 6].includes(parseDate(next).getUTCDay())) next = addDays(next, 1);
    return next;
  }
  if (unit === "day") return addDays(base, interval);
  if (unit === "week") return addDays(base, interval * 7);
  if (unit === "month") return addMonths(base, interval, recurrence.anchorDay);
  return addMonths(base, interval * 12, recurrence.anchorDay);
};

export const shiftDate = (value: string, from: string, to: string) => {
  const delta = Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
  return addDays(value, delta);
};
