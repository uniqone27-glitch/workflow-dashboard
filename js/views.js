import { S, can, requests, allRequests, requestTitle, requestType, requestBrand, product, pname, productThumb, profileName,
  brandName, launchOf, isOverdue, isOpen, dueThisWeek, sortRequests, designers, loadTable } from './store.js?v=202611181539';
import { KINDS, ROLES, STATUSES, PRIORITIES, CATEGORIES, PRODUCT_KINDS, LAUNCH_STATES, PACKAGE_TYPES, SHOOT_TYPES, FIELD_LABELS } from './constants.js?v=202611181539';
import { $, $$, esc, fmtDate, timeAgo, statusPill, priorityTag, options, toast, errMsg, debounce, today, confirmBox } from './ui.js?v=202611181539';
import { openDetail, openProduct } from './detail.js?v=202611181539';
import { openRequestForm, openProductForm, openDraftList } from './forms.js?v=202611181539';

export const ROUTES = [
  { name: 'dashboard', no: '01', label: '통합 대시보드' },
  { name: 'package', no: '02', label: '패키지 디자인 요청' },
  { name: 'shoot', no: '03', label: '촬영 요청' },
  { name: 'design', no: '04', label: '디자인 작업 요청' },
  { name: 'products', no: '05', label: '제품 통합 관리' },
  { name: 'admin', no: '⚙', label: '사용자 · 설정', admin: true },
  { name: 'tasks', label: '전체 업무', title: '전체 업무 목록', hidden: true },
];

export function renderView(route, el, fresh = false) {
  // 같은 화면에서 데이터만 바뀐 경우 결과 영역만 갱신 (입력 중인 검색어 유지)
  if (!fresh && el.dataset.route === route.name && el._update) { el._update(); return; }
  el.dataset.route = route.name;
  el._update = null;
  const fn = { dashboard: dashboardView, package: requestView, shoot: requestView, design: requestView, tasks: requestView, products: productsView, admin: adminView }[route.name];
  fn(route, el);
}

