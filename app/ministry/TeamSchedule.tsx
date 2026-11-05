"use client";

import { useCallback, useEffect, useState } from "react";
import type { Poll } from "../team-preview/model";
import { label } from "../team-preview/model";
import { Ballot, NewPoll, Results } from "../team-preview/PollControls";
import "../team-preview/preview.css";

type Member = { name:string; role:string };
type Team = {name:string; area:string; role:string; people:Member[]; polls:Poll[]};
type Board = {name:string; teams:Team[]};
async function request(operation:string, payload?:unknown) {
  const response=await fetch("/api/ministry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation,payload}),cache:"no-store"});
  const result=await response.json();
  if (!response.ok) throw new Error(result.expired?"소속 확인을 위해 로그아웃 후 기존 비밀번호로 한 번 다시 입장해 주세요.":result.error || "다시 시도해 주세요.");
  return result;
}

export default function TeamSchedule({name}:{name:string}) {
  const [data,setData]=useState<Board>();
  const [teamName,setTeamName]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const board:Board=await request("read");
    if (board.name!==name) throw new Error("로그아웃 후 본인 계정으로 다시 입장해 주세요.");
    setData(board);
  },[name]);
  useEffect(()=>{refresh().catch(e=>setMessage(e.message));},[refresh]);
  const team=data?.teams.find(t=>t.name===teamName) ?? data?.teams[0];
  async function change(operation:string, payload:unknown) {
    setBusy(true); setMessage("");
    try {await request(operation,payload); await refresh(); setMessage("저장했습니다.");return true;}
    catch(e) {setMessage(e instanceof Error?e.message:"저장에 실패했습니다.");return false;}
    finally {setBusy(false);}
  }
  return <section className="teamPreview ministryPanel">
    {message && <p role="status">{message}</p>}
    {!data && !message && <p>내 사역팀을 확인하고 있어요.</p>}
    {data && !team && <p>배정된 사역팀이 없습니다. 조교에게 확인해 주세요.</p>}
    {team && <><button type="button" disabled={busy} onClick={async()=>{
      setBusy(true);
      try { await refresh(); setMessage("최신 일정과 응답을 불러왔습니다."); }
      catch(e) { setMessage(e instanceof Error ? e.message : "다시 시도해 주세요."); }
      finally { setBusy(false); }
    }}>새로고침</button><label>내 사역팀<select value={team.name} onChange={e=>{setTeamName(e.target.value);setMessage("");}}>{data?.teams.map(t=><option key={t.name} value={t.name}>{t.area} · {t.name} ({t.role})</option>)}</select></label>
      <details><summary>팀원 {team.people.length}명</summary><p>{team.people.map(p=>p.name+(p.role==="팀원"?"":" ("+p.role+")")).join(", ")}</p></details>
      <fieldset disabled={busy} key={team.name}>
      {team.role==="팀장" && <NewPoll team={team.name} add={p=>change("create",p)}/>}
      {!team.polls.length && <p>아직 등록된 팀 일정이 없습니다.</p>}
      {team.polls.map(p=><article className="panel" key={p.id}>
        <small>{p.confirmed?"확정 공지":"시간 투표"}</small><h2>{p.title}</h2>
        {p.confirmed?<><strong>{label(p.confirmed,p.hours)}</strong><p>장소 · {p.place}</p></>:
          <><Ballot key={p.id+name} poll={p} name={name} save={next=>change("vote",{id:p.id,slots:next.votes[name]})}/>
          {team.role==="팀장" && <details><summary>투표 결과 및 일정 확정</summary><Results poll={p} members={team.people.map(person=>({...person,teams:[team.name]}))} save={next=>change("confirm",{id:p.id,confirmed:next.confirmed,place:next.place})}/></details>}</>}
      </article>)}</fieldset></>}
  </section>;
}
