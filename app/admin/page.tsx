"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { sortSurveysByDate } from "../../lib/survey-order";
import { groupArchivedSurveys } from "../../lib/archive-groups";
import { cleanAttendanceReason } from "../../lib/attendance-share";
import AttendanceShare from "./AttendanceShare";
import Workbench from "../ministry-review/Workbench";

export default function AdminPage() {
  // 🛠️ 탭에 'baggage' 추가
  const [activeTab, setActiveTab] = useState<"status" | "users" | "create" | "archived" | "baggage" | "teams">("status");
  
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [rsvpResponses, setRsvpResponses] = useState<any[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]); 
  const [baggages, setBaggages] = useState<any[]>([]); // 🎒 물품 데이터
  
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataError, setDataError] = useState("");
  const [dataReady, setDataReady] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [tempDate, setTempDate] = useState(""); 
  const [newDates, setNewDates] = useState<string[]>([]); 
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
    setIsRefreshing(true);
    setDataError("");
    setDataReady(false);
    try {
      const [sData, srData, rsvpData, uData, bData] = await Promise.all([
        supabase.from("surveys").select("*").order("created_at", { ascending: false }),
        supabase.from("survey_responses").select("*"),
        supabase.from("rsvp_responses").select("*"),
        supabase.from("users").select("id,name,generation,team"),
        supabase.from("mission_baggage").select("*"),
      ]);
      if ([sData, srData, rsvpData, uData, bData].some(result => result.error)) {
        throw new Error("현황을 불러오지 못했습니다. 다시 새로고침해 주세요.");
      }
      setSurveys(sData.data || []);
      setSurveyResponses(srData.data || []);
      setRsvpResponses(rsvpData.data || []);
      setRegisteredUsers(uData.data || []);
      setBaggages(bData.data || []);
      setSelectedSurvey((current: any) => current ? sData.data?.find(survey => survey.id === current.id) ?? null : null);
      setDataReady(true);
    } catch {
      setDataError("현황을 불러오지 못했습니다. 다시 새로고침해 주세요.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddDate = () => {
    if (!tempDate) return;
    if (newDates.includes(tempDate)) return alert("이미 추가된 날짜입니다.");
    setNewDates([...newDates, tempDate].sort());
    setTempDate("");
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

  const handleCreateSurvey = async () => {
    if (!newTitle || newDates.length === 0 || !startTime || !endTime) {
      return alert("제목, 날짜(최소 1개 이상 추가), 시작/종료 시간을 모두 입력해주세요.");
    }
    
    const slotsArray = generateTimeSlots(startTime, endTime);
    if (slotsArray.length === 0) return alert("종료 시간이 시작 시간보다 늦어야 합니다.");

    const datesPayload = newDates.map((dateStr) => {
      const [yyyy, mm, dd] = dateStr.split("-").map(Number);
      const dateObj = new Date(yyyy, mm - 1, dd);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dayName = days[dateObj.getDay()];
      return { date: `${mm}월 ${dd}일 (${dayName})`, slots: slotsArray };
    });

    const newSurveyData = {
      id: crypto.randomUUID(), 
      title: newTitle,
      meeting_type: "전체모임",
      target_team: "전체",
      status: "active",
      dates: datesPayload,
    };

    const { error } = await supabase.from("surveys").insert([newSurveyData]);
    if (error) return alert("생성 실패: " + error.message);
    
    alert("📢 새로운 투표가 생성되었습니다!");
    setNewTitle(""); setNewDates([]); setStartTime(""); setEndTime("");
    setActiveTab("status");
    fetchData(); 
  };

  const handleEditNoticeClick = () => {
    if(!selectedSurvey || !selectedSurvey.final_schedule) return;
    setFinalTime(selectedSurvey.final_schedule.time || "");
    setFinalLocation(selectedSurvey.final_schedule.location || "");
    setFinalMemo(selectedSurvey.final_schedule.memo || "");
    setIsFinalizing(true);
  };

  const handleFinalizeSurvey = async () => {
    if (!finalTime || !finalLocation) return alert("확정된 시간과 장소를 입력해주세요.");
    const finalSchedule = { time: finalTime, location: finalLocation, memo: finalMemo };
    const { error } = await supabase.from("surveys").update({ status: "finalized", final_schedule: finalSchedule }).eq("id", selectedSurvey.id);
    if (error) return alert("저장 실패: " + error.message);

    alert("공지 내용이 성공적으로 저장되었습니다! ✅");
    setIsFinalizing(false);
    setFinalTime(""); setFinalLocation(""); setFinalMemo("");
    fetchData(); 
    setSelectedSurvey({ ...selectedSurvey, status: "finalized", final_schedule: finalSchedule }); 
  };

  const handleArchiveSurvey = async (id: string) => {
    if (!window.confirm("이 일정을 조원 화면에서 숨기고 과거 보관함으로 이동하시겠습니까?")) return;
    await supabase.from("surveys").update({ status: "archived" }).eq("id", id);
    alert("숨김 처리되었습니다.");
    setSelectedSurvey(null);
    fetchData();
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!window.confirm("정말 영구 삭제하시겠습니까?")) return;
    await supabase.from("surveys").delete().eq("id", id);
    alert("삭제되었습니다.");
    setSelectedSurvey(null);
    fetchData();
  };

  const handleShareToKakao = (survey: any) => {
    let shareText = "";
    if (survey.status === "active") {
      shareText = `[📢 피지 선교 모임 일정 투표 오픈]\n\n선교 모임 일정 투표가 등록되었습니다. 한 분도 빠짐없이 투표에 응답해 주세요!\n\n📌 모임명: ${survey.title}\n🔗 지금 투표하기:\nhttps://1-weld-ten-38.vercel.app`;
    } else {
      shareText = `[📍 피지 선교 모임 최종 확정 공지]\n\n선교 모임 일정 및 장소가 최종 조율되어 공지합니다. 아래 내용을 확인하시고 꼭 앱에서 '식사 여부' 및 '참석체크'를 진행해 주세요!\n\n📌 모임명: ${survey.title}\n⏱️ 날짜 및 시간: ${survey.final_schedule?.time || "미정"}\n🏫 장소: ${survey.final_schedule?.location || "미정"}\n📝 조교 공지: ${survey.final_schedule?.memo || "없음"}\n\n🔗 참석 체크하러 가기:\nhttps://1-weld-ten-38.vercel.app`;
    }
    navigator.clipboard.writeText(shareText).then(() => alert("클립보드에 복사되었습니다!"));
  };

  const currentVoteResponses = surveyResponses.filter((r) => r.survey_id === selectedSurvey?.id);
  const currentRsvpResponses = rsvpResponses.filter((r) => r.survey_id === selectedSurvey?.id);

  const slotCounts: Record<string, number> = {};
  currentVoteResponses.forEach((response) => {
    response.slots.forEach((slot: string) => { slotCounts[slot] = (slotCounts[slot] || 0) + 1; });
  });
  const sortedSlots = Object.entries(slotCounts).sort((a, b) => b[1] - a[1]);
  const maxVotes = sortedSlots.length > 0 ? sortedSlots[0][1] : 1;

  const attending = currentRsvpResponses.filter((r) => r.status === "참석");
  const partial = currentRsvpResponses.filter((r) => r.status === "부분참석");
  const absent = currentRsvpResponses.filter((r) => r.status === "불참");

  const mealYesCount = currentRsvpResponses.filter(r => r.reason?.includes("[식사함]")).length;
  const extractMealBadge = (reason: string) => {
    if(reason?.includes("[식사함]")) return <span className="bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded text-[10px] ml-1">🍚 식사함</span>;
    if(reason?.includes("[식사안함]")) return <span className="bg-slate-200 text-slate-600 border border-slate-300 px-1.5 py-0.5 rounded text-[10px] ml-1">🙅 식사X</span>;
    return null;
  };
  const cleanReasonText = cleanAttendanceReason;

  const unresponsiveForSelected = registeredUsers.filter(user => {
    if (!selectedSurvey) return false;
    if (selectedSurvey.status === "active") {
      return !surveyResponses.some(r => r.survey_id === selectedSurvey.id && r.name === user.name && r.generation === user.generation);
    } else {
      return !rsvpResponses.some(r => r.survey_id === selectedSurvey.id && r.name === user.name && r.generation === user.generation);
    }
  });

  const activeAndFinalizedSurveys = sortSurveysByDate(surveys.filter(s => s.status === "active" || s.status === "finalized"));
  const archivedGroups = groupArchivedSurveys(surveys.filter(s => s.status === "archived"));

  const usersByGeneration = registeredUsers.reduce((acc: Record<string, any[]>, user: any) => {
    const gen = user.generation;
    if (!acc[gen]) acc[gen] = [];
    acc[gen].push(user);
    return acc;
  }, {} as Record<string, any[]>);
  const sortedGenerations = Object.keys(usersByGeneration).map(Number).sort((a, b) => a - b);

  // 🎒 물품 데이터 계산 로직
  const totalSleepingBags = baggages.reduce((sum, b) => sum + (b.sleeping_bag_count || 0), 0);
  const totalMats = baggages.reduce((sum, b) => sum + (b.mat_count || 0), 0);
  
  const baggageSubmittedUsers = baggages.map(b => b.name);
  const baggageUnsubmittedUsers = registeredUsers.filter(u => !baggageSubmittedUsers.includes(u.name));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-6 flex gap-6 font-sans selection:bg-blue-100">
      
      <div className="w-1/3 bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/60 flex flex-col h-[calc(100vh-3rem)]">
        <div className="mb-5 pl-1">
          <span className="text-[10px] bg-blue-50 text-blue-600 font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider">Admin Control</span>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-1.5">📋 선교 조교 대시보드</h1>
        </div>
        
        {/* 🛠️ 탭 5개로 변경 (grid-cols-5) */}
        <div className="grid grid-cols-5 gap-0.5 bg-slate-100 p-1 rounded-xl mb-4 border border-slate-200/40">
          <button onClick={() => { setActiveTab("status"); setSelectedSurvey(null); setIsFinalizing(false); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "status" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            현황판
          </button>
          <button onClick={() => { setActiveTab("users"); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "users" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            👥 명단
          </button>
          <button onClick={() => setActiveTab("create")} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            ➕ 개설
          </button>
          {/* 🎒 물품 탭 버튼 */}
          <button onClick={() => { setActiveTab("baggage"); setSelectedSurvey(null); setIsFinalizing(false); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "baggage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            🎒 물품
          </button>
          <button onClick={() => { setActiveTab("archived"); setSelectedSurvey(null); setIsFinalizing(false); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "archived" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            📂 보관
          </button>
        </div>

        {<button onClick={() => { setActiveTab("teams"); setSelectedSurvey(null); }} className={`mb-4 w-full rounded-xl border px-4 py-3 text-sm font-bold ${activeTab === "teams" ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-blue-50 text-blue-700"}`}>사역팀 현황</button>}

        <div className="space-y-2.5 overflow-y-auto flex-1 pr-1.5">
          {activeTab === "status" && (
            activeAndFinalizedSurveys.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium text-center pt-8">활성화된 모임이 없습니다.</p>
            ) : (
              activeAndFinalizedSurveys.map((survey) => (
                <button key={survey.id} onClick={() => { setSelectedSurvey(survey); setIsFinalizing(false); }} className={`w-full text-left p-3.5 rounded-xl border transition-all active:scale-[0.985] ${selectedSurvey?.id === survey.id ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-slate-50 border-slate-200/80 text-slate-800 hover:bg-slate-100/70"}`}>
                  <div className="font-bold text-base mb-1.5 leading-snug">{survey.title}</div>
                  <div className="flex gap-1.5 text-[10px] font-extrabold">
                    <span className={`px-1.5 py-0.5 rounded ${selectedSurvey?.id === survey.id ? 'bg-blue-500 text-white' : (survey.status === 'active' ? 'bg-blue-50 text-blue-600 border' : 'bg-emerald-50 text-emerald-600 border')}`}>
                      {survey.status === "active" ? "투표중" : "공지확정"}
                    </span>
                  </div>
                </button>
              ))
            )
          )}
          {activeTab === "archived" && (
            archivedGroups.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium text-center pt-8">보관된 일정이 없습니다.</p>
            ) : (
              archivedGroups.map(group => (
                <details key={group.key} className="rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer p-3.5 text-sm font-black text-slate-800">
                    📁 {group.label} <span className="ml-1 text-xs font-medium text-slate-500">({group.surveys.length}개)</span>
                  </summary>
                  <div className="space-y-2 px-2 pb-2">
                    {group.surveys.map(survey => (
                      <button key={survey.id} onClick={() => { setSelectedSurvey(survey); setIsFinalizing(false); }} className={`w-full rounded-xl border p-3.5 text-left transition-all ${selectedSurvey?.id === survey.id ? "border-slate-700 bg-slate-700 text-white shadow-md" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-100"}`}>
                        <div className="mb-1.5 text-sm font-bold leading-snug">{survey.title}</div>
                        <span className={`text-[10px] font-bold ${selectedSurvey?.id === survey.id ? "text-slate-200" : "text-slate-500"}`}>숨김 보관됨</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))
            )
          )}
          {/* 다른 탭 선택 시 왼쪽 패널 설명 */}
          {(activeTab === "users" || activeTab === "create" || activeTab === "baggage" || activeTab === "teams") && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center opacity-70 pb-10">
              <span className="text-4xl mb-3">{activeTab === "baggage" ? "🎒" : activeTab === "users" ? "👥" : "✨"}</span>
              <p className="text-xs font-bold leading-relaxed px-4">
                우측 패널에서 상세 내용을<br/>확인하고 관리하세요.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="w-2/3 bg-white p-7 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/60 overflow-y-auto h-[calc(100vh-3rem)]">
        {activeTab !== "teams" && <div className="mb-4 flex items-center justify-end gap-3">
          {dataError && <p role="alert" className="text-xs font-bold text-red-600">{dataError}</p>}
          <button type="button" onClick={fetchData} disabled={isRefreshing} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">{isRefreshing ? "불러오는 중…" : "현황 새로고침"}</button>
        </div>}

        
        {activeTab === "teams" && <Workbench admin />}

        {/* 🎒 물품 탭 (새로 추가됨) */}
        {activeTab === "baggage" && (
          <div className="animate-fade-in space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                🎒 선교 취침 물품 확보 현황
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">단원들이 입력한 침낭 및 매트 수량을 집계합니다.</p>
            </div>

            {/* 통계 요약 카드 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="block text-xs font-black text-indigo-500 mb-1">총 확보된 침낭 수량</span>
                  <div className="text-2xl font-black text-indigo-900 flex items-baseline gap-1">
                    {totalSleepingBags}<span className="text-sm font-bold text-indigo-700">개</span>
                  </div>
                </div>
                <span className="text-4xl">🐛</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="block text-xs font-black text-emerald-600 mb-1">총 확보된 매트 수량</span>
                  <div className="text-2xl font-black text-emerald-900 flex items-baseline gap-1">
                    {totalMats}<span className="text-sm font-bold text-emerald-700">개</span>
                  </div>
                </div>
                <span className="text-4xl">🧘‍♂️</span>
              </div>
            </div>

            {/* 응답자 명단 */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-black text-slate-800 border-b pb-2 flex items-center justify-between">
                ✅ 수화물 내역 제출 완료 ({baggages.length}명)
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                {baggages.map(b => {
                  // 유저 기수 찾기 (표시용)
                  const matchedUser = registeredUsers.find(u => u.name === b.name);
                  const genStr = matchedUser ? `${matchedUser.generation}기 ` : "";
                  
                  return (
                    <div key={b.id} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm hover:border-indigo-300 transition-all group relative">
                      <div className="font-bold text-sm text-slate-800 mb-2">
                        {genStr}{b.name}
                      </div>
                      <div className="flex gap-2">
                        {b.has_sleeping_bag ? (
                          <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">침낭: {b.sleeping_bag_count}개</span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">침낭 X</span>
                        )}
                        {b.has_mat ? (
                          <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded">매트: {b.mat_count}개</span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">매트 X</span>
                        )}
                      </div>
                      {b.other_items && (
                        <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded leading-tight border border-slate-100">
                          <strong className="text-slate-600 block mb-0.5">💬 특이사항:</strong> {b.other_items}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 미응답자 추적 */}
              {baggageUnsubmittedUsers.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h3 className="text-sm font-black text-rose-600 mb-3">
                    ⏳ 아직 짐 조사를 제출하지 않은 단원 ({baggageUnsubmittedUsers.length}명)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {baggageUnsubmittedUsers.map(u => (
                      <span key={u.id} className="bg-white border border-dashed border-rose-300 text-rose-500 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm">
                        {u.generation}기 {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="animate-fade-in space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-900">👥 등록된 선교인원 명단 ({registeredUsers.length}명)</h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">가입을 완료한 인원이 기수별로 표시됩니다.</p>
            </div>
            <div className="space-y-6">
              {sortedGenerations.map(gen => (
                <div key={gen} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <h3 className="text-sm font-black text-blue-800 mb-3 border-b border-blue-100 pb-2">🎯 {gen}기 ({usersByGeneration[gen].length}명)</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {usersByGeneration[gen].map((user: any) => (
                      <div key={user.id} className="bg-white border border-slate-200 p-2.5 rounded-lg text-center shadow-sm text-sm font-bold text-slate-800">
                        {user.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "create" && (
          <div className="animate-fade-in max-w-xl mx-auto space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xl font-black text-slate-900">✨ 선교 일정 (전체) 개설하기</h2>
            </div>
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">모임 제목</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 7월 2주차 전체 기도회" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none shadow-sm" />
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">투표 날짜 선택</label>
                <div className="flex gap-2 mb-2.5">
                  <input type="date" value={tempDate} onChange={(e) => setTempDate(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                  <button onClick={handleAddDate} className="bg-slate-900 text-white font-black text-xs px-5 rounded-xl transition-all">추가</button>
                </div>
                {newDates.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-blue-50/50 rounded-xl border border-blue-100 min-h-[2.5rem]">
                    {newDates.map((d) => (
                      <span key={d} className="bg-blue-600 text-white font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm text-xs">
                        📅 {d} <button onClick={() => handleRemoveDate(d)} className="text-white hover:text-red-300 ml-0.5">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">시작 시간</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">종료 시간</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                </div>
              </div>
              <button onClick={handleCreateSurvey} className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl hover:bg-blue-700 shadow-md">🚀 공지 배포하기</button>
            </div>
          </div>
        )}

        {(activeTab === "status" || activeTab === "archived") && (
          !selectedSurvey ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <span className="text-5xl mb-3">📊</span>
              <p className="font-bold text-sm">왼쪽 리스트에서 상세 조회할 일정을 선택해 주세요.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 leading-tight">{selectedSurvey.title}</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleShareToKakao(selectedSurvey)} className="bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-black text-xs py-2 px-3 rounded-xl shadow-sm">💬 공지 문구 복사</button>
                  {selectedSurvey.status !== "archived" && (
                    <button onClick={() => handleArchiveSurvey(selectedSurvey.id)} className="bg-slate-100 text-slate-700 text-xs py-2 px-3 rounded-xl font-bold border">📥 숨김 보관</button>
                  )}
                  <button onClick={() => handleDeleteSurvey(selectedSurvey.id)} className="text-red-500 font-extrabold hover:bg-red-50 px-2.5 py-1.5 rounded-xl text-xs">🗑️ 영구삭제</button>
                </div>
              </div>

              {dataReady && selectedSurvey.status !== "active" && selectedSurvey.final_schedule && (
                <AttendanceShare key={selectedSurvey.id} title={selectedSurvey.title} responses={currentRsvpResponses} members={registeredUsers} />
              )}

              {isFinalizing ? (
                <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-sm space-y-4 animate-fade-in">
                  <h3 className="text-base font-black text-amber-900">✏️ 일정 내용 {selectedSurvey.status === 'active' ? '마감 및 최종 확정' : '수정 (업데이트)'}</h3>
                  <div className="space-y-3">
                    <input type="text" value={finalTime} onChange={(e) => setFinalTime(e.target.value)} placeholder="최종 모임 확정 일시 (예: 7월 15일 오후 2시)" className="w-full border border-amber-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                    <input type="text" value={finalLocation} onChange={(e) => setFinalLocation(e.target.value)} placeholder="최종 장소 (예: 교육관 3층)" className="w-full border border-amber-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                    <textarea value={finalMemo} onChange={(e) => setFinalMemo(e.target.value)} placeholder="지참물이나 전달 사항이 있다면 자유롭게 입력해 주세요." className="w-full border border-amber-200 rounded-xl p-3 h-24 text-sm font-medium text-slate-900 bg-white focus:outline-none" />
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setIsFinalizing(false)} className="flex-1 bg-white text-slate-600 font-bold py-2.5 rounded-xl border text-xs">취소</button>
                      <button onClick={handleFinalizeSurvey} className="flex-1 bg-amber-500 text-white font-black py-2.5 rounded-xl shadow hover:bg-amber-600 text-xs">저장하기</button>
                    </div>
                  </div>
                </div>
              ) : (
                selectedSurvey.status === "active" && (
                  <button onClick={() => setIsFinalizing(true)} className="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 font-black py-3.5 rounded-xl shadow text-sm flex justify-center items-center gap-2">✅ 투표 마감하고 최종 공지 확정하기</button>
                )
              )}

              {selectedSurvey.status === "active" && (
                <div className="bg-blue-50/40 p-5 rounded-2xl border border-blue-100/70">
                  <h3 className="text-sm font-black text-blue-900 mb-4 uppercase tracking-wider">📊 날짜별 투표 현황 및 최적 시간대 분석</h3>
                  {currentVoteResponses.length === 0 ? <p className="text-xs text-slate-400 font-medium py-2">아직 참여한 단원이 없습니다.</p> : (
                    <div className="space-y-6">
                      {selectedSurvey.dates.map((day: any) => {
                        const daySlots = sortedSlots.filter(([slot]) => slot.startsWith(day.date));
                        const dayMaxVotes = daySlots.length > 0 ? daySlots[0][1] : 0;
                        return (
                          <div key={day.date} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="text-sm font-black text-slate-900">📅 {day.date}</span>
                            </div>
                            <div className="space-y-2">
                              {daySlots.map(([slot, count]) => {
                                const timeText = slot.replace(`${day.date} (`, "").replace(")", "");
                                const isBest = count === dayMaxVotes && count > 0;
                                const widthPercent = Math.max(5, Math.min(100, (count / maxVotes) * 100));
                                return (
                                  <div key={slot} className="relative overflow-hidden bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 flex justify-between items-center text-xs font-bold z-10">
                                    <div className="absolute left-0 top-0 bottom-0 bg-blue-500/5 z-0 transition-all duration-500" style={{ width: `${widthPercent}%` }}></div>
                                    <div className="flex items-center gap-2 relative z-10"><span className="text-slate-800">{timeText}</span></div>
                                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-black relative z-10 ${isBest ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border'}`}>{count}명 선택</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {(selectedSurvey.status === "finalized" || selectedSurvey.status === "archived") && (
                <div className="space-y-6 animate-fade-in">
                  <div className={`p-5 rounded-2xl border shadow-inner space-y-2.5 text-sm relative ${selectedSurvey.status === 'archived' ? 'bg-slate-100 border-slate-300/80 text-slate-500' : 'bg-emerald-50/50 border-emerald-200/60 text-slate-700'}`}>
                    <div className="flex justify-between items-center">
                      <h3 className={`font-black text-base ${selectedSurvey.status === 'archived' ? 'text-slate-700' : 'text-emerald-900'}`}>📍 최종 공지 확정본</h3>
                      {!isFinalizing && (
                        <button onClick={handleEditNoticeClick} className="bg-white border text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 shadow-sm hover:bg-slate-50">
                          ✏️ 내용 수정
                        </button>
                      )}
                    </div>
                    <p><strong>시간:</strong> <span className="font-bold text-slate-900">{selectedSurvey.final_schedule?.time}</span></p>
                    <p><strong>장소:</strong> <span className="font-bold text-slate-900">{selectedSurvey.final_schedule?.location}</span></p>
                    <p><strong>전달:</strong> <span className="font-medium text-slate-800">{selectedSurvey.final_schedule?.memo}</span></p>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center justify-between">
                      🙋‍♂️ 실시간 참석 여부
                      <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg shadow-sm">
                        총 식사 인원: <strong>{mealYesCount}명</strong>
                      </span>
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="text-sm font-black text-blue-700">✅ 참석 확정 ({attending.length}명)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {attending.map((r, i) => (
                            <span key={i} className="bg-slate-50 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm flex items-center">
                              {r.generation}기 {r.name}
                              {extractMealBadge(r.reason)}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="text-sm font-black text-amber-600">⚠️ 부분 참석 ({partial.length}명)</span>
                        </div>
                        <div className="grid gap-2">
                          {partial.map((r, i) => (
                            <div key={i} className="bg-amber-50/40 border border-amber-200/60 p-3 rounded-xl flex items-center justify-between shadow-sm text-xs font-bold">
                              <span className="text-slate-800 flex items-center">
                                {r.generation}기 {r.name}
                                {extractMealBadge(r.reason)}
                              </span>
                              <span className="text-slate-600 bg-white border border-amber-100 px-2 py-1 rounded">💬 {cleanReasonText(r.reason)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="text-sm font-black text-rose-600">❌ 불참 대기 ({absent.length}명)</span>
                        </div>
                        <div className="grid gap-2">
                          {absent.map((r, i) => (
                            <div key={i} className="bg-rose-50/40 border border-rose-200/60 p-3 rounded-xl flex items-center justify-between shadow-sm text-xs font-bold">
                              <span className="text-slate-800">{r.generation}기 {r.name}</span>
                              <span className="text-rose-600 bg-white border border-rose-100 px-2 py-1 rounded">🚨 {cleanReasonText(r.reason)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {unresponsiveForSelected.length > 0 && (
                        <div className="pt-4 border-t border-slate-200 mt-4">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <span className="text-sm font-black text-slate-500">⏳ 아직 체크 안 함 ({unresponsiveForSelected.length}명)</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {unresponsiveForSelected.map((u, i) => (
                              <span key={i} className="bg-white border border-dashed border-slate-300 text-slate-400 px-2.5 py-1 rounded-lg text-xs font-bold">
                                {u.generation}기 {u.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
