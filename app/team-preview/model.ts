export const ministries = {
  준비사역: ["회계", "디자인", "영상", "수익사업", "기도팀"],
  어린이사역: ["세션팀", "공과팀", "체육대회팀"],
  공연사역: ["율동팀", "워십팀", "연극팀"],
};
export const teams = Object.values(ministries).flat();
export type Person = { name: string; teams: string[] };
export type Poll = { id: string; team: string; title: string; slots: string[]; hours: number;
  votes: Record<string, string[]>; confirmed?: string; place?: string };
export type Data = { members: Person[]; leaders: Record<string, string>; polls: Poll[] };
export const seed: Data = {
  members: [
    { name: "하늘", teams: ["디자인", "공과팀", "워십팀"] },
    { name: "다온", teams: ["영상", "세션팀", "워십팀"] },
    { name: "이든", teams: ["회계", "체육대회팀", "워십팀"] },
  ],
  leaders: { 워십팀: "다온" },
  polls: [
    { id: "worship", team: "워십팀", title: "워십팀 첫 연습", hours: 2,
      slots: ["2026-11-09T18:00","2026-11-09T19:00","2026-11-09T20:00","2026-11-10T18:00","2026-11-10T19:00"],
      votes: { 다온: ["2026-11-09T18:00","2026-11-09T19:00"], 이든: ["2026-11-09T19:00","2026-11-09T20:00"] } },
    { id: "all", team: "전체", title: "피지 선교 준비모임", slots: [], votes: {}, hours: 4,
      confirmed: "2026-11-07T15:00", place: "미정(추후 공지 예정)" },
  ],
};
export function shift(slot: string, hours: number) {
  const date = new Date(slot + ":00Z");
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString().slice(0, 16);
}
export function label(slot: string, hours = 1) {
  const day = new Date(slot + ":00Z");
  return day.toLocaleDateString("ko-KR", {month:"long",day:"numeric",weekday:"short",timeZone:"UTC"})
    + " · " + slot.slice(11) + "–" + shift(slot,hours).slice(11);
}
export function rankings(poll: Poll, members: Person[]) {
  return poll.slots.map(start => {
    const block = Array.from({length:poll.hours}, (_, i) => shift(start,i));
    const count = members.filter(p => block.every(s => poll.votes[p.name]?.includes(s))).length;
    return { start, count, valid: block.every(s => poll.slots.includes(s)) };
  }).filter(r => r.valid).sort((a,b) => b.count-a.count || a.start.localeCompare(b.start));
}
