'use client';

import { useState } from 'react';
import DatePicker from '../team-preview/DatePicker';
import { type Meeting, type Person, type Rsvp, dateLabel, timeLabel, shift, options, closed } from './model';
export type Save = (operation: string, payload: Record<string, unknown>) => Promise<boolean>;
export function localTime(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const clockChoices = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
export function CandidateForm({ team, meeting, save, done }: { team: string; meeting?: Meeting; save: Save; done: () => void }) {
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [description, setDescription] = useState(meeting?.description ?? '');
  const [minutes, setMinutes] = useState(meeting?.minutes ?? 90);
  const [deadline, setDeadline] = useState(localTime(meeting?.deadline ?? new Date(Date.now() + 86400000).toISOString()));
  const [dates, setDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>(meeting?.slots ?? []);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');
  const [error, setError] = useState('');
  function apply() {
    if (!dates.length || start >= end) { setError('날짜와 시작·종료 시간을 확인해 주세요.'); return; }
    const batch = dates.flatMap(date => clockChoices.filter(time => time >= start && time < end).map(time => `${date}T${time}`));
    setSlots(previous => [...new Set([...previous, ...batch])].sort()); setDates([]); setError('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (dates.length) { setError('선택한 날짜에 시간을 적용한 후 등록해 주세요.'); return; }
    if (meeting && Object.keys(meeting.votes).length && !confirm('후보 변경 시 기존 투표가 초기화됩니다. 팀원에게 다시 투표하도록 안내해 주세요. 변경할까요?')) return;
    if (await save(meeting ? 'editCandidates' : 'create', { id: meeting?.id, version: meeting?.version, team, title, description, slots, minutes, deadline: new Date(deadline).toISOString() })) done();
  }
  const days = [...new Set(slots.map(slot => slot.slice(0, 10)))];
  return <form onSubmit={submit} className="work-form">
    <h3>{meeting ? '후보 일정 수정' : '일정 투표 만들기'}</h3>
    <label>모임 제목<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>모임 설명<textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <label>모임에 필요한 시간<select value={minutes} onChange={e => setMinutes(+e.target.value)}>{[30,60,90,120,150,180,210,240].map(value => <option key={value} value={value}>{value}분</option>)}</select></label>
    <DatePicker dates={dates} toggle={date => setDates(previous => previous.includes(date) ? previous.filter(day => day !== date) : [...previous, date])} />
    <div className="work-row"><label>시작<select value={start} onChange={e => setStart(e.target.value)}>{clockChoices.slice(0, -1).map(time => <option key={time}>{time}</option>)}</select></label><label>종료<select value={end} onChange={e => setEnd(e.target.value)}>{clockChoices.slice(1).map(time => <option key={time}>{time}</option>)}</select></label></div>
    <button type="button" onClick={apply}>선택한 날짜에 시간 적용</button>
    <div className="work-candidates"><h4>등록할 후보</h4>{!days.length && <p className="work-muted">날짜와 시간을 추가해 주세요.</p>}{days.map(day => {
      const times = slots.filter(slot => slot.startsWith(day));
      const ranges: string[][] = [];
      for (const time of times) {
        const last = ranges[ranges.length - 1];
        if (last && shift(last[last.length - 1], 30) === time) last.push(time); else ranges.push([time]);
      }
      return <div key={day} className="work-candidate"><span>{dateLabel(day)}<br/><small>{ranges.map(range => `${range[0].slice(11)}~${shift(range[range.length - 1],30).slice(11)}`).join(', ')}</small></span><div className="work-actions"><button type="button" onClick={() => { setDates([day]); setStart(times[0].slice(11)); setEnd(shift(times[times.length - 1],30).slice(11) === '00:00' ? '24:00' : shift(times[times.length - 1],30).slice(11)); setSlots(slots.filter(slot => !slot.startsWith(day))); }}>수정</button><button type="button" onClick={() => setSlots(slots.filter(slot => !slot.startsWith(day)))}>삭제</button></div></div>;
    })}</div>
    <label>투표 마감<input required type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
    {meeting && <p className="work-warning">후보를 수정하면 기존 응답을 초기화하고 다시 투표받습니다.</p>}
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="work-actions"><button type="button" onClick={done}>취소</button><button className="work-primary" type="submit" disabled={!slots.length}>{meeting ? '변경 후 재투표' : '투표 등록'}</button></div>
  </form>;
}

export function VoteForm({ meeting, actor, save }: { meeting: Meeting; actor: string; save: Save }) {
  const previous = meeting.votes[actor];
  const [selected, setSelected] = useState(previous?.slots ?? []);
  const [none, setNone] = useState(previous?.slots.length === 0);
  const [memo, setMemo] = useState(previous?.memo ?? '');
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...(previous?.slots ?? [])].sort()) || memo !== (previous?.memo ?? '') || (!previous && none);
  return <form onSubmit={async e => { e.preventDefault(); await save('vote', { id: meeting.id, version: meeting.version, slots: selected, memo }); }}>
    <p>참석 가능한 시간을 모두 선택해 주세요. 모임은 {meeting.minutes}분 진행됩니다.</p>
    {previous && <p className="work-success">투표 완료 · 마감 전까지 수정할 수 있어요.</p>}
    <fieldset disabled={closed(meeting)}>
      {[...new Set(meeting.slots.map(slot => slot.slice(0,10)))].map(day => <div className="work-day" key={day}><h4>{dateLabel(day)}</h4><div className="work-slots">{meeting.slots.filter(slot => slot.startsWith(day)).map(slot => <button type="button" key={slot} aria-pressed={selected.includes(slot)} onClick={() => { setNone(false); setSelected(selected.includes(slot) ? selected.filter(item => item !== slot) : [...selected, slot]); }}>{slot.slice(11)}~{shift(slot,30).slice(11)}{selected.includes(slot) ? ' ✓' : ''}</button>)}</div></div>)}
      <label className="work-check"><input type="checkbox" checked={none} onChange={e => { setNone(e.target.checked); setSelected([]); }} />가능한 시간 없음</label>
      <label>전달사항<textarea maxLength={2000} value={memo} onChange={e => setMemo(e.target.value)} /></label>
      {dirty && <p className="work-warning">저장되지 않은 변경사항이 있습니다.</p>}
      <button className="work-primary work-wide" disabled={!selected.length && !none}>{previous ? '응답 수정하기' : '투표 제출하기'}</button>
    </fieldset>
    {closed(meeting) && <p className="work-warning">투표가 마감되었습니다.</p>}
  </form>;
}

export function NoticeForm({ meeting, people, save, done }: { meeting: Meeting; people: Person[]; save: Save; done: () => void }) {
  const edit = meeting.status === 'confirmed';
  const ranked = options(meeting, people);
  const [chosen, setChosen] = useState(meeting.confirmed);
  const [place, setPlace] = useState(meeting.place);
  const [memo, setMemo] = useState(meeting.memo);
  const [meal, setMeal] = useState(meeting.mealProvided);
  const [all, setAll] = useState(false);
  const names = (list: Person[]) => list.map(person => person.name).join(', ') || '없음';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edit && (meeting.confirmed !== chosen || meeting.mealProvided !== meal) && !confirm('시간 또는 식사 제공 여부가 변경되어 참석 응답을 다시 받습니다. 저장할까요?')) return;
    if (await save(edit ? 'editNotice' : 'confirm', { id: meeting.id, version: meeting.version, confirmed: chosen, place, memo, mealProvided: meal })) done();
  }
  return <form onSubmit={submit} className="work-form">
    <h3>{edit ? '확정 공지 수정' : '결과 확인 및 공지 확정'}</h3>
    {edit ? <label>날짜와 시간<input type="datetime-local" required value={chosen} onChange={e => setChosen(e.target.value)} /></label> : <>
      <p>{Object.keys(meeting.votes).length}/{people.length}명 응답 · 연속 {meeting.minutes}분 가능한 인원순</p>
      {(all ? ranked : ranked.slice(0,3)).map((option, index) => <div className="work-result" key={option.start}>
        <label className="work-check"><input type="radio" required name="candidate" checked={chosen === option.start} onChange={() => setChosen(option.start)} /><strong>{timeLabel(option.start, meeting.minutes)}</strong><span className="work-badge">{option.available.length}명</span></label>
        {index === 0 && <small className="work-success">최다 참석 후보{ranked[1]?.available.length === option.available.length ? ' · 동률 있음' : ''}</small>}
        <p>가능 · {names(option.available)}<br/>불가능 · {names(option.unavailable)}<br/>미응답 · {names(option.pending)}</p>
      </div>)}
      {ranked.length > 3 && <button type="button" onClick={() => setAll(!all)}>{all ? '상위 3개만 보기' : `후보 ${ranked.length}개 모두 보기`}</button>}
      <details><summary>팀원 전달사항</summary>{people.map(person => <p key={person.id}>{person.name} · {meeting.votes[person.id]?.memo || '전달사항 없음'}</p>)}</details>
    </>}
    <label>장소<input maxLength={160} value={place} onChange={e => setPlace(e.target.value)} placeholder="미정(추후 공지 예정)" /></label>
    <label>전달사항·준비물<textarea maxLength={2000} value={memo} onChange={e => setMemo(e.target.value)} /></label>
    <label className="work-check"><input type="checkbox" checked={meal} onChange={e => setMeal(e.target.checked)} />식사 제공</label>
    <div className="work-actions"><button type="button" onClick={done}>취소</button><button className="work-primary" disabled={!chosen}>{edit ? '공지 저장' : '선택한 시간으로 공지 확정'}</button></div>
  </form>;
}

