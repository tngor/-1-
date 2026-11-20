export async function overallSchedule<Result = Record<string, never>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ data: Result | null; error: { message: string } | null }> {
  try {
    const response = await fetch("/api/ministry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "overall", action, payload }),
    });
    const result = await response.json();
    if (response.ok) return { data: result, error: null };
    return { data: null, error: { message: result.error || "일정을 처리하지 못했습니다." } };
  } catch {
    return { data: null, error: { message: "연결 상태를 확인하고 다시 시도해 주세요." } };
  }
}

export type OverallAdminData = {
  surveys: any[];
  surveyResponses: any[];
  rsvpResponses: any[];
  users: any[];
  baggage: any[];
};
