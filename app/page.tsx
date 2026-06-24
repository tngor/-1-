"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [generation, setGeneration] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [entered, setEntered] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState("");
  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
  const [finalizedSurveys, setFinalizedSurveys] = useState<any[]>([]);
  
  const [currentSurvey, setCurrentSurvey] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "vote" | "notice">("list");
  
  // 투표용 상태
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [voteMemo, setVoteMemo] = useState(""); // ✅ 투표 비고란 상태 추가

  // 확정 공지(RSVP)용 상태
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
        if (parsed.lastTeam) {
          setSelectedTeam(parsed.lastTeam);
          setupMySurveys(parsed.lastTeam, fetchedSurveys);
        }
      }
    };
    initApp();
  }, []);

  const setupMySurveys = (team: string, surveys: any[]) => {
    if (!team) {
      setActiveSurveys([]);
      setFinalizedSurveys([]);
      return;
    }
    const mySurveys = surveys.filter(s => s.target_team === team || s.target_team === "전체");
    setActiveSurveys(mySurveys.filter((s) => s.status === "active"));
    setFinalizedSurveys(mySurveys.filter((s) => s.status === "finalized"));
  };

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTeam = e.target.value;
    setSelectedTeam(newTeam);
    setupMySurveys(newTeam, allSurveys);
    if (entered) {
      localStorage.setItem("missionUser", JSON.stringify({ generation, name, lastTeam: newTeam }));
    }
  };

  const handleEnter = async () => {
    if (!generation || !name || !pin) return alert("기수, 이름, 비밀번호를 모두 입력해주세요.");
    if (pin.length !== 4) return alert("비밀번호는 4자리 숫자로 입력해주세요.");

    const { data: existingUser } = await supabase.from("users").select("*").eq("generation", generation).eq("name", name).maybeSingle();

    if (existingUser) {
      if (existingUser.pin !== pin) return alert("비밀번호가 틀렸습니다! 다시 확인해주세요.");
    } else {
      if (!window.confirm(`처음 오셨군요! [${generation}기 ${name}]님, 비밀번호 [${pin}](으)로 계정을 생성할까요?`)) return;
      const { error } = await supabase.from("users").insert([{ team: "미지정", generation, name, pin }]);
      if (error) return alert("계정 생성에 실패했습니다.");
      alert("계정이 성공적으로 만들어졌습니다!");
    }

    localStorage.setItem("missionUser", JSON.stringify({ generation, name }));
    setEntered(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("missionUser");
    setEntered(false);
    setPin("");
    setSelectedTeam("");
  };

  const toggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  // ✅ 1. 투표 제출 로직 (이중 투표 방지 적용)
  const handleSubmitVote = async () => {
    if (selectedSlots.length === 0) {
      if (!window.confirm("선택한 시간이 없습니다. 이대로 제출하시겠습니까?")) return;
    }

    // 💡 [핵심] 기존에 이 사람이 이 일정에 투표한 기록이 있다면 싹 지워버립니다.
    await supabase.from("survey_responses")
      .delete()
      .eq("survey_id", currentSurvey.id)
      .eq("generation", generation)
      .eq("name", name);

    // 그리고 새로운 투표를 넣습니다.
    const newResponse = {
      survey_id: currentSurvey.id,
      team: selectedTeam, 
      generation: generation,
      name: name,
      slots: selectedSlots,
      memo: voteMemo,
    };
    const { error } = await supabase.from("survey_responses").insert([newResponse]);
    if (error) return alert("투표 저장에 실패했습니다.");
    
    alert("투표가 성공적으로 저장/수정되었습니다! 🎉");
    setViewMode("list");
    setSelectedSlots([]);
    setVoteMemo("");
  };

  // ✅ 2. 확정 공지 열 때 이전 참석 여부 불러오기
  const openNotice = async (survey: any) => {
    setCurrentSurvey(survey);
    setRsvpStatus("");
    setRsvpReason("");
    
    // DB에서 내가 이 일정에 응답한 기록이 있는지 찾습니다.
    const { data } = await supabase.from("rsvp_responses")
      .select("*")
      .eq("survey_id", survey.id)
      .eq("generation", generation)
      .eq("name", name)
      .maybeSingle();

    if (data) {
      setRsvpStatus(data.status as any);
      setRsvpReason(data.reason || "");
    }
    setViewMode("notice");
  };

  // ✅ 3. 참석 여부(RSVP) 제출 로직
  const handleSubmitRsvp = async () => {
    if (!rsvpStatus) return alert("참석 여부를 선택해주세요.");
    if ((rsvpStatus === "부분참석" || rsvpStatus === "불참") && !rsvpReason.trim()) {
      return alert("사유를 작성해주세요.");
    }

    // 기존 기록이 있으면 지우고 새로 덮어씌웁니다. (수정 기능)
    await supabase.from("rsvp_responses").delete()
      .eq("survey_id", currentSurvey.id)
      .eq("generation", generation)
      .eq("name", name);

    const { error } = await supabase.from("rsvp_responses").insert([{
      survey_id: currentSurvey.id,
      team: selectedTeam,
      generation: generation,
      name: name,
      status: rsvpStatus,
      reason: rsvpReason
    }]);

    if (error) {
      console.error(error); // 개발자 도구에 자세히 기록
      return alert("저장 실패 이유: " + error.message + "\n\n이 메시지를 젬나이에게 알려주세요!");
    }
    alert("참석 여부가 저장되었습니다! ✅");
    setViewMode("list");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-lg">
        
        {!entered ? (
          <>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">서울영동교회 청년1부</h1>
            <h2 className="mb-8 text-xl text-gray-600">피지 선교 (계정 접속)</h2>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input type="number" placeholder="기수 (예: 45)" value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-1/3 rounded-lg border p-4 text-lg text-gray-900" />
                <input type="text" placeholder="이름 (예: 홍길동)" value={name} onChange={(e) => setName(e.target.value)} className="w-2/3 rounded-lg border p-4 text-lg text-gray-900" />
              </div>
              <input type="password" maxLength={4} placeholder="숫자 4자리 비밀번호" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-lg border p-4 text-lg text-gray-900 tracking-[0.5em] font-bold" />
              <button onClick={handleEnter} className="mt-4 w-full rounded-lg bg-blue-600 p-4 text-xl font-bold text-white shadow hover:bg-blue-700 transition">시작하기</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex justify-between items-center border-b pb-4">
              <div>
                <span className="text-xl font-bold text-gray-900">{generation}기 {name}님</span>
              </div>
              <div className="flex items-center gap-4">
                {viewMode !== "list" && <button onClick={() => setViewMode("list")} className="text-sm font-semibold text-gray-500 hover:underline">← 목록으로</button>}
                <button onClick={handleLogout} className="text-sm rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-200">로그아웃</button>
              </div>
            </div>

            {viewMode === "list" && (
              <div>
                <div className="mb-8 bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-inner">
                  <label className="block text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">🎯 현재 활동 중인 조를 선택하세요</label>
                  <select value={selectedTeam} onChange={handleTeamChange} className="w-full rounded-xl border border-blue-200 p-3.5 text-lg font-semibold text-gray-900 bg-white shadow-sm focus:border-blue-500 focus:outline-none">
                    <option value="">-- 조를 선택해 주세요 --</option>
                    <option value="1조">1조</option>
                    <option value="2조">2조</option>
                    <option value="3조">3조</option>
                    <option value="4조">4조</option>
                  </select>
                </div>

                {!selectedTeam ? (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-500 text-lg font-medium">위에서 조를 선택하시면 해당 조의 일정이 나타납니다.</p>
                  </div>
                ) : (
                  <div className="space-y-8 animate-fade-in">
                    <div>
                      <h3 className="mb-3 text-xl font-bold text-gray-900 flex items-center gap-2">🗳️ 진행 중인 투표 ({selectedTeam})</h3>
                      {activeSurveys.length === 0 ? <p className="text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-dashed">진행 중인 투표가 없습니다.</p> : (
                        <div className="space-y-3">
                          {activeSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => { setCurrentSurvey(survey); setViewMode("vote"); setVoteMemo(""); }} className="w-full text-left p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition flex justify-between items-center">
                              <span className="font-bold text-gray-800">{survey.title}</span>
                              <span className="text-sm bg-blue-600 text-white px-3 py-1 rounded-full font-semibold">투표하기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-3 text-xl font-bold text-gray-900 flex items-center gap-2">📢 확정된 공지 ({selectedTeam})</h3>
                      {finalizedSurveys.length === 0 ? <p className="text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-dashed">확정된 공지가 없습니다.</p> : (
                        <div className="space-y-3">
                          {finalizedSurveys.map((survey) => (
                            <button key={survey.id} onClick={() => openNotice(survey)} className="w-full text-left p-4 rounded-xl border border-green-200 bg-green-50/50 hover:bg-green-50 transition flex justify-between items-center">
                              <span className="font-bold text-gray-800">{survey.title}</span>
                              <span className="text-sm bg-green-600 text-white px-3 py-1 rounded-full font-semibold">확인하기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✅ 투표 화면 UI 업데이트 (비고란 추가) */}
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
                          <button key={slotId} onClick={() => toggleSlot(slotId)} className={`w-full rounded-lg border p-3.5 text-left transition ${selected ? "bg-blue-600 text-white font-semibold" : "bg-white text-gray-800 hover:bg-gray-50"}`}>
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                
                <div className="mb-6">
                  <h3 className="mb-2 font-bold text-gray-800">📝 비고란 (선택)</h3>
                  <textarea 
                    value={voteMemo} 
                    onChange={(e) => setVoteMemo(e.target.value)} 
                    placeholder="관리자에게 남길 말이 있다면 적어주세요." 
                    className="w-full rounded-lg border border-gray-300 p-3 h-24 text-gray-900" 
                  />
                </div>

                <button onClick={handleSubmitVote} className="w-full rounded-lg bg-green-600 p-4 text-lg font-semibold text-white shadow hover:bg-green-700 transition">
                  제출하기
                </button>
              </>
            )}

            {/* ✅ 확정 공지 화면 UI 업데이트 (참석 여부 버튼 및 사유 입력 추가) */}
            {viewMode === "notice" && currentSurvey && (
              <div className="rounded-2xl border border-green-300 bg-green-50/30 p-6 space-y-4">
                <h2 className="text-2xl font-bold text-green-900">📢 {currentSurvey.title} - 최종 확정</h2>
                <div className="bg-white p-5 rounded-xl border space-y-3 shadow-sm">
                  <p className="text-gray-800 text-lg"><strong>📍 시간:</strong> {currentSurvey.final_schedule?.time || "미정"}</p>
                  <p className="text-gray-800 text-lg"><strong>🏫 장소:</strong> {currentSurvey.final_schedule?.location || "미정"}</p>
                  {currentSurvey.final_schedule?.memo && (
                    <div className="mt-4 pt-3 border-t text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      <strong>📝 메모:</strong><br/>{currentSurvey.final_schedule.memo}
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-green-200 pt-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">🙋‍♂️ 참석 여부를 알려주세요</h3>
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => setRsvpStatus("참석")} className={`flex-1 py-3 rounded-lg font-bold transition ${rsvpStatus === "참석" ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}>
                      참석
                    </button>
                    <button onClick={() => setRsvpStatus("부분참석")} className={`flex-1 py-3 rounded-lg font-bold transition ${rsvpStatus === "부분참석" ? "bg-yellow-500 text-white shadow-md" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}>
                      부분참석
                    </button>
                    <button onClick={() => setRsvpStatus("불참")} className={`flex-1 py-3 rounded-lg font-bold transition ${rsvpStatus === "불참" ? "bg-red-500 text-white shadow-md" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}>
                      불참
                    </button>
                  </div>

                  {/* 부분참석 또는 불참 선택 시에만 나타나는 입력창 */}
                  {(rsvpStatus === "부분참석" || rsvpStatus === "불참") && (
                    <div className="mb-4 animate-fade-in">
                      <textarea 
                        value={rsvpReason} 
                        onChange={(e) => setRsvpReason(e.target.value)} 
                        placeholder={rsvpStatus === "부분참석" ? "예: 7시 30분쯤 도착할 것 같습니다." : "불참 사유를 적어주세요. (관리자만 확인 가능)"} 
                        className="w-full rounded-lg border border-gray-300 p-3 h-24 text-gray-900 focus:border-blue-500 focus:outline-none" 
                      />
                    </div>
                  )}

                  <button onClick={handleSubmitRsvp} className="w-full rounded-lg bg-gray-900 p-4 text-lg font-semibold text-white shadow hover:bg-gray-800 transition mt-2">
                    {rsvpStatus ? "참석 여부 저장하기" : "항목을 선택해주세요"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