export function AttendanceForm({ meeting, actor, save }: { meeting: Meeting; actor: string; save: Save }) {
  const previous = meeting.rsvps[actor];
  const [status, setStatus] = useState<Rsvp['status'] | ''>(previous?.status ?? '');
  const [reason, setReason] = useState(previous?.reason ?? '');
  const [arrival, setArrival] = useState(previous?.arrival ?? '');
  const [meal, setMeal] = useState(previous ? String(previous.meal) : '');
  return <form onSubmit={async e => { e.preventDefault(); await save('rsvp', { id: meeting.id, version: meeting.version, status, reason, arrival, meal: meal === '' ? null : meal === 'true' }); }}>
    <h3>참석 체크</h3>
    {previous && <p className="work-success">{previous.status}으로 제출했습니다.</p>}
    <label>참석 여부<select required value={status} onChange={e => setStatus(e.target.value as Rsvp['status'])}><option value="">선택해 주세요</option>{['참석','부분참석','불참'].map(value => <option key={value}>{value}</option>)}</select></label>
    {status && status !== '참석' && <label>사유를 자세히 적어 주세요<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
    {status === '부분참석' && <label>몇 시부터 참석 가능한가요?<input type="time" required value={arrival} onChange={e => setArrival(e.target.value)} /></label>}
    {meeting.mealProvided && status !== '불참' && <label>식사 여부<select required value={meal} onChange={e => setMeal(e.target.value)}><option value="">선택해 주세요</option><option value="true">식사함</option><option value="false">식사안함</option></select></label>}
    <button className="work-primary work-wide">{previous ? '참석 응답 수정' : '참석 응답 제출'}</button>
  </form>;
}
