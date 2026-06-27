"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"status" | "users" | "create" | "archived">("status");
  
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [rsvpResponses, setRsvpResponses] = useState<any[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]); 
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);

  const [targetFilterSurveyId, setTargetFilterSurveyId] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"전체모임" | "조별모임">("조별모임");
  const [newTeam, setNewTeam] = useState("1조");
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
    const { data: sData } = await supabase.from("surveys").select("*").order("created_at", { ascending: false });
    setSurveys(sData || []);
    const { data: srData } = await supabase.from("survey_responses").select("*");
    setSurveyResponses(srData || []);
    const { data: rsvpData } = await supabase.from("rsvp_responses").select("*");
    setRsvpResponses(rsvpData || []);
    const { data: uData } = await supabase.from("users").select("*").order("generation", { ascending: false }).order("name", { ascending: true });
    setRegisteredUsers(uData || []);
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
      
      return {
        date: `${mm}월 ${dd}일 (${dayName})`,
        slots: slotsArray,
      };
    });

    const newSurveyData = {
      id: crypto.randomUUID(), 
      title: newTitle,
      meeting_type: meetingType,
      target_team: meetingType === "전체모임" ? "전체" : newTeam,
      status: "active",
      dates: datesPayload,
    };

    const { error } = await supabase.from("surveys").insert([newSurveyData]);
    if (error) return alert("생성 실패: " + error.message);
    
    alert("📢 새로운 투표가 생성되었습니다! [현황판]에서 카톡 알림 텍스트를 복사해 보세요!");
    setNewTitle(""); setNewDates([]); setStartTime(""); setEndTime("");
    setActiveTab("status");
    fetchData(); 
  };

  const handleFinalizeSurvey = async () => {
    if (!finalTime || !finalLocation) return alert("확정된 시간 and 장소를 입력해주세요.");
    const finalSchedule = { time: finalTime, location: finalLocation, memo: finalMemo };
    const { error } = await supabase.from("surveys").update({ status: "finalized", final_schedule: finalSchedule }).eq("id", selectedSurvey.id);
    if (error) return alert("확정 실패: " + error.message);

    alert("일정이 확정되어 공지로 전환되었습니다! ✅");
    setIsFinalizing(false);
    setFinalTime(""); setFinalLocation(""); setFinalMemo("");
    fetchData(); 
    setSelectedSurvey({ ...selectedSurvey, status: "finalized", final_schedule: finalSchedule }); 
  };

  const handleArchiveSurvey = async (id: string) => {
    if (!window.confirm("이 일정을 조원 화면에서 숨기고 과거 보관함으로 이동하시겠습니까?")) return;
    const { error } = await supabase.from("surveys").update({ status: "archived" }).eq("id", id);
    if (error) return alert("보관 이동 실패: " + error.message);
    alert("과거 보관함 탭으로 안전하게 이동되었습니다. 조원 화면에서는 숨김 처리됩니다.");
    setSelectedSurvey(null);
    fetchData();
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!window.confirm("정말 이 일정을 데이터베이스에서 완전 영구 삭제하시겠습니까? (복구 불가능)")) return;
    const { error } = await supabase.from("surveys").delete().eq("id", id);
    if (error) return alert("삭제 실패: " + error.message);
    alert("영구 삭제되었습니다.");
    setSelectedSurvey(null);
    fetchData();
  };

  const handleDownloadCSV = () => {
    if (!selectedSurvey) return;
    let csvContent = "\uFEFF"; 
    
    csvContent += `📝 선교 모임 회의록 데이터\n`;
    csvContent += `모임명,${selectedSurvey.title}\n`;
    csvContent += `모임 성격,${selectedSurvey.meeting_type || "조별모임"} (${selectedSurvey.target_team})\n`;
    csvContent += `최종 시간,${selectedSurvey.final_schedule?.time || "미정"}\n`;
    csvContent += `최종 장소,${selectedSurvey.final_schedule?.location || "미정"}\n`;
    csvContent += `조교 전달사항,${(selectedSurvey.final_schedule?.memo || "없음").replace(/\n/g, " ")}\n`;
    csvContent += `\n`; 
    
    csvContent += "구분,소속 조/구분,기수,이름,사유 및 비고란\n"; 
    attending.forEach(r => csvContent += `참석 확정,${r.team},${r.generation}기,${r.name},${r.reason || ""}\n`);
    partial.forEach(r => csvContent += `부분 참석,${r.team},${r.generation}기,${r.name},${r.reason || ""}\n`);
    absent.forEach(r => csvContent += `불참 인원,${r.team},${r.generation}기,${r.name},${r.reason || ""}\n`);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `[선교회의록]_${selectedSurvey.title}.csv`); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🛠️ 수혁님 피드백 완벽 반영: 카카오톡 공유 문구
  const handleShareToKakao = (survey: any) => {
    let shareText = "";
    if (survey.status === "active") {
      shareText = `[📢 피지 선교 조별 모임 일정 여부 투표 오픈]\n\n선교 조별 모임 일정 투표가 등록되었습니다. 해당되시는 분들은 한 분도 빠짐없이 투표에 응답해 주세요!\n\n📌 모임명: ${survey.title}\n👥 대상: ${survey.meeting_type || "조별모임"} (${survey.target_team})\n\n🔗 지금 투표하기:\nhttps://1-weld-ten-38.vercel.app`;
    } else {
      shareText = `[📍 피지 선교 조별 모임 최종 확정 공지]\n\n선교 조별 모임 일정 및 장소가 최종 조율되어 공지합니다. 아래 내용을 확인하시고 앱에서 꼭 식사 여부 및 참석체크를 진행해 주세요! \n\n부분참석의 경우는 사유와 시간도 같이 기재해주세요.\n\n📌 모임명: ${survey.title}\n⏱️ 최종 날짜 및 시간: ${survey.final_schedule?.time || "미정"}\n🏫 최종 장소: ${survey.final_schedule?.location || "미정"}\n📝 조교 공지사항: ${survey.final_schedule?.memo || "없음"}\n\n🔗 참석 여부 제출하러 가기:\nhttps://1-weld-ten-38.vercel.app`;
    }

    navigator.clipboard.writeText(shareText).then(() => {
      alert("📋 카카오톡 단톡방 공지용 텍스트가 클립보드에 복사되었습니다! 단톡방에 붙여넣기(Ctrl+V) 하세요!");
    }).catch(() => {
      alert("복사에 실패했습니다.");
    });
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

  const unresponsiveUsers = registeredUsers.filter(user => {
    if (!targetFilterSurveyId) return false;
    const targetSurvey = surveys.find(s => s.id === targetFilterSurveyId);
    if (!targetSurvey) return false;
    if (targetSurvey.status === "active") {
      return !surveyResponses.some(r => r.survey_id === targetSurvey.id && r.name === user.name && r.generation === user.generation);
    } else {
      return !rsvpResponses.some(r => r.survey_id === targetSurvey.id && r.name === user.name && r.generation === user.generation);
    }
  });

  const activeAndFinalizedSurveys = surveys.filter(s => s.status === "active" || s.status === "finalized");
  const archivedSurveys = surveys.filter(s => s.status === "archived");

  const renderVoteMemos = () => {
    const validVoteMemos = currentVoteResponses.filter((res) => res.memo && res.memo.trim() !== "");

    return (
      <div className="space-y-3 pt-4 border-t border-slate-100 mt-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider pl-0.5">📝 조원 초기 투표 비고란 기록 (의견 제출자만 노출)</h3>
        {validVoteMemos.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium py-1">제출된 특별 비고 의견이 없습니다.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {validVoteMemos.map((res, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="font-bold text-slate-900 text-xs border-b border-slate-200/60 pb-2 mb-2 flex justify-between">
                  <span>{res.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{res.team} · {res.generation}기</span>
                </div>
                <div className="text-slate-800 text-xs bg-white border border-slate-100 p-3 rounded-xl whitespace-pre-wrap leading-relaxed shadow-inner font-semibold">💡 {res.memo}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-6 flex gap-6 font-sans selection:bg-blue-100">
      
      <div className="w-1/3 bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/60 flex flex-col h-[calc(100vh-3rem)]">
        <div className="mb-5 pl-1">
          <span className="text-[10px] bg-blue-50 text-blue-600 font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider">Admin Control</span>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-1.5">📋 선교 조교 대시보드</h1>
        </div>
        
        <div className="grid grid-cols-4 gap-0.5 bg-slate-100 p-1 rounded-xl mb-4 border border-slate-200/40">
          <button onClick={() => { setActiveTab("status"); setSelectedSurvey(null); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "status" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            현황판
          </button>
          <button onClick={() => { setActiveTab("users"); setTargetFilterSurveyId(""); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "users" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            👥 명단
          </button>
          <button onClick={() => setActiveTab("create")} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            ➕ 개설
          </button>
          <button onClick={() => { setActiveTab("archived"); setSelectedSurvey(null); }} className={`text-center py-2 text-[11px] font-black rounded-lg transition-all ${activeTab === "archived" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            📂 보관함
          </button>
        </div>

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
                      {survey.status === "active" ? "투표중" : "확정됨"}
                    </span>
                    <span className="bg-purple-50 text-purple-600 border px-1.5 py-0.5 rounded">{survey.meeting_type || "조별모임"}</span>
                  </div>
                </button>
              ))
            )
          )}
          {activeTab === "archived" && (
            archivedSurveys.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium text-center pt-8">보관 처리된 일정이 없습니다.</p>
            ) : (
              archivedSurveys.map((survey) => (
                <button key={survey.id} onClick={() => { setSelectedSurvey(survey); setIsFinalizing(false); }} className={`w-full text-left p-3.5 rounded-xl border transition-all active:scale-[0.985] ${selectedSurvey?.id === survey.id ? "bg-slate-700 text-white border-slate-700 shadow-md" : "bg-slate-50 border-slate-200/80 text-slate-800 hover:bg-slate-100/70"}`}>
                  <div className="font-bold text-base mb-1.5 leading-snug text-slate-500">{survey.title}</div>
                  <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">📂 숨김 보관됨</span>
                </button>
              ))
            )
          )}
          {activeTab === "users" && <p className="text-xs text-slate-400 font-bold text-center pt-6">우측에서 미응답 추적 확인 가능</p>}
          {activeTab === "create" && <p className="text-xs text-slate-400 font-bold text-center pt-6">우측에서 신규 개설 가능</p>}
        </div>
      </div>

      <div className="w-2/3 bg-white p-7 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/60 overflow-y-auto h-[calc(100vh-3rem)]">
        
        {activeTab === "users" && (
          <div className="animate-fade-in space-y-6">
            <div className="border-b border-slate-100 pb-4 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-black text-slate-900">👥 등록된 선교인원 명단 ({registeredUsers.length}명)</h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">비밀번호를 생성하여 가입을 완료한 인원 목록입니다.</p>
              </div>
              
              <div className="w-52 text-right">
                <label className="block text-[10px] font-black text-red-500 uppercase mb-1">🚨 미응답자 선별 추적기</label>
                <select value={targetFilterSurveyId} onChange={(e) => setTargetFilterSurveyId(e.target.value)} className="w-full border border-red-200 p-2 rounded-xl text-xs font-bold text-slate-900 bg-red-50/30 focus:outline-none cursor-pointer">
                  <option value="">모임을 선택해 보세요</option>
                  {surveys.map(s => (
                    <option key={s.id} value={s.id}>{s.status === 'active' ? '[투표]' : s.status === 'archived' ? '[보관]' : '[공지]'} {s.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {targetFilterSurveyId && (
              <div className="bg-red-50/40 border border-red-100 p-4 rounded-2xl animate-fade-in">
                <h3 className="text-xs font-black text-red-600 uppercase tracking-wider mb-2">🎯 아직 참여안한 미응답자 목록 ({unresponsiveUsers.length}명)</h3>
                {unresponsiveUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 font-bold bg-white p-3 rounded-xl border border-slate-100 text-center">🎉 가입된 모든 단원이 응답을 마쳤습니다!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {unresponsiveUsers.map((u, i) => (
                      <span key={i} className="bg-white border border-red-200 text-red-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm">⚠️ {u.generation}기 {u.name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {registeredUsers.map((user) => (
                <div key={user.id} className="bg-slate-50 border border-slate-200/70 p-4 rounded-xl flex flex-col justify-center shadow-sm">
                  <span className="text-[10px] font-black text-blue-600 mb-0.5">{user.generation}기</span>
                  <span className="text-base font-bold text-slate-900">{user.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "create" && (
          <div className="animate-fade-in max-w-xl mx-auto space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xl font-black text-slate-900">✨ 새로운 선교 일정 만들기</h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">조원들의 투표를 받을 양식을 배포합니다.</p>
            </div>
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">모임 제목</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 7월 2주차 선교 전체 기도회" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none shadow-sm" />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">모임 구분</label>
                <div className="flex gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input type="radio" checked={meetingType === "조별모임"} onChange={() => setMeetingType("조별모임")} className="accent-blue-600" />
                    👥 조별 모임
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input type="radio" checked={meetingType === "전체모임"} onChange={() => setMeetingType("전체모임")} className="accent-blue-600" />
                    📢 전체 모임
                  </label>
                </div>
              </div>
              
              {meetingType === "조별모임" && (
                <div>
                  <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">대상 조 지정</label>
                  <select value={newTeam} onChange={(e) => setNewTeam(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none shadow-sm">
                    <option value="1조">1조</option>
                    <option value="2조">2조</option>
                    <option value="3조">3조</option>
                    <option value="4조">4조</option>
                    <option value="5조">5조</option>
                  </select>
                </div>
              )}

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">투표 날짜 선택 (여러 개 가능)</label>
                <div className="flex gap-2 mb-2.5">
                  <input type="date" value={tempDate} onChange={(e) => setTempDate(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                  <button onClick={handleAddDate} className="bg-slate-900 text-white font-black text-xs px-5 rounded-xl transition-all">추가</button>
                </div>
                {newDates.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-blue-50/50 rounded-xl border border-blue-100 min-h-[2.5rem]">
                    {newDates.map((d) => (
                      <span key={d} className="bg-blue-600 text-white font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm text-xs">
                        📅 {d}
                        <button onClick={() => handleRemoveDate(d)} className="text-white hover:text-red-300 font-bold ml-0.5">✕</button>
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

              <button onClick={handleCreateSurvey} className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-md text-base mt-2">
                🚀 투표 공지 생성하기
              </button>
            </div>
          </div>
        )}

        {(activeTab === "status" || activeTab === "archived") && (
          !selectedSurvey ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <span className="text-5xl mb-3">{activeTab === 'archived' ? '📂' : '📊'}</span>
              <p className="font-bold text-sm">왼쪽 리스트에서 상세 조회할 선교 일정을 선택해 주세요.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-black bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded">{selectedSurvey.meeting_type || "조별모임"}</span>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">대상: {selectedSurvey.target_team}</span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 leading-tight">{selectedSurvey.title}</h2>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={() => handleShareToKakao(selectedSurvey)} className="bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-black text-xs py-2 px-3 rounded-xl shadow-sm transition-all active:scale-95">
                    💬 카톡 문구 복사
                  </button>
                  {selectedSurvey.status !== "archived" && (
                    <button onClick={() => handleArchiveSurvey(selectedSurvey.id)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl font-bold border active:scale-95">
                      📥 숨김 보관
                    </button>
                  )}
                  <button onClick={() => handleDeleteSurvey(selectedSurvey.id)} className="text-red-500 font-extrabold hover:bg-red-50 px-2.5 py-1.5 rounded-xl text-xs">
                    🗑️ 데이터 영구삭제
                  </button>
                </div>
              </div>

              {selectedSurvey.status === "active" && (
                <div className="space-y-6 animate-fade-in">
                  {isFinalizing ? (
                    <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-sm space-y-4">
                      <h3 className="text-base font-black text-amber-900">🎯 이 일정 마감 및 최종 공지 확정</h3>
                      <div className="space-y-3">
                        <input type="text" value={finalTime} onChange={(e) => setFinalTime(e.target.value)} placeholder="최종 모임 확정 일시 (예: 7월 15일 오후 2시)" className="w-full border border-amber-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                        <input type="text" value={finalLocation} onChange={(e) => setFinalLocation(e.target.value)} placeholder="최종 장소 (예: 교육관 3층 청년부실)" className="w-full border border-amber-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none" />
                        <textarea value={finalMemo} onChange={(e) => setFinalMemo(e.target.value)} placeholder="지참물이나 전달 사항이 있다면 자유롭게 입력해 주세요." className="w-full border border-amber-200 rounded-xl p-3 h-24 text-sm font-medium text-slate-900 bg-white focus:outline-none" />
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setIsFinalizing(false)} className="flex-1 bg-white text-slate-600 font-bold py-2.5 rounded-xl border text-xs">취소</button>
                          <button onClick={handleFinalizeSurvey} className="flex-1 bg-amber-500 text-white font-black py-2.5 rounded-xl shadow hover:bg-amber-600 text-xs">공지로 전환하기</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setIsFinalizing(true)} className="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 font-black py-3.5 rounded-xl shadow text-sm flex justify-center items-center gap-2">
                      ✅ 투표 마감하고 최종 공지 확정하기
                    </button>
                  )}

                  <div className="bg-blue-50/40 p-5 rounded-2xl border border-blue-100/70">
                    <h3 className="text-sm font-black text-blue-900 mb-4 uppercase tracking-wider">
                      📊 날짜별 투표 현황 및 최적 시간대 분석
                    </h3>
                    {currentVoteResponses.length === 0 ? (
                      <p className="text-xs text-slate-400 font-medium py-2">아직 참여한 단원이 없습니다.</p>
                    ) : (
                      <div className="space-y-6">
                        {selectedSurvey.dates.map((day: any) => {
                          const daySlots = sortedSlots.filter(([slot]) => slot.startsWith(day.date));
                          const dayMaxVotes = daySlots.length > 0 ? daySlots[0][1] : 0;

                          return (
                            <div key={day.date} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-sm font-black text-slate-900">📅 {day.date}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded">
                                  이 날 참여: {Array.from(new Set(currentVoteResponses.filter(r => r.slots.some((s: string) => s.startsWith(day.date))).map(r => r.name))).length}명
                                </span>
                              </div>

                              <div className="space-y-2">
                                {daySlots.length === 0 ? (
                                  <p className="text-[11px] text-slate-400 italic py-1 pl-1">이 날짜에는 투표한 인원이 없습니다.</p>
                                ) : (
                                  daySlots.map(([slot, count]) => {
                                    const timeText = slot.replace(`${day.date} (`, "").replace(")", "");
                                    const isBest = count === dayMaxVotes && count > 0;
                                    const widthPercent = Math.max(5, Math.min(100, (count / maxVotes) * 100));

                                    return (
                                      <div key={slot} className="relative overflow-hidden bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 flex justify-between items-center text-xs font-bold z-10">
                                        <div className="absolute left-0 top-0 bottom-0 bg-blue-500/5 z-0 transition-all duration-500" style={{ width: `${widthPercent}%` }}></div>
                                        <div className="flex items-center gap-2 relative z-10">
                                          <span className="text-slate-800">{timeText}</span>
                                          {isBest && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5 animate-pulse">
                                              ⭐ 최적
                                            </span>
                                          )}
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-black relative z-10 ${isBest ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border'}`}>
                                          {count}명 선택
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {renderVoteMemos()}
                </div>
              )}

              {(selectedSurvey.status === "finalized" || selectedSurvey.status === "archived") && (
                <div className="space-y-6 animate-fade-in">
                  <div className={`p-5 rounded-2xl border shadow-inner space-y-2.5 text-sm ${selectedSurvey.status === 'archived' ? 'bg-slate-100 border-slate-300/80 text-slate-500' : 'bg-emerald-50/50 border-emerald-200/60 text-slate-700'}`}>
                    <h3 className={`font-black text-base ${selectedSurvey.status === 'archived' ? 'text-slate-700' : 'text-emerald-900'}`}>📍 최종 공지 확정본 리포트 {selectedSurvey.status === 'archived' && '(보관함 이관완료)'}</h3>
                    <p><strong>모임 시간:</strong> <span className="font-bold text-slate-900">{selectedSurvey.final_schedule?.time || "미정"}</span></p>
                    <p><strong>모임 장소:</strong> <span className="font-bold text-slate-900">{selectedSurvey.final_schedule?.location || "미정"}</span></p>
                    <p><strong>조교 전달사항:</strong> <span className="font-medium text-slate-800">{selectedSurvey.final_schedule?.memo || "없음"}</span></p>
                  </div>

                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h3 className="text-lg font-black text-slate-900">🙋‍♂️ 실시간 참석 명부</h3>
                    <button onClick={handleDownloadCSV} className="bg-slate-900 text-white text-xs font-black py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow active:scale-95">
                      📥 회의록용 엑셀(CSV) 추출
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-sm font-black text-blue-700">✅ 참석 확정</span>
                        <span className="bg-blue-50 text-blue-700 font-black px-2 py-0.5 rounded-full text-xs">{attending.length}명</span>
                      </div>
                      {attending.length === 0 ? <p className="text-xs text-slate-400 font-medium pl-0.5">확정된 인원이 없습니다.</p> : (
                        <div className="flex flex-wrap gap-2">
                          {attending.map((r, i) => <span key={i} className="bg-slate-50 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm">{r.generation}기 {r.name} ({r.team})</span>)}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-sm font-black text-amber-600">⚠️ 부분 참석 (지각/조퇴)</span>
                        <span className="bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full text-xs">{partial.length}명</span>
                      </div>
                      {partial.length === 0 ? <p className="text-xs text-slate-400 font-medium pl-0.5">확정된 인원이 없습니다.</p> : (
                        <div className="grid gap-2">
                          {partial.map((r, i) => (
                            <div key={i} className="bg-amber-50/40 border border-amber-200/60 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm text-xs font-bold">
                              <span className="text-slate-800 min-w-[130px]">{r.generation}기 {r.name} ({r.team})</span>
                              <span className="text-slate-600 bg-white border border-amber-100 px-3 py-1.5 rounded-lg flex-1 font-medium">💬 {r.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-sm font-black text-rose-600">❌ 불참 대기</span>
                        <span className="bg-rose-50 text-rose-700 font-black px-2 py-0.5 rounded-full text-xs">{absent.length}명</span>
                      </div>
                      {absent.length === 0 ? <p className="text-xs text-slate-400 font-medium pl-0.5">확정된 인원이 없습니다.</p> : (
                        <div className="grid gap-2">
                          {absent.map((r, i) => (
                            <div key={i} className="bg-rose-50/40 border border-rose-200/60 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm text-xs font-bold">
                              <span className="text-slate-800 min-w-[130px]">{r.generation}기 {r.name} ({r.team})</span>
                              <span className="text-rose-600 bg-white border border-rose-100 px-3 py-1.5 rounded-lg flex-1 font-medium">🚨 사유: {r.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {renderVoteMemos()}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
