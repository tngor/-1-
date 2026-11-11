type ArchivedSurvey = {
  title: string;
  created_at?: string;
  final_schedule?: { time?: string } | null;
  dates?: { date: string }[] | null;
};

function parseDate(text?: string) {
  const match = text?.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    ?? text?.match(/(?:^|[^\d])(?:(\d{4})[-/.])?(\d{1,2})[-/](\d{1,2})(?!\d)/);
  if (!match) return null;
  const year = match[1] ? Number(match[1]) : null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Use a leap year to validate month/day when the old notice omits its year.
  const checked = new Date(Date.UTC(year ?? 2000, month - 1, day));
  if (checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function groupArchivedSurveys<T extends ArchivedSurvey>(surveys: T[]) {
  const groups = new Map<string, { key: string; label: string; order: number; entries: { survey: T; day: number }[] }>();
  for (const survey of surveys) {
    const candidates = (survey.dates ?? []).map(d => parseDate(d.date)).filter(d => d !== null)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.month - b.month || a.day - b.day);
    const date = parseDate(survey.final_schedule?.time) ?? candidates[0] ?? parseDate(survey.title);
    // Older records contain only M/D; use the record's year, never its creation month.
    const createdYear = survey.created_at?.match(/^(\d{4})-/)?.[1];
    const year = date?.year ?? (createdYear ? Number(createdYear) : null);
    const key = date ? `${year ?? "unknown"}-${date.month}` : "undated";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: date ? `${year ? `${year}년 ` : ""}${date.month}월 모임` : "날짜 미확인",
        order: date ? (year ?? 0) * 100 + date.month : -1,
        entries: [],
      });
    }
    groups.get(key)!.entries.push({ survey, day: date?.day ?? 0 });
  }
  return [...groups.values()].sort((a, b) => b.order - a.order).map(group => ({
    key: group.key,
    label: group.label,
    surveys: group.entries.sort((a, b) => a.day - b.day || a.survey.title.localeCompare(b.survey.title, "ko")).map(entry => entry.survey),
  }));
}
