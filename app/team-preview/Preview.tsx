"use client";
import { useEffect, useState } from "react";
import type { Data, Poll, Person } from "./model";
import { seed, teams, ministries, label, rankings } from "./model";
import DatePicker from "./DatePicker";
import "./preview.css";

const storageKey = "fiji-team-preview-v1";
type Role = "사용자" | "팀장" | "조교";
const roster = (data: Data, team: string) => data.members.filter(p => team === "전체" || p.teams.includes(team));

function NewPoll({team, add}: {team: string; add: (poll: Poll) => void}) {
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
  function create() {
    if (dates.length && end <= start) { setError("종료 시간을 시작 시간보다 늦게 선택해 주세요."); return; }
    const poll = { id: crypto.randomUUID(), team, title:title.trim(), slots:candidateSlots(), hours, votes:{} };
    if (!poll.title || !rankings(poll, []).length) { setError("모임 이름과 필요한 시간만큼 이어지는 후보 시간대를 입력해 주세요."); return; }
    add(poll); setTitle(""); setDates([]); setSlots([]); setError("");
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

function Ballot({poll, name, save}: {poll:Poll;name:string;save:(poll:Poll)=>void}) {
  const [selected, setSelected] = useState<string[]>(poll.votes[name] ?? []);
  const [none, setNone] = useState(poll.votes[name]?.length === 0);
  const [message,setMessage] = useState("");
  return <><p>참석 가능한 1시간 단위를 모두 선택하세요. 모임은 {poll.hours}시간 진행됩니다.</p>
    <div>{Array.from(new Set(poll.slots.map(s=>s.slice(0,10)))).sort().map(day=><fieldset key={day} className="voteDay"><legend>{label(day+"T00:00").split(" · ")[0]}</legend><div className="row">{poll.slots.filter(s=>s.startsWith(day)).map(s=><button key={s} aria-pressed={selected.includes(s)} onClick={()=>{
      setNone(false); setMessage(""); setSelected(selected.includes(s)?selected.filter(v=>v!==s):[...selected,s]);
    }}>{label(s).split(" · ")[1]}</button>)}</div></fieldset>)}</div>
    <label className="check"><input type="checkbox" checked={none} onChange={e=>{setNone(e.target.checked);setSelected([]);setMessage("");}}/>가능한 시간 없음</label>
    <button className="primary" disabled={!none && !selected.length} onClick={()=>{save({...poll,votes:{...poll.votes,[name]:selected}}); setMessage("응답을 저장했어요.");}}>응답 저장</button>
    <span role="status">{message}</span></>;
}

function Results({poll, members, save}: {poll:Poll; members:Person[]; save:(poll:Poll)=>void}) {
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

export default function Preview() {
  const [data,setData] = useState<Data>(seed);
  const [ready,setReady] = useState(false);
  const [role,setRole] = useState<Role>("사용자");
  const [member,setMember] = useState("하늘");
  const [team,setTeam] = useState("워십팀");
  const [notice,setNotice] = useState("");
  useEffect(()=>{
    let initial = seed;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) initial = JSON.parse(raw);
    } catch { setNotice("연습용 초기 자료를 불러왔습니다."); }
    setData(initial);
    if (new URLSearchParams(window.location.search).get("view") === "leader") {
      setRole("팀장");
      const leader = initial.leaders["워십팀"] || Object.values(initial.leaders).find(Boolean);
      if (leader) setMember(leader);
    }
    setReady(true);
  },[]);
  function update(next: Data) {
    setData(next);
    try {localStorage.setItem(storageKey,JSON.stringify(next));} catch {setNotice("이 브라우저에서는 새로고침 후 저장되지 않을 수 있습니다.");}
  }
  function save(poll: Poll) {update({...data,polls:data.polls.map(p=>p.id===poll.id?poll:p)});}
  const user=data.members.find(p=>p.name===member)!;
  const myTeams=teams.filter(t=>data.leaders[t]===member);
  const managedTeam=role==="팀장" ? (myTeams.includes(team)?team:myTeams[0]) : team;
  const visible=data.polls.filter(p=> role==="사용자" ? p.team==="전체" || user.teams.includes(p.team) : p.team===managedTeam);
  function switchRole(next:Role) {
    setRole(next); setNotice("");
    if(next==="팀장" && !myTeams.length) setMember(data.leaders["워십팀"] || Object.values(data.leaders).find(Boolean) || member);
  }
  return <main className="teamPreview"><div className="wrap">
    <header><p>피지 선교 준비 · 개인 체험</p><h1>사역팀 모임</h1><p>가상 팀원으로 역할을 바꿔볼 수 있어요. 연습한 내용은 이 브라우저에 저장됩니다.</p></header>
    <nav aria-label="미리볼 화면">{(["사용자","팀장","조교"] as const).map(r=><button key={r} aria-pressed={role===r} onClick={()=>switchRole(r)}>{r} 화면</button>)}</nav>
    <div className="panel"><div className="row">
    {role!=="조교" && <label>연습 계정<select value={member} onChange={e=>setMember(e.target.value)}>{data.members.map(p=><option key={p.name}>{p.name}</option>)}</select></label>}
    {role!=="사용자" && <label>관리할 팀<select value={managedTeam ?? ""} onChange={e=>setTeam(e.target.value)}>{(role==="조교"?["전체",...teams]:myTeams).map(t=><option key={t}>{t}</option>)}</select></label>}</div>
    {role==="사용자" && <p>내 소속 · {user.teams.join(" / ")}</p>}
    {role==="사용자" && myTeams.length>0 && <button onClick={()=>switchRole("팀장")}>내 팀 관리 →</button>}
    {role==="팀장" && <p>{managedTeam ? managedTeam+" 팀장으로 보고 있어요." : "이 계정은 담당하는 팀이 없습니다."}</p>}</div>
    {role==="조교" && <details className="panel"><summary>팀 배정 및 팀장 지정</summary>
    {managedTeam!=="전체" && <label>{managedTeam} 팀장<select value={data.leaders[managedTeam] || ""} onChange={e=>update({...data,leaders:{...data.leaders,[managedTeam]:e.target.value}})}><option value="">미지정</option>{roster(data,managedTeam).map(p=><option key={p.name}>{p.name}</option>)}</select></label>}
    {data.members.map(p=><div className="assignment" key={p.name}><b>{p.name}</b><div className="row">{Object.entries(ministries).map(([area,options],index)=><label key={area}>{area}<select value={p.teams[index]} onChange={e=>{
      const next=e.target.value, old=p.teams[index]; const leaders={...data.leaders}; if(leaders[old]===p.name)delete leaders[old];
      update({...data,leaders,members:data.members.map(m=>m.name===p.name?{...m,teams:m.teams.map((t,i)=>i===index?next:t)}:m)});
    }}>{options.map(t=><option key={t}>{t}</option>)}</select></label>)}</div></div>)}</details>}
    {role!=="사용자" && managedTeam && <NewPoll key={managedTeam} team={managedTeam} add={p=>{update({...data,polls:[p,...data.polls]});setNotice("새 투표를 등록했습니다.");}}/>}
    <p role="status">{notice}</p>
    {ready && visible.map(p=><article className="panel" key={p.id}><small>{p.team} · {p.confirmed?"확정 공지":"투표 중"}</small><h2>{p.title}</h2>
      {p.confirmed?<><strong>{label(p.confirmed,p.hours)}</strong><p>장소 · {p.place}</p></>:
      role==="사용자"?<Ballot key={member+p.id} poll={p} name={member} save={save}/>:<Results poll={p} members={roster(data,p.team)} save={save}/>}</article>)}
    {ready && !visible.length && <p>표시할 모임이 없습니다.</p>}
  </div></main>;
}
