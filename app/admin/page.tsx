"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [rsvpResponses, setRsvpResponses] = useState<any[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);

  // 새 투표 생성용 상태 (복수 날짜 처리)
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTeam, setNewTeam] = useState("전체");
  const [tempDate, setTempDate] = useState(""); // 달력에서 방금 선택한 임시 날짜
  const [newDates, setNewDates] = useState<string[]>([]); // 추가된 날짜들이 담기는 바구니
  const [startTime, setStartTime] = useState(""); 
  const [endTime, setEndTime] = useState(""); 

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalTime, setFinalTime] = useState("");
  const [finalLocation, setFinalLocation] = useState("");
  const [finalMemo, setFinalMemo] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: sData } = await supabase.from("surveys").select("*").order("created_at", { ascending: false });
    setSurveys(sData || []);
    const { data: srData } = await supabase.from("survey_responses").select("*");
    setSurveyResponses(srData || []);
    const { data: rsvpData } = await supabase.from("rsvp_responses").select("*");
    setRsvpResponses(rsvpData || []);
  };

  // 📅 날짜 바구니에 추가/삭제하는 함수
  const handleAddDate = () => {
    if (!tempDate) return;
    if (newDates.includes(tempDate)) return alert("이미 추가된 날짜입니다.");
    setNewDates([...newDates, tempDate].sort()); // 날짜순으로 정렬해서 추가
    setTempDate(""); // 입력창 비우기
  };

  const handleRemoveDate = (dateToRemove: string) => {
    setNewDates(newDates.filter((d) => d !== dateToRemove));
  };

  const generateTimeSlots = (start: string, end: string) => {
    const slots: string[] = [];
    const [startHour, startMin] = start.split(":").map(Number);
    const [endHour, endMin] = end.split(":").map(Number);
    let currentHour = startHour;
    
    while (currentHour < endHour) {
      let nextHour = currentHour + 1;
      const formatAMPM = (h: number, m: number) => {
        const ampm = h >= 12 ? "오후" : "오전";
        const formattedH = h % 12 === 0 ? 12 : h % 12;
        const formattedM = m.toString().padStart(2, "0");
        return `${ampm} ${formattedH}:${formattedM}`;
      };
      slots.push(`${formatAMPM(currentHour, startMin)} ~ ${formatAMPM(nextHour, startMin)}`);
      currentHour = nextHour;
    }
    return slots;
  };

  // ✅ 새로운 투표 생성 함수 (여러 날짜 적용)
  const handleCreateSurvey = async () => {
    if (!newTitle || newDates.length === 0 || !startTime || !endTime) {
      return alert("제목, 날짜(최소 1개 이상 추가), 시작/종료 시간을 모두 입력해주세요.");
    }
    
    const slotsArray = generateTimeSlots(startTime, endTime);
    if (slotsArray.length === 0) return alert("종료 시간이 시작 시간보다 늦어야 합니다.");

    // 담아둔 여러 날짜들을 각각 예쁜 형식으로 변환해서 배열로 만듭니다.
    const datesPayload = newDates.map((dateStr) => {
      const dateObj = new Date(dateStr);
      return {
        date: `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`,
        slots: slotsArray,
      };
    });

    const newSurveyData = {
      id: crypto.randomUUID(), 
      title: newTitle,
      target_team: newTeam,
      status: "active",
      dates: datesPayload, // 여러 날짜 데이터 묶음을 통째로 넣습니다.
    };

    const { error } = await supabase.from("surveys").insert([newSurveyData]);
    if (error) return alert("생성 실패: " + error.message);
    
    alert("새로운 다중 날짜 투표가 생성되었습니다! 🎉");
    setIsCreating(false);
    setNewTitle(""); setNewDates([]); setStartTime(""); setEndTime("");
    fetchData(); 
  };

  const handleFinalizeSurvey = async () => {
    if (!finalTime || !finalLocation) return alert("확정된 시간과 장소를 입력해주세요.");
    const finalSchedule = { time: finalTime, location: finalLocation, memo: finalMemo };
    const { error } = await supabase.from("surveys").update({ status: "finalized", final_schedule: finalSchedule }).eq("id", selectedSurvey.id);
    if (error) return alert("확정 실패: " + error.message);

    alert("일정이 확정되어 공지로 전환되었습니다! ✅");
    setIsFinalizing(false);
    setFinalTime(""); setFinalLocation(""); setFinalMemo("");
    fetchData(); 
    setSelectedSurvey({ ...selectedSurvey, status: "finalized", final_schedule: finalSchedule }); 
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!window.confirm("정말 이 일정을 삭제하시겠습니까? (관련된 데이터 모두 삭제됨)")) return;
    const { error } = await supabase.from("surveys").delete().eq("id", id);
    if (error) return alert("삭제 실패: " + error.message);
    alert("삭제되었습니다.");
    setSelectedSurvey(null);
    fetchData();
  };

  const handleDownloadCSV = () => {
    let csvContent = "\uFEFF"; 
    csvContent += "상태,소속 조,기수,이름,사유(비고)\n"; 
    attending.forEach(r => csvContent += `참석,${r.team},${r.generation},${r.name},\n`);
    partial.forEach(r => csvContent += `부분참석,${r.team},${r.generation},${r.name},${r.reason || ""}\n`);
    absent.forEach(r => csvContent += `불참,${r.team},${r.generation},${r.name},${r.reason || ""}\n`);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `[명단]_${selectedSurvey?.title}.csv`); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentVoteResponses = surveyResponses.filter((r) => r.survey_id === selectedSurvey?.id);
  const currentRsvpResponses = rsvpResponses.filter((r) => r.survey_id === selectedSurvey?.id);

  // 📊 날짜+시간(slotId)별 득표수 합산 로직
  const slotCounts: Record<string, number> = {};
  currentVoteResponses.forEach((response) => {
    response.slots.forEach((slot: string) => { slotCounts[slot] = (slotCounts[slot] || 0) + 1; });
  });
  // 득표수가 많은 순서대로 정렬
  const sortedSlots = Object.entries(slotCounts).sort((a, b) => b[1] - a[1]);

  const attending = currentRsvpResponses.filter((r) => r.status === "참석");
  const partial = currentRsvpResponses.filter((r) => r.status === "부분참석");
  const absent = currentRsvpResponses.filter((r) => r.status === "불참");

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex gap-8">
      {/* 왼쪽 사이드바 */}
      <div className="w-1/3 bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🛠️ 관리자 대시보드</h1>
          <button onClick={() => { setIsCreating(true); setSelectedSurvey(null); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition">
            ➕ 새 투표
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto flex-1 pr-2">
          {surveys.map((survey) => (
            <button key={survey.id} onClick={() => { setSelectedSurvey(survey); setIsCreating(false); setIsFinalizing(false); }} className={`w-full text-left p-4 rounded-xl border transition ${selectedSurvey?.id === survey.id ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-gray-50 text-gray-800 border-gray-200 hover:bg-gray-100"}`}>
              <div className="font-bold text-lg mb-1">{survey.title}</div>
              <div className="flex justify-between items-center">
                <div className="flex gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${survey.status === 'active' ? 'bg-blue-200 text-blue-800' : 'bg-green-200 text-green-800'}`}>{survey.status === "active" ? "투표중" : "확정됨"}</span>
                  <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md">{survey.target_team}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 오른쪽 메인 패널 */}
      <div className="w-2/3 bg-white p-8 rounded-3xl shadow-sm border border-gray-200 overflow-y-auto h-[calc(100vh-4rem)]">
        
        {isCreating ? (
          <div className="animate-fade-in max-w-xl mx-auto mt-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">✨ 새로운 일정 만들기</h2>
            <div className="space-y-5 bg-gray-50 p-6 rounded-2xl border">
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">모임 제목</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 7월 1주차 피지 선교 준비 모임" className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 bg-white" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">대상 조</label>
                <select value={newTeam} onChange={(e) => setNewTeam(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 bg-white">
                  <option value="전체">전체 인원</option>
                  <option value="1조">1조</option>
                  <option value="2조">2조</option>
                  <option value="3조">3조</option>
                  <option value="4조">4조</option>
                </select>
              </div>

              {/* ✨ 다중 날짜 선택 UI */}
              <div className="bg-white p-4 rounded-xl border border-gray-200">
                <label className="block text-sm font-bold text-gray-700 mb-2">투표할 날짜 추가 (여러 개 가능)</label>
                <div className="flex gap-2 mb-3">
                  <input type="date" value={tempDate} onChange={(e) => setTempDate(e.target.value)} className="flex-1 border border-gray-300 rounded-lg p-3 text-gray-900 bg-white" />
                  <button onClick={handleAddDate} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-6 rounded-lg transition">추가</button>
                </div>
                {/* 추가된 날짜들이 바구니에 표시되는 영역 */}
                {newDates.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[3rem]">
                    {newDates.map((d) => (
                      <span key={d} className="bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm text-sm">
                        📅 {d}
                        <button onClick={() => handleRemoveDate(d)} className="text-white hover:text-red-300 font-bold ml-1 transition">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {newDates.length === 0 && <p className="text-sm text-red-500 mt-2 font-medium">※ 투표를 받을 날짜를 최소 1개 이상 추가해주세요.</p>}
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-2">시작 시간</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 bg-white" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-2">종료 시간</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 bg-white" />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setIsCreating(false)} className="flex-1 bg-gray-200 text-gray-800 font-bold py-4 rounded-lg hover:bg-gray-300 transition">취소</button>
                <button onClick={handleCreateSurvey} className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition shadow-md">투표 생성하기</button>
              </div>
            </div>
          </div>
        ) : !selectedSurvey ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4">📊</span>
            <p className="font-medium text-lg">왼쪽에서 일정을 선택하거나 새 투표를 만들어주세요.</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-start mb-6 border-b pb-4">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedSurvey.title}</h2>
                <p className="text-gray-500 font-medium">대상: {selectedSurvey.target_team}</p>
              </div>
              <button onClick={() => handleDeleteSurvey(selectedSurvey.id)} className="text-red-500 font-semibold hover:bg-red-50 px-3 py-1.5 rounded-lg transition text-sm">
                🗑️ 이 일정 삭제
              </button>
            </div>

            {/* ===== 투표 중 ===== */}
            {selectedSurvey.status === "active" && (
              <div className="space-y-8 animate-fade-in">
                {isFinalizing ? (
                  <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-300 shadow-md">
                    <h3 className="text-xl font-bold text-yellow-900 mb-4">🎯 이 일정 확정하기 (투표 마감)</h3>
                    <div className="space-y-4">
                      <input type="text" value={finalTime} onChange={(e) => setFinalTime(e.target.value)} placeholder="최종 확정 시간 (예: 7월 15일 오후 2시)" className="w-full border border-yellow-200 rounded-lg p-3 text-gray-900 bg-white" />
                      <input type="text" value={finalLocation} onChange={(e) => setFinalLocation(e.target.value)} placeholder="최종 장소 (예: 교육관 3층)" className="w-full border border-yellow-200 rounded-lg p-3 text-gray-900 bg-white" />
                      <textarea value={finalMemo} onChange={(e) => setFinalMemo(e.target.value)} placeholder="조원들에게 남길 공지 메모 (선택)" className="w-full border border-yellow-200 rounded-lg p-3 h-20 text-gray-900 bg-white" />
                      <div className="flex gap-2">
                        <button onClick={() => setIsFinalizing(false)} className="flex-1 bg-white text-gray-600 font-bold py-3 rounded-lg border">취소</button>
                        <button onClick={handleFinalizeSurvey} className="flex-1 bg-yellow-500 text-white font-bold py-3 rounded-lg shadow hover:bg-yellow-600">공지로 전환하기</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsFinalizing(true)} className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-4 rounded-xl shadow transition text-lg flex justify-center items-center gap-2">
                    ✅ 투표 마감하고 일정 확정하기
                  </button>
                )}

                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <h3 className="text-xl font-bold text-blue-900 mb-4">📊 날짜 및 시간대별 득표 현황 (Top 순위)</h3>
                  {sortedSlots.length === 0 ? <p className="text-gray-500">아직 투표한 인원이 없습니다.</p> : (
                    <div className="space-y-2">
                      {sortedSlots.map(([slot, count]) => (
                        <div key={slot} className="flex justify-between items-center bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                          <span className="font-semibold text-gray-800">{slot}</span>
                          <span className="font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">{count}명</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ✨ 조원 투표 코멘트 (메모 눈에 띄게 강조) */}
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">📝 조원 투표 코멘트 (비고란)</h3>
                  {currentVoteResponses.length === 0 ? <p className="text-gray-500">제출된 투표가 없습니다.</p> : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {currentVoteResponses.map((res, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                          <div className="font-bold text-gray-900 mb-3 text-lg border-b pb-2">
                            {res.team} - {res.generation}기 {res.name}
                          </div>
                          {res.memo ? (
                            <div className="text-gray-800 font-medium bg-yellow-50 border border-yellow-200 p-4 rounded-xl whitespace-pre-wrap leading-relaxed shadow-inner">
                              💡 {res.memo}
                            </div>
                          ) : (
                            <div className="text-gray-400 text-sm italic py-2">남긴 메모가 없습니다.</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== 확정됨 (RSVP 모드) ===== */}
            {selectedSurvey.status === "finalized" && (
              <div className="space-y-8 animate-fade-in">
                {/* 기존 참석/부분참석/불참 현황 로직 (동일) */}
                <div className="bg-green-50 p-6 rounded-2xl border border-green-200 shadow-inner">
                  <h3 className="text-xl font-bold text-green-900 mb-3">📍 확정된 모임 정보</h3>
                  <p className="text-gray-800"><strong>시간:</strong> {selectedSurvey.final_schedule?.time || "미정"}</p>
                  <p className="text-gray-800"><strong>장소:</strong> {selectedSurvey.final_schedule?.location || "미정"}</p>
                  <p className="text-gray-800"><strong>메모:</strong> {selectedSurvey.final_schedule?.memo || "없음"}</p>
                </div>

                <div className="flex justify-between items-end border-b pb-2 mb-4">
                  <h3 className="text-2xl font-bold text-gray-900">🙋‍♂️ 참석 현황판</h3>
                  <button onClick={handleDownloadCSV} className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-2 px-4 rounded-lg flex items-center gap-2 shadow-sm transition">
                    📥 엑셀(CSV) 다운로드
                  </button>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-blue-700">✅ 참석 확정</span>
                    <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full text-sm">{attending.length}명</span>
                  </div>
                  {attending.length === 0 ? <p className="text-gray-400 text-sm">아직 없습니다.</p> : (
                    <div className="flex flex-wrap gap-2">
                      {attending.map((r, i) => <span key={i} className="bg-white border border-blue-200 text-gray-700 px-3 py-1.5 rounded-lg shadow-sm font-medium">{r.team} {r.name}</span>)}
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-yellow-600">⚠️ 부분참석 (지각/조퇴)</span>
                    <span className="bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full text-sm">{partial.length}명</span>
                  </div>
                  {partial.length === 0 ? <p className="text-gray-400 text-sm">아직 없습니다.</p> : (
                    <div className="space-y-2">
                      {partial.map((r, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <span className="font-bold text-gray-800 min-w-[100px]">{r.team} {r.name}</span>
                          <span className="text-gray-600 text-sm flex-1">{r.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-red-600">❌ 불참</span>
                    <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full text-sm">{absent.length}명</span>
                  </div>
                  {absent.length === 0 ? <p className="text-gray-400 text-sm">아직 없습니다.</p> : (
                    <div className="space-y-2">
                      {absent.map((r, i) => (
                        <div key={i} className="bg-red-50 border border-red-200 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <span className="font-bold text-gray-800 min-w-[100px]">{r.team} {r.name}</span>
                          <span className="text-gray-600 text-sm flex-1">{r.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

