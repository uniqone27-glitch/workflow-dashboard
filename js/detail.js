import { S, can, findRequest, product, pname, productImages, attachmentsOf, profileName, brandName, launchOf, designers,
  requestTitle, requestType, requests, isOverdue, ensureUrls, loadTable } from './store.js';
import { KINDS, ROLES, STATUSES, NEED_STATES, LAUNCH_STATES, COMMON_SPECS, CATEGORY_SPECS, FIELD_LABELS, specLabel } from './constants.js';
import { $, $$, esc, fmtDate, fmtDateTime, timeAgo, linkify, nl, statusPill, priorityTag, toast, errMsg, options, confirmBox, fileSize, readForm } from './ui.js';
import { openRequestForm, openProductForm } from './forms.js';
import { launchSummary, progCell, histText } from './views.js';

const panels = [];   // 열린 상세 패널 목록 (실시간 갱신 대상)

function openDrawer(render, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'drawer-backdrop';
  wrap.innerHTML = `<aside class="drawer ${wide ? 'drawer-wide' : ''}"></aside>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const el = wrap.firstElementChild;
  const panel = { el, wrap, render, close };
  function close() {
    wrap.remove();
    panels.splice(panels.indexOf(panel), 1);
    if (!document.querySelector('.modal-backdrop, .drawer-backdrop')) document.body.classList.remove('no-scroll');
  }
  wrap.addEventListener('click', (e) => { if (e.target === wrap && !el.querySelector('.dirty')) close(); });
  panels.push(panel);
  render(panel);
  return panel;
}

export function closeAllPanels() {
  [...panels].forEach((p) => p.close());
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
  document.body.classList.remove('no-scroll');
}

// 다른 사용자의 변경이 들어오면 열려 있는 상세 화면을 갱신 (작성 중인 입력이 있으면 안내만 표시)
export function refreshOpenPanels() {
  panels.forEach((p) => {
    if (p.el.querySelector('.dirty') || p.el.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) {
      const note = p.el.querySelector('.stale-note');
      if (note) note.hidden = false;
    } else {
      const top = p.el.scrollTop;
      p.render(p);
      p.el.scrollTop = top;
    }
  });
}

// ---------------------------------------------------------------- 파일 업로드 공통
export async function uploadFiles(entity, entityId, kind, files) {
  const out = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const path = `${entity}/${entityId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await S.db.upload(path, file);
    try {
      const [row] = await S.db.insert('attachments', { entity_type: entity, entity_id: entityId, kind, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
      out.push(row);
    } catch (e) {
      await S.db.removeFile(path).catch(() => {});
      throw e;
    }
  }
  await loadTable('attachments');
  await ensureUrls(out.map((a) => a.storage_path));
  return out;
}

export const zoomImg = (a, cls = '') => `<img class="${cls}" src="${esc(S.urls[a.storage_path])}" alt="" loading="lazy" data-zoom data-path="${esc(a.storage_path)}" data-name="${esc(a.file_name)}">`;

// 제품 이미지 갤러리: 대표 이미지 + 나머지 썸네일, 모두 클릭하면 확대
export function productGallery(pid) {
  const imgs = productImages(pid).filter((a) => S.urls[a.storage_path]);
  if (!imgs.length) return '<span class="thumb empty lg"></span>';
  const rest = imgs.slice(1, 9);
  return `<div class="gallery" data-gallery>${zoomImg(imgs[0], 'g-main')}
    ${rest.length ? `<div class="g-strip">${rest.map((a) => zoomImg(a)).join('')}</div>` : ''}
    ${imgs.length > 1 ? `<span class="g-more">이미지 ${imgs.length}장 · 클릭해 확대</span>` : '<span class="g-more">클릭해 확대</span>'}</div>`;
}

const isImage = (a) => /^image\//.test(a.mime_type || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.file_name);

function attachmentBlock(entity, id, kinds, { title, uploadKind, empty = '첨부된 파일이 없습니다.' }) {
  const list = attachmentsOf(entity, id).filter((a) => kinds.includes(a.kind));
  const canUp = uploadKind && can.attach(entity, uploadKind);
  return `<div class="att-block" data-att="${entity}:${id}:${uploadKind || ''}">
    <div class="sub-head"><h4>${title}</h4>${canUp ? `<label class="btn btn-sm">파일 추가<input type="file" multiple hidden data-upload></label>` : ''}</div>
    ${list.length ? `<div class="att-grid" data-gallery>${list.map((a) => `
      <div class="att">
        ${isImage(a) && S.urls[a.storage_path] ? zoomImg(a) : `<div class="att-file">${esc((a.file_name.split('.').pop() || '').toUpperCase())}</div>`}
        <div class="att-meta"><button class="btn-link" data-dl="${esc(a.storage_path)}" data-name="${esc(a.file_name)}">${esc(a.file_name)}</button>
          <small>${fileSize(a.size_bytes)} · ${esc(profileName(a.uploaded_by))}</small>
          ${a.uploaded_by === S.me.id || can.admin() ? `<button class="btn-link danger small" data-del-att="${a.id}" data-path="${esc(a.storage_path)}">삭제</button>` : ''}</div>
      </div>`).join('')}</div>` : `<p class="muted small">${empty}</p>`}
  </div>`;
}

function bindAttachments(el, rerender) {
  $$('.att-block', el).forEach((block) => {
    const [entity, id, kind] = block.dataset.att.split(':');
    $('[data-upload]', block)?.addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      toast('업로드 중…');
      try { await uploadFiles(entity, id, kind, files); toast('업로드했습니다.'); rerender(); } catch (err) { toast(errMsg(err), 'error'); }
    });
  });
  $$('[data-dl]', el).forEach((b) => b.addEventListener('click', async () => {
    try { window.open(await S.db.downloadUrl(b.dataset.dl, b.dataset.name), '_blank'); } catch (e) { toast(errMsg(e), 'error'); }
  }));
  $$('[data-del-att]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('이 파일을 삭제할까요?', { danger: true, ok: '삭제' }))) return;
    try {
      await S.db.remove('attachments', { id: b.dataset.delAtt });
      await S.db.removeFile(b.dataset.path).catch(() => {});
      await loadTable('attachments');
      rerender();
    } catch (e) { toast(errMsg(e), 'error'); }
  }));
}

