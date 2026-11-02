type DatedSurvey = {
  title?: string;
  final_schedule?: { time?: string } | null;
  dates?: { date: string }[] | null;
};

// Existing notices store month/day as Korean text or M/D, rather than ISO dates.
function dateKey(value: string | undefined): number {
  const match = value?.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    ?? value?.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (!match) return Infinity;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
    ? month * 100 + day
    : Infinity;
}

function surveyDateKey(survey: DatedSurvey): number {
  const confirmed = dateKey(survey.final_schedule?.time);
  if (Number.isFinite(confirmed)) return confirmed;
  const candidates = (survey.dates ?? []).map(({ date }) => dateKey(date));
  const earliest = Math.min(...candidates);
  return Number.isFinite(earliest) ? earliest : dateKey(survey.title);
}

export function sortSurveysByDate<T extends DatedSurvey>(surveys: T[]): T[] {
  return [...surveys].sort((a, b) => {
    const first = surveyDateKey(a);
    const second = surveyDateKey(b);
    return first === second ? 0 : first < second ? -1 : 1;
  });
}