// ===================================================================== 통합 대시보드
function dashboardView(route, el) {
  const draw = () => {
    const all = allRequests().filter((r) => !r.cancelled);
    const cnt = (f) => all.filter(f).length;
    const kpis = [
      ['전체 업무 요청', all.length, ''],
      ['요청', cnt((r) => r.status === '요청'), 'status=요청'],
      ['작업중', cnt((r) => r.status === '작업중'), 'status=작업중'],
      ['완료', cnt((r) => r.status === '완료'), 'status=완료'],
      ['기한 초과', cnt(isOverdue), 'special=overdue', 'danger'],
      ['이번 주 완료 예정', cnt(dueThisWeek), 'special=week'],
    ];
    const byStatus = (list) => STATUSES.map((s) => list.filter((r) => r.status === s).length);
    const bar = (vals) => {
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      return `<div class="stack-bar">${vals.map((v, i) => v ? `<span class="seg seg-${i}" style="width:${(v / total) * 100}%" title="${STATUSES[i]} ${v}"></span>` : '').join('')}</div>`;
    };
    const teamRows = [
      ['물류/발주팀', all.filter((r) => r._kind === 'package'), 'kind=package'],
      ['브랜드팀', all.filter((r) => r._kind !== 'package'), 'kind=brand'],
    ];
    const designerRows = designers().map((d) => [d.name, all.filter((r) => r.assignee_id === d.id && r.status !== '완료'), `assignee=${d.id}`])
      .concat([['미배정', all.filter((r) => !r.assignee_id && r.status === '요청'), 'assignee=none']]);
    const typeRows = Object.entries(KINDS).map(([k, v]) => [v.label, all.filter((r) => r._kind === k), `kind=${k}`]);
    const highPri = sortRequests(all.filter((r) => isOpen(r) && ['긴급', '높음'].includes(r.priority)), 'priority').slice(0, 8);
    const dueSoon = sortRequests(all.filter((r) => isOpen(r) && r.due_date), 'due').slice(0, 8);
    const newProducts = S.data.products.filter((p) => ['신제품', '리뉴얼'].includes(p.product_kind)).slice(0, 6);
    const recent = S.data.history.slice(0, 12);

    el.innerHTML = `
      <div class="kpis">${kpis.map(([l, v, q, cls]) => `
        <a class="kpi ${cls || ''}" href="#/tasks?${q}"><span>${l}</span><strong>${v}</strong></a>`).join('')}
      </div>
      ${followupBanner()}
      <div class="grid-3">
        <div class="card"><div class="card-head"><h3>부서별 요청 현황</h3>${legend()}</div>
          ${teamRows.map(([l, list, q]) => `<a class="bar-row" href="#/tasks?${q}"><span>${l}</span>${bar(byStatus(list))}<em>${list.length}</em></a>`).join('')}
          <div class="card-sub">디자인팀 담당자별 진행 중</div>
          ${designerRows.map(([l, list, q]) => `<a class="bar-row" href="#/tasks?${q}"><span>${esc(l)}</span>${bar(byStatus(list))}<em>${list.length}</em></a>`).join('')}
        </div>
        <div class="card"><div class="card-head"><h3>요청 유형별 현황</h3>${legend()}</div>
          ${typeRows.map(([l, list, q]) => `<a class="bar-row" href="#/tasks?${q}"><span>${l}</span>${bar(byStatus(list))}<em>${list.length}</em></a>`).join('')}
        </div>
        <div class="card"><div class="card-head"><h3>최근 등록 신제품 · 리뉴얼</h3><a href="#/products" class="more">전체</a></div>
          ${newProducts.length ? newProducts.map((p) => `
            <button class="mini-row" data-product="${p.id}">${thumb(p.id)}
              <span class="grow"><strong>${esc(pname(p))}</strong><small>${esc(brandName(p.brand_id))} · ${esc(p.product_kind)} · 입고 ${fmtDate(p.arrival_date)}</small></span>
              <span class="tag">${esc(launchOf(p.id).launch_state || '')}</span></button>`).join('') : '<p class="empty">등록된 제품이 없습니다.</p>'}
        </div>
      </div>
      <div class="grid-3">
        <div class="card"><div class="card-head"><h3>우선순위 높은 작업</h3><a href="#/tasks?special=open&sort=priority" class="more">전체</a></div>${miniList(highPri)}</div>
        <div class="card"><div class="card-head"><h3>완료 예정일 임박</h3><a href="#/tasks?special=open&sort=due" class="more">전체</a></div>${miniList(dueSoon, true)}</div>
        <div class="card"><div class="card-head"><h3>최근 변경된 업무</h3></div>
          ${recent.length ? recent.map((h) => `
            <button class="mini-row" data-hist="${esc(h.entity_type)}:${esc(h.entity_id)}">
              <span class="grow"><strong>${esc(h.entity_code || '')} ${esc(histText(h))}</strong><small>${esc(profileName(h.actor_id))} · ${timeAgo(h.created_at)}</small></span>
            </button>`).join('') : '<p class="empty">변경 이력이 없습니다.</p>'}
        </div>
      </div>`;
    bindRowClicks(el);
  };
  draw();
  el._update = draw;
}

function legend() {
  return `<div class="legend"><i class="seg-0"></i>요청<i class="seg-1"></i>작업중<i class="seg-2"></i>완료</div>`;
}

export function histText(h) {
  const ent = { product: '제품', package: '패키지', shoot: '촬영', design: '디자인' }[h.entity_type] || '';
  if (h.action === 'create') return `${ent} 등록`;
  if (h.action === 'delete') return `${ent} 삭제`;
  if (h.action === 'status') return `${h.from_status} → ${h.to_status}`;
  if (h.action === 'cancel') return h.changes?.cancelled?.to ? '요청 취소' : '취소 해제';
  const keys = Object.keys(h.changes || {}).map((k) => FIELD_LABELS[k] || k);
  return `${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` 외 ${keys.length - 3}` : ''} 수정`;
}