// ---------------------------------------------------------------- 댓글 / 이력
function commentsBlock(entity, id, { allowCorrection = false } = {}) {
  const list = S.data.comments.filter((c) => c.entity_type === entity && c.entity_id === id).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  return `<section class="section" data-comments="${entity}:${id}">
    <h3>협업 댓글 <span class="muted small">${list.length}</span></h3>
    <div class="comments">${list.map((c) => `
      <div class="comment ${c.kind === 'correction' ? 'correction' : ''}">
        <div class="c-head"><strong>${esc(profileName(c.author_id))}</strong><span class="muted small">${esc(ROLES[S.data.profiles.find((p) => p.id === c.author_id)?.role] || '')} · ${fmtDateTime(c.created_at)}</span>
          ${c.kind === 'correction' ? '<span class="tag warn">정보 수정 요청</span>' : ''}
          ${c.author_id === S.me.id || can.admin() ? `<button class="btn-link danger small" data-del-c="${c.id}">삭제</button>` : ''}</div>
        <p>${nl(c.body)}</p>
      </div>`).join('') || '<p class="muted small">아직 댓글이 없습니다.</p>'}</div>
    <form class="comment-form">
      <textarea class="input" name="body" rows="2" placeholder="요청 부서·디자인팀에 남길 내용을 입력하세요" required></textarea>
      <div class="row gap">
        ${allowCorrection ? '<label class="check"><input type="checkbox" name="correction"><span>제품 정보 수정 요청으로 등록 (물류/발주팀 알림)</span></label>' : ''}
        <div class="grow"></div><button class="btn btn-primary btn-sm">등록</button></div>
    </form>
  </section>`;
}
function bindComments(el, rerender) {
  $$('[data-comments]', el).forEach((sec) => {
    const [entity, id] = sec.dataset.comments.split(':');
    const form = $('form', sec);
    form.body.addEventListener('input', () => form.classList.toggle('dirty', !!form.body.value.trim()));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) return;
      try {
        await S.db.insert('comments', { entity_type: entity, entity_id: id, body, kind: form.correction?.checked ? 'correction' : 'comment' });
        form.classList.remove('dirty');
        await loadTable('comments');
        rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  });
  $$('[data-del-c]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('댓글을 삭제할까요?', { danger: true, ok: '삭제' }))) return;
    try { await S.db.remove('comments', { id: b.dataset.delC }); await loadTable('comments'); rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  }));
}

function fmtVal(k, v) {
  if (v === null || v === undefined || v === '') return '(없음)';
  if (k.endsWith('_id') && typeof v === 'string' && k !== 'product_id' && k !== 'shoot_request_id') return profileName(v);
  if (k === 'brand_id') return brandName(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? Object.values(x).filter(Boolean).join('/') : x)).join(', ') || '(없음)';
  if (typeof v === 'object') return Object.entries(v).filter(([, x]) => x).map(([a, b]) => `${specLabel(a)}: ${b}`).join(', ');
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  return String(v);
}

