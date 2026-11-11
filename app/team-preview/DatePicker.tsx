import { useState } from "react";

export default function DatePicker({dates, toggle}: {dates: string[]; toggle: (day: string) => void}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = month.getFullYear();
  const index = month.getMonth();
  const prefix = year + "-" + String(index+1).padStart(2,"0") + "-";
  const days = new Date(year,index+1,0).getDate();
  return <fieldset className="calendar"><legend>후보 날짜 · 여러 날 선택</legend>
    <div className="month"><button type="button" aria-label="이전 달" onClick={()=>setMonth(new Date(year,index-1,1))}>‹</button>
      <strong>{year}년 {index+1}월</strong><button type="button" aria-label="다음 달" onClick={()=>setMonth(new Date(year,index+1,1))}>›</button></div>
    <div className="days">{Array.from("일월화수목금토", d=><small key={d}>{d}</small>)}
      {Array.from({length:month.getDay()},(_,i)=><span key={"space"+i}/>)}
      {Array.from({length:days},(_,i)=>{
        const day = prefix+String(i+1).padStart(2,"0");
        return <button type="button" key={day} aria-label={day} aria-pressed={dates.includes(day)} onClick={()=>toggle(day)}>{i+1}</button>;
      })}</div>
    {dates.length>0 && <p>선택한 날짜 · {dates.join(", ")}</p>}
  </fieldset>;
}