function followupBanner() {
  if (!['brand', 'admin'].includes(S.me.role)) return '';
  const list = S.data.products.filter((p) => ['신제품', '리뉴얼'].includes(p.product_kind) && (launchOf(p.id).followup || '미확인') === '미확인');
  if (!list.length) return '';
  return `<div class="banner"><div><strong>브랜드팀 확인 필요 ${list.length}건</strong>
    <span>새로 등록된 신제품·리뉴얼 제품의 촬영/디자인 후속 업무를 결정하세요.</span></div>
    <div class="chips">${list.slice(0, 6).map((p) => `<button class="chip" data-product="${p.id}">${esc(pname(p))}</button>`).join('')}</div></div>`;
}

function thumb(pid, size = '') {
  const url = pid ? productThumb(pid) : null;
  return url ? `<img class="thumb ${size}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="thumb ${size} empty"></span>`;
}

function miniList(list, showDue) {
  if (!list.length) return '<p class="empty">해당 업무가 없습니다.</p>';
  return list.map((r) => `
    <button class="mini-row" data-req="${r._kind}:${r.id}">${thumb(r.product_id)}
      <span class="grow"><strong>${esc(requestTitle(r))}</strong><small>${KINDS[r._kind].short} · ${esc(requestType(r))}</small></span>
      ${showDue ? `<span class="due ${isOverdue(r) ? 'over' : ''}">${fmtDate(r.due_date)}</span>` : priorityTag(r.priority)}
      ${statusPill(r.status, r.cancelled)}
    </button>`).join('');
}

function bindRowClicks(el) {
  $$('[data-req]', el).forEach((b) => b.addEventListener('click', () => { const [k, id] = b.dataset.req.split(':'); openDetail(k, id); }));
  $$('[data-product]', el).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openProduct(b.dataset.product); }));
  $$('[data-hist]', el).forEach((b) => b.addEventListener('click', () => {
    const [t, id] = b.dataset.hist.split(':');
    if (t === 'product') openProduct(id); else openDetail(t, id);
  }));
}

