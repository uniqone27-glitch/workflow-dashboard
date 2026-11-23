import { S, can, categoryList, requests, allRequests, requestTitle, requestType, requestBrand, product, pname, productThumb, requestThumb, requestThumbAtt, productThumbAtt, profileName,
  brandName, launchOf, isOverdue, isOpen, dueThisWeek, sortRequests, designers, assigneesOf, isAssignee, assigneeNames, loadTable, ensureUrls, requestCategory, shootRetailName, shootOnlineName, shootColors } from './store.js?v=202611231028';
import { KINDS, ROLES, STATUSES, PRIORITIES, CATEGORIES, PRODUCT_KINDS, LAUNCH_STATES, PACKAGE_TYPES, SHOOT_TYPES, FIELD_LABELS } from './constants.js?v=202611231028';
import { $, $$, esc, fmtDate, timeAgo, statusPill, priorityTag, options, toast, errMsg, debounce, today, confirmBox } from './ui.js?v=202611231028';
import { openDetail, openProduct } from './detail.js?v=202611231028';
import { devReqView } from './devreq.js?v=202611231028';
import { PATCH_NOTES } from './patchnotes.js?v=202611231028';
import { openRequestForm, openProductForm, openDraftList } from './forms.js?v=202611231028';

export const ROUTES = [
  { name: 'dashboard', no: '01', label: '통합 대시보드' },
  { name: 'package', no: '02', label: '패키지 디자인 요청' },
  { name: 'shoot', no: '03', label: '촬영 요청' },
  { name: 'design', no: '04', label: '디자인 작업 요청' },
  { name: 'products', no: '05', label: '제품 통합 관리' },
  { name: 'devreq', no: '06', label: '개발요청' },
  { name: 'patchnotes', no: '07', label: '패치노트' },
  { name: 'admin', no: '⚙', label: '사용자 · 설정', admin: true },
  { name: 'tasks', label: '전체 업무', title: '전체 업무 목록', hidden: true },
];

