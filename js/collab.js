// 02 협업 요청: 촬영·기타 업무를 위해 물류/발주팀 구성원에게 시간 협업을 요청
import { S, can, profileName, loadTable } from './store.js?v=202611231257';
import { ROLES } from './constants.js?v=202611231257';
import { $, $$, esc, fmtDate, fmtDateTime, nl, toast, errMsg, options, confirmBox, openModal, debounce, today } from './ui.js?v=202611231257';
import { openDrawer, findPanel, commentsBlock, bindComments } from './detail.js?v=202611231257';

export const COLLAB_PURPOSES = ['촬영 지원', '제품 세팅·이동', '입고·검수 지원', '샘플 확인', '기타'];
export const COLLAB_STATUSES = ['요청', '수락', '완료', '반려'];
const PLACES = ['쇼룸', '물류창고', '사무실', '외부 스튜디오'];
const STATUS_CLS = { 요청: 'pill-req', 수락: 'pill-wip', 완료: 'pill-done', 반려: 'pill-cancel' };

export const collabStatusPill = (s) => `<span class="pill ${STATUS_CLS[s] || ''}">${esc(s)}</span>`;
const rows = () => S.data.collab_requests || [];
const findCollab = (id) => rows().find((r) => r.id === id);
const isOpen = (r) => ['요청', '수락'].includes(r.status);
export const canProcessCollab = () => ['admin', 'logistics'].includes(S.me?.role);
const canEdit = (r) => can.admin() || (r.requester_id === S.me.id && r.status === '요청');
const purposeText = (r) => (r.purpose === '기타' && r.purpose_etc ? `기타 (${r.purpose_etc})` : r.purpose || '');
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const timeText = (r) => (r.time_start || r.time_end ? `${hhmm(r.time_start) || '?'} ~ ${hhmm(r.time_end) || '?'}` : '');
const deptOf = (uid) => ROLES[S.data.profiles.find((p) => p.id === uid)?.role] || '';
const assigneeText = (r) => (r.assignee_ids || []).map(profileName).join(', ');
// 담당자 후보: 물류/발주팀 구성원 (+ 이미 배정된 사람)
const logisticsMembers = (cur = []) => {
  const list = S.data.profiles.filter((p) => p.active && p.role === 'logistics').map((p) => [p.id, p.name]);
  cur.filter((id) => !list.some(([x]) => x === id)).forEach((id) => list.push([id, profileName(id)]));
  return list;
};

