"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// ✅ 1. Supabase 연결 도구 불러오기
import { supabase } from "../../../lib/supabase";

export default function ResultsPage() {
  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [allResponses, setAllResponses] = useState<any[]>([]);
  
  const [selectedSurveyId, setSelectedSurveyId] = useState("");
  const [aggregatedData, setAggregatedData] = useState<Record<string, string[]>>({});

  const [finalTime, setFinalTime] = useState("");
  const [finalLocation, setFinalLocation] = useState("");
  const [finalMemo, setFinalMemo] = useState("");

  // ✅ 2. 처음에 DB에서 전체 일정과 전체 응답을 모두 가져옵니다.
  useEffect(() => {
    const fetchData = async () => {
      const { data: surveysData } = await supabase.from("surveys").select("*");
      const { data: responsesData } = await supabase.from("survey_responses").select("*");

      if (surveysData) setAllSurveys(surveysData);
      if (responsesData) setAllResponses(responsesData);
    };

    fetchData();
  }, []);

  // 3. 관리자가 볼 일정을 선택하면 그 일정에 투표한 사람만 골라내서 집계합니다.
  useEffect(() => {
    if (!selectedSurveyId) {
      setAggregatedData({});
      return;
    }

    const filteredResponses = allResponses.filter((r) => r.survey_id === selectedSurveyId);
    const grouped: Record<string, string[]> = {};

    filteredResponses.forEach((response) => {
      const userInfo = `${response.generation}기 ${response.name}`;
      response.slots.forEach((slot: string) => {
        if (!grouped[slot]) grouped[slot] = [];
        grouped[slot].push(userInfo);
      });
    });

    setAggregatedData(grouped);

    // 이미 확정된 공지라면 내용을 폼에 미리 채워줍니다.
    const targetSurvey = allSurveys.find((s) => s.id === selectedSurveyId);
    if (targetSurvey?.status === "finalized" && targetSurvey.final_schedule) {
      setFinalTime(targetSurvey.final_schedule.time);
      setFinalLocation(targetSurvey.final_schedule.location);
      setFinalMemo(targetSurvey.final_schedule.memo || "");
    } else {
      setFinalTime("");
      setFinalLocation("");
      setFinalMemo("");
    }
  }, [selectedSurveyId, allResponses, allSurveys]);

  // ✅ 4. 관리자가 공지를 확정하면 DB의 상태(status)와 공지 내용(final_schedule)을 업데이트(update) 합니다.
  const handleFinalize = async () => {
    if (!finalTime || !finalLocation) {
      alert("최종 시간과 장소를 입력해주세요!");
      return;
    }

    const confirmMsg = "이 내용으로 조원들에게 확정 공지를 띄우시겠습니까?";
    if (!window.confirm(confirmMsg)) return;

    // DB에 업데이트할 데이터 포장
    const updateData = {
      status: "finalized",
      final_schedule: {
        time: finalTime,
        location: finalLocation,
        memo: finalMemo,
      },
    };

    // Supabase DB 업데이트 실행 (.eq를 써서 선택한 ID의 데이터만 수정합니다)
    const { error } = await supabase
      .from("surveys")
      .update(updateData)
      .eq("id", selectedSurveyId);

    if (error) {
      console.error("공지 업데이트 에러:", error.message);
      alert("공지 확정에 실패했습니다.");
      return;
    }

    // 성공하면 화면의 목록도 최신 상태로 바꿔줍니다.
    const updatedSurveys = allSurveys.map((survey) => {
      if (survey.id === selectedSurveyId) {
        return { ...survey, ...updateData };
      }
      return survey;
    });
    setAllSurveys(updatedSurveys);
    
    alert("공지가 성공적으로 확정되었습니다! 조원들 화면에 즉시 노출됩니다. 🎉");
  };

  const selectedSurvey = allSurveys.find((s) => s.id === selectedSurveyId);

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-lg">
        
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">결과 집계 및 공지 확정 (DB 연결됨)</h1>
          <Link href="/admin" className="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-300 transition">
            관리자 홈으로
          </Link>
        </div>

        <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-6">
          <label className="mb-2 block font-bold text-blue-900">조회할 일정을 선택하세요</label>
          <select
            value={selectedSurveyId}
            onChange={(e) => setSelectedSurveyId(e.target.value)}
            className="w-full rounded-lg border border-blue-300 p-3 text-gray-900 shadow-sm bg-white"
          >
            <option value="">일정 선택...</option>
            {allSurveys.map((survey) => (
              <option key={survey.id} value={survey.id}>
                [{survey.target_team}] {survey.title} {survey.status === "finalized" ? "(✅ 확정됨)" : "(🗳️ 투표중)"}
              </option>
            ))}
          </select>
        </div>

        {selectedSurvey && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* 왼쪽: 투표 결과 집계 화면 */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900 border-b pb-2">📊 투표 결과 집계</h2>
              {Object.keys(aggregatedData).length === 0 ? (
                <div className="rounded-xl border border-gray-300 bg-gray-50 p-6 text-center">
                  <p className="text-gray-600">아직 제출된 응답이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {Object.entries(aggregatedData)
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([slot, users]) => (
                      <div key={slot} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between border-b pb-2">
                          <h3 className="text-lg font-bold text-gray-800">{slot}</h3>
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
                            {users.length}명 가능
                          </span>
                        </div>
                        <ul className="flex flex-wrap gap-2">
                          {users.map((user, index) => (
                            <li key={index} className="rounded-md bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700">
                              {user}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 오른쪽: 공지 확정 폼 */}
            <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-6 shadow-sm h-fit">
              <h2 className="mb-4 text-2xl font-bold text-green-900 flex items-center gap-2">
                📢 모임 확정 및 공지하기
              </h2>
              <p className="text-green-800 mb-6 text-sm">
                투표 결과를 참고하여 최종 모임 시간과 장소를 결정해주세요. 저장 시 조원들에게 공지됩니다.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block font-bold text-gray-900">최종 모임 시간</label>
                  <input
                    type="text"
                    placeholder="예: 7월 10일 (금) 20:00"
                    value={finalTime}
                    onChange={(e) => setFinalTime(e.target.value)}
                    className="w-full rounded-lg border p-3 text-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-gray-900">모임 장소</label>
                  <input
                    type="text"
                    placeholder="예: 영동교회 비전센터 3층"
                    value={finalLocation}
                    onChange={(e) => setFinalLocation(e.target.value)}
                    className="w-full rounded-lg border p-3 text-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-gray-900">추가 안내사항 (선택)</label>
                  <textarea
                    placeholder="예: 준비물은 성경책입니다. 늦지 않게 와주세요!"
                    value={finalMemo}
                    onChange={(e) => setFinalMemo(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border p-3 text-gray-900 resize-none"
                  />
                </div>

                <button
                  onClick={handleFinalize}
                  className={`w-full rounded-lg p-4 text-lg font-bold text-white shadow-md transition ${
                    selectedSurvey.status === "finalized"
                      ? "bg-gray-600 hover:bg-gray-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {selectedSurvey.status === "finalized" ? "공지 내용 수정하기" : "최종 공지 확정하기"}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