export function renderView(route, el, fresh = false) {
  // 같은 화면에서 데이터만 바뀐 경우 결과 영역만 갱신 (입력 중인 검색어 유지)
  if (!fresh && el.dataset.route === route.name && el._update) { el._update(); return; }
  el.dataset.route = route.name;
  el._update = null;
  const fn = { dashboard: dashboardView, package: requestView, shoot: requestView, design: requestView, tasks: requestView, products: productsView, devreq: devReqView, patchnotes: patchNotesView, admin: adminView }[route.name];
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
    const designerRows = designers().map((d) => [d.name, all.filter((r) => isAssignee(r, d.id) && r.status !== '완료'), `assignee=${d.id}`])
      .concat([['미배정', all.filter((r) => !assigneesOf(r).length && r.status === '요청'), 'assignee=none']]);
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

// 목록 썸네일: 클릭하면 확대 보기 (행 클릭으로 상세가 열리지 않음)
function thumb(pid, size = '', att = productThumbAtt(pid)) {
  const url = att ? S.urls[att.storage_path] : null;
  return url ? `<img class="thumb ${size} zoomable" src="${esc(url)}" alt="" loading="lazy" data-zoom data-path="${esc(att.storage_path)}" data-name="${esc(att.file_name)}" title="클릭하면 크게 볼 수 있습니다">`
    : `<span class="thumb ${size} empty"></span>`;
}

function miniList(list, showDue) {
  if (!list.length) return '<p class="empty">해당 업무가 없습니다.</p>';
  return list.map((r) => `
    <button class="mini-row" data-req="${r._kind}:${r.id}">${thumb(r.product_id, '', requestThumbAtt(r))}
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
      <select class="input" data-f="category">${options(categoryList(f.category), f.category, { empty: '카테고리 전체' })}</select>
      ${kind ? `<select class="input" data-f="type">${options(typeList, f.type, { empty: kind === 'shoot' ? '촬영 유형 전체' : '요청 유형 전체' })}</select>` : ''}
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
      if (f.category && requestCategory(r) !== f.category) return false;
      if (f.type && !(r._kind === 'shoot' ? (r.shoot_types || []).includes(f.type) : requestType(r) === f.type || r.design_type === f.type)) return false;
      if (f.assignee && (f.assignee === 'none' ? assigneesOf(r).length : !isAssignee(r, f.assignee))) return false;
      if (f.requester && r.requester_id !== f.requester) return false;
      if (f.priority && r.priority !== f.priority) return false;
      if (f.from && r.created_at.slice(0, 10) < f.from) return false;
      if (f.to && r.created_at.slice(0, 10) > f.to) return false;
      if (f.special === 'open' && !isOpen(r)) return false;
      if (f.special === 'overdue' && !isOverdue(r)) return false;
      if (f.special === 'week' && !dueThisWeek(r)) return false;
      if (f.special === 'mine' && !isAssignee(r, S.me.id) && r.requester_id !== S.me.id) return false;
      if (q) {
        const hay = [r.code, requestTitle(r), p?.online_name, p?.retail_name, p?.retail_name_en, r.product_retail_name, r.product_online_name, requestType(r), profileName(r.requester_id), assigneeNames(r)].join(' ').toLowerCase();
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
    $('#results', el).innerHTML = base.length ? requestTable(base, !kind, kind) : '<p class="empty big">조건에 맞는 업무가 없습니다.</p>';
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
  $('#excel', el).addEventListener('click', () => exportExcel(el._rows || [], kind ? KINDS[kind].label : '전체 업무', kind));
  update();
  el._update = update;
}

function requestTable(list, showKind, kind = null) {
  // 02 패키지 · 03 촬영: 「유통 제품명(한글)」 · 「유통 제품명(영문)」 (촬영은 카테고리 포함)
  const shoot = kind === 'shoot';
  const named = shoot || kind === 'package';
  const retail = (r) => shootRetailName(r) || requestTitle(r);
  const retailEn = (r) => product(r.product_id)?.retail_name_en || '';
  const dash = '<span class="muted">-</span>';
  return `<div class="table-scroll"><table class="table">
    <thead><tr>
      <th>제품 이미지</th><th>요청번호</th>${showKind ? '<th>구분</th>' : ''}<th>브랜드</th>${named ? `<th>유통 제품명(한글)</th><th>유통 제품명(영문)</th>${shoot ? '<th>컬러</th><th>카테고리</th>' : ''}` : '<th>제품명 / 작업명</th>'}<th>${shoot ? '촬영 유형' : '요청 유형'}</th>
      <th>요청 부서</th><th>요청자</th><th>담당자</th><th>우선순위</th><th>요청일</th><th>희망 완료일</th><th>상태</th>
    </tr></thead>
    <tbody>${list.map((r) => `
      <tr data-req="${r._kind}:${r.id}" class="${r.cancelled ? 'is-cancel' : ''}">
        <td>${thumb(r.product_id, 'sm', requestThumbAtt(r))}</td>
        <td class="mono">${esc(r.code)}</td>
        ${showKind ? `<td>${KINDS[r._kind].short}</td>` : ''}
        <td>${esc(requestBrand(r))}</td>
        ${named ? `<td class="title-cell"><strong>${esc(retail(r))}</strong></td><td class="title-cell">${retailEn(r) ? esc(retailEn(r)) : dash}</td>${shoot ? `<td class="title-cell">${shootColors(r).length ? esc(shootColors(r).join(', ')) : dash}</td><td>${requestCategory(r) ? esc(requestCategory(r)) : dash}</td>` : ''}`
          : `<td class="title-cell"><strong>${esc(requestTitle(r))}</strong>${r._kind === 'design' && r.product_id ? `<small>${esc(pname(product(r.product_id)))}</small>` : ''}</td>`}
        <td>${esc(requestType(r))}</td>
        <td>${ROLES[KINDS[r._kind].requester]}</td>
        <td>${esc(profileName(r.requester_id))}</td>
        <td>${assigneesOf(r).length ? esc(assigneeNames(r)) : '<span class="muted">미배정</span>'}</td>
        <td>${priorityTag(r.priority)}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td class="${isOverdue(r) ? 'over' : ''}">${fmtDate(r.due_date)}</td>
        <td>${statusPill(r.status, r.cancelled)}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

// 엑셀 다운로드: 제품 이미지(목록 썸네일과 동일) 포함, 모든 셀 가운데 정렬
const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let excelJsLoading = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return (excelJsLoading ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = EXCELJS_URL;
    sc.onload = () => resolve(window.ExcelJS);
    sc.onerror = () => { excelJsLoading = null; reject(new Error('엑셀 모듈을 불러오지 못했습니다.')); };
    document.head.appendChild(sc);
  }));
}
// 이미지 → 셀 모양(가로:세로 = XL_CELL_RATIO) 캔버스에 원본 비율 그대로 꽉 맞춰 넣은 PNG
// (남는 부분은 투명 → 셀 테두리·배경이 그대로 보임). 엑셀에서는 이 PNG를 셀 네 모서리에 고정하므로
// 열 너비·행 높이가 프로그램(Mac/Windows 엑셀, 넘버스 등)마다 다르게 그려져도 셀 밖으로 벗어나지 않습니다.
const XL_CELL_RATIO = 169 / 200;   // 열 너비 21 : 행 높이 150 (Mac 엑셀 실측)
async function excelImage(url) {
  try {
    const blob = await (await fetch(url)).blob();
    const bmpUrl = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = bmpUrl; });
    // 상세페이지처럼 극단적으로 길쭉한 이미지(3:1 초과)는 목록 썸네일처럼 셀 모양으로 잘라서 사용 (세로형은 위쪽, 가로형은 가운데)
    let sx = 0, sy = 0, sw = img.naturalWidth || 480, sh = img.naturalHeight || 480;
    if (sh / sw > 3) sh = Math.round(sw / XL_CELL_RATIO);
    else if (sw / sh > 3) { const nw = Math.round(sh * XL_CELL_RATIO); sx = Math.round((sw - nw) / 2); sw = nw; }
    const H = 400, W = Math.round(H * XL_CELL_RATIO), pad = 4;
    const k = Math.min((W - pad * 2) / sw, (H - pad * 2) / sh);
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
    URL.revokeObjectURL(bmpUrl);
    return { base64: c.toDataURL('image/png') };
  } catch { return null; }
}
// 글자 폭(한글 2, 그 외 1) — 여러 줄이면 가장 긴 줄 기준
const xlWidth = (v) => Math.max(0, ...String(v ?? '').split('\n').map((l) => [...l].reduce((n, ch) => n + (/[\u1100-\uffff]/.test(ch) ? 2 : 1), 0)));

async function exportExcel(rows, label, kind = null) {
  if (!rows.length) return toast('내보낼 업무가 없습니다.');
  const data = rows.map((r) => {
    const p = product(r.product_id);
    // 03 촬영 요청 탭: 촬영에 필요한 항목만
    if (kind === 'shoot') return {
      유통제품명: shootRetailName(r), 온라인제품명: shootOnlineName(r), 컬러: shootColors(r).join(', '),
      카테고리: requestCategory(r), 촬영유형: requestType(r), '촬영 유의사항': r.caution || '',
    };
    return {
      요청번호: r.code, 구분: KINDS[r._kind].label, 브랜드: requestBrand(r), '제품명/작업명': requestTitle(r),
      유통제품명: p?.retail_name || r.product_retail_name || '', 온라인제품명: r.product_online_name || p?.online_name || '', 카테고리: requestCategory(r), 입고예정일: p?.arrival_date || '', 입고예정수량: p?.arrival_qty ?? '',
      요청유형: requestType(r), 요청부서: ROLES[KINDS[r._kind].requester], 요청자: profileName(r.requester_id),
      담당자: assigneeNames(r), 우선순위: r.priority, 상태: r.cancelled ? '취소' : r.status,
      요청일: (r.created_at || '').slice(0, 10), 희망완료일: r.due_date || '', 예상완료일: r.expected_date || '',
      실제완료일: r.completed_date || '', '결과물(URL·공유폴더 경로)': r.result_url || '',
    };
  });
  const name = `${label}_${today()}`;
  toast('엑셀 파일을 만드는 중입니다… (이미지 포함)');
  let ExcelJS;
  try { ExcelJS = await loadExcelJs(); } catch (e) { return toast(errMsg(e), 'error'); }

  // 제품 이미지: 목록 썸네일과 같은 이미지 (촬영 요청은 선택한 촬영 제품 이미지)
  const atts = rows.map((r) => requestThumbAtt(r));
  await ensureUrls(atts.filter(Boolean).map((a) => a.storage_path));
  const imgs = new Array(rows.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < rows.length) {
      const i = next++;
      const u = atts[i] && S.urls[atts[i].storage_path];
      if (u) imgs[i] = await excelImage(u);
    }
  }));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('업무목록', { views: [{ state: 'frozen', ySplit: 1 }] });
  const heads = ['제품 이미지', ...Object.keys(data[0])];
  ws.columns = heads.map((h, i) => ({
    header: h, key: h,
    width: i === 0 ? 21 : Math.min(h === '촬영 유의사항' ? 70 : 40, Math.max(10, xlWidth(h) + 2, ...data.map((d) => xlWidth(d[h]) + 2))),
  }));
  data.forEach((d) => ws.addRow({ ...d, '제품 이미지': '' }));
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    row.height = n === 1 ? 24 : 150;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = center;
      if (n === 1) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F5' } };
      }
      cell.border = { top: { style: 'thin', color: { argb: 'FFDDDDE2' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDE2' } }, left: { style: 'thin', color: { argb: 'FFDDDDE2' } }, right: { style: 'thin', color: { argb: 'FFDDDDE2' } } };
    });
  });
  // 셀 네 모서리에 고정(twoCell): 셀 크기에 딱 맞게 들어가고, 열·행 크기를 바꾸면 함께 맞춰짐
  imgs.forEach((im, i) => {
    if (!im) return;
    const id = wb.addImage({ base64: im.base64, extension: 'png' });
    ws.addImage(id, {
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: i + 1, nativeRowOff: 0 },
      br: { nativeCol: 1, nativeColOff: 0, nativeRow: i + 2, nativeRowOff: 0 },
      editAs: 'twoCell',
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${name}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  const miss = imgs.filter((x, i) => atts[i] && !x).length;
  toast(`엑셀 파일을 내려받았습니다.${miss ? ` (이미지 ${miss}개는 불러오지 못했습니다)` : ''}`);
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
      <select class="input" data-f="category">${options(categoryList(f.category), f.category, { empty: '카테고리 전체' })}</select>
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
      <thead><tr><th></th><th>관리번호</th><th>브랜드</th><th>유통 제품명(한글)</th><th>카테고리</th><th>구분</th><th>입고 예정 (수량)</th>
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

// ===================================================================== 06 패치노트 (모든 사용자)
const PN_TYPE_CLASS = { 신규: 'new', 수정: 'mod', 보완: 'imp' };
function patchNotesView(route, el) {
  let filter = '';
  const areas = [...new Set(PATCH_NOTES.flatMap((n) => n.items.map((i) => i.area)))];
  const draw = () => {
    const notes = PATCH_NOTES.map((n) => ({ ...n, items: n.items.filter((i) => !filter || i.area === filter) })).filter((n) => n.items.length);
    el.innerHTML = `
      <div class="toolbar"><div class="seg-ctl pn-filter">
        <button data-area="" class="${!filter ? 'on' : ''}">전체</button>
        ${areas.map((a) => `<button data-area="${esc(a)}" class="${filter === a ? 'on' : ''}">${esc(a)}</button>`).join('')}
      </div></div>
      <div class="pn-list">${notes.map((n, idx) => `
        <section class="card pn-card">
          <div class="pn-head"><span class="pn-ver">${esc(n.version)}</span><h3>${esc(n.title)}</h3>
            ${idx === 0 && !filter ? '<span class="tag new">최신</span>' : ''}<span class="grow"></span><time class="muted small">${esc(n.date.replace(/-/g, '.'))}</time></div>
          <ul class="pn-items">${n.items.map((i) => `
            <li><span class="pn-type ${PN_TYPE_CLASS[i.type] || ''}">${esc(i.type)}</span><span class="pn-area">${esc(i.area)}</span><span class="pn-text">${esc(i.text)}</span></li>`).join('')}</ul>
        </section>`).join('') || '<p class="empty big">해당 업데이트가 없습니다.</p>'}</div>`;
    $$('[data-area]', el).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.area; draw(); }));
  };
  draw();
  el._update = () => {};
  markPatchNotesSeen();
}

// ===================================================================== 관리자
function adminView(route, el) {
  const draw = () => {
    const users = S.data.profiles.filter((u) => !u.deleted_at).sort((a, b) => (a.role === 'pending' ? -1 : 1) - (b.role === 'pending' ? -1 : 1) || a.name.localeCompare(b.name));
    el.innerHTML = `
      <div class="card"><div class="card-head"><h3>사용자 및 권한</h3>
        <span class="muted small">신규 가입자는 '승인 대기' 상태입니다. 소속 팀을 지정하면 바로 이용할 수 있습니다.</span></div>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>계정 상태</th><th>슬랙 DM</th><th>가입일</th><th></th></tr></thead>
          <tbody>${users.map((u) => `<tr class="${u.role === 'pending' ? 'hl' : ''}">
            <td><strong>${esc(u.name)}</strong>${u.id === S.me.id ? ' <span class="tag">나</span>' : ''}</td>
            <td>${esc(u.email || '')}</td>
            <td><select class="input input-sm" data-role="${u.id}">${options(Object.entries(ROLES), u.role)}</select></td>
            <td><label class="check"><input type="checkbox" data-active="${u.id}" ${u.active ? 'checked' : ''}><span>${u.active ? '활성' : '비활성'}</span></label></td>
            <td><div class="slack-cell">
              <label class="check"><input type="checkbox" data-slack-on="${u.id}" ${u.slack_enabled !== false ? 'checked' : ''}><span>받기</span></label>
              <input class="input input-sm" data-slack-id="${u.id}" value="${esc(u.slack_user_id || '')}" placeholder="자동 연결" title="비워 두면 첫 알림 때 가입 이메일로 슬랙 계정을 자동으로 찾습니다. 이메일이 다르면 슬랙 멤버 ID(U로 시작)를 입력하세요.">
            </div></td>
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
        <div class="card"><div class="card-head"><h3>카테고리</h3></div>
          <div class="list-edit">${S.data.categories.map((c) => `<div class="li"><span>${esc(c.name)}</span>
            <label class="check"><input type="checkbox" data-cat="${esc(c.name)}" ${c.active !== false ? 'checked' : ''}><span>사용</span></label>
            <button class="btn-link danger" data-del-cat="${esc(c.name)}">삭제</button></div>`).join('')}</div>
          <p class="muted small">제품·촬영 요청에 쓰인 카테고리는 삭제할 수 없습니다. 더 이상 쓰지 않으면 「사용」 체크를 해제하세요. 새로 추가한 카테고리는 공통 사양(사이즈·컬러·소재 등)만 입력합니다.</p>
          <form class="row gap" id="add-cat"><input class="input" name="name" placeholder="새 카테고리명" required><button class="btn">추가</button></form>
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
    $$('[data-slack-on]', el).forEach((c) => c.addEventListener('change', () =>
      act(() => S.db.update('profiles', { id: c.dataset.slackOn }, { slack_enabled: c.checked }).then(() => loadTable('profiles')), c.checked ? '슬랙 DM을 켰습니다.' : '슬랙 DM을 껐습니다.')));
    $$('[data-slack-id]', el).forEach((i) => i.addEventListener('change', () => {
      const v = i.value.trim();
      if (v && !/^[UW][A-Z0-9]{6,}$/.test(v)) { toast('슬랙 멤버 ID는 U로 시작하는 영문 대문자·숫자입니다. (슬랙 프로필 > ⋮ > 멤버 ID 복사)', 'error'); return draw(); }
      act(() => S.db.update('profiles', { id: i.dataset.slackId }, { slack_user_id: v || null }).then(() => loadTable('profiles')), '슬랙 연결 정보를 저장했습니다.');
    }));
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
      const used = S.data.products.filter((p) => p.brand_id === id).length + S.data.design_requests.filter((r) => r.brand_id === id).length + S.data.shoot_requests.filter((r) => String(r.product_brand_id) === String(id)).length;
      if (used) return toast(`「${br.name}」 브랜드는 제품·업무 ${used}건에서 사용 중이라 삭제할 수 없습니다. 「사용」 체크를 해제해 숨겨 주세요.`, 'error');
      if (!(await confirmBox(`「${br.name}」 브랜드를 삭제할까요?`, { danger: true, ok: '삭제' }))) return;
      act(() => S.db.remove('brands', { id }).then(() => loadTable('brands')).then(draw), '브랜드를 삭제했습니다.');
    }));
    $$('[data-cat]', el).forEach((c) => c.addEventListener('change', () =>
      act(() => S.db.update('categories', { name: c.dataset.cat }, { active: c.checked }).then(() => loadTable('categories')), '저장했습니다.')));
    $$('[data-del-cat]', el).forEach((b) => b.addEventListener('click', async () => {
      const name = b.dataset.delCat;
      const used = S.data.products.filter((p) => p.category === name).length + S.data.shoot_requests.filter((r) => r.product_category === name).length;
      if (used) return toast(`「${name}」 카테고리는 제품·촬영 요청 ${used}건에서 사용 중이라 삭제할 수 없습니다. 「사용」 체크를 해제해 숨겨 주세요.`, 'error');
      if (!(await confirmBox(`「${name}」 카테고리를 삭제할까요?`, { danger: true, ok: '삭제' }))) return;
      act(() => S.db.remove('categories', { name }).then(() => loadTable('categories')).then(draw), '카테고리를 삭제했습니다.');
    }));
    $('#add-cat', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.elements.namedItem('name').value.trim();
      if (S.data.categories.some((c) => c.name === name)) return toast('이미 있는 카테고리입니다.', 'error');
      const sort = Math.max(0, ...S.data.categories.map((c) => c.sort || 0)) + 1;
      act(() => S.db.insert('categories', { name, sort, active: true }).then(() => loadTable('categories')).then(draw), '카테고리를 추가했습니다.');
    });
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

// 새 패치노트 표시 (이 브라우저에서 마지막으로 본 버전 기준)
const PN_KEY = 'fbg-patchnotes-seen';
export function hasNewPatchNotes() {
  try { return localStorage.getItem(PN_KEY) !== PATCH_NOTES[0]?.version; } catch { return false; }
}
function markPatchNotesSeen() {
  try { localStorage.setItem(PN_KEY, PATCH_NOTES[0]?.version || ''); } catch { /* 저장 불가 시 무시 */ }
}