async function loadHistory(container, entity, id) {
  try {
    const rows = await S.db.list('history', { eq: { entity_type: entity, entity_id: id }, limit: 200 });
    container.innerHTML = rows.length ? `<ol class="timeline">${rows.map((h) => `
      <li><div class="t-head"><strong>${esc(histText(h))}</strong><span class="muted small">${esc(profileName(h.actor_id))} · ${fmtDateTime(h.created_at)}</span></div>
        ${h.action !== 'create' && h.action !== 'delete' ? `<ul class="t-changes">${Object.entries(h.changes || {}).map(([k, c]) => `
          <li><span>${esc(FIELD_LABELS[k] || k)}</span> ${esc(fmtVal(k, c.from))} → <b>${esc(fmtVal(k, c.to))}</b></li>`).join('')}</ul>` : ''}
      </li>`).join('')}</ol>` : '<p class="muted small">이력이 없습니다.</p>';
  } catch (e) { container.innerHTML = `<p class="muted small">${esc(errMsg(e))}</p>`; }
}

function fields(rows) {
  return `<dl class="fields">${rows.filter(Boolean).map(([k, v, wide]) => `<div class="${wide ? 'wide' : ''}"><dt>${k}</dt><dd>${v === '' || v === null || v === undefined ? '-' : v}</dd></div>`).join('')}</dl>`;
}