// ===================================================================== 업무 목록 (02~04 + 전체)
function requestView(route, el) {
  const name = route.name;
  const kind = KINDS[name] ? name : null;
  const f = S.filters[name] = { sort: 'recent', status: '', ...(S.filters[name] || {}) };
  if (Object.keys(route.query).length) {
    Object.keys(f).forEach((k) => { if (!['sort'].includes(k)) delete f[k]; });
    Object.assign(f, { status: '', sort: 'recent' }, route.query);
  }

  const typeList = kind === 'package' ? PACKAGE_TYPES : kind === 'shoot' ? SHOOT_TYPES : kind === 'design' ? S.data.design_work_types.map((w) => w.name) : [];
  const requesters = S.data.profiles.filter((p) => p.role !== 'pending');
  const drafts = S.data.drafts.filter((d) => !kind || d.kind === kind);

  el.innerHTML = `
    ${kind === 'package' ? `<div id="fu-banner">${followupBanner()}</div>` : ''}
    <div class="toolbar">
      <div class="seg-ctl" id="status-seg"></div>
      <input class="input search" id="q" placeholder="제품명, 작업명, 요청번호 검색" value="${esc(f.q || '')}">
      <select class="input" id="sort">${options([['recent', '최근 요청순'], ['due', '희망 완료일순'], ['priority', '우선순위순']], f.sort)}</select>
      <div class="grow"></div>
      ${drafts.length ? `<button class="btn" id="drafts">임시저장 ${drafts.length}</button>` : ''}
      <button class="btn" id="excel">엑셀 다운로드</button>
      ${kind && can.createRequest(kind) ? `<button class="btn btn-primary" id="new">+ 새 ${kind === 'package' ? '작업' : KINDS[kind].short} 요청</button>` : ''}
    </div>
    <div class="filters">
      ${!kind ? `<select class="input" data-f="kind">${options([['package', '패키지 디자인'], ['shoot', '촬영'], ['design', '디자인 작업'], ['brand', '브랜드팀 요청 전체']], f.kind, { empty: '업무 구분 전체' })}</select>` : ''}
      <select class="input" data-f="brand">${options(S.data.brands.map((b) => [b.name, b.name]), f.brand, { empty: '브랜드 전체' })}</select>
      <select class="input" data-f="category">${options(CATEGORIES, f.category, { empty: '카테고리 전체' })}</select>
      ${kind ? `<select class="input" data-f="type">${options(typeList, f.type, { empty: '요청 유형 전체' })}</select>` : ''}
      <select class="input" data-f="assignee">${options([['none', '미배정'], ...designers().map((d) => [d.id, d.name])], f.assignee, { empty: '담당자 전체' })}</select>
      <select class="input" data-f="requester">${options(requesters.map((p) => [p.id, p.name]), f.requester, { empty: '요청자 전체' })}</select>
      <select class="input" data-f="priority">${options(PRIORITIES, f.priority, { empty: '우선순위 전체' })}</select>
      <span class="date-range">요청일 <input type="date" class="input" data-f="from" value="${esc(f.from || '')}"> ~ <input type="date" class="input" data-f="to" value="${esc(f.to || '')}"></span>
      <select class="input" data-f="special">${options([['open', '진행 중(미완료)'], ['overdue', '기한 초과'], ['week', '7일 내 완료 예정'], ['mine', '내 담당/내 요청']], f.special, { empty: '조건 없음' })}</select>
      <label class="check"><input type="checkbox" id="show-cancel" ${f.cancelled ? 'checked' : ''}><span>취소 포함</span></label>
      <button class="btn-link" id="reset">필터 초기화</button>
    </div>
    <div class="card table-card"><div id="results"></div></div>`;

  const filtered = () => {
    let list = kind ? requests(kind) : allRequests();
    const q = (f.q || '').toLowerCase();
    list = list.filter((r) => {
      const p = product(r.product_id);
      if (!f.cancelled && r.cancelled) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.kind && !(f.kind === 'brand' ? r._kind !== 'package' : r._kind === f.kind)) return false;
      if (f.brand && requestBrand(r) !== f.brand) return false;
      if (f.category && p?.category !== f.category) return false;
      if (f.type && !(r._kind === 'shoot' ? (r.shoot_types || []).includes(f.type) : requestType(r) === f.type || r.design_type === f.type)) return false;
      if (f.assignee && (f.assignee === 'none' ? r.assignee_id : r.assignee_id !== f.assignee)) return false;
      if (f.requester && r.requester_id !== f.requester) return false;
      if (f.priority && r.priority !== f.priority) return false;
      if (f.from && r.created_at.slice(0, 10) < f.from) return false;
      if (f.to && r.created_at.slice(0, 10) > f.to) return false;
      if (f.special === 'open' && !isOpen(r)) return false;
      if (f.special === 'overdue' && !isOverdue(r)) return false;
      if (f.special === 'week' && !dueThisWeek(r)) return false;
      if (f.special === 'mine' && r.assignee_id !== S.me.id && r.requester_id !== S.me.id) return false;
      if (q) {
        const hay = [r.code, requestTitle(r), p?.online_name, p?.retail_name, requestType(r), profileName(r.requester_id), profileName(r.assignee_id)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortRequests(list, f.sort);
  };

  const update = () => {
    const banner = $('#fu-banner', el);
    if (banner) { banner.innerHTML = followupBanner(); bindRowClicks(banner); }
    const base = filtered();
    // 상태 탭 카운트는 상태 조건만 빼고 계산
    const st = f.status; f.status = ''; const noStatus = filtered(); f.status = st;
    $('#status-seg', el).innerHTML = [['', '전체'], ...STATUSES.map((s) => [s, s])].map(([v, l]) => `
      <button class="${f.status === v ? 'on' : ''}" data-status="${v}">${l} <em>${noStatus.filter((r) => !v || r.status === v).length}</em></button>`).join('');
    $$('[data-status]', el).forEach((b) => b.addEventListener('click', () => { f.status = b.dataset.status; update(); }));
    $('#results', el).innerHTML = base.length ? requestTable(base, !kind) : '<p class="empty big">조건에 맞는 업무가 없습니다.</p>';
    $$('tr[data-req]', el).forEach((tr) => tr.addEventListener('click', () => { const [k, id] = tr.dataset.req.split(':'); openDetail(k, id); }));
    el._rows = base;
  };

  $('#q', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); update(); }, 200));
  $('#sort', el).addEventListener('change', (e) => { f.sort = e.target.value; update(); });
  $$('[data-f]', el).forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value || undefined; update(); }));
  $('#show-cancel', el).addEventListener('change', (e) => { f.cancelled = e.target.checked; update(); });
  $('#reset', el).addEventListener('click', () => { S.filters[name] = {}; if (location.hash.includes('?')) location.hash = `#/${name}`; else requestView({ name, query: {} }, el); });
  $('#new', el)?.addEventListener('click', () => openRequestForm(kind));
  $('#drafts', el)?.addEventListener('click', () => openDraftList(kind));
  $('#excel', el).addEventListener('click', () => exportExcel(el._rows || [], kind ? KINDS[kind].label : '전체 업무'));
  update();
  el._update = update;
}

