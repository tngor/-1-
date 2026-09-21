"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [generation, setGeneration] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [entered, setEntered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(""); 
  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
  const [finalizedSurveys, setFinalizedSurveys] = useState<any[]>([]);
  
  const [currentSurvey, setCurrentSurvey] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "vote" | "notice" | "baggage">("list");
  
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [voteMemo, setVoteMemo] = useState(""); 

  const [rsvpStatus, setRsvpStatus] = useState<"참석" | "부분참석" | "불참" | "">("");
  const [rsvpReason, setRsvpReason] = useState("");
  const [mealStatus, setMealStatus] = useState<"식사함" | "식사안함" | "">(""); 

  const [showRules, setShowRules] = useState(false);

  // 🎒 물품 파악용 상태
  const [hasSleepingBag, setHasSleepingBag] = useState(false);
  const [sleepingBagCount, setSleepingBagCount] = useState(1);
  const [hasMat, setHasMat] = useState(false);
  const [matCount, setMatCount] = useState(1);
  const [hasNone, setHasNone] = useState(false); // 🛠️ '둘 다 없음' 상태 추가
  const [otherItems, setOtherItems] = useState("");
  const [isBaggageSubmitted, setIsBaggageSubmitted] = useState(false);

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
      checkBaggageStatus(parsed.name); 
    }
  };

  const checkBaggageStatus = async (userName: string) => {
    const { data } = await supabase.from("mission_baggage").select("*").eq("name", userName).maybeSingle();
    if (data) {
      setIsBaggageSubmitted(true);
      setHasSleepingBag(data.has_sleeping_bag);
      setSleepingBagCount(data.sleeping_bag_count || 1);
      setHasMat(data.has_mat);
      setMatCount(data.mat_count || 1);
      setOtherItems(data.other_items || "");
      
      // 🛠️ 저장된 데이터가 둘 다 false면 '없음' 체크
      if (!data.has_sleeping_bag && !data.has_mat) {
        setHasNone(true);
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
      filtered = surveys.filter(s => s.meeting_type === "전체모임" || s.target_team === "전체" || !s.meeting_type);
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
    const cleanGen = generation.trim();
    const cleanName = name.trim();
    const cleanPin = pin.trim();

    if (!cleanGen || !cleanName || !cleanPin) return alert("기수, 이름, 비밀번호를 모두 입력해주세요.");
    if (cleanPin.length !== 4) return alert("비밀번호는 4자리 숫자로 입력해주세요.");
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .eq("generation", cleanGen)
        .eq("name", cleanName)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.pin !== cleanPin) {
          setIsSubmitting(false);
          return alert("비밀번호가 틀렸습니다! 다시 확인해주세요.");
        }
      } else {
        if (!window.confirm(`처음 오셨군요! [${cleanGen}기] [${cleanName}]님, 비밀번호 [${cleanPin}](으)로 계정을 생성할까요?`)) {
          setIsSubmitting(false);
          return;
        }
        const { error } = await supabase.from("users").insert([{ team: "전체", generation: cleanGen, name: cleanName, pin: cleanPin }]);
        if (error) {
          setIsSubmitting(false);
          return alert("계정 생성에 실패했습니다.");
        }
        alert("계정이 성공적으로 만들어졌습니다!");
      }

      localStorage.setItem("missionUser", JSON.stringify({ generation: cleanGen, name: cleanName, lastCategory: selectedCategory }));
      setEntered(true);
      fetchSurveys();
      checkBaggageStatus(cleanName);
    } finally {
      setIsSubmitting(false);
    }
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
    await supabase.from("survey_responses").delete().eq("survey_id", currentSurvey.id).eq("generation", generation.trim()).eq("name", name.trim());

    const newResponse = {
      survey_id: currentSurvey.id,
      team: selectedCategory || "전체",
      generation: generation.trim(),
      name: name.trim(),
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
    
    const { data } = await supabase.from("rsvp_responses").select("*").eq("survey_id", survey.id).eq("generation", generation.trim()).eq("name", name.trim()).maybeSingle();
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

    await supabase.from("rsvp_responses").delete().eq("survey_id", currentSurvey.id).eq("generation", generation.trim()).eq("name", name.trim());

    let finalReasonToSave = rsvpReason.trim();
    if (rsvpStatus !== "불참" && mealStatus) {
      finalReasonToSave = `[${mealStatus}] ${finalReasonToSave}`;
    }

    const { error } = await supabase.from("rsvp_responses").insert([{
      survey_id: currentSurvey.id,
      team: selectedCategory || "전체",
      generation: generation.trim(),
      name: name.trim(),
      status: rsvpStatus,
      reason: finalReasonToSave
    }]);

    if (error) return alert("저장에 실패했습니다.");
    alert("참석 여부가 저장되었습니다! ✅");
    setViewMode("list");
  };

  // 🎒 물품 데이터 저장 함수 (에러 핸들링 강화)
  const handleSubmitBaggage = async () => {
    if (!hasSleepingBag && !hasMat && !hasNone) {
      return alert("가져올 수 있는 품목을 선택하거나 '둘 다 없음'을 체크해 주세요.");
    }
    if (hasSleepingBag && sleepingBagCount < 1) return alert("침낭 수량을 확인해 주세요.");
    if (hasMat && matCount < 1) return alert("매트 수량을 확인해 주세요.");

    // 기존 내역 지우기
    await supabase.from("mission_baggage").delete().eq("name", name.trim());

    // 🛠️ 명시적으로 uuid를 프론트에서 생성해 넘김으로써 DB의 uuid_generate_v4() 의존도 제거
    const { error } = await supabase.from("mission_baggage").insert([{
      id: crypto.randomUUID(), 
      name: name.trim(),
      has_sleeping_bag: hasSleepingBag,
      sleeping_bag_count: hasSleepingBag ? sleepingBagCount : 0,
      has_mat: hasMat,
      mat_count: hasMat ? matCount : 0,
      other_items: otherItems.trim()
    }]);

    if (error) {
      console.error(error);
      return alert(`물품 등록에 실패했습니다.\n사유: ${error.message}\n(RLS 권한 문제일 수 있습니다.)`);
    }
    
    alert("개인 물품 내역이 성공적으로 저장되었습니다! 🎒");
    setIsBaggageSubmitted(true);
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

              <button 
                onClick={handleEnter} 
                disabled={isSubmitting}
                className="mt-4 w-full rounded-xl bg-blue-600 p-3.5 text-base font-black text-white shadow-md shadow-blue-100 hover:bg-blue-700 active:scale-[0.99] disabled:bg-blue-300 transition-all"
              >
                {isSubmitting ? "확인 중..." : "입장하기 →"}
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
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
              <div className="mb-4 space-y-3">
                <button onClick={() => setViewMode("baggage")} className={`w-full p-4 rounded-2xl font-black text-sm flex justify-between items-center shadow-sm transition-all active:scale-[0.99] border ${isBaggageSubmitted ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎒</span>
                    <div className="text-left">
                      <div className="leading-tight">선교 개인 물품 파악</div>
                      {isBaggageSubmitted ? (
                        <div className="text-[10px] font-bold opacity-80 mt-0.5">✅ 제출 완료 (클릭하여 수정 가능)</div>
                      ) : (
                        <div className="text-[10px] font-medium opacity-90 mt-0.5">배송을 위해 수량을 입력해 주세요!</div>
                      )}
                    </div>
                  </div>
                  <span>→</span>
                </button>

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

            {/* 🎒 물품 입력 뷰 */}
            {viewMode === "baggage" && (
              <div className="animate-fade-in space-y-6">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md border bg-indigo-50 text-indigo-600 border-indigo-100">
                    사전 수화물 조사
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mt-2.5 leading-tight">🎒 개인 침낭 및 매트 파악</h2>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    본인이 가져올 수 있는 취침용 물품 수량을 파악합니다.<br/>
                    <strong className="text-indigo-600">여유분이 있다면 최대한 많이 등록해 주시면 좋습니다!</strong>
                  </p>
                </div>

                <div className="space-y-4">
                  {/* 🛠️ 침낭 섹션 (텍스트 및 디자인 단순화) */}
                  <div className={`p-4 rounded-2xl border transition-all ${hasSleepingBag ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-black text-slate-800">
                        침낭
                      </label>
                      <input 
                        type="checkbox" 
                        checked={hasSleepingBag} 
                        onChange={(e) => {
                          setHasSleepingBag(e.target.checked);
                          if (e.target.checked) setHasNone(false); // 선택 시 '없음' 자동 해제
                        }} 
                        className="w-5 h-5 accent-indigo-600 cursor-pointer" 
                      />
                    </div>
                    {hasSleepingBag && (
                      <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center justify-between animate-fade-in">
                        <span className="text-xs font-bold text-indigo-800">수량</span>
                        <div className="flex items-center gap-3 bg-white border border-indigo-100 rounded-lg p-1">
                          <button onClick={() => setSleepingBagCount(Math.max(1, sleepingBagCount - 1))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold active:scale-95">-</button>
                          <span className="font-black text-indigo-700 w-4 text-center">{sleepingBagCount}</span>
                          <button onClick={() => setSleepingBagCount(sleepingBagCount + 1)} className="w-8 h-8 flex items-center justify-center bg-indigo-100 rounded text-indigo-700 font-bold active:scale-95">+</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 🛠️ 매트 섹션 */}
                  <div className={`p-4 rounded-2xl border transition-all ${hasMat ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-black text-slate-800">
                        매트
                      </label>
                      <input 
                        type="checkbox" 
                        checked={hasMat} 
                        onChange={(e) => {
                          setHasMat(e.target.checked);
                          if (e.target.checked) setHasNone(false); // 선택 시 '없음' 자동 해제
                        }} 
                        className="w-5 h-5 accent-indigo-600 cursor-pointer" 
                      />
                    </div>
                    {hasMat && (
                      <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center justify-between animate-fade-in">
                        <span className="text-xs font-bold text-indigo-800">수량</span>
                        <div className="flex items-center gap-3 bg-white border border-indigo-100 rounded-lg p-1">
                          <button onClick={() => setMatCount(Math.max(1, matCount - 1))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold active:scale-95">-</button>
                          <span className="font-black text-indigo-700 w-4 text-center">{matCount}</span>
                          <button onClick={() => setMatCount(matCount + 1)} className="w-8 h-8 flex items-center justify-center bg-indigo-100 rounded text-indigo-700 font-bold active:scale-95">+</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 🛠️ 둘 다 없음 섹션 (새로 추가됨) */}
                  <div className={`p-4 rounded-2xl border transition-all ${hasNone ? 'bg-slate-800 border-slate-900' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center">
                      <label className={`text-sm font-black ${hasNone ? 'text-white' : 'text-slate-800'}`}>
                        없음 (침낭/매트 모두 없음)
                      </label>
                      <input 
                        type="checkbox" 
                        checked={hasNone} 
                        onChange={(e) => {
                          setHasNone(e.target.checked);
                          if (e.target.checked) {
                            setHasSleepingBag(false);
                            setHasMat(false);
                          }
                        }} 
                        className="w-5 h-5 accent-slate-900 cursor-pointer" 
                      />
                    </div>
                  </div>

                  {/* 기타 전달 사항 */}
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1.5 pl-0.5">기타 전달 사항 (선택)</label>
                    <textarea value={otherItems} onChange={(e) => setOtherItems(e.target.value)} placeholder="부피가 크다거나, 다인용 매트일 경우 자유롭게 적어주세요." className="w-full rounded-xl border border-slate-200 p-3 h-20 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all shadow-inner" />
                  </div>
                </div>

                <button onClick={handleSubmitBaggage} className="w-full rounded-xl bg-indigo-600 p-4 text-base font-black text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all mt-2 active:scale-[0.99]">
                  {isBaggageSubmitted ? "물품 내역 수정하기" : "물품 파악 제출하기"}
                </button>
              </div>
            )}

            {/* 기존 리스트/투표/공지 화면 */}
            {viewMode === "list" && (
              <div className="space-y-5">
                <div className="bg-gradient-to-b from-blue-50/70 to-blue-50/20 p-4 rounded-2xl border border-blue-100">
                  <label className="block text-xs font-black text-blue-700 uppercase tracking-wider mb-2 pl-0.5">🎯 모임 섹션 필터</label>
                  <select value={selectedCategory} onChange={handleCategoryChange} className="w-full rounded-xl border border-blue-200 p-3 text-base font-bold text-slate-900 bg-white shadow-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer">
                    <option value="">구분 항목을 선택하세요</option>
                    <option value="전체모임">📢 전체 모임 일정 전체보기</option>
                  </select>
                </div>

                {!selectedCategory ? (
                  <div className="text-center py-10 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                    <span className="text-3xl">🗺️</span>
                    <p className="text-slate-400 text-sm font-bold mt-2">상단에서 전체모임을 선택하시면<br/>일정이 나타납니다.</p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <h3 className="mb-2 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">⏳ 진행 중인 전체 투표</h3>
                      {activeSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">현재 활성화된 투표가 없습니다.</p>
                      ) : (
                        <div className="space-y-2">
                          {activeSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => { setCurrentSurvey(survey); setViewMode("vote"); setVoteMemo(""); }} className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-400 transition-all active:scale-[0.99] flex justify-between items-center group">
                              <div className="flex flex-col gap-1.5">
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">{survey.title}</span>
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded w-max bg-purple-50 text-purple-600 border border-purple-100">전체모임</span>
                              </div>
                              <span className="text-xs bg-blue-600 text-white font-extrabold px-3 py-1.5 rounded-lg shadow-sm shrink-0 ml-3">투표하기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-2 text-xs font-black text-slate-400 uppercase tracking-wider pl-1">📢 확정된 전체 공지</h3>
                      {finalizedSurveys.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-dashed font-medium">확정 배포된 공지가 없습니다.</p>
                      ) : (
                        <div className="space-y-2">
                          {finalizedSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => openNotice(survey)} className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-emerald-400 transition-all active:scale-[0.99] flex justify-between items-center group">
                              <div className="flex flex-col gap-1.5">
                                <span className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight">{survey.title}</span>
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded w-max bg-purple-50 text-purple-600 border border-purple-100">전체모임</span>
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
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md border bg-purple-50 text-purple-600 border-purple-100">전체모임</span>
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
                  <textarea value={voteMemo} onChange={(e) => setVoteMemo(e.target.value)} placeholder="개인적인 일정이나, 시간 조율이 필요한 경우 내용을 상세하게 적어주세요." className="w-full rounded-xl border border-slate-200 p-3 h-24 text-sm font-medium text-slate-900 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:outline-none transition-all shadow-inner" />
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
                    <span className="text-[10px] font-black px-2 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-100">전체모임</span>
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
                    <button onClick={() => setRsvpStatus("참석")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "참석" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>참석</button>
                    <button onClick={() => setRsvpStatus("부분참석")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "부분참석" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>부분참석</button>
                    <button onClick={() => setRsvpStatus("불참")} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all shadow-sm active:scale-95 ${rsvpStatus === "불참" ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>불참</button>
                  </div>
                  {(rsvpStatus === "참석" || rsvpStatus === "부분참석") && (
                    <div className="mb-4 animate-fade-in bg-orange-50/50 p-4 rounded-xl border border-orange-200/60 shadow-sm">
                      <label className="block text-xs font-black text-orange-800 mb-2">🍽️ 모임 식사 여부</label>
                      <div className="flex gap-2">
                        <button onClick={() => setMealStatus("식사함")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mealStatus === "식사함" ? "bg-orange-500 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>🍚 밥 먹어요</button>
                        <button onClick={() => setMealStatus("식사안함")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mealStatus === "식사안함" ? "bg-slate-700 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>🙅 안 먹어요</button>
                      </div>
                    </div>
                  )}
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
