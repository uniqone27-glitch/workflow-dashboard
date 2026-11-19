// 06 개발요청: 대시보드 수정·보완·신규 기능·오류 요청 (모든 구성원)
import { S, can, profileName, attachmentsOf, loadTable, ensureUrls } from './store.js?v=202611191840';
import { ROLES } from './constants.js?v=202611191840';
import { $, $$, esc, fmtDate, fmtDateTime, nl, toast, errMsg, options, confirmBox, openModal, debounce } from './ui.js?v=202611191840';
import { openDrawer, findPanel, attachmentBlock, bindAttachments, commentsBlock, bindComments, uploadFiles, isImage } from './detail.js?v=202611191840';

export const DEV_TYPES = ['오류', '수정', '보완', '신규 기능'];
export const DEV_AREAS = ['공통', '통합 대시보드', '패키지 디자인 요청', '촬영 요청', '디자인 작업 요청', '제품 통합 관리', '사용자 · 설정', '기타'];
export const DEV_STATUSES = ['접수', '검토중', '진행중', '완료', '보류'];
const DEV_PRIORITIES = ['긴급', '보통', '낮음'];
const TYPE_CLS = { 오류: 'err', 수정: 'mod', 보완: 'imp', '신규 기능': 'new' };
const STATUS_CLS = { 접수: 'pill-req', 검토중: 'pill-wip', 진행중: 'pill-wip', 완료: 'pill-done', 보류: 'pill-cancel' };

export const devStatusPill = (s) => `<span class="pill ${STATUS_CLS[s] || ''}">${esc(s)}</span>`;
export const devTypeTag = (t) => `<span class="dev-type ${TYPE_CLS[t] || ''}">${esc(t)}</span>`;
const devPriTag = (p) => (p === '긴급' ? '<span class="tag warn">긴급</span>' : p === '낮음' ? '<span class="tag">낮음</span>' : '<span class="muted small">보통</span>');
const devRows = () => S.data.dev_requests || [];
const findDev = (id) => devRows().find((r) => r.id === id);
const isOpenDev = (r) => !['완료', '보류'].includes(r.status);
const canEditDev = (r) => can.admin() || (r.requester_id === S.me.id && r.status === '접수');

