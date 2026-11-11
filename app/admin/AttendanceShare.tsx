"use client";

import { useRef, useState } from "react";
import { attendanceShare, type Attendance, type Member } from "../../lib/attendance-share";

export default function AttendanceShare({ title, responses, members }: {
  title: string;
  responses: Attendance[];
  members: Member[];
}) {
  const [mode, setMode] = useState<"full" | "reasons">("full");
  const [message, setMessage] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const text = attendanceShare(title, responses, members)[mode];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("복사했습니다. 카카오톡 대화창에 붙여넣어 주세요.");
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setMessage("자동 복사를 사용할 수 없습니다. 선택된 내용을 ⌘C 또는 Ctrl+C로 복사해 주세요.");
    }
  }

  return (
    <details className="rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4">
      <summary className="cursor-pointer text-sm font-black text-slate-900">💬 참석 현황 카톡 공유</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">현재 불러온 응답 기준입니다. 최신 응답은 위의 ‘현황 새로고침’으로 확인해 주세요.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="공유 내용 선택">
          {([['full', '전체 현황'], ['reasons', '불참·부분참 사유만']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(""); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mode === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
          ))}
        </div>
        <textarea ref={textRef} aria-label="카톡 공유 내용" readOnly value={text} rows={12} className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800" />
        <button type="button" onClick={copy} className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-yellow-950 hover:bg-yellow-500">{mode === "full" ? "전체 현황 복사" : "불참·부분참 사유 복사"}</button>
        <p role="status" className="text-xs text-slate-700">{message}</p>
      </div>
    </details>
  );
}
