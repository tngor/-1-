export type Member = { name: string; generation: string | number };
export type Attendance = Member & { status: string; reason?: string | null };

export function cleanAttendanceReason(reason?: string | null): string {
  return (reason ?? "").replace(/\[식사(?:안)?함\]/g, "").trim();
}

function memberLabel(member: Member): string {
  return `${member.generation}기 ${member.name}`;
}

function byMember(a: Member, b: Member): number {
  return Number(a.generation) - Number(b.generation) || a.name.localeCompare(b.name, "ko");
}

function reasonList(title: string, people: Attendance[]): string {
  return [
    `${title} : ${people.length}명`,
    ...people.map(person => {
      const reason = cleanAttendanceReason(person.reason) || "사유 미기재";
      return `• ${memberLabel(person)}\n  사유: ${reason.replace(/\r?\n/g, "\n  ")}`;
    }),
  ].join("\n");
}

export function attendanceShare(title: string, responses: Attendance[], members: Member[]) {
  const attending = responses.filter(r => r.status === "참석");
  const absent = responses.filter(r => r.status === "불참").sort(byMember);
  const partial = responses.filter(r => r.status === "부분참석").sort(byMember);
  const unresponsive = members.filter(member => !responses.some(response =>
    response.name === member.name && String(response.generation) === String(member.generation)
  )).sort(byMember);
  const mealCount = responses.filter(r => r.reason?.includes("[식사함]")).length;
  const reasons = [reasonList("불참", absent), reasonList("부분참", partial)].join("\n\n");

  return {
    full: [
      title,
      `참석 : ${attending.length}명`,
      reasons,
      [`미투표자 : ${unresponsive.length}명`, ...unresponsive.map(person => `• ${memberLabel(person)}`)].join("\n"),
      `식사 인원 : ${mealCount}명`,
    ].join("\n\n"),
    reasons: `${title}\n\n${reasons}`,
  };
}