function requestTable(list, showKind) {
  return `<div class="table-scroll"><table class="table">
    <thead><tr>
      <th></th><th>요청번호</th>${showKind ? '<th>구분</th>' : ''}<th>브랜드</th><th>제품명 / 작업명</th><th>요청 유형</th>
      <th>요청 부서</th><th>요청자</th><th>담당자</th><th>우선순위</th><th>요청일</th><th>희망 완료일</th><th>상태</th>
    </tr></thead>
    <tbody>${list.map((r) => `
      <tr data-req="${r._kind}:${r.id}" class="${r.cancelled ? 'is-cancel' : ''}">
        <td>${thumb(r.product_id, 'sm')}</td>
        <td class="mono">${esc(r.code)}</td>
        ${showKind ? `<td>${KINDS[r._kind].short}</td>` : ''}
        <td>${esc(requestBrand(r))}</td>
        <td class="title-cell"><strong>${esc(requestTitle(r))}</strong>${r._kind === 'design' && r.product_id ? `<small>${esc(pname(product(r.product_id)))}</small>` : ''}</td>
        <td>${esc(requestType(r))}</td>
        <td>${ROLES[KINDS[r._kind].requester]}</td>
        <td>${esc(profileName(r.requester_id))}</td>
        <td>${r.assignee_id ? esc(profileName(r.assignee_id)) : '<span class="muted">미배정</span>'}</td>
        <td>${priorityTag(r.priority)}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td class="${isOverdue(r) ? 'over' : ''}">${fmtDate(r.due_date)}</td>
        <td>${statusPill(r.status, r.cancelled)}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

function exportExcel(rows, label) {
  if (!rows.length) return toast('내보낼 업무가 없습니다.');
  const data = rows.map((r) => {
    const p = product(r.product_id);
    return {
      요청번호: r.code, 구분: KINDS[r._kind].label, 브랜드: requestBrand(r), '제품명/작업명': requestTitle(r),
      유통제품명: p?.retail_name || '', 온라인제품명: p?.online_name || '', 카테고리: p?.category || '', 입고예정일: p?.arrival_date || '', 입고예정수량: p?.arrival_qty ?? '',
      요청유형: requestType(r), 요청부서: ROLES[KINDS[r._kind].requester], 요청자: profileName(r.requester_id),
      담당자: r.assignee_id ? profileName(r.assignee_id) : '', 우선순위: r.priority, 상태: r.cancelled ? '취소' : r.status,
      요청일: (r.created_at || '').slice(0, 10), 희망완료일: r.due_date || '', 예상완료일: r.expected_date || '',
      실제완료일: r.completed_date || '', 결과물URL: r.result_url || '',
    };
  });
  const name = `${label}_${today()}`;
  if (window.XLSX) {
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '업무목록');
    window.XLSX.writeFile(wb, `${name}.xlsx`);
  } else {
    const head = Object.keys(data[0]);
    const csv = [head, ...data.map((d) => head.map((h) => d[h]))].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `${name}.csv`;
    a.click();
  }
}

