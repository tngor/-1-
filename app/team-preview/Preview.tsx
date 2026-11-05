"use client";
import { useEffect, useState } from "react";
import type { Data, Poll } from "./model";
import { seed, teams, ministries, label } from "./model";
import { NewPoll, Ballot, Results } from "./PollControls";
import "./preview.css";

const storageKey = "fiji-team-preview-v1";
type Role = "사용자" | "팀장" | "조교";
const roster = (data: Data, team: string) => data.members.filter(p => team === "전체" || p.teams.includes(team));

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
