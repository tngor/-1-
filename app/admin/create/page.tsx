"use client";

import { useState } from "react";
import Link from "next/link";
// ✅ 1. Supabase 연결 도구를 불러옵니다. (폴더 경로에 맞게 점 3개 ../../../ 사용)
import { supabase } from "../../../lib/supabase";

export default function CreatePage() {
  const [title, setTitle] = useState("");
  const [targetTeam, setTargetTeam] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [startHour, setStartHour] = useState("18");
  const [endHour, setEndHour] = useState("22");
  const [preview, setPreview] = useState<any>(null);

  const addDate = () => {
    if (!dateInput) return;
    if (!dates.includes(dateInput)) {
      setDates([...dates, dateInput]);
    }
    setDateInput("");
  };

  // ✅ 2. async를 붙여서 DB 저장이 끝날 때까지 기다리게 만듭니다.
  const createSurvey = async () => {
    if (!title || !targetTeam || dates.length === 0) {
      alert("일정명, 대상 조, 날짜를 모두 입력해주세요.");
      return;
    }

    const start = Number(startHour);
    const end = Number(endHour);

    if (start >= end) {
      alert("종료 시간이 시작 시간보다 커야 합니다.");
      return;
    }

    const generated = dates.map((date) => {
      const slots = [];
      for (let hour = start; hour < end; hour++) {
        slots.push(
          `${hour.toString().padStart(2, "0")}:00 ~ ${(hour + 1)}:00`
        );
      }
      return { date, slots };
    });

    // ✅ 3. DB 표(Table)의 열(Column) 이름에 정확히 맞춰서 데이터를 포장합니다.
    const newSurvey = {
      id: Date.now().toString(),
      title: title,
      target_team: targetTeam, // targetTeam이 아니라 target_team
      status: "active",
      final_schedule: null,    // finalSchedule이 아니라 final_schedule
      dates: generated,
    };

    // ✅ 4. Supabase의 'surveys' 표에 데이터를 집어넣습니다(insert).
    const { error } = await supabase
      .from("surveys")
      .insert([newSurvey]);

    // 에러가 났을 때의 처리
    if (error) {
      console.error("DB 저장 에러:", error.message);
      alert("일정 생성에 실패했습니다. 콘솔창을 확인해주세요.");
      return;
    }

    // 성공 시 화면 초기화
    setPreview(newSurvey);
    setTitle("");
    setTargetTeam("");
    setDates([]);
    
    alert(`[${targetTeam}] 일정이 진짜 DB에 성공적으로 저장되었습니다! 🎉`);
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-4xl font-bold text-gray-900">일정 생성 (DB 연결됨)</h1>
          <Link href="/admin" className="text-blue-600 font-semibold hover:underline">← 관리자 홈</Link>
        </div>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block font-semibold text-gray-900">대상 조 선택</label>
            <select
              value={targetTeam}
              onChange={(e) => setTargetTeam(e.target.value)}
              className="w-full rounded-lg border p-3 text-gray-900 bg-white"
            >
              <option value="">조를 선택하세요</option>
              <option value="1조">1조</option>
              <option value="2조">2조</option>
              <option value="3조">3조</option>
              <option value="4조">4조</option>
              <option value="전체">전체 공통</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-gray-900">일정명</label>
            <input
              type="text"
              placeholder="예: 7월 첫 모임, 찬양팀 연습"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border p-3 text-gray-900"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-gray-900">날짜 추가</label>
            <div className="flex gap-3">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="flex-1 rounded-lg border p-3 text-gray-900"
              />
              <button onClick={addDate} className="rounded-lg bg-blue-600 px-5 py-3 text-white font-semibold">
                추가
              </button>
            </div>
          </div>

          {dates.length > 0 && (
            <div className="rounded-xl border p-4 bg-gray-50">
              <h2 className="mb-3 font-bold text-gray-900">선택된 날짜 목록</h2>
              <div className="flex flex-wrap gap-2">
                {dates.map((date) => (
                  <div key={date} className="rounded-lg bg-white border px-3 py-1.5 text-gray-900 font-medium">
                    📅 {date}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block font-semibold text-gray-900">시작 시간</label>
              <select value={startHour} onChange={(e) => setStartHour(e.target.value)} className="w-full rounded-lg border p-3 text-gray-900">
                {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}:00</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block font-semibold text-gray-900">종료 시간</label>
              <select value={endHour} onChange={(e) => setEndHour(e.target.value)} className="w-full rounded-lg border p-3 text-gray-900">
                {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}:00</option>)}
              </select>
            </div>
          </div>

          <button onClick={createSurvey} className="w-full rounded-lg bg-green-600 p-4 text-lg font-semibold text-white shadow-md hover:bg-green-700 transition">
            새로운 일정 등록하기
          </button>
        </div>
      </div>
    </main>
  );
}