// ===================================================================== 제품 통합 관리
export function launchSummary(pid) {
  const l = launchOf(pid);
  const live = (list) => list.filter((r) => !r.cancelled);
  const pk = live(requests('package').filter((r) => r.product_id === pid));
  const sh = live(requests('shoot').filter((r) => r.product_id === pid));
  const ds = live(requests('design').filter((r) => r.product_id === pid));
  const detail = ds.filter((r) => r.work_type.includes('상세페이지'));
  const thumbs = ds.filter((r) => r.work_type.includes('썸네일'));
  const prog = (list, need) => {
    const done = list.filter((r) => r.status === '완료').length;
    if (need === '불필요' && !list.length) return { cls: 'na', text: '불필요' };
    if (!list.length) return need === '필요' ? { cls: 'warn', text: '필요 · 미요청' } : { cls: 'na', text: need === '미정' ? '미정' : '-' };
    if (done === list.length) return { cls: 'done', text: `완료 ${done}/${list.length}` };
    const wip = list.some((r) => r.status === '작업중');
    return { cls: wip ? 'wip' : 'req', text: `${wip ? '작업중' : '요청'} ${done}/${list.length}` };
  };
  return {
    l, pk, sh, ds,
    package: prog(pk, '필요'),
    shoot: prog(sh, l.shoot_needed),
    detail: prog(detail, l.detail_needed),
    thumb: prog(thumbs, l.thumb_needed),
  };
}
export const progCell = (p) => `<span class="prog prog-${p.cls}">${esc(p.text)}</span>`;

