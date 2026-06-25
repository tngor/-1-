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

  useEffect(() => {
    const initApp = async () => {
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
    initApp();
  }, []);

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
      if (!window.confirm(`처음 오셨군요! [${generation}기 [${name}]님, 비밀번호 [${pin}](으)로 계정을 생성할까요?`)) return;
      const { error } = await supabase.from("users").insert([{ team: "미지정", generation, name, pin }]);
      if (error) return alert("계정 생성에 실패했습니다.");
      alert("계정이 성공적으로 만들어졌습니다!");
    }

    localStorage.setItem("missionUser", JSON.stringify({ generation, name, lastCategory: selectedCategory }));
    setEntered(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("missionUser");
    setEntered(false);
    setPin("");
    setSelectedCategory("");
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
    
    const { data } = await supabase.from("rsvp_responses").select("*").eq("survey_id", survey.id).eq("generation", generation).eq("name", name).maybeSingle();
    if (data) {
      setRsvpStatus(data.status as any);
      setRsvpReason(data.reason || "");
    }
    setViewMode("notice");
  };

  const handleSubmitRsvp = async () => {
    if (!rsvpStatus) return alert("참석 여부를 선택해주세요.");
    if ((rsvpStatus === "부분참석" || rsvpStatus === "불참") && !rsvpReason.trim()) {
      return alert("사유를 작성해주세요.");
    }

    await supabase.from("rsvp_responses").delete().eq("survey_id", currentSurvey.id).eq("generation", generation).eq("name", name);

    const { error } = await supabase.from("rsvp_responses").insert([{
      survey_id: currentSurvey.id,
      team: selectedCategory,
      generation: generation,
      name: name,
      status: rsvpStatus,
      reason: rsvpReason
    }]);

    if (error) return alert("저장에 실패했습니다.");
    alert("참석 여부가 저장되었습니다! ✅");
    setViewMode("list");
  };

  return (
    <main className="min-h-screen w-full bg-slate-50 text-slate-800 flex flex-col justify-start items-center px-4 py-6 font-sans selection:bg-blue-100">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        
        {!entered ? (
          <div className="py-4 animate-fade-in">
            <div className="text-center mb-8">
              {/* 🛠️ 수혁님 피드백 반영: 영어 표기 SYDC로 수정 */}
              <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full uppercase tracking-wider">SYDC</span>
              {/* 🛠️ 수혁님 피드백 반영: 청년 1부 피지 선교 준비로 문구 수정 */}
              <h1 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">청년 1부 피지 선교 준비</h1>
              <p className="text-sm text-slate-500 mt-1 font-medium">🗺️ 실시간 일정 및 공지 관리 시스템</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-1/3">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 pl-1">기수</label>
                  <input type="number" placeholder="45" value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5 text-center text-lg font-bold text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                </div>
                <div className="w-2/3">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 pl-1">이름</label>
                  <input type="text" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5 text-lg font-bold text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 pl-1">암호 설정</label>
                <input type="password" maxLength={4} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-xl border border-slate-200 p-3.5 text-2xl tracking-[0.4em] text-center font-black text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                <p className="text-xs text-slate-400 mt-2 pl-1 flex items-center gap-1">✨ 기억하기 쉽게 <strong className="text-blue-500 font-bold">생일 4자리</strong>를 권장합니다!</p>
              </div>

              {/* 🛠️ 수혁님 피드백 반영: '입장하기'로 간소화 */}
              <button onClick={handleEnter} className="mt-6 w-full rounded-xl bg-blue-600 p-4 text-base font-black text-white shadow-md shadow-blue-100 hover:bg-blue-700 active:scale-[0.99] transition-all">
                입장하기 →
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="mb-6 flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 pl-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-sm font-black text-slate-800">{generation}기 <strong className="text-blue-600">{name}</strong> 단원</span>
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
              <div className="space-y-6">
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
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h3 className="mb-3 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">
                        {selectedCategory === "전체모임" ? "⏳ 진행 중인 전체 투표" : `⏳ 진행 중인 조별 투표 (${selectedCategory})`}
                      </h3>
                      {activeSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">현재 활성화된 투표가 없습니다.</p>
                      ) : (
                        <div className="space-y-2.5">
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
                      <h3 className="mb-3 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">
                        {selectedCategory === "전체모임" ? "📢 확정된 전체 공지" : `📢 확정된 조별 공지 (${selectedCategory})`}
                      </h3>
                      {finalizedSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">확정 배포된 공지가 없습니다.</p>
                      ) : (
                        <div className="space-y-2.5">
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
                  <textarea value={voteMemo} onChange={(e) => setVoteMemo(e.target.value)} placeholder="지각 사유나 조퇴 시간 조율이 필요한 내용을 상세하게 적어주세요." className="w-full rounded-xl border border-slate-200 p-3 h-24 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
                </div>

                <button onClick={handleSubmitVote} className="w-full rounded-xl bg-blue-600 p-4 text-base font-black text-white shadow-md shadow-blue-100 hover:bg-blue-700 transition-all">
                  투표 제출하기
                </button>
              </div>
            )}

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
                  
                  <div className="flex gap-2 mb-3">
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

                  {(rsvpStatus === "부분참석" || rsvpStatus === "불참") && (
                    <div className="mb-4 animate-fade-in">
                      <textarea value={rsvpReason} onChange={(e) => setRsvpReason(e.target.value)} placeholder={rsvpStatus === "부분참석" ? "예: 학원 수강으로 인해 30분 정도 지각합니다." : "조교 서류 기록을 위해 불참 사유를 구체적으로 작성해 주세요."} className="w-full rounded-xl border border-slate-200 p-3 h-24 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
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