function productCard(p, { specs = false } = {}) {
  if (!p) return '<div class="product-card muted">연결된 제품 없음</div>';
  const specRows = specs ? [...COMMON_SPECS, ...(CATEGORY_SPECS[p.category] || [])].filter((s) => p.specs?.[s.key]) : [];
  return `<div class="product-card">
    ${productGallery(p.id)}
    <div class="grow">
      <div class="muted small">${esc(brandName(p.brand_id))} · ${esc(p.category)} · ${esc(p.product_kind)} · <span class="mono">${esc(p.code)}</span></div>
      <strong>${esc(pname(p))}</strong>
      <div class="small">${p.online_name && p.online_name !== p.retail_name ? `온라인: ${esc(p.online_name)} · ` : ''}입고 예정 ${fmtDate(p.arrival_date)}${p.arrival_qty != null ? ` · ${esc(p.arrival_qty)}개` : ''}</div>
      ${specRows.length ? `<dl class="spec-mini">${specRows.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(p.specs[s.key])}</dd></div>`).join('')}</dl>` : ''}
      ${specs && p.options?.length ? `<div class="small"><b>옵션</b> ${p.options.map((o) => esc([o.name, o.color, o.size, o.material].filter(Boolean).join(' / '))).join(' · ')}</div>` : ''}
      ${specs && p.spec_notes ? `<div class="small"><b>특이사항</b> ${nl(p.spec_notes)}</div>` : ''}
      <button class="btn-link" data-open-product="${p.id}">제품 상세 · 연관 업무 보기 →</button>
    </div>
  </div>`;
}

// ================================================================= 업무 상세
export function openDetail(kind, id) {
  if (!KINDS[kind]) return;
  const existing = panels.find((p) => p.key === `${kind}:${id}`);
  if (existing) { existing.wrap.parentNode.appendChild(existing.wrap); return; }
  const panel = openDrawer((pn) => renderRequest(pn, kind, id));
  panel.key = `${kind}:${id}`;
}

function renderRequest(panel, kind, id) {
  const el = panel.el;
  const r0 = findRequest(kind, id);
  if (!r0) { el.innerHTML = `<div class="drawer-head"><h2>업무를 찾을 수 없습니다</h2><button class="icon-btn" data-x>✕</button></div><p class="pad muted">삭제되었거나 권한이 없습니다.</p>`; $('[data-x]', el).onclick = panel.close; return; }
  const r = { ...r0, _kind: kind };
  const p = product(r.product_id);
  const meta = KINDS[kind];
  const editable = can.editRequest(kind) && !r.cancelled;
  const workable = can.work() && !r.cancelled;
  const rerender = () => { const t = el.scrollTop; renderRequest(panel, kind, id); el.scrollTop = t; };

  const reqRows = {
    package: [
      ['디자인 유형', esc(r.design_type) + (r.design_type_etc ? ` (${esc(r.design_type_etc)})` : '')],
      ['패키지 규격', nl(r.package_spec)], ['필수 기재 문구', nl(r.required_text), true], ['인쇄 유의사항', nl(r.print_notes), true],
      ['디자인 레퍼런스', linkify(r.reference_url), true], ['추가 요청사항', nl(r.request_note), true],
    ],
    shoot: [
      ['촬영 목적', esc(r.purpose) + (r.purpose_etc ? ` (${esc(r.purpose_etc)})` : '')],
      ['촬영 유형', esc((r.shoot_types || []).join(', ')) + (r.shoot_types_etc ? ` (${esc(r.shoot_types_etc)})` : '')],
      ['촬영 장소', esc(r.location || '-') + (r.location_etc ? ` (${esc(r.location_etc)})` : '')],
      ['촬영 제품 옵션', esc((r.shoot_options || []).join(', ') || '-')], ['촬영 수량', r.quantity ?? '-'],
      ['촬영 희망일', fmtDate(r.desired_shoot_date)],
      ['촬영 유의사항', nl(r.caution), true], ['레퍼런스 URL', linkify(r.reference_url), true], ['추가 요청사항', nl(r.request_note), true],
    ],
    design: [
      ['작업 유형', esc(r.work_type)], ['브랜드', esc(brandName(r.brand_id))],
      ['제작 목적', nl(r.purpose), true],
      ['사용 위치', esc((r.channels || []).join(', ') || '-') + (r.channels_etc ? ` (${esc(r.channels_etc)})` : ''), true],
      ['기획안 URL', linkify(r.plan_url), true], ['레퍼런스 URL', linkify(r.reference_url), true],
      ['디자인 유의사항', nl(r.caution), true], ['추가 요청사항', nl(r.request_note), true],
      r.shoot_request_id ? ['연결 촬영 요청', `<button class="btn-link" data-open-req="shoot:${r.shoot_request_id}">${esc(findRequest('shoot', r.shoot_request_id)?.code || '보기')}</button>`] : null,
    ],
  }[kind];

  const urlCol = kind === 'package' ? ['work_url', '작업 파일 URL'] : kind === 'design' ? ['figma_url', 'Figma 작업 URL'] : null;
  const linkedDesigns = kind === 'shoot' ? requests('design').filter((d) => d.shoot_request_id === id) : [];

  el.innerHTML = `
    <div class="drawer-head">
      <div><div class="muted small">${meta.label} · <span class="mono">${esc(r.code)}</span></div>
        <h2>${esc(requestTitle(r))}</h2>
        <div class="row gap-sm">${statusPill(r.status, r.cancelled)} ${priorityTag(r.priority)} <span class="muted small">${esc(requestType(r))}</span></div>
      </div>
      <button class="icon-btn" data-x title="닫기">✕</button>
    </div>
    <div class="stale-note" hidden>다른 사용자가 이 업무를 수정했습니다. <button class="btn-link" data-reload>최신 내용 보기</button></div>
    <div class="drawer-actions">
      ${editable ? '<button class="btn btn-sm" data-edit>요청 내용 수정</button>' : ''}
      ${kind === 'shoot' && can.createRequest('design') ? '<button class="btn btn-sm btn-primary" data-follow>후속 디자인 요청 생성</button>' : ''}
      ${editable && r.status !== '완료' ? '<button class="btn btn-sm" data-cancel>요청 취소</button>' : ''}
      ${r.cancelled && can.editRequest(kind) ? '<button class="btn btn-sm" data-uncancel>취소 철회</button>' : ''}
      ${can.admin() ? '<button class="btn btn-sm btn-danger-ghost" data-delete>삭제</button>' : ''}
    </div>
    ${r.cancelled ? `<div class="notice">취소된 요청입니다.${r.cancel_reason ? ` 사유: ${esc(r.cancel_reason)}` : ''}</div>` : ''}

    <section class="section">${productCard(p, { specs: kind !== 'design' })}</section>

    <section class="section">
      <h3>요청 정보</h3>
      ${fields([
        ['요청 부서', ROLES[meta.requester]], ['요청자', esc(profileName(r.requester_id))],
        ['요청일', fmtDateTime(r.created_at)], ['희망 완료일', `<span class="${isOverdue(r) ? 'over' : ''}">${fmtDate(r.due_date)}${isOverdue(r) ? ' (기한 초과)' : ''}</span>`],
        ...reqRows,
      ])}
      ${attachmentBlock(kind, id, ['reference', 'file'], { title: '참고 이미지 · 첨부파일', uploadKind: editable ? 'reference' : null })}
    </section>

    <section class="section work">
      <h3>디자인팀 처리</h3>
      ${workable ? `
      <form class="work-form">
        <div class="status-pick">${STATUSES.map((s) => `<label><input type="radio" name="status" value="${s}" ${r.status === s ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div>
        <div class="form-grid">
          <label class="field"><span>담당 ${kind === 'shoot' ? '자' : '디자이너'}</span><select class="input" name="assignee_id">${options(designers().map((d) => [d.id, d.name]), r.assignee_id, { empty: '미배정' })}</select></label>
          ${kind === 'shoot' ? `<label class="field"><span>촬영 예정일</span><input class="input" type="date" name="scheduled_date" value="${esc(r.scheduled_date || '')}"></label>` : ''}
          <label class="field"><span>예상 완료일</span><input class="input" type="date" name="expected_date" value="${esc(r.expected_date || '')}"></label>
          <label class="field"><span>실제 완료일</span><input class="input" type="date" name="completed_date" value="${esc(r.completed_date || '')}"><small class="muted">완료 처리 시 자동 입력</small></label>
          ${urlCol ? `<label class="field wide"><span>${urlCol[1]}</span><input class="input" name="${urlCol[0]}" value="${esc(r[urlCol[0]] || '')}" placeholder="https://"></label>` : ''}
          <label class="field wide"><span>${kind === 'shoot' ? '촬영 결과물 URL' : '결과물 URL'}</span><input class="input" name="result_url" value="${esc(r.result_url || '')}" placeholder="https://"></label>
          <label class="field wide"><span>${kind === 'shoot' ? '촬영 진행 메모' : '작업 메모'}</span><textarea class="input" name="work_memo" rows="3">${esc(r.work_memo || '')}</textarea></label>
        </div>
        <div class="row"><span class="muted small">${r.status_changed_at ? `상태 변경: ${esc(profileName(r.status_changed_by))} · ${fmtDateTime(r.status_changed_at)}` : ''}</span><div class="grow"></div><button class="btn btn-primary">처리 내용 저장</button></div>
      </form>` : fields([
        ['담당자', r.assignee_id ? esc(profileName(r.assignee_id)) : '<span class="muted">미배정</span>'],
        ['진행 상태', statusPill(r.status, r.cancelled)],
        kind === 'shoot' ? ['촬영 예정일', fmtDate(r.scheduled_date)] : null,
        ['예상 완료일', fmtDate(r.expected_date)], ['실제 완료일', fmtDate(r.completed_date)],
        urlCol ? [urlCol[1], linkify(r[urlCol[0]]), true] : null,
        ['결과물 URL', linkify(r.result_url), true],
        ['작업 메모', nl(r.work_memo), true],
        ['상태 변경', r.status_changed_at ? `${esc(profileName(r.status_changed_by))} · ${fmtDateTime(r.status_changed_at)}` : '-', true],
      ])}
      ${attachmentBlock(kind, id, ['result'], { title: '완료 파일', uploadKind: can.work() ? 'result' : null, empty: '등록된 완료 파일이 없습니다.' })}
    </section>

    ${kind === 'shoot' ? `<section class="section"><h3>연결된 디자인 작업</h3>
      ${linkedDesigns.length ? linkedDesigns.map((d) => `<button class="mini-row" data-open-req="design:${d.id}"><span class="grow"><strong>${esc(d.title)}</strong><small>${esc(d.code)} · ${esc(d.work_type)}</small></span>${statusPill(d.status, d.cancelled)}</button>`).join('') : '<p class="muted small">아직 없습니다. 촬영이 끝나면 「후속 디자인 요청 생성」으로 상세페이지·썸네일 작업을 이어서 요청하세요.</p>'}
    </section>` : ''}

    ${commentsBlock(kind, id)}
    <section class="section"><h3>변경 이력</h3><div class="history-box"><p class="muted small">불러오는 중…</p></div></section>`;

  $('[data-x]', el).onclick = panel.close;
  $('[data-reload]', el)?.addEventListener('click', () => { $$('.dirty', el).forEach((d) => d.classList.remove('dirty')); rerender(); });
  $$('[data-open-product]', el).forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.openProduct)));
  $$('[data-open-req]', el).forEach((b) => b.addEventListener('click', () => { const [k, rid] = b.dataset.openReq.split(':'); openDetail(k, rid); }));
  $('[data-edit]', el)?.addEventListener('click', () => openRequestForm(kind, { edit: r0 }));
  $('[data-follow]', el)?.addEventListener('click', () => openRequestForm('design', { productId: r.product_id, shootId: id, multiType: ['상세페이지 신규 제작', '썸네일 신규 제작'] }));
  $('[data-cancel]', el)?.addEventListener('click', async () => {
    const reason = await confirmBox('이 요청을 취소할까요? 취소된 요청은 목록에서 숨겨지며 기록은 유지됩니다.', { danger: true, ok: '요청 취소', input: '취소 사유 (선택)' });
    if (!reason) return;
    try { await S.db.update(meta.table, { id }, { cancelled: true, cancel_reason: reason === true ? null : reason }); await loadTable(meta.table); toast('요청을 취소했습니다.'); rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  });
  $('[data-uncancel]', el)?.addEventListener('click', async () => {
    try { await S.db.update(meta.table, { id }, { cancelled: false, cancel_reason: null }); await loadTable(meta.table); rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  });
  $('[data-delete]', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`${r.code} 업무를 완전히 삭제합니다. 되돌릴 수 없습니다. (일반적으로는 '요청 취소'를 권장합니다)`, { danger: true, ok: '영구 삭제' }))) return;
    try { await S.db.remove(meta.table, { id }); await loadTable(meta.table); toast('삭제했습니다.'); panel.close(); S.hooks.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  });

  const wf = $('.work-form', el);
  if (wf) {
    wf.addEventListener('input', () => wf.classList.add('dirty'));
    wf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = readForm(wf);
      const patch = {};
      meta.workCols.forEach((c) => { if (c in v && (v[c] ?? null) !== (r0[c] ?? null)) patch[c] = v[c]; });
      if (patch.status && patch.status !== '완료' && !('completed_date' in patch)) patch.completed_date = null;
      if (!Object.keys(patch).length) return toast('변경된 내용이 없습니다.');
      try {
        await S.db.update(meta.table, { id }, patch);
        await loadTable(meta.table);
        wf.classList.remove('dirty');
        toast('저장했습니다. 요청 부서 화면에도 바로 반영됩니다.');
        rerender();
        S.hooks.rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  }
  bindAttachments(el, rerender);
  bindComments(el, rerender);
  ensureUrls(attachmentsOf(kind, id).filter(isImage).map((a) => a.storage_path)).then(() => {
    // 새로 받은 이미지 URL 반영 (최초 1회)
    const missing = $$('.att-file', el).length && attachmentsOf(kind, id).some((a) => isImage(a) && S.urls[a.storage_path]);
    if (missing && !panel._imgOnce) { panel._imgOnce = true; rerender(); }
  });
  loadHistory($('.history-box', el), kind, id);
}