function productsView(route, el) {
  const f = S.filters.products = S.filters.products || {};
  el.innerHTML = `
    <div class="toolbar">
      <input class="input search" id="pq" placeholder="유통 제품명, 온라인 제품명, 관리번호 검색" value="${esc(f.q || '')}">
      <select class="input" data-f="brand">${options(S.data.brands.map((b) => [String(b.id), b.name]), f.brand, { empty: '브랜드 전체' })}</select>
      <select class="input" data-f="category">${options(CATEGORIES, f.category, { empty: '카테고리 전체' })}</select>
      <select class="input" data-f="kind">${options(PRODUCT_KINDS, f.kind, { empty: '구분 전체' })}</select>
      <select class="input" data-f="launch">${options(LAUNCH_STATES, f.launch, { empty: '론칭 상태 전체' })}</select>
      <select class="input" data-f="followup">${options(['미확인', '후속 진행', '후속 불필요'], f.followup, { empty: '후속 업무 전체' })}</select>
      <div class="grow"></div>
      ${can.editProduct() ? '<button class="btn btn-primary" id="new-product">+ 제품 등록</button>' : ''}
    </div>
    <div class="card table-card"><div id="presults"></div></div>`;

  const update = () => {
    const q = (f.q || '').toLowerCase();
    const list = S.data.products.filter((p) => {
      const l = launchOf(p.id);
      if (f.brand && String(p.brand_id) !== f.brand) return false;
      if (f.category && p.category !== f.category) return false;
      if (f.kind && p.product_kind !== f.kind) return false;
      if (f.launch && l.launch_state !== f.launch) return false;
      if (f.followup && l.followup !== f.followup) return false;
      if (q && ![p.code, p.online_name, p.retail_name].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    $('#presults', el).innerHTML = list.length ? `<div class="table-scroll"><table class="table">
      <thead><tr><th></th><th>관리번호</th><th>브랜드</th><th>제품명</th><th>카테고리</th><th>구분</th><th>입고 예정 (수량)</th>
        <th>패키지</th><th>촬영</th><th>상세페이지</th><th>썸네일</th><th>론칭 예정일</th><th>론칭 준비 상태</th></tr></thead>
      <tbody>${list.map((p) => {
        const s = launchSummary(p.id);
        return `<tr data-pid="${p.id}">
          <td>${thumb(p.id, 'sm')}</td><td class="mono">${esc(p.code)}</td><td>${esc(brandName(p.brand_id))}</td>
          <td class="title-cell"><strong>${esc(pname(p))}</strong><small>${p.online_name && p.online_name !== p.retail_name ? `온라인: ${esc(p.online_name)}` : ''}</small></td>
          <td>${esc(p.category)}</td><td>${esc(p.product_kind)}</td><td>${fmtDate(p.arrival_date)}${p.arrival_qty != null ? `<small class="muted"> · ${esc(p.arrival_qty)}개</small>` : ''}</td>
          <td>${progCell(s.package)}</td><td>${progCell(s.shoot)}</td><td>${progCell(s.detail)}</td><td>${progCell(s.thumb)}</td>
          <td>${fmtDate(s.l.launch_date)}</td><td><span class="launch launch-${LAUNCH_STATES.indexOf(s.l.launch_state)}">${esc(s.l.launch_state || '-')}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty big">등록된 제품이 없습니다.</p>';
    $$('tr[data-pid]', el).forEach((tr) => tr.addEventListener('click', () => openProduct(tr.dataset.pid)));
  };
  $('#pq', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); update(); }, 200));
  $$('[data-f]', el).forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value || undefined; update(); }));
  $('#new-product', el)?.addEventListener('click', () => openProductForm());
  update();
  el._update = update;
}

