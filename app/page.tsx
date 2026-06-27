"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [generation, setGeneration] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [entered, setEntered] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(""); 
  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
  const [finalizedSurveys, setFinalizedSurveys] = useState<any[]>([]);
  
  const [currentSurvey, setCurrentSurvey] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "vote" | "notice">("list");
  
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [voteMemo, setVoteMemo] = useState(""); 

  const [rsvpStatus, setRsvpStatus] = useState<"참석" | "부분참석" | "불참" | "">("");
  const [rsvpReason, setRsvpReason] = useState("");
  const [mealStatus, setMealStatus] = useState<"식사함" | "식사안함" | "">(""); 

  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    fetchSurveys();
  }, []);

  const fetchSurveys = async () => {
    const { data } = await supabase.from("surveys").select("*");
    const fetchedSurveys = data || [];
    setAllSurveys(fetchedSurveys);

    const savedUser = localStorage.getItem("missionUser");
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setGeneration(parsed.generation);
      setName(parsed.name);
      setEntered(true);
      if (parsed.lastCategory) {
        setSelectedCategory(parsed.lastCategory);
        setupMySurveys(parsed.lastCategory, fetchedSurveys);
      }
    }
  };

  const setupMySurveys = (category: string, surveys: any[]) => {
    if (!category) {
      setActiveSurveys([]);
      setFinalizedSurveys([]);
      return;
    }
    let filtered: any[] = [];
    if (category === "전체모임") {
      filtered = surveys.filter(s => s.meeting_type === "전체모임" || s.target_team === "전체");
    } else {
      filtered = surveys.filter(s => (s.meeting_type === "조별모임" || !s.meeting_type) && s.target_team === category);
    }
    
    setActiveSurveys(filtered.filter((s) => s.status === "active"));
    setFinalizedSurveys(filtered.filter((s) => s.status === "finalized"));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCategory = e.target.value;
    setSelectedCategory(nextCategory);
    setupMySurveys(nextCategory, allSurveys);
    if (entered) {
      localStorage.setItem("missionUser", JSON.stringify({ generation, name, lastCategory: nextCategory }));
    }
  };

  const handleEnter = async () => {
    if (!generation || !name || !pin) return alert("기수, 이름, 비밀번호를 모두 입력해주세요.");
    if (pin.length !== 4) return alert("비밀번호는 4자리 숫자로 입력해주세요.");

    const { data: existingUser } = await supabase.from("users").select("*").eq("generation", generation).eq("name", name).maybeSingle();

    if (existingUser) {
      if (existingUser.pin !== pin) return alert("비밀번호가 틀렸습니다! 다시 확인해주세요.");
    } else {
      if (!window.confirm(`처음 오셨군요! [${generation}기] [${name}]님, 비밀번호 [${pin}](으)로 계정을 생성할까요?`)) return;
      const { error } = await supabase.from("users").insert([{ team: "미지정", generation, name, pin }]);
      if (error) return alert("계정 생성에 실패했습니다.");
      alert("계정이 성공적으로 만들어졌습니다!");
    }

    localStorage.setItem("missionUser", JSON.stringify({ generation, name, lastCategory: selectedCategory }));
    setEntered(true);
    fetchSurveys();
  };

  const handleLogout = () => {
    localStorage.removeItem("missionUser");
    setEntered(false);
    setPin("");
    setSelectedCategory("");
    setShowRules(false);
  };

  const toggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  const handleSubmitVote = async () => {
    if (selectedSlots.length === 0) {
      if (!window.confirm("선택한 시간이 없습니다. 이대로 제출하시겠습니까?")) return;
    }
    await supabase.from("survey_responses").delete().eq("survey_id", currentSurvey.id).eq("generation", generation).eq("name", name);

    const newResponse = {
      survey_id: currentSurvey.id,
      team: selectedCategory,
      generation: generation,
      name: name,
      slots: selectedSlots,
      memo: voteMemo, 
    };
    const { error } = await supabase.from("survey_responses").insert([newResponse]);
    if (error) return alert("투표 저장에 실패했습니다.");
    
    alert("투표가 성공적으로 저장되었습니다! 🎉");
    setViewMode("list");
    setSelectedSlots([]);
    setVoteMemo("");
  };

  const openNotice = async (survey: any) => {
    setCurrentSurvey(survey);
    setRsvpStatus("");
    setRsvpReason("");
    setMealStatus("");
    
    const { data } = await supabase.from("rsvp_responses").select("*").eq("survey_id", survey.id).eq("generation", generation).eq("name", name).maybeSingle();
    if (data) {
      setRsvpStatus(data.status as any);
      if (data.reason?.startsWith("[식사함] ")) {
        setMealStatus("식사함");
        setRsvpReason(data.reason.replace("[식사함] ", ""));
      } else if (data.reason?.startsWith("[식사안함] ")) {
        setMealStatus("식사안함");
        setRsvpReason(data.reason.replace("[식사안함] ", ""));
      } else {
        setRsvpReason(data.reason || "");
      }
    }
    setViewMode("notice");
  };

  const handleSubmitRsvp = async () => {
    if (!rsvpStatus) return alert("참석 여부를 선택해주세요.");
    if ((rsvpStatus === "참석" || rsvpStatus === "부분참석") && !mealStatus) {
      return alert("식사 여부를 체크해주세요.");
    }
    if ((rsvpStatus === "부분참석" || rsvpStatus === "불참") && !rsvpReason.trim()) {
      return alert("참석 가능 시간 또는 사유를 작성해주세요.");
    }

    await supabase.from("rsvp_responses").delete().eq("survey_id", currentSurvey.id).eq("generation", generation).eq("name", name);

    let finalReasonToSave = rsvpReason.trim();
    if (rsvpStatus !== "불참" && mealStatus) {
      finalReasonToSave = `[${mealStatus}] ${finalReasonToSave}`;
    }

    const { error } = await supabase.from("rsvp_responses").insert([{
      survey_id: currentSurvey.id,
      team: selectedCategory,
      generation: generation,
      name: name,
      status: rsvpStatus,
      reason: finalReasonToSave
    }]);

    if (error) return alert("저장에 실패했습니다.");
    alert("참석 여부가 저장되었습니다! ✅");
    setViewMode("list");
  };

  return (
    <main className="min-h-screen w-full bg-slate-50 text-slate-800 flex flex-col justify-start items-center px-4 py-6 font-sans selection:bg-blue-100">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        
        {!entered ? (
          <div className="py-2 animate-fade-in">
            <div className="text-center mb-6">
              <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full uppercase tracking-wider">SYDC</span>
              <h1 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">청년 1부 피지 선교 준비</h1>
              <p className="text-xs text-slate-400 mt-1 font-medium">🗺️ 실시간 일정 및 공지 관리 시스템</p>
            </div>

            <div className="mb-5 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl text-xs space-y-1.5 text-slate-600 shadow-inner">
              <div className="font-extrabold text-slate-800 text-sm mb-1 flex items-center gap-1">💡 초간단 3초 이용 가이드</div>
              <p>• <strong>처음 오셨나요?</strong> 본인의 기수와 이름을 입력하고, 원하는 비밀번호 4자리를 치면 즉시 계정이 생성되며 입장합니다.</p>
              <p>• <strong>다시 오셨나요?</strong> 처음에 가입했던 비밀번호 4자리를 입력하면 즉시 로그인이 완료됩니다.</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-1/3">
                  <label className="block text-xs font-bold text-slate-500 mb-1 pl-0.5">기수</label>
                  <input type="number" placeholder="45" value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-center text-base font-bold text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all" />
                </div>
                <div className="w-2/3">
                  <label className="block text-xs font-bold text-slate-500 mb-1 pl-0.5">이름</label>
                  <input type="text" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-base font-bold text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 pl-0.5">비밀번호 (4자리)</label>
                <input type="password" maxLength={4} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-xl border border-slate-200 p-3 text-xl tracking-[0.4em] text-center font-black text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all" />
                <p className="text-[11px] text-slate-400 mt-1.5 pl-0.5">✨ 기억하기 쉽게 <strong>생일 4자리</strong> 설정을 권장합니다!</p>
              </div>

              <button onClick={handleEnter} className="mt-4 w-full rounded-xl bg-blue-600 p-3.5 text-base font-black text-white shadow-md shadow-blue-100 hover:bg-blue-700 active:scale-[0.99] transition-all">
                입장하기 →
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* 🛠️ 수혁님 피드백 반영: 상단 프로필 헤더 '단원' 명칭 제거 */}
            <div className="mb-5 flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 pl-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-sm font-black text-slate-800">{generation}기 <strong className="text-blue-600">{name}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                {viewMode !== "list" && (
                  <button onClick={() => setViewMode("list")} className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm active:scale-95 transition-all">
                    ← 뒤로
                  </button>
                )}
                <button onClick={handleLogout} className="text-xs font-bold text-red-500 bg-red-50/50 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all">
                  로그아웃
                </button>
              </div>
            </div>

            {viewMode === "list" && (
              <div className="mb-4">
                <button onClick={() => setShowRules(!showRules)} className="w-full bg-slate-900 text-white p-3 rounded-xl font-bold text-xs flex justify-between items-center shadow transition-all active:scale-[0.99]">
                  <span className="flex items-center gap-1.5">📜 피지 선교 준비 단원 수칙 보기</span>
                  <span className="text-slate-400 transition-transform duration-200" style={{ transform: showRules ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>
                {showRules && (
                  <div className="mt-2 bg-amber-50/60 border border-amber-200/70 p-4 rounded-xl text-xs text-slate-700 space-y-2.5 animate-fade-in leading-relaxed font-semibold shadow-inner">
                    <div className="text-slate-900 font-black border-b border-amber-200 pb-1.5 mb-1.5 text-sm flex items-center gap-1">🙌 우리들의 약속 (선교 수칙)</div>
                    <p className="flex items-start gap-1"><span className="text-red-500">🚫</span> <span><strong>연애 금지:</strong> 선교가 완전히 끝날 때까지 팀원 내 연애는 절대 금지합니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-amber-600">⏰</span> <span><strong>사전 연락:</strong> 불참하거나 늦게 참석할 경우, 최소 모임 3일 전에는 수혁에게 미리 전달해야 합니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-blue-600">🏃‍♂️</span> <span><strong>코리안 타임 금지:</strong> 모든 모임은 늘 시작 5분 전에 도착해 기도로 준비합니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-emerald-600">✅</span> <span><strong>공지 체크:</strong> 단톡방의 모든 카톡 공지는 확인 후 반드시 '체크 표시' 리액션을 남깁니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-purple-600">🧹</span> <span><strong>함께 동역:</strong> 모임이 끝난 후 장소 뒷정리와 청소는 다 같이 함께 합니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-indigo-600">📂</span> <span><strong>기록 보존:</strong> 팀별 회의가 끝난 후에는 구글 드라이브에 회의록을 꼭 작성합니다.</span></p>
                    <p className="flex items-start gap-1"><span className="text-rose-500">🙏</span> <span><strong>순종의 마음:</strong> 세워진 리더십을 온전히 존중하고 순종하는 마음으로 임합니다.</span></p>
                  </div>
                )}
              </div>
            )}

            {viewMode === "list" && (
              <div className="space-y-5">
                <div className="bg-gradient-to-b from-blue-50/70 to-blue-50/20 p-4 rounded-2xl border border-blue-100">
                  <label className="block text-xs font-black text-blue-700 uppercase tracking-wider mb-2 pl-0.5">🎯 모임 섹션 필터</label>
                  <select value={selectedCategory} onChange={handleCategoryChange} className="w-full rounded-xl border border-blue-200 p-3 text-base font-bold text-slate-900 bg-white shadow-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer">
                    <option value="">구분 항목을 선택하세요</option>
                    <option value="전체모임">📢 전체 모임 일정 전체보기</option>
                    <option value="1조">👥 1조 모임 일정 필터링</option>
                    <option value="2조">👥 2조 모임 일정 필터링</option>
                    <option value="3조">👥 3조 모임 일정 필터링</option>
                    <option value="4조">👥 4조 모임 일정 필터링</option>
                    <option value="5조">👥 5조 모임 일정 필터링</option>
                  </select>
                </div>

                {!selectedCategory ? (
                  <div className="text-center py-10 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                    <span className="text-3xl">🗺️</span>
                    <p className="text-slate-400 text-sm font-bold mt-2">상단에서 보고 싶은 조나 전체모임을 고르시면<br/>해당하는 일정이 나타납니다.</p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <h3 className="mb-2 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">
                        {selectedCategory === "전체모임" ? "⏳ 진행 중인 전체 투표" : `⏳ 진행 중인 조별 투표 (${selectedCategory})`}
                      </h3>
                      {activeSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">현재 활성화된 투표가 없습니다.</p>
                      ) : (
                        <div className="space-y-2">
                          {activeSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => { setCurrentSurvey(survey); setViewMode("vote"); setVoteMemo(""); }} className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-400 transition-all active:scale-[0.99] flex justify-between items-center group">
                              <div className="flex flex-col gap-1.5">
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">{survey.title}</span>
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded w-max ${survey.meeting_type === '전체모임' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                                  {survey.meeting_type || "조별모임"}
                                </span>
                              </div>
                              <span className="text-xs bg-blue-600 text-white font-extrabold px-3 py-1.5 rounded-lg shadow-sm shrink-0 ml-3">투표하기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-2 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">
                        {selectedCategory === "전체모임" ? "📢 확정된 전체 공지" : `📢 확정된 조별 공지 (${selectedCategory})`}
                      </h3>
                      {finalizedSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">확정 배포된 공지가 없습니다.</p>
                      ) : (
                        <div className="space-y-2">
                          {finalizedSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => openNotice(survey)} className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-emerald-400 transition-all active:scale-[0.99] flex justify-between items-center group">
                              <div className="flex flex-col gap-1.5">
                                <span className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight">{survey.title}</span>
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded w-max ${survey.meeting_type === '전체모임' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                                  {survey.meeting_type || "조별모임"}
                                </span>
                              </div>
                              <span className="text-xs bg-emerald-600 text-white font-extrabold px-3 py-1.5 rounded-lg shadow-sm shrink-0 ml-3">출석체크</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 🗳️ 첫 투표 화면 (날짜+요일 자동 표시 연동 완료) */}
            {viewMode === "vote" && currentSurvey && (
              <div className="animate-fade-in space-y-5">
                <div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-md border ${currentSurvey.meeting_type === '전체모임' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                    {currentSurvey.meeting_type || "조별모임"}
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mt-2.5 leading-tight">{currentSurvey.title}</h2>
                  <p className="text-xs text-slate-400 mt-1 font-medium">가능한 시간대를 모두 복수 선택해 주세요.</p>
                </div>

                <div className="space-y-4">
                  {currentSurvey.dates.map((day: any) => (
                    <div key={day.date} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      {/* 🛠️ 새로 만드는 일정의 경우 이곳에 날짜와 요일이 세트로 노출됩니다 */}
                      <h3 className="mb-2.5 text-sm font-extrabold text-slate-700 flex items-center gap-1.5">📅 {day.date}</h3>
                      <div className="grid gap-2">
                        {day.slots.map((slot: string) => {
                          const slotId = `${day.date} (${slot})`;
                          const selected = selectedSlots.includes(slotId);
                          return (
                            <button key={slotId} onClick={() => toggleSlot(slotId)} className={`w-full rounded-xl border p-3.5 text-left font-bold text-sm transition-all flex justify-between items-center active:scale-[0.985] ${selected ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-sm"}`}>
                              <span>{slot}</span>
                              {selected && <span className="text-xs bg-white text-blue-600 px-2 py-0.5 rounded-md font-black">선택됨</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 pl-0.5">📝 조교 비고 전달사항</label>
                  <textarea value={voteMemo} onChange={(e) => setVoteMemo(e.target.value)} placeholder="개인적인 일정이나, 시간 조율이 필요한 경우 내용을 상세하게 적어주세요." className="w-full rounded-xl border border-slate-200 p-3 h-24 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                </div>

                <button onClick={handleSubmitVote} className="w-full rounded-xl bg-blue-600 p-4 text-base font-black text-white shadow-md shadow-blue-100 hover:bg-blue-700 transition-all">
                  투표 제출하기
                </button>
              </div>
            )}

            {/* 📢 최종 확정 공지 및 RSVP 체크 UI 화면 */}
            {viewMode === "notice" && currentSurvey && (
              <div className="animate-fade-in space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${currentSurvey.meeting_type === '전체모임' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                      {currentSurvey.meeting_type || "조별모임"}
                    </span>
                    <span className="text-xs font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded">최종공지 완료</span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">{currentSurvey.title}</h2>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5 shadow-inner">
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0 mt-0.5">📍</span>
                    <div className="text-sm"><strong className="text-slate-400 block text-xs">최종 모임 시간</strong> <span className="font-bold text-slate-900">{currentSurvey.final_schedule?.time || "미정"}</span></div>
                  </div>
                  <div className="flex items-start gap-2.5 border-t border-slate-200/60 pt-3">
                    <span className="text-base shrink-0 mt-0.5">🏫</span>
                    <div className="text-sm"><strong className="text-slate-400 block text-xs">최종 모임 장소</strong> <span className="font-bold text-slate-900">{currentSurvey.final_schedule?.location || "미정"}</span></div>
                  </div>
                  {currentSurvey.final_schedule?.memo && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 text-xs font-medium text-slate-600 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                      <strong className="text-blue-600 block text-[10px] uppercase font-black tracking-wider mb-1">📝 조교 공지 전달사항</strong>
                      <div className="whitespace-pre-wrap leading-relaxed">{currentSurvey.final_schedule.memo}</div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 mb-3 pl-0.5">🙋‍♂️ 나의 참석 여부 제출</h3>
                  
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => setRsvpStatus("참석")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "참석" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                      참석
                    </button>
                    <button onClick={() => setRsvpStatus("부분참석")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "부분참석" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                      부분참석
                    </button>
                    <button onClick={() => setRsvpStatus("불참")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "불참" ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                      불참
                    </button>
                  </div>

                  {/* 🍽️ 식사 여부 선택 토글 */}
                  {(rsvpStatus === "참석" || rsvpStatus === "부분참석") && (
                    <div className="mb-4 animate-fade-in bg-orange-50/50 p-4 rounded-xl border border-orange-200/60 shadow-sm">
                      <label className="block text-xs font-black text-orange-800 mb-2">🍽️ 모임 식사 여부</label>
                      <div className="flex gap-2">
                        <button onClick={() => setMealStatus("식사함")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mealStatus === "식사함" ? "bg-orange-500 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                          🍚 밥 먹어요
                        </button>
                        <button onClick={() => setMealStatus("식사안함")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mealStatus === "식사안함" ? "bg-slate-700 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                          🙅 안 먹어요
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 🛠️ 수혁님 피드백 반영: 부분참석 예시 알바 내용 및 지각/조퇴 시간 필수 기재 가이드 수정 */}
                  {(rsvpStatus === "부분참석" || rsvpStatus === "불참") && (
                    <div className="mb-4 animate-fade-in">
                      <textarea value={rsvpReason} onChange={(e) => setRsvpReason(e.target.value)} placeholder={rsvpStatus === "부분참석" ? "예: 알바 근무로 인해 3시 이후에 참석 가능합니다. (참석 가능 시간을 꼭 적어주세요!)" : "조교 서류 기록을 위해 불참 사유를 구체적으로 작성해 주세요."} className="w-full rounded-xl border border-slate-200 p-3 h-24 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                    </div>
                  )}

                  <button onClick={handleSubmitRsvp} className="w-full rounded-xl bg-slate-900 p-4 text-base font-black text-white shadow-md hover:bg-slate-800 transition-all mt-2 active:scale-[0.99]">
                    {rsvpStatus ? "참석 여부 저장하기" : "상태 항목을 선택해 주세요"}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}
