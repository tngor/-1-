export type Role = '팀장' | '담당자' | '팀원';
export type Person = { id: string; name: string; role: Role };
export type Team = { id: string; name: string; area: string; people: Person[] };
export type Vote = { slots: string[]; memo: string };
export type Rsvp = { status: '참석' | '부분참석' | '불참'; reason: string; arrival: string; meal: boolean };
export type Meeting = {
  id: string; team: string; title: string; description: string; slots: string[];
  minutes: number; deadline: string | null; status: 'voting' | 'confirmed' | 'cancelled' | 'archived';
  confirmed: string; place: string; memo: string; mealProvided: boolean;
  votes: Record<string, Vote>; rsvps: Record<string, Rsvp>;
  version: number; noticeVersion: number; updatedAt: string; responseCount?: number;
};
export type Board = { actor: string; teams: Team[]; meetings: Meeting[] };
export function shift(slot: string, minutes: number) {
  return new Date(new Date(slot + ':00Z').getTime() + minutes * 60000).toISOString().slice(0, 16);
}
export function dateLabel(slot: string) {
  return new Date(slot.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
}
export function timeLabel(slot: string, minutes: number) {
  return `${dateLabel(slot)} / ${slot.slice(11)} ~ ${shift(slot, minutes).slice(11)}`;
}
export function closed(meeting: Meeting) { return meeting.deadline !== null && Date.now() >= new Date(meeting.deadline).getTime(); }
export function stateLabel(meeting: Meeting) {
  if (meeting.status === 'archived') return '보관';
  if (meeting.status === 'cancelled') return '취소';
  if (meeting.status === 'confirmed') return '공지 확정';
  return closed(meeting) ? '투표 마감' : '투표 중';
}
export function options(meeting: Meeting, people: Person[]) {
  return meeting.slots.flatMap(start => {
    const block = Array.from({ length: meeting.minutes / 30 }, (_, index) => shift(start, index * 30));
    if (!block.every(slot => meeting.slots.includes(slot))) return [];
    const pending = people.filter(person => !meeting.votes[person.id]);
    const available = people.filter(person => block.every(slot => meeting.votes[person.id]?.slots.includes(slot)));
    const unavailable = people.filter(person => meeting.votes[person.id] && !available.includes(person));
    return [{ start, available, unavailable, pending }];
  }).sort((a, b) => b.available.length - a.available.length || a.start.localeCompare(b.start));
}