// ===================================================================== 관리자
function adminView(route, el) {
  const draw = () => {
    const users = S.data.profiles.filter((u) => !u.deleted_at).sort((a, b) => (a.role === 'pending' ? -1 : 1) - (b.role === 'pending' ? -1 : 1) || a.name.localeCompare(b.name));
    el.innerHTML = `
      <div class="card"><div class="card-head"><h3>사용자 및 권한</h3>
        <span class="muted small">신규 가입자는 '승인 대기' 상태입니다. 소속 팀을 지정하면 바로 이용할 수 있습니다.</span></div>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>계정 상태</th><th>가입일</th><th></th></tr></thead>
          <tbody>${users.map((u) => `<tr class="${u.role === 'pending' ? 'hl' : ''}">
            <td><strong>${esc(u.name)}</strong>${u.id === S.me.id ? ' <span class="tag">나</span>' : ''}</td>
            <td>${esc(u.email || '')}</td>
            <td><select class="input input-sm" data-role="${u.id}">${options(Object.entries(ROLES), u.role)}</select></td>
            <td><label class="check"><input type="checkbox" data-active="${u.id}" ${u.active ? 'checked' : ''}><span>${u.active ? '활성' : '비활성'}</span></label></td>
            <td>${fmtDate(u.created_at)}</td>
            <td>${u.id === S.me.id ? '' : `<button class="btn-link danger small" data-del-user="${u.id}">삭제</button>`}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>브랜드</h3></div>
          <div class="list-edit">${S.data.brands.map((b) => `<div class="li"><span>${esc(b.name)}</span>
            <label class="check"><input type="checkbox" data-brand="${b.id}" ${b.active ? 'checked' : ''}><span>사용</span></label>
            <button class="btn-link danger" data-del-brand="${b.id}">삭제</button></div>`).join('')}</div>
          <p class="muted small">제품·업무에 쓰인 브랜드는 삭제할 수 없습니다. 더 이상 쓰지 않으면 「사용」 체크를 해제하세요.</p>
          <form class="row gap" id="add-brand"><input class="input" name="name" placeholder="새 브랜드명" required><button class="btn">추가</button></form>
        </div>
        <div class="card"><div class="card-head"><h3>디자인 작업 유형</h3></div>
          <div class="list-edit">${S.data.design_work_types.map((w) => `<div class="li"><span>${esc(w.name)}</span>
            <button class="btn-link danger" data-wt="${esc(w.name)}">삭제</button></div>`).join('')}</div>
          <form class="row gap" id="add-wt"><input class="input" name="name" placeholder="새 작업 유형" required><button class="btn">추가</button></form>
        </div>
      </div>`;

    const act = async (fn, msg) => { try { await fn(); toast(msg); } catch (e) { toast(errMsg(e), 'error'); draw(); } };
    $$('[data-role]', el).forEach((s) => s.addEventListener('change', async () => {
      if (s.dataset.role === S.me.id && s.value !== 'admin' && !(await confirmBox('본인의 관리자 권한을 해제하면 이 화면에 접근할 수 없습니다. 계속할까요?', { danger: true }))) return draw();
      act(() => S.db.update('profiles', { id: s.dataset.role }, { role: s.value }).then(() => loadTable('profiles')), '권한을 변경했습니다.');
    }));
    $$('[data-active]', el).forEach((c) => c.addEventListener('change', () =>
      act(() => S.db.update('profiles', { id: c.dataset.active }, { active: c.checked }).then(() => loadTable('profiles')), '계정 상태를 변경했습니다.')));
    $$('[data-del-user]', el).forEach((b) => b.addEventListener('click', async () => {
      const u = S.data.profiles.find((x) => x.id === b.dataset.delUser);
      if (!u) return;
      const ok = await confirmBox(`「${u.name}」(${u.email || ''}) 계정을 삭제할까요? 삭제하면 이 계정으로 더 이상 로그인할 수 없고 되돌릴 수 없습니다. 작성한 요청·댓글·변경 이력은 그대로 남습니다.`, { danger: true, ok: '삭제' });
      if (!ok) return;
      act(() => S.db.rpc('admin_delete_user', { target: u.id }).then(() => loadTable('profiles')).then(draw), '사용자를 삭제했습니다.');
    }));
    $$('[data-brand]', el).forEach((c) => c.addEventListener('change', () =>
      act(() => S.db.update('brands', { id: Number(c.dataset.brand) }, { active: c.checked }).then(() => loadTable('brands')), '저장했습니다.')));
    $$('[data-del-brand]', el).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delBrand);
      const br = S.data.brands.find((x) => x.id === id);
      const used = S.data.products.filter((p) => p.brand_id === id).length + S.data.design_requests.filter((r) => r.brand_id === id).length;
      if (used) return toast(`「${br.name}」 브랜드는 제품·업무 ${used}건에서 사용 중이라 삭제할 수 없습니다. 「사용」 체크를 해제해 숨겨 주세요.`, 'error');
      if (!(await confirmBox(`「${br.name}」 브랜드를 삭제할까요?`, { danger: true, ok: '삭제' }))) return;
      act(() => S.db.remove('brands', { id }).then(() => loadTable('brands')).then(draw), '브랜드를 삭제했습니다.');
    }));
    $$('[data-wt]', el).forEach((b) => b.addEventListener('click', () =>
      act(() => S.db.remove('design_work_types', { name: b.dataset.wt }).then(() => loadTable('design_work_types')).then(draw), '삭제했습니다.')));
    $('#add-brand', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.elements.namedItem('name').value.trim();
      act(() => S.db.insert('brands', { name, sort: S.data.brands.length + 1 }).then(() => loadTable('brands')).then(draw), '브랜드를 추가했습니다.');
    });
    $('#add-wt', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.elements.namedItem('name').value.trim();
      act(() => S.db.insert('design_work_types', { name, sort: 50 }).then(() => loadTable('design_work_types')).then(draw), '작업 유형을 추가했습니다.');
    });
  };
  draw();
  el._update = draw;
}
