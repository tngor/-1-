"use client";
import { useState } from "react";
import type { Poll, Person } from "./model";
import { label, rankings } from "./model";
import DatePicker from "./DatePicker";

export function NewPoll({team, add}: {team: string; add: (poll: Poll) => void | Promise<boolean>}) {
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(21);
  const [hours, setHours] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState("");
  const choices = Array.from({length:24}, (_,i) => i);
  function candidateSlots() {
    const batch = dates.flatMap(date => choices.slice(start,end).map(h => date + "T" + String(h).padStart(2,"0") + ":00"));
    return [...new Set([...slots,...batch])].sort();
  }
  function applyDates() {
    if (!dates.length || end <= start) { setError("후보 날짜와 올바른 시간 범위를 선택해 주세요."); return; }
    setSlots(candidateSlots()); setDates([]); setError("");
  }
  async function create() {
    if (dates.length && end <= start) { setError("종료 시간을 시작 시간보다 늦게 선택해 주세요."); return; }
    const poll = { id: crypto.randomUUID(), team, title:title.trim(), slots:candidateSlots(), hours, votes:{} };
    if (!poll.title || !rankings(poll, []).length) { setError("모임 이름과 필요한 시간만큼 이어지는 후보 시간대를 입력해 주세요."); return; }
    if (await add(poll) === false) return;
    setTitle(""); setDates([]); setSlots([]); setError("");
  }
  return <details className="panel"><summary>＋ 일정 투표 만들기</summary>
    <label>모임 이름<input value={title} onChange={e=>setTitle(e.target.value)} /></label>
    <DatePicker dates={dates} toggle={day=>setDates(previous=>previous.includes(day)?previous.filter(d=>d!==day):[...previous,day].sort())}/>
    <div className="row">
    <label>시작<select value={start} onChange={e=>setStart(+e.target.value)}>{choices.map(h=><option key={h} value={h}>{h}시</option>)}</select></label>
    <label>종료<select value={end} onChange={e=>setEnd(+e.target.value)}>{choices.map(h=><option key={h} value={h+1}>{h+1}시</option>)}</select></label></div>
    <button disabled={!dates.length} onClick={applyDates}>선택한 날짜에 시간 적용</button>
    <div className="row">{slots.map(s=><button key={s} onClick={()=>setSlots(slots.filter(v=>v!==s))}>{label(s)} ×</button>)}</div>
    <label>모임에 필요한 시간<select value={hours} onChange={e=>setHours(+e.target.value)}>{[1,2,3,4].map(h=><option key={h} value={h}>{h}시간</option>)}</select></label>
    {error && <p role="alert">{error}</p>}<button className="primary" onClick={create}>투표 등록</button>
  </details>;
}

export function Ballot({poll, name, save}: {poll:Poll;name:string;save:(poll:Poll)=>void | Promise<boolean>}) {
  const [selected, setSelected] = useState<string[]>(poll.votes[name] ?? []);
  const [none, setNone] = useState(poll.votes[name]?.length === 0);
  const [message,setMessage] = useState("");
  return <><p>참석 가능한 1시간 단위를 모두 선택하세요. 모임은 {poll.hours}시간 진행됩니다.</p>
    <div>{Array.from(new Set(poll.slots.map(s=>s.slice(0,10)))).sort().map(day=><fieldset key={day} className="voteDay"><legend>{label(day+"T00:00").split(" · ")[0]}</legend><div className="row">{poll.slots.filter(s=>s.startsWith(day)).map(s=><button key={s} aria-pressed={selected.includes(s)} onClick={()=>{
      setNone(false); setMessage(""); setSelected(selected.includes(s)?selected.filter(v=>v!==s):[...selected,s]);
    }}>{label(s).split(" · ")[1]}</button>)}</div></fieldset>)}</div>
    <label className="check"><input type="checkbox" checked={none} onChange={e=>{setNone(e.target.checked);setSelected([]);setMessage("");}}/>가능한 시간 없음</label>
    <button className="primary" disabled={!none && !selected.length} onClick={async()=>{if (await save({...poll,votes:{...poll.votes,[name]:selected}}) === false) return; setMessage("응답을 저장했어요.");}}>응답 저장</button>
    <span role="status">{message}</span></>;
}

export function Results({poll, members, save}: {poll:Poll; members:Person[]; save:(poll:Poll)=>void | Promise<boolean>}) {
  const options = rankings(poll,members);
  const [chosen,setChosen] = useState("");
  const [place,setPlace] = useState("");
  const pending = members.filter(m=>!(m.name in poll.votes));
  return <><p>{members.length-pending.length}/{members.length}명 응답 · 미응답 {pending.map(p=>p.name).join(", ") || "없음"}</p>
    <p>연속 {poll.hours}시간 참석 가능한 인원순</p>
    {options.map(r=><label className="result" key={r.start}><input type="radio" name={"pick"+poll.id} checked={chosen===r.start} onChange={()=>setChosen(r.start)}/>{label(r.start,poll.hours)} <b>{r.count}명</b></label>)}
    <label>모임 장소<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="미정(추후 공지 예정)"/></label>
    <button className="primary" disabled={!chosen} onClick={()=>save({...poll,confirmed:chosen,place:place.trim() || "미정(추후 공지 예정)"})}>선택한 시간으로 공지 확정</button></>;
}