// ---------------------------------------------------------------- 목록
export function collabView(route, el) {
  const f = S.filters.collab ||= { status: 'open', purpose: '', mine: false, assigned: false, q: '' };
  el.innerHTML = `
    <div class="dev-intro card">
      <div><h3>물류/발주팀 협업 요청</h3>
        <p class="muted small">촬영·기타 업무에 물류/발주팀의 시간 협업이 필요할 때 요청하세요. 「요청 받는 자」를 고르면 그 사람에게, 고르지 않으면 물류/발주팀 전체에 🔔·슬랙 DM 알림이 가고,
        담당자가 배정·수락되면 요청자에게 알려 드립니다.</p></div>
      <button class="btn btn-primary" data-new-collab>+ 협업 요청하기</button>
    </div>
    <div class="toolbar">
      <div class="seg-ctl" data-seg="status"></div>
      <select class="input" data-f="purpose">${options(COLLAB_PURPOSES, f.purpose, { empty: '협업 목적 전체' })}</select>
      <label class="check"><input type="checkbox" data-f="mine" ${f.mine ? 'checked' : ''}><span>내 요청만</span></label>
      <label class="check"><input type="checkbox" data-f="assigned" ${f.assigned ? 'checked' : ''}><span>내 담당만</span></label>
      <input class="input search" data-f="q" placeholder="목적·이유·장소·요청자 검색" value="${esc(f.q)}">
    </div>
    <div class="card table-card" id="collab-results"></div>`;

  const draw = () => {
    const q = f.q.toLowerCase();
    const base = rows().filter((r) => (!f.purpose || r.purpose === f.purpose)
      && (!f.mine || r.requester_id === S.me.id) && (!f.assigned || (r.assignee_ids || []).includes(S.me.id))
      && (!q || [r.code, purposeText(r), r.reason, r.location, r.response, profileName(r.requester_id), assigneeText(r)].join(' ').toLowerCase().includes(q)));
    const segs = [['open', '진행 중', base.filter(isOpen).length], ['', '전체', base.length], ...COLLAB_STATUSES.map((s) => [s, s, base.filter((r) => r.status === s).length])];
    $('[data-seg=status]', el).innerHTML = segs.map(([v, l, n]) => `<button data-status="${esc(v)}" class="${f.status === v ? 'on' : ''}">${esc(l)} <em>${n}</em></button>`).join('');
    $$('[data-status]', el).forEach((b) => b.addEventListener('click', () => { f.status = b.dataset.status; draw(); }));
    // 요청 일자 가까운 순 (같은 날은 시작 시간 순)
    const list = base.filter((r) => (f.status === 'open' ? isOpen(r) : !f.status || r.status === f.status))
      .sort((a, b) => (`${a.req_date}${a.time_start || ''}` > `${b.req_date}${b.time_start || ''}` ? 1 : -1));
    const dash = '<span class="muted">-</span>';
    $('#collab-results', el).innerHTML = list.length ? `<div class="table-scroll"><table class="table collab-table">
      <thead><tr><th>협업 목적</th><th>협업 이유</th><th>요청 일자</th><th>요청 시간</th><th>장소</th><th>요청부서</th><th>요청자</th><th>담당자</th><th>상태</th></tr></thead>
      <tbody>${list.map((r) => `<tr data-collab="${r.id}" class="${r.req_date < today() && isOpen(r) ? 'hl' : ''}">
        <td><strong>${esc(purposeText(r))}</strong></td>
        <td class="collab-reason">${esc(r.reason || '')}</td>
        <td>${fmtDate(r.req_date)}</td>
        <td>${timeText(r) ? esc(timeText(r)) : dash}</td>
        <td>${r.location ? esc(r.location) : dash}</td>
        <td>${esc(deptOf(r.requester_id))}</td>
        <td>${esc(profileName(r.requester_id))}</td>
        <td>${assigneeText(r) ? esc(assigneeText(r)) : '<span class="muted">미배정</span>'}</td>
        <td>${collabStatusPill(r.status)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty big">${rows().length ? '조건에 맞는 협업 요청이 없습니다.' : '아직 등록된 협업 요청이 없습니다. 「+ 협업 요청하기」로 요청해 주세요.'}</p>`;
    $$('[data-collab]', el).forEach((tr) => tr.addEventListener('click', () => openCollab(tr.dataset.collab)));
  };
  $$('[data-f]', el).forEach((i) => {
    const h = () => { f[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); draw(); };
    i.addEventListener(i.dataset.f === 'q' ? 'input' : 'change', i.dataset.f === 'q' ? debounce(h, 200) : h);
  });
  $('[data-new-collab]', el).addEventListener('click', () => openCollabForm());
  draw();
  el._update = draw;
}

// ---------------------------------------------------------------- 등록 / 수정
export function openCollabForm(edit = null) {
  const r = edit || { purpose: '', req_date: '', location: '' };
  const wid = edit ? edit.requester_id : S.me.id;
  const m = openModal(`
    <form class="dev-form collab-form" novalidate>
      <div class="modal-head"><h2>${edit ? `협업 요청 수정 <span class="muted mono small">${esc(edit.code || '')}</span>` : '협업 요청하기'}</h2><button type="button" class="icon-btn" data-close>✕</button></div>
      <div class="modal-body"><div class="form-grid">
        <label class="field"><span>요청자</span><input class="input" value="${esc(profileName(wid))}" readonly></label>
        <label class="field"><span>요청부서</span><input class="input" value="${esc(deptOf(wid))}" readonly></label>
        <label class="field"><span>협업 목적 <b class="req">*</b></span><select class="input" name="purpose">${options(COLLAB_PURPOSES, r.purpose, { empty: '선택' })}</select></label>
        <label class="field"><span>직접 입력(기타 선택 시)</span><input class="input" name="purpose_etc" value="${esc(r.purpose_etc || '')}" placeholder="기타 목적"></label>
        <label class="field wide"><span>협업 이유 <b class="req">*</b></span><textarea class="input" name="reason" rows="4" placeholder="어떤 업무에 어떤 도움이 필요한지 적어 주세요. 예: 신제품 소파 촬영을 위해 창고에서 쇼룸으로 제품 이동 및 세팅 필요">${esc(r.reason || '')}</textarea></label>
        <label class="field"><span>요청 일자 <b class="req">*</b></span><input class="input" type="date" name="req_date" value="${esc(r.req_date || '')}"></label>
        <div class="field"><span>요청 시간</span><div class="row gap-sm time-range">
          <input class="input" type="time" name="time_start" value="${esc(hhmm(r.time_start))}"><span class="muted">~</span>
          <input class="input" type="time" name="time_end" value="${esc(hhmm(r.time_end))}"></div></div>
        <label class="field wide"><span>장소</span><input class="input" name="location" list="collab-places" value="${esc(r.location || '')}" placeholder="예: 쇼룸, 물류창고, 외부 스튜디오">
          <datalist id="collab-places">${PLACES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
        <div class="field wide"><span>요청 받는 자 <small class="muted">물류/발주팀에서 여러 명 선택 가능 · 선택한 사람에게만 알림 (선택하지 않으면 물류/발주팀 전체)</small></span>
          <div class="checks assignee-pick">${logisticsMembers(r.assignee_ids || []).map(([pid, name]) => `<label class="check"><input type="checkbox" data-recipient value="${esc(pid)}" ${(r.assignee_ids || []).includes(pid) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('') || '<span class="muted small">물류/발주팀 구성원이 없습니다.</span>'}</div></div>
      </div></div>
      <div class="modal-foot"><span class="muted small">${edit ? '' : '등록하면 요청 받는 자(선택하지 않으면 물류/발주팀 전체)에게 알림이 갑니다.'}</span><div class="grow"></div>
        <button type="button" class="btn" data-close>취소</button><button class="btn btn-primary">${edit ? '저장' : '요청 등록'}</button></div>
    </form>`, { wide: true });
  const form = $('form', m.el);
  form.addEventListener('input', () => form.classList.add('dirty'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = {
      purpose: form.purpose.value, purpose_etc: form.purpose_etc.value.trim() || null,
      reason: form.reason.value.trim(), req_date: form.req_date.value || null,
      time_start: form.time_start.value || null, time_end: form.time_end.value || null,
      location: form.location.value.trim() || null,
      assignee_ids: $$('[data-recipient]', form).filter((c) => c.checked).map((c) => c.value),
    };
    const missing = [!v.purpose && '협업 목적', v.purpose === '기타' && !v.purpose_etc && '직접 입력(기타)', !v.reason && '협업 이유', !v.req_date && '요청 일자'].filter(Boolean);
    if (missing.length) return toast(`필수 항목을 입력하세요: ${missing.join(', ')}`, 'error');
    if (v.time_start && v.time_end && v.time_end <= v.time_start) return toast('요청 시간의 끝 시간이 시작 시간보다 늦어야 합니다.', 'error');
    const btn = $('.btn-primary', form);
    btn.disabled = true;
    try {
      if (edit) {
        await S.db.update('collab_requests', { id: edit.id }, v);
        await loadTable('collab_requests');
        toast('저장했습니다.');
      } else {
        const [row] = await S.db.insert('collab_requests', v);
        await loadTable('collab_requests');
        toast('협업 요청을 등록했습니다. 물류/발주팀에 알림이 갑니다.');
        form.classList.remove('dirty');
        m.close();
        S.hooks.rerender();
        openCollab(row.id);
        return;
      }
      form.classList.remove('dirty');
      m.close();
      S.hooks.rerender();
    } catch (err) { toast(errMsg(err), 'error'); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- 상세
export function openCollab(id) {
  const ex = findPanel(`collab:${id}`);
  if (ex) { ex.wrap.parentNode.appendChild(ex.wrap); return; }
  const panel = openDrawer((pn) => renderCollab(pn, id));
  panel.key = `collab:${id}`;
}

function renderCollab(panel, id) {
  const el = panel.el;
  const r = findCollab(id);
  const rerender = () => { const t = el.scrollTop; renderCollab(panel, id); el.scrollTop = t; };
  if (!r) {
    el.innerHTML = `<div class="drawer-head"><h2>요청을 찾을 수 없습니다</h2><button class="icon-btn" data-x>✕</button></div><p class="pad muted">삭제되었거나 권한이 없습니다.</p>`;
    $('[data-x]', el).onclick = panel.close;
    return;
  }
  const proc = canProcessCollab();
  el.innerHTML = `
    <div class="drawer-head">
      <div><div class="muted small">협업 요청 · <span class="mono">${esc(r.code || '')}</span></div>
        <h2>${esc(purposeText(r))}</h2>
        <div class="row gap-sm">${collabStatusPill(r.status)} <span class="muted small">${fmtDate(r.req_date)}${timeText(r) ? ` · ${esc(timeText(r))}` : ''}${r.location ? ` · ${esc(r.location)}` : ''}</span></div>
      </div>
      <button class="icon-btn" data-x title="닫기">✕</button>
    </div>
    <div class="stale-note" hidden>다른 사용자가 이 요청을 수정했습니다. <button class="btn-link" data-reload>최신 내용 보기</button></div>
    ${canEdit(r) ? `<div class="drawer-actions"><button class="btn btn-sm" data-edit>내용 수정</button>
      <button class="btn btn-sm btn-danger-ghost" data-del>요청 삭제</button>
      ${!can.admin() ? '<span class="muted small">물류/발주팀이 수락하면 수정할 수 없습니다. 변경 사항은 댓글로 남겨 주세요.</span>' : ''}</div>` : ''}

    <section class="section">
      <h3>요청 정보</h3>
      <dl class="fields">
        <div><dt>협업 목적</dt><dd>${esc(purposeText(r))}</dd></div>
        <div><dt>요청 일자</dt><dd>${fmtDate(r.req_date)}</dd></div>
        <div><dt>요청 시간</dt><dd>${esc(timeText(r) || '-')}</dd></div>
        <div><dt>장소</dt><dd>${esc(r.location || '-')}</dd></div>
        <div><dt>요청부서</dt><dd>${esc(deptOf(r.requester_id))}</dd></div>
        <div><dt>요청자</dt><dd>${esc(profileName(r.requester_id))} <span class="muted small">${fmtDateTime(r.created_at)}</span></dd></div>
        <div><dt>요청 받는 자</dt><dd>${esc(assigneeText(r) || '물류/발주팀 전체')}</dd></div>
        <div class="wide"><dt>협업 이유</dt><dd>${nl(r.reason)}</dd></div>
      </dl>
    </section>

    <section class="section work">
      <h3>물류/발주팀 처리</h3>
      ${proc ? `<form class="collab-proc">
        <div class="status-pick">${COLLAB_STATUSES.map((s) => `<label><input type="radio" name="status" value="${s}" ${r.status === s ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div>
        <div class="field"><span>담당자 (요청 받는 자) <small class="muted">여러 명 선택 가능 · 새로 배정된 사람에게 알림</small></span>
          <div class="checks assignee-pick">${logisticsMembers(r.assignee_ids || []).map(([pid, name]) => `<label class="check"><input type="checkbox" data-assignee value="${esc(pid)}" ${(r.assignee_ids || []).includes(pid) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('') || '<span class="muted small">물류/발주팀 구성원이 없습니다.</span>'}</div></div>
        <label class="field"><span>처리 메모 · 답변 <small class="muted">요청자에게 알림이 갑니다</small></span>
          <textarea class="input" name="response" rows="3" placeholder="예: 11/25 10시 김물류 지원 예정, 반려 사유 등">${esc(r.response || '')}</textarea></label>
        <div class="row"><span class="muted small">${r.status_changed_at ? `상태 변경: ${esc(profileName(r.status_changed_by))} · ${fmtDateTime(r.status_changed_at)}` : ''}</span><div class="grow"></div><button class="btn btn-primary">처리 내용 저장</button></div>
      </form>` : `<dl class="fields">
        <div><dt>진행 상태</dt><dd>${collabStatusPill(r.status)}</dd></div>
        <div><dt>담당자</dt><dd>${esc(assigneeText(r) || '미배정')}</dd></div>
        <div class="wide"><dt>처리 메모 · 답변</dt><dd>${r.response ? nl(r.response) : '<span class="muted">아직 답변이 없습니다.</span>'}</dd></div>
      </dl>`}
    </section>

    ${commentsBlock('collab', id)}`;

  $('[data-x]', el).onclick = panel.close;
  $('[data-reload]', el)?.addEventListener('click', () => { $$('.dirty', el).forEach((d) => d.classList.remove('dirty')); rerender(); });
  $('[data-edit]', el)?.addEventListener('click', () => openCollabForm(r));
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`${r.code || ''} 협업 요청을 삭제합니다. 되돌릴 수 없습니다.`, { danger: true, ok: '삭제' }))) return;
    try {
      await S.db.remove('collab_requests', { id });
      await loadTable('collab_requests');
      toast('삭제했습니다.');
      panel.close();
      S.hooks.rerender();
    } catch (e) { toast(errMsg(e), 'error'); }
  });
  const pf = $('.collab-proc', el);
  if (pf) {
    pf.addEventListener('input', () => pf.classList.add('dirty'));
    pf.addEventListener('change', () => pf.classList.add('dirty'));
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {};
      const st = pf.status.value;
      const ids = $$('[data-assignee]', pf).filter((c) => c.checked).map((c) => c.value);
      const resp = pf.response.value.trim() || null;
      if (st !== r.status) patch.status = st;
      if (ids.join() !== (r.assignee_ids || []).join()) patch.assignee_ids = ids;
      if (resp !== (r.response || null)) patch.response = resp;
      if (!Object.keys(patch).length) return toast('변경된 내용이 없습니다.');
      try {
        await S.db.update('collab_requests', { id }, patch);
        await loadTable('collab_requests');
        pf.classList.remove('dirty');
        toast('저장했습니다. 요청자에게 알림이 갑니다.');
        rerender();
        S.hooks.rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  }
  bindComments(el, rerender);
}
