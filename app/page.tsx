
"use client";

import { useEffect, useState } from "react";
// ✅ 1. Supabase 연결 도구를 불러옵니다.
import { supabase } from "../lib/supabase";

export default function Home() {
  const [team, setTeam] = useState("");
  const [generation, setGeneration] = useState("");
  const [name, setName] = useState("");
  const [entered, setEntered] = useState(false);

  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
  const [finalizedSurveys, setFinalizedSurveys] = useState<any[]>([]);
  
  const [currentSurvey, setCurrentSurvey] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "vote" | "notice">("list");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  // ✅ 2. 컴포넌트가 켜질 때 로컬 스토리지 대신 진짜 DB에서 일정을 불러옵니다.
  useEffect(() => {
    const fetchSurveys = async () => {
      // surveys 표에서 모든 데이터(*)를 가져옵니다(select).
      const { data, error } = await supabase.from("surveys").select("*");

      if (error) {
        console.error("일정 불러오기 에러:", error.message);
      } else if (data) {
        setAllSurveys(data);
      }
    };

    fetchSurveys();
  }, []);

  const handleEnter = () => {
    if (!team || !generation || !name) {
      alert("조, 기수, 이름을 모두 입력해주세요.");
      return;
    }

    // ✅ 3. DB에 저장된 이름(target_team) 기준으로 필터링합니다.
    const myTeamSurveys = allSurveys.filter(
      (s) => s.target_team === team || s.target_team === "전체"
    );

    setActiveSurveys(myTeamSurveys.filter((s) => s.status === "active"));
    setFinalizedSurveys(myTeamSurveys.filter((s) => s.status === "finalized"));
    
    setEntered(true);
  };

  const toggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  // ✅ 4. 투표 제출 시 로컬 스토리지 대신 진짜 DB에 저장합니다.
  const handleSubmitVote = async () => {
    if (selectedSlots.length === 0) {
      const confirmEmpty = window.confirm("선택한 시간이 없습니다. 이대로 제출하시겠습니까?");
      if (!confirmEmpty) return;
    }

    // DB의 'survey_responses' 표 양식에 맞게 데이터 포장
    const newResponse = {
      survey_id: currentSurvey.id, // DB 컬럼명에 맞춤
      team: team,
      generation: generation,
      name: name,
      slots: selectedSlots,
    };

    // DB에 데이터 넣기 (insert)
    const { error } = await supabase
      .from("survey_responses")
      .insert([newResponse]);

    if (error) {
      console.error("투표 저장 에러:", error.message);
      alert("투표 저장에 실패했습니다.");
      return;
    }

    setSubmitted(true);
    alert("투표가 진짜 DB에 성공적으로 저장되었습니다! 🎉");
    setTimeout(() => {
      setViewMode("list");
      setSubmitted(false);
      setSelectedSlots([]);
    }, 1500);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-lg">
        
        {!entered ? (
          <>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">서울영동교회 청년1부</h1>
            <h2 className="mb-8 text-xl text-gray-600">피지 선교 일정 관리 시스템</h2>

            <div className="space-y-5">
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-gray-900 bg-white">
                <option value="">조를 선택하세요</option>
                <option value="1조">1조</option>
                <option value="2조">2조</option>
                <option value="3조">3조</option>
                <option value="4조">4조</option>
                <option value="전체">전체 공통</option>
              </select>
              <input type="text" placeholder="기수 입력 (예: 45)" value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-gray-900" />
              <input type="text" placeholder="이름 입력" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-gray-900" />
              <button onClick={handleEnter} className="w-full rounded-lg bg-blue-600 p-4 text-lg font-semibold text-white shadow hover:bg-blue-700 transition">
                내 조 일정 확인하러 가기 →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex justify-between items-center border-b pb-4">
              <div>
                <span className="text-xl font-bold text-blue-700 mr-2">{team}</span>
                <span className="text-gray-700 font-medium">{generation}기 {name}님</span>
              </div>
              {viewMode !== "list" && (
                <button onClick={() => setViewMode("list")} className="text-sm font-semibold text-gray-500 hover:underline">
                  ← 목록으로 돌아가기
                </button>
              )}
            </div>

            {viewMode === "list" && (
              <div className="space-y-8">
                <div>
                  <h3 className="mb-3 text-xl font-bold text-gray-900 flex items-center gap-2">🗳️ 진행 중인 일정 투표</h3>
                  {activeSurveys.length === 0 ? (
                    <p className="text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-dashed">현재 투표 중인 일정이 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeSurveys.map((survey) => (
                        <button
                          key={survey.id}
                          onClick={() => {
                            setCurrentSurvey(survey);
                            setViewMode("vote");
                          }}
                          className="w-full text-left p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition flex justify-between items-center"
                        >
                          <span className="font-bold text-gray-800">{survey.title}</span>
                          <span className="text-sm bg-blue-600 text-white px-3 py-1 rounded-full font-semibold">투표하기</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 text-xl font-bold text-gray-900 flex items-center gap-2">📢 확정된 일정 및 공지사항</h3>
                  {finalizedSurveys.length === 0 ? (
                    <p className="text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-dashed">아직 확정된 공지사항이 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {finalizedSurveys.map((survey) => (
                        <button
                          key={survey.id}
                          onClick={() => {
                            setCurrentSurvey(survey);
                            setViewMode("notice");
                          }}
                          className="w-full text-left p-4 rounded-xl border border-green-200 bg-green-50/50 hover:bg-green-50 transition flex justify-between items-center"
                        >
                          <span className="font-bold text-gray-800">{survey.title}</span>
                          <span className="text-sm bg-green-600 text-white px-3 py-1 rounded-full font-semibold">공지보기</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewMode === "vote" && currentSurvey && (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">🗳️ {currentSurvey.title}</h2>
                {currentSurvey.dates.map((day: any) => (
                  <div key={day.date} className="mb-6">
                    <h3 className="mb-3 font-bold text-gray-800">📅 {day.date}</h3>
                    <div className="space-y-2">
                      {day.slots.map((slot: string) => {
                        const slotId = `${day.date}-${slot}`;
                        const selected = selectedSlots.includes(slotId);
                        return (
                          <button
                            key={slotId}
                            onClick={() => toggleSlot(slotId)}
                            className={`w-full rounded-lg border p-3.5 text-left transition ${
                              selected ? "bg-blue-600 text-white font-semibold" : "bg-white text-gray-800 hover:bg-gray-50"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button onClick={handleSubmitVote} className="w-full rounded-lg bg-green-600 p-4 text-lg font-semibold text-white shadow hover:bg-green-700 transition">
                  투표 제출하기
                </button>
              </>
            )}

            {viewMode === "notice" && currentSurvey && (
              <div className="rounded-2xl border border-green-300 bg-green-50/30 p-6 space-y-4">
                <h2 className="text-2xl font-bold text-green-900">📢 {currentSurvey.title} - 최종 확정 공지</h2>
                <div className="bg-white p-5 rounded-xl border space-y-3 shadow-sm">
                  <p className="text-gray-800 text-lg">
                    <strong>📍 최종 시간:</strong> {currentSurvey.final_schedule?.time || "미정"}
                  </p>
                  <p className="text-gray-800 text-lg">
                    <strong>🏫 모임 장소:</strong> {currentSurvey.final_schedule?.location || "미정"}
                  </p>
                  {currentSurvey.final_schedule?.memo && (
                    <div className="mt-4 pt-3 border-t text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      <strong>📝 추가 안내사항:</strong><br/>
                      {currentSurvey.final_schedule.memo}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}