// ---------------------------------------------------------------- 목록 화면
export function devReqView(route, el) {
  const f = S.filters.devreq ||= { status: 'open', type: '', area: '', mine: false, q: '' };
  el.innerHTML = `
    <div class="dev-intro card">
      <div><h3>대시보드 개발 요청</h3>
        <p class="muted small">대시보드를 쓰면서 불편한 점, 고쳐야 할 오류, 추가되면 좋을 기능을 자유롭게 요청하세요.
        관리자가 확인한 뒤 진행 상태와 답변을 남기면 🔔·슬랙 DM으로 알려 드립니다. 반영된 내용은 「07 패치노트」에서 확인할 수 있습니다.</p></div>
      <button class="btn btn-primary" data-new-dev>+ 개발 요청하기</button>
    </div>
    <div class="toolbar">
      <div class="seg-ctl" data-seg="status"></div>
      <select class="input" data-f="type">${options(DEV_TYPES, f.type, { empty: '유형 전체' })}</select>
      <select class="input" data-f="area">${options(DEV_AREAS, f.area, { empty: '관련 화면 전체' })}</select>
      <label class="check"><input type="checkbox" data-f="mine" ${f.mine ? 'checked' : ''}><span>내 요청만</span></label>
      <input class="input search" data-f="q" placeholder="번호·제목·내용·요청자 검색" value="${esc(f.q)}">
    </div>
    <div class="card table-card" id="dev-results"></div>`;

  const draw = () => {
    const base = devRows().filter((r) => (!f.type || r.req_type === f.type) && (!f.area || r.area === f.area) && (!f.mine || r.requester_id === S.me.id)
      && (!f.q || [r.code, r.title, r.body, r.answer, profileName(r.requester_id)].join(' ').toLowerCase().includes(f.q.toLowerCase())));
    const segs = [['open', '진행 중', base.filter(isOpenDev).length], ['', '전체', base.length], ...DEV_STATUSES.map((s) => [s, s, base.filter((r) => r.status === s).length])];
    $('[data-seg=status]', el).innerHTML = segs.map(([v, l, n]) => `<button data-status="${esc(v)}" class="${f.status === v ? 'on' : ''}">${esc(l)} <em>${n}</em></button>`).join('');
    $$('[data-status]', el).forEach((b) => b.addEventListener('click', () => { f.status = b.dataset.status; draw(); }));
    const list = base.filter((r) => (f.status === 'open' ? isOpenDev(r) : !f.status || r.status === f.status))
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    const cmt = (id) => S.data.comments.filter((c) => c.entity_type === 'dev' && c.entity_id === id).length;
    $('#dev-results', el).innerHTML = list.length ? `<div class="table-scroll"><table class="table dev-table">
      <thead><tr><th>번호</th><th>유형</th><th>관련 화면</th><th>제목</th><th>요청자</th><th>우선순위</th><th>상태</th><th>요청일</th></tr></thead>
      <tbody>${list.map((r) => `<tr data-dev="${r.id}">
        <td class="mono small">${esc(r.code || '')}</td><td>${devTypeTag(r.req_type)}</td><td class="small">${esc(r.area)}</td>
        <td class="dev-title"><strong>${esc(r.title)}</strong>${cmt(r.id) ? ` <span class="muted small">💬 ${cmt(r.id)}</span>` : ''}${r.answer ? ' <span class="tag new">답변</span>' : ''}</td>
        <td>${esc(profileName(r.requester_id))}</td><td>${devPriTag(r.priority)}</td><td>${devStatusPill(r.status)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty big">${devRows().length ? '조건에 맞는 요청이 없습니다.' : '아직 등록된 개발 요청이 없습니다. 「+ 개발 요청하기」로 첫 요청을 남겨 주세요.'}</p>`;
    $$('[data-dev]', el).forEach((tr) => tr.addEventListener('click', () => openDevRequest(tr.dataset.dev)));
  };
  $$('[data-f]', el).forEach((i) => {
    const h = () => { f[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); draw(); };
    i.addEventListener(i.dataset.f === 'q' ? 'input' : 'change', i.dataset.f === 'q' ? debounce(h, 200) : h);
  });
  $('[data-new-dev]', el).addEventListener('click', () => openDevForm());
  draw();
  el._update = draw;
}

// ---------------------------------------------------------------- 등록 / 수정
export function openDevForm(edit = null) {
  const r = edit || { req_type: '', area: '공통', priority: '보통' };
  let files = [];
  const m = openModal(`
    <form class="dev-form" novalidate>
      <div class="modal-head"><h2>${edit ? `개발 요청 수정 <span class="muted mono small">${esc(edit.code)}</span>` : '개발 요청하기'}</h2><button type="button" class="icon-btn" data-close>✕</button></div>
      <div class="modal-body"><div class="form-grid">
        <div class="field wide"><span>요청 유형 <b class="req">*</b></span>
          <div class="checks">${DEV_TYPES.map((t) => `<label class="check"><input type="radio" name="req_type" value="${t}" ${r.req_type === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
          <small class="muted">오류: 동작이 잘못됨 · 수정: 문구·항목 변경 · 보완: 기존 기능 개선 · 신규 기능: 새로 필요한 기능</small></div>
        <label class="field"><span>관련 화면 <b class="req">*</b></span><select class="input" name="area">${options(DEV_AREAS, r.area)}</select></label>
        <div class="field"><span>우선순위</span><div class="checks">${DEV_PRIORITIES.map((p) => `<label class="check"><input type="radio" name="priority" value="${p}" ${r.priority === p ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div></div>
        <label class="field wide"><span>제목 <b class="req">*</b></span><input class="input" name="title" maxlength="120" value="${esc(r.title || '')}" placeholder="예: 촬영 요청 목록에 촬영 예정일 칸 추가"></label>
        <label class="field wide"><span>요청 내용 <b class="req">*</b></span><textarea class="input" name="body" rows="7" placeholder="어느 화면에서, 무엇을, 어떻게 바꾸면 좋을지 적어 주세요.\n오류라면 어떤 순서로 했을 때 어떤 문제가 생기는지 함께 적어 주세요.">${esc(r.body || '')}</textarea></label>
        ${edit ? '' : `<div class="field wide"><span>화면 캡처 · 참고 파일</span>
          <label class="dropzone"><input type="file" multiple data-dev-files><span>파일 선택 (여러 개 가능)</span></label><div class="file-list" data-dev-list></div></div>`}
      </div></div>
      <div class="modal-foot"><span class="muted small">${edit ? '' : '등록하면 관리자에게 알림이 갑니다.'}</span><div class="grow"></div>
        <button type="button" class="btn" data-close>취소</button><button class="btn btn-primary">${edit ? '저장' : '요청 등록'}</button></div>
    </form>`, { wide: true });
  const form = $('form', m.el);
  form.addEventListener('input', () => form.classList.add('dirty'));
  const drawFiles = () => {
    const box = $('[data-dev-list]', form);
    if (!box) return;
    box.innerHTML = files.map((fl, i) => `<span class="file-chip">${esc(fl.name)}<button type="button" class="chip-x" data-rm="${i}" title="삭제">✕</button></span>`).join('');
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { files.splice(+b.dataset.rm, 1); drawFiles(); }));
  };
  $('[data-dev-files]', form)?.addEventListener('change', (e) => { files = files.concat([...e.target.files]); e.target.value = ''; drawFiles(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = {
      req_type: form.req_type.value, area: form.area.value, priority: form.priority.value || '보통',
      title: form.title.value.trim(), body: form.body.value.trim(),
    };
    const missing = [!v.req_type && '요청 유형', !v.title && '제목', !v.body && '요청 내용'].filter(Boolean);
    if (missing.length) return toast(`필수 항목을 입력하세요: ${missing.join(', ')}`, 'error');
    const btn = $('.btn-primary', form);
    btn.disabled = true;
    try {
      if (edit) {
        await S.db.update('dev_requests', { id: edit.id }, v);
        await loadTable('dev_requests');
        toast('저장했습니다.');
      } else {
        const [row] = await S.db.insert('dev_requests', v);
        if (files.length) await uploadFiles('dev', row.id, 'file', files);
        await loadTable('dev_requests');
        toast(`개발 요청을 등록했습니다. (${row.code || ''})`);
        form.classList.remove('dirty');
        m.close();
        S.hooks.rerender();
        openDevRequest(row.id);
        return;
      }
      form.classList.remove('dirty');
      m.close();
      S.hooks.rerender();
    } catch (err) { toast(errMsg(err), 'error'); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- 상세
export function openDevRequest(id) {
  const ex = findPanel(`dev:${id}`);
  if (ex) { ex.wrap.parentNode.appendChild(ex.wrap); return; }
  const panel = openDrawer((pn) => renderDev(pn, id));
  panel.key = `dev:${id}`;
}

function renderDev(panel, id) {
  const el = panel.el;
  const r = findDev(id);
  const rerender = () => { const t = el.scrollTop; renderDev(panel, id); el.scrollTop = t; };
  if (!r) {
    el.innerHTML = `<div class="drawer-head"><h2>요청을 찾을 수 없습니다</h2><button class="icon-btn" data-x>✕</button></div><p class="pad muted">삭제되었거나 권한이 없습니다.</p>`;
    $('[data-x]', el).onclick = panel.close;
    return;
  }
  const mine = r.requester_id === S.me.id;
  const admin = can.admin();
  const reqRole = ROLES[S.data.profiles.find((p) => p.id === r.requester_id)?.role] || '';
  el.innerHTML = `
    <div class="drawer-head">
      <div><div class="muted small">개발요청 · <span class="mono">${esc(r.code || '')}</span></div>
        <h2>${esc(r.title)}</h2>
        <div class="row gap-sm">${devStatusPill(r.status)} ${devTypeTag(r.req_type)} ${devPriTag(r.priority)} <span class="muted small">${esc(r.area)}</span></div>
      </div>
      <button class="icon-btn" data-x title="닫기">✕</button>
    </div>
    <div class="stale-note" hidden>다른 사용자가 이 요청을 수정했습니다. <button class="btn-link" data-reload>최신 내용 보기</button></div>
    ${canEditDev(r) ? `<div class="drawer-actions"><button class="btn btn-sm" data-edit>내용 수정</button>
      <button class="btn btn-sm btn-danger-ghost" data-del>요청 삭제</button>
      ${!admin ? '<span class="muted small">관리자가 확인을 시작하면 수정할 수 없습니다.</span>' : ''}</div>` : ''}

    <section class="section">
      <h3>요청 정보</h3>
      <dl class="fields">
        <div><dt>요청자</dt><dd>${esc(profileName(r.requester_id))}${reqRole ? ` <span class="muted small">${esc(reqRole)}</span>` : ''}</dd></div>
        <div><dt>요청일</dt><dd>${fmtDateTime(r.created_at)}</dd></div>
        <div><dt>요청 유형</dt><dd>${esc(r.req_type)}</dd></div>
        <div><dt>관련 화면</dt><dd>${esc(r.area)}</dd></div>
        <div class="wide"><dt>요청 내용</dt><dd>${nl(r.body)}</dd></div>
      </dl>
      ${attachmentBlock('dev', id, ['file'], { title: '화면 캡처 · 참고 파일', uploadKind: mine || admin ? 'file' : null })}
    </section>

    <section class="section work">
      <h3>관리자 처리</h3>
      ${admin ? `<form class="dev-admin">
        <div class="status-pick">${DEV_STATUSES.map((s) => `<label><input type="radio" name="status" value="${s}" ${r.status === s ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div>
        <label class="field"><span>답변 · 처리 내용 <small class="muted">요청자에게 알림이 갑니다</small></span>
          <textarea class="input" name="answer" rows="4" placeholder="검토 결과, 반영 예정 시기, 보류 사유 등">${esc(r.answer || '')}</textarea></label>
        <div class="row"><span class="muted small">${r.status_changed_at ? `상태 변경: ${esc(profileName(r.status_changed_by))} · ${fmtDateTime(r.status_changed_at)}` : ''}</span><div class="grow"></div><button class="btn btn-primary">처리 내용 저장</button></div>
      </form>` : `<dl class="fields">
        <div><dt>진행 상태</dt><dd>${devStatusPill(r.status)}</dd></div>
        <div><dt>상태 변경</dt><dd>${r.status_changed_at ? `${esc(profileName(r.status_changed_by))} · ${fmtDateTime(r.status_changed_at)}` : '-'}</dd></div>
        <div class="wide"><dt>관리자 답변</dt><dd>${r.answer ? nl(r.answer) : '<span class="muted">아직 답변이 없습니다.</span>'}</dd></div>
      </dl>`}
    </section>

    ${commentsBlock('dev', id)}`;

  $('[data-x]', el).onclick = panel.close;
  $('[data-reload]', el)?.addEventListener('click', () => { $$('.dirty', el).forEach((d) => d.classList.remove('dirty')); rerender(); });
  $('[data-edit]', el)?.addEventListener('click', () => openDevForm(r));
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`${r.code} 개발 요청을 삭제합니다. 되돌릴 수 없습니다.`, { danger: true, ok: '삭제' }))) return;
    try {
      for (const a of attachmentsOf('dev', id).filter((a) => a.uploaded_by === S.me.id || admin)) {
        await S.db.remove('attachments', { id: a.id }).catch(() => {});
        await S.db.removeFile(a.storage_path).catch(() => {});
      }
      await S.db.remove('dev_requests', { id });
      await Promise.all(['dev_requests', 'attachments'].map(loadTable));
      toast('삭제했습니다.');
      panel.close();
      S.hooks.rerender();
    } catch (e) { toast(errMsg(e), 'error'); }
  });
  const af = $('.dev-admin', el);
  if (af) {
    af.addEventListener('input', () => af.classList.add('dirty'));
    af.addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {};
      const st = af.status.value;
      const ans = af.answer.value.trim() || null;
      if (st !== r.status) patch.status = st;
      if (ans !== (r.answer || null)) patch.answer = ans;
      if (!Object.keys(patch).length) return toast('변경된 내용이 없습니다.');
      try {
        await S.db.update('dev_requests', { id }, patch);
        await loadTable('dev_requests');
        af.classList.remove('dirty');
        toast('저장했습니다. 요청자에게 알림이 갑니다.');
        rerender();
        S.hooks.rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  }
  bindAttachments(el, rerender);
  bindComments(el, rerender);
  const imgs = attachmentsOf('dev', id).filter(isImage).map((a) => a.storage_path);
  if (imgs.some((p) => !S.urls[p])) ensureUrls(imgs).then(() => { if (!panel._imgOnce) { panel._imgOnce = true; rerender(); } });
}
