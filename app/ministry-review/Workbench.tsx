'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Board, type Meeting, type Team, closed, timeLabel, stateLabel } from './model';
import { CandidateForm, VoteForm, NoticeForm, AttendanceForm, localTime, type Save } from './Forms';
import './workbench.css';

export default function Workbench({ admin = false }: { admin?: boolean }) {
  const [board, setBoard] = useState<Board>();
  const actor = board?.actor ?? "";
  const [filter, setFilter] = useState('all');
  const [attention, setAttention] = useState('all');
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copyText, setCopyText] = useState('');
  const [reopenUntil, setReopenUntil] = useState(localTime(new Date(Date.now() + 86400000).toISOString()));
  const [tick, setTick] = useState(0);
  const request = useCallback(async (operation: string, payload?: Record<string, unknown>) => {
    const response = await fetch('/api/ministry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: "schedule", action: operation, payload, adminView: admin }) });
    const result = await response.json();
    if (response.status === 401) {
      setBoard(undefined);
      throw new Error('기존 계정으로 다시 로그인해 주세요.');
    }
    if (!response.ok) throw new Error(result.error || '다시 시도해 주세요.');
    setBoard(result as Board);
  }, [admin]);
  useEffect(() => {
    setBusy(true); setBoard(undefined); setError('');
    request('read').catch(e => setError(e.message)).finally(() => setBusy(false));
  }, [request]);
  useEffect(() => { const timer = setInterval(() => setTick(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const save: Save = async (operation, payload) => {
    setBusy(true); setError(''); setFeedback('');
    try { await request(operation, payload); setFeedback(operation === 'read' ? '최신 현황을 불러왔습니다.' : '저장했습니다.'); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다.'); return false; }
    finally { setBusy(false); }
  };
  const meeting = board?.meetings.find(item => item.id === selected);
  const team = board?.teams.find(item => item.id === meeting?.team);
  const manager = admin || team?.people.some(person => person.id === actor && person.role !== '팀원');
  const manageable = board?.teams.filter(item => admin || item.people.some(person => person.id === actor && person.role !== '팀원')) ?? [];
  function open(id: string) { setSelected(id); setCreating(false); setForm(''); setFeedback(''); setCopyText(''); }
  function back() { setSelected(''); setCreating(false); setForm(''); setCopyText(''); }
  async function copy(text: string) {
    setCopyText(text);
    try { await navigator.clipboard.writeText(text); setFeedback('복사했습니다. 카카오톡에 붙여넣어 주세요.'); }
    catch { setFeedback('아래 내용을 선택해 직접 복사해 주세요.'); }
  }
  function shareAttendance(item: Meeting, target: Team) {
    const lines = [item.title, timeLabel(item.confirmed, item.minutes), ''];
    for (const status of ['참석','불참','부분참석']) {
      const people = target.people.filter(person => item.rsvps[person.id]?.status === status);
      lines.push(`${status} : ${people.length}명`);
      if (status !== '참석') people.forEach(person => {
        const response = item.rsvps[person.id];
        lines.push(`• ${person.name} · ${response.reason}${response.arrival ? ` / ${response.arrival}부터 참석` : ''}`);
      });
      lines.push('');
    }
    const pending = target.people.filter(person => !item.rsvps[person.id]);
    lines.push(`미투표자 : ${pending.length}명`, pending.map(person => person.name).join(', '));
    if (item.mealProvided) lines.push('', `식사 인원 : ${Object.values(item.rsvps).filter(response => response.meal).length}명`);
    return lines.join('\n');
  }
  const visible = board?.meetings.filter(item => filter === 'all' || item.team === filter) ?? [];
  const byDate = (a: Meeting, b: Meeting) => (a.confirmed || a.slots[0] || '').localeCompare(b.confirmed || b.slots[0] || '');
  const lists = [
    { label: '진행 중인 투표', items: visible.filter(item => item.status === 'voting').sort((a,b) => (a.deadline ?? "~").localeCompare(b.deadline ?? "~")) },
    { label: '확정된 공지', items: visible.filter(item => item.status === 'confirmed').sort(byDate) },
  ];
  const card = (item: Meeting) => <button key={item.id} className="work-meeting" onClick={() => open(item.id)}>
    <div><span className={'work-tag ' + item.status}>{item.team} · {stateLabel(item)}</span><h3>{item.title}</h3><p className="work-muted">{item.confirmed ? timeLabel(item.confirmed, item.minutes) : item.deadline ? `마감 ${new Date(item.deadline!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '마감 미정'}</p><small>{item.status === 'voting' ? `${item.responseCount ?? 0}명 응답${admin ? '' : item.votes[actor] ? ' · 내 투표 완료' : ' · 내 투표 미완료'}` : item.status === 'confirmed' ? (admin ? `참석 응답 ${Object.keys(item.rsvps).length}명` : item.rsvps[actor] ? `내 응답 · ${item.rsvps[actor].status}` : '참석 체크 필요') : ''}</small></div>
    <span className={item.status === 'confirmed' ? 'work-go confirmed' : 'work-go'}>{admin ? '상세 보기' : item.status === 'confirmed' ? '참석 체크' : item.status === 'voting' ? closed(item) ? '결과 대기' : item.votes[actor] ? '응답 수정' : '투표하기' : '상세 보기'}</span>
  </button>;
  return <section className="ministryWork" data-clock={tick}>
    <div className="work-heading"><div><h2>{admin ? '사역팀 진행 현황' : '내 사역 일정'}</h2><p className="work-muted">{admin ? '팀별 투표와 다음 모임을 확인하세요.' : '소속 팀의 일정과 참석 여부를 확인하세요.'}</p></div><button disabled={busy} onClick={() => save('read', {})}>새로고침</button></div>
    {error && <p className="work-error" role="alert">{error} <a href="/">사용자 화면</a></p>}
    {feedback && <p className="work-success" role="status">{feedback}</p>}
    {busy && <p role="status">처리 중입니다…</p>}
    {!board && !busy && <button onClick={() => save('read', {})}>다시 불러오기</button>}
    <fieldset disabled={busy}>
    {board && !board.teams.length && <p className="work-empty">배정된 사역팀이 없습니다. 조교에게 확인해 주세요.</p>}
    {board && board.teams.length > 0 && !selected && !creating && <>
      <div className="work-toolbar"><label>사역팀<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{admin ? '모든 사역팀' : '내 사역 전체'}</option>{board.teams.map(item => <option key={item.id} value={item.id}>{item.area} · {item.name}</option>)}</select></label>{manageable.length > 0 && <button className="work-primary" onClick={() => { if (filter === 'all') setFilter(manageable[0].id); setCreating(true); }}>＋ 일정 투표 만들기</button>}</div>
      {admin && <>
        <div className="work-chips" role="group" aria-label="진행 상황 필터">{[['all','전체'],['late','마감 지남'],['pending','미응답 있음'],['ready','응답 완료 · 미확정']].map(([value,label]) => <button key={value} aria-pressed={attention === value} onClick={() => setAttention(value)}>{label}</button>)}</div>
        <div className="work-team-grid">{board.teams.filter(item => filter === 'all' || item.id === filter).filter(item => {
          const polls = board.meetings.filter(poll => poll.team === item.id && poll.status === 'voting');
          if (attention === 'late') return polls.some(closed);
          if (attention === 'pending') return polls.some(poll => Object.keys(poll.votes).length < item.people.length);
          if (attention === 'ready') return polls.some(poll => Object.keys(poll.votes).length === item.people.length);
          return true;
        }).map(item => {
          const polls = board.meetings.filter(poll => poll.team === item.id && poll.status === 'voting');
          const next = board.meetings.filter(poll => poll.team === item.id && poll.status === 'confirmed' && new Date(poll.confirmed + ':00+09:00').getTime() >= Date.now()).sort(byDate)[0];
          return <article className="work-team" key={item.id}><small>{item.area}</small><h3>{item.name}</h3><p className="work-muted">{item.people.length}명 · {item.people.filter(person => person.role !== '팀원').map(person => `${person.role} ${person.name}`).join(' / ')}</p>{polls.length ? polls.map(poll => <button className="work-team-poll" key={poll.id} onClick={() => open(poll.id)}><strong>{poll.title}</strong><span>{Object.keys(poll.votes).length}/{item.people.length}명 · {stateLabel(poll)}</span></button>) : <p className="work-muted">진행 중인 투표 없음</p>}<p>{next ? `다음 모임 · ${timeLabel(next.confirmed, next.minutes)}` : '다음 확정 일정 없음'}</p><button onClick={() => { setFilter(item.id); setAttention('all'); }}>팀 일정 보기</button></article>;
        })}</div>
      </>}
      {lists.map(list => <div className="work-section" key={list.label}><h3>{list.label} <small>{list.items.length}</small></h3>{list.items.length ? list.items.map(card) : <p className="work-empty">등록된 일정이 없습니다.</p>}</div>)}
      <details className="work-section"><summary>취소·보관된 모임 ({visible.filter(item => ['cancelled','archived'].includes(item.status)).length})</summary>{visible.filter(item => ['cancelled','archived'].includes(item.status)).sort(byDate).map(card)}</details>
    </>}
    {creating && <><button onClick={back}>← 일정 목록</button><label>생성할 팀<select value={filter} onChange={e => setFilter(e.target.value)}>{manageable.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><CandidateForm key={filter} team={filter} save={save} done={back} /></>}
    {meeting && team && <>
      <button onClick={back}>← 일정 목록</button>
      <header className="work-detail-head"><span className={'work-tag ' + meeting.status}>{team.area} · {team.name} · {stateLabel(meeting)}</span><h2>{meeting.title}</h2><p>{meeting.description}</p><details><summary>팀원 {team.people.length}명</summary><p>{team.people.map(person => `${person.name}(${person.role})`).join(', ')}</p></details></header>
      {form === 'candidates' ? <CandidateForm meeting={meeting} team={team.id} save={save} done={() => setForm('')} /> : form === 'notice' ? <NoticeForm meeting={meeting} people={team.people} save={save} done={() => setForm('')} /> : <>
        {meeting.status === 'voting' && <>
          <p className="work-muted">마감 · {meeting.deadline ? new Date(meeting.deadline).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미정'}</p>
          {!admin && <VoteForm key={`${meeting.id}-${actor}-${meeting.version}`} meeting={meeting} actor={actor} save={save} />}
          {manager && <div className="work-manager"><h3>일정 관리</h3><p>{meeting.responseCount}/{team.people.length}명 응답</p><p className="work-muted">미응답 · {team.people.filter(person => !meeting.votes[person.id]).map(person => person.name).join(', ') || '없음'}</p><div className="work-actions"><button className="work-primary" onClick={() => setForm('notice')}>결과 확인 · 공지 확정</button><button onClick={() => setForm('candidates')}>후보 수정</button>{!closed(meeting) && <button onClick={() => save('close', { id: meeting.id, version: meeting.version })}>투표 마감</button>}</div>{closed(meeting) && <form onSubmit={async e => { e.preventDefault(); await save('reopen', { id: meeting.id, version: meeting.version, deadline: new Date(reopenUntil).toISOString() }); }}><label>다시 열 투표의 마감<input required type="datetime-local" value={reopenUntil} onChange={e => setReopenUntil(e.target.value)} /></label><button>투표 다시 열기</button></form>}</div>}
        </>}
        {meeting.confirmed && <div className="work-notice"><h3>확정 공지</h3>{meeting.noticeVersion > 1 && <p className="work-warning">수정된 공지 · {new Date(meeting.updatedAt).toLocaleDateString('ko-KR')}</p>}<dl><dt>날짜 / 시간</dt><dd>{timeLabel(meeting.confirmed, meeting.minutes)}</dd><dt>장소</dt><dd>{meeting.place}</dd><dt>전달사항</dt><dd>{meeting.memo || '없음'}</dd><dt>식사</dt><dd>{meeting.mealProvided ? '제공합니다' : '제공하지 않습니다'}</dd></dl></div>}
        {meeting.status === 'confirmed' && !admin && <AttendanceForm key={`${meeting.id}-${actor}-${meeting.version}`} meeting={meeting} actor={actor} save={save} />}
        {manager && meeting.confirmed && <div className="work-manager"><h3>참석 현황</h3><div className="work-chips">{['참석','부분참석','불참'].map(status => <span className="work-badge" key={status}>{status} {Object.values(meeting.rsvps).filter(response => response.status === status).length}명</span>)}<span className="work-badge">미응답 {team.people.filter(person => !meeting.rsvps[person.id]).length}명</span>{meeting.mealProvided && <span className="work-badge">식사 {Object.values(meeting.rsvps).filter(response => response.meal).length}명</span>}</div><div className="work-table-scroll"><table><thead><tr><th>이름</th><th>참석</th><th>사유 / 참석 시작</th>{meeting.mealProvided && <th>식사</th>}</tr></thead><tbody>{team.people.map(person => { const response = meeting.rsvps[person.id]; return <tr key={person.id}><td>{person.name}</td><td>{response?.status || '미응답'}</td><td>{response?.reason || '—'}{response?.arrival && ` / ${response.arrival}부터`}</td>{meeting.mealProvided && <td>{response ? response.meal ? '식사함' : '식사안함' : '—'}</td>}</tr>; })}</tbody></table></div><div className="work-actions"><button onClick={() => copy(shareAttendance(meeting,team))}>참석 현황 복사</button><button onClick={() => copy(`[${team.name}] ${meeting.title}\n\n${timeLabel(meeting.confirmed, meeting.minutes)}\n장소: ${meeting.place}\n${meeting.memo}\n${meeting.mealProvided ? '식사 제공' : ''}\n\n사이트에서 참석 여부를 체크해 주세요.`)}>공지 문구 복사</button>{meeting.status === 'confirmed' && <button onClick={() => setForm('notice')}>공지 수정</button>}</div></div>}
        {manager && meeting.status !== 'archived' && <div className="work-actions work-bottom">{meeting.status !== 'cancelled' && <button onClick={() => { if (confirm('이 모임을 취소로 표시할까요?')) void save('cancel', { id: meeting.id, version: meeting.version }); }}>모임 취소</button>}<button onClick={() => { if (confirm('지난 모임으로 보관할까요?')) void save('archive', { id: meeting.id, version: meeting.version }); }}>보관하기</button></div>}
        {copyText && <label>카톡 공유 내용<textarea readOnly rows={10} value={copyText} onFocus={e => e.currentTarget.select()} /></label>}
      </>}
    </>}
    </fieldset>
  </section>;
}