// ================================================================= 제품 상세
export function openProduct(pid) {
  const existing = panels.find((p) => p.key === `product:${pid}`);
  if (existing) { existing.wrap.parentNode.appendChild(existing.wrap); return; }
  const panel = openDrawer((pn) => renderProduct(pn, pid), { wide: true });
  panel.key = `product:${pid}`;
}

function renderProduct(panel, pid) {
  const el = panel.el;
  const p = product(pid);
  if (!p) { el.innerHTML = `<div class="drawer-head"><h2>제품을 찾을 수 없습니다</h2><button class="icon-btn" data-x>✕</button></div>`; $('[data-x]', el).onclick = panel.close; return; }
  const s = launchSummary(pid);
  const l = s.l;
  const rerender = () => { const t = el.scrollTop; renderProduct(panel, pid); el.scrollTop = t; };
  const specList = [...COMMON_SPECS, ...(CATEGORY_SPECS[p.category] || [])];
  const extraSpecKeys = Object.keys(p.specs || {}).filter((k) => !specList.some((x) => x.key === k) && p.specs[k]);
  const reqList = (kind, list) => list.length ? list.map((r) => `
    <button class="mini-row" data-open-req="${kind}:${r.id}"><span class="grow"><strong>${esc(kind === 'design' ? r.title : requestType({ ...r, _kind: kind }))}</strong>
      <small>${esc(r.code)} · ${esc(profileName(r.assignee_id))} · 희망 ${fmtDate(r.due_date)}</small></span>${statusPill(r.status, r.cancelled)}</button>`).join('') : '<p class="muted small">없음</p>';
  const allOf = (kind) => requests(kind).filter((r) => r.product_id === pid);

  el.innerHTML = `
    <div class="drawer-head">
      <div><div class="muted small">제품 통합 관리 · <span class="mono">${esc(p.code)}</span></div>
        <h2>${esc(pname(p))}</h2>
        <div class="row gap-sm"><span class="tag">${esc(p.product_kind)}</span><span class="muted small">${esc(brandName(p.brand_id))} · ${esc(p.category)}</span></div>
      </div>
      <button class="icon-btn" data-x title="닫기">✕</button>
    </div>
    <div class="stale-note" hidden>다른 사용자가 수정했습니다. <button class="btn-link" data-reload>최신 내용 보기</button></div>
    <div class="drawer-actions">
      ${can.editProduct() ? '<button class="btn btn-sm" data-edit>제품 정보 수정</button><button class="btn btn-sm" data-pkg>+ 패키지 디자인 요청</button>' : ''}
      ${can.createRequest('shoot') ? '<button class="btn btn-sm btn-primary" data-shoot>+ 촬영 요청</button>' : ''}
      ${can.createRequest('design') ? '<button class="btn btn-sm btn-primary" data-design>+ 디자인 작업 요청</button>' : ''}
      ${can.launch() && l.followup === '미확인' ? '<button class="btn btn-sm" data-nofollow>후속 작업 불필요</button>' : ''}
      ${can.admin() ? '<button class="btn btn-sm btn-danger-ghost" data-delete>제품 삭제</button>' : ''}
    </div>

    <div class="two-col">
      <div>
        <section class="section">
          ${attachmentBlock('product', pid, ['product_image', 'reference', 'file'], { title: '제품 이미지 · 자료', uploadKind: can.editProduct() ? 'product_image' : null, empty: '등록된 이미지가 없습니다.' })}
        </section>
        <section class="section"><h3>기본 정보</h3>
          ${fields([
            ['브랜드', esc(brandName(p.brand_id))], ['카테고리', esc(p.category)],
            ['유통 제품명', esc(p.retail_name || '-'), true], ['온라인 제품명', esc(p.online_name || '-'), true],
            ['요청 구분', esc(p.product_kind)], ['제품 관리번호', `<span class="mono">${esc(p.code)}</span>`],
            ['입고 예정일', fmtDate(p.arrival_date)], ['입고 예정 수량', p.arrival_qty != null ? `${esc(p.arrival_qty)}개` : '-'],
            ['등록', `${esc(profileName(p.created_by))} · ${fmtDateTime(p.created_at)}`, true],
            ['최종 수정', `${esc(profileName(p.updated_by))} · ${fmtDateTime(p.updated_at)}`, true],
          ])}
        </section>
        <section class="section"><h3>상세 사양</h3>
          ${fields([...specList.map((x) => [esc(x.label), esc(p.specs?.[x.key] || ''), x.wide]), ...extraSpecKeys.map((k) => [esc(k), esc(p.specs[k])])])}
          ${p.options?.length ? `<h4>옵션별 사양</h4><div class="table-scroll"><table class="table compact"><thead><tr><th>옵션명</th><th>컬러</th><th>사이즈</th><th>소재</th><th>비고</th></tr></thead>
            <tbody>${p.options.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.color)}</td><td>${esc(o.size)}</td><td>${esc(o.material)}</td><td>${esc(o.note)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${p.spec_changes?.length ? `<h4>사양 변경사항 (리뉴얼)</h4><div class="table-scroll"><table class="table compact changes"><thead><tr><th>항목</th><th>기존</th><th></th><th>변경</th></tr></thead>
            <tbody>${p.spec_changes.map((c) => `<tr><td>${esc(c.field)}</td><td class="before">${esc(c.before)}</td><td>→</td><td class="after">${esc(c.after)}</td></tr>`).join('')}</tbody></table></div>
            <p class="muted small">기존 상세페이지·썸네일·영상의 수정 필요 여부를 확인하세요.</p>` : ''}
          ${p.spec_notes ? `<h4>추가 설명</h4><p>${nl(p.spec_notes)}</p>` : ''}
        </section>
      </div>
      <div>
        <section class="section launch-box"><h3>신제품 론칭 준비 현황</h3>
          <div class="launch-grid">
            <div><span>패키지 디자인</span>${progCell(s.package)}</div>
            <div><span>촬영</span>${progCell(s.shoot)}</div>
            <div><span>상세페이지</span>${progCell(s.detail)}</div>
            <div><span>썸네일</span>${progCell(s.thumb)}</div>
          </div>
          ${can.launch() ? `
          <form class="launch-form form-grid">
            <label class="field"><span>후속 업무</span><select class="input" name="followup">${options(['미확인', '후속 진행', '후속 불필요'], l.followup)}</select></label>
            <label class="field"><span>론칭 예정일</span><input class="input" type="date" name="launch_date" value="${esc(l.launch_date || '')}"></label>
            <label class="field"><span>촬영 필요</span><select class="input" name="shoot_needed">${options(NEED_STATES, l.shoot_needed)}</select></label>
            <label class="field"><span>상세페이지 필요</span><select class="input" name="detail_needed">${options(NEED_STATES, l.detail_needed)}</select></label>
            <label class="field"><span>썸네일 필요</span><select class="input" name="thumb_needed">${options(NEED_STATES, l.thumb_needed)}</select></label>
            <label class="field"><span>론칭 준비 상태</span><select class="input" name="launch_state">${options(LAUNCH_STATES, l.launch_state)}</select></label>
            <label class="field wide"><span>메모</span><input class="input" name="note" value="${esc(l.note || '')}"></label>
            <div class="wide row"><span class="muted small">패키지 완료 ≠ 론칭 완료. 필요한 작업이 모두 끝났는지 확인 후 상태를 바꾸세요.</span><div class="grow"></div><button class="btn btn-primary btn-sm">저장</button></div>
          </form>` : fields([
            ['후속 업무', esc(l.followup)], ['론칭 예정일', fmtDate(l.launch_date)],
            ['촬영 필요', esc(l.shoot_needed)], ['상세페이지 필요', esc(l.detail_needed)], ['썸네일 필요', esc(l.thumb_needed)],
            ['론칭 준비 상태', `<b>${esc(l.launch_state)}</b>`], ['메모', esc(l.note || '-'), true],
          ])}
        </section>
        <section class="section"><h3>패키지 디자인 요청</h3>${reqList('package', allOf('package'))}</section>
        <section class="section"><h3>촬영 요청</h3>${reqList('shoot', allOf('shoot'))}</section>
        <section class="section"><h3>디자인 작업 요청</h3>${reqList('design', allOf('design'))}</section>
      </div>
    </div>
    ${commentsBlock('product', pid, { allowCorrection: !can.editProduct() })}
    <section class="section"><h3>최근 변경 이력</h3><div class="history-box"><p class="muted small">불러오는 중…</p></div></section>`;

  $('[data-x]', el).onclick = panel.close;
  $('[data-reload]', el)?.addEventListener('click', () => { $$('.dirty', el).forEach((d) => d.classList.remove('dirty')); rerender(); });
  $$('[data-open-req]', el).forEach((b) => b.addEventListener('click', () => { const [k, rid] = b.dataset.openReq.split(':'); openDetail(k, rid); }));
  $('[data-edit]', el)?.addEventListener('click', () => openProductForm(p));
  $('[data-pkg]', el)?.addEventListener('click', () => openRequestForm('package', { productId: pid }));
  $('[data-shoot]', el)?.addEventListener('click', () => openRequestForm('shoot', { productId: pid }));
  $('[data-design]', el)?.addEventListener('click', () => openRequestForm('design', { productId: pid }));
  $('[data-nofollow]', el)?.addEventListener('click', async () => {
    try { await S.db.update('launch_readiness', { product_id: pid }, { followup: '후속 불필요' }); await loadTable('launch_readiness'); toast('후속 작업 불필요로 표시했습니다.'); rerender(); S.hooks.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  });
  $('[data-delete]', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`'${pname(p)}' 제품과 연결된 패키지·촬영 요청이 모두 삭제됩니다. 되돌릴 수 없습니다.`, { danger: true, ok: '영구 삭제' }))) return;
    try { await S.db.remove('products', { id: pid }); await Promise.all(['products', 'package_requests', 'shoot_requests', 'design_requests', 'launch_readiness'].map(loadTable)); panel.close(); S.hooks.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  });
  const lf = $('.launch-form', el);
  if (lf) {
    lf.addEventListener('input', () => lf.classList.add('dirty'));
    lf.addEventListener('change', () => lf.classList.add('dirty'));
    lf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = readForm(lf);
      try {
        await S.db.update('launch_readiness', { product_id: pid }, v);
        await loadTable('launch_readiness');
        lf.classList.remove('dirty');
        toast('론칭 준비 현황을 저장했습니다.');
        rerender();
        S.hooks.rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  }
  bindAttachments(el, rerender);
  bindComments(el, rerender);
  const imgs = attachmentsOf('product', pid).filter(isImage).map((a) => a.storage_path);
  if (imgs.some((x) => !S.urls[x])) ensureUrls(imgs).then(() => { if (!panel._imgOnce) { panel._imgOnce = true; rerender(); } });
  loadHistory($('.history-box', el), 'product', pid);
}
