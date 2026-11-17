import { S, can, product, pname, launchOf, requests, requestType, brandName, loadTable, productImages } from './store.js';
import { KINDS, PRIORITIES, CATEGORIES, PRODUCT_KINDS, COMMON_SPECS, CATEGORY_SPECS, PACKAGE_TYPES, SHOOT_PURPOSES,
  SHOOT_TYPES, SHOOT_LOCATIONS, CHANNELS } from './constants.js';
import { $, $$, esc, openModal, toast, errMsg, readForm, options, checks, statusPill, fmtDate, timeAgo, confirmBox } from './ui.js';
import { openDetail, openProduct, uploadFiles, productGallery } from './detail.js';

// ---------------------------------------------------------------- 제품 입력 섹션
function specInputs(list, specs = {}) {
  return list.map((s) => `
    <label class="field ${s.wide ? 'wide' : ''}"><span>${esc(s.label)}</span>
      ${s.options ? `<select class="input" data-spec="${s.key}">${options(s.options, specs[s.key] || '', { empty: '선택' })}</select>`
        : s.type === 'textarea' ? `<textarea class="input" rows="2" data-spec="${s.key}">${esc(specs[s.key] || '')}</textarea>`
        : `<input class="input" data-spec="${s.key}" value="${esc(specs[s.key] || '')}">`}
    </label>`).join('');
}
const optRow = (o = {}) => `<div class="opt-row">
  ${['name', 'color', 'size', 'material', 'note'].map((k) => `<input class="input" data-k="${k}" value="${esc(o[k] || '')}" placeholder="${{ name: '옵션명', color: '컬러', size: '사이즈', material: '소재', note: '비고' }[k]}">`).join('')}
  <button type="button" class="icon-btn" data-rm>✕</button></div>`;
const chgRow = (c = {}) => `<div class="chg-row">
  <input class="input" data-k="field" value="${esc(c.field || '')}" placeholder="변경 항목 (예: 프레임 두께)">
  <input class="input" data-k="before" value="${esc(c.before || '')}" placeholder="기존">
  <span>→</span>
  <input class="input" data-k="after" value="${esc(c.after || '')}" placeholder="변경">
  <button type="button" class="icon-btn" data-rm>✕</button></div>`;

function productSection(p = {}, { withImages = true } = {}) {
  const brands = S.data.brands.filter((b) => b.active || String(b.id) === String(p.brand_id));
  return `<div class="prod-fields">
    <fieldset><legend>기본 정보</legend><div class="form-grid prod-basic">
      <label class="field"><span>브랜드 <b class="req">*</b></span><select class="input" name="brand_id" required>${options(brands.map((b) => [String(b.id), b.name]), String(p.brand_id ?? ''), { empty: '선택' })}</select></label>
      <label class="field"><span>제품 카테고리 <b class="req">*</b></span><select class="input" name="category" required>${options(CATEGORIES, p.category, { empty: '선택' })}</select></label>
      <label class="field wide"><span>유통 제품명 <b class="req">*</b></span><input class="input" name="retail_name" required value="${esc(p.retail_name || '')}"></label>
      <label class="field wide"><span>온라인 제품명</span><input class="input" name="online_name" value="${esc(p.online_name || '')}"></label>
      <label class="field wide"><span>요청 구분 <b class="req">*</b></span><select class="input" name="product_kind" required>${options(PRODUCT_KINDS, p.product_kind || '신제품')}</select></label>
      <label class="field"><span>입고 예정일</span><input class="input" type="date" name="arrival_date" value="${esc(p.arrival_date || '')}"></label>
      <label class="field"><span>입고 예정 수량</span><input class="input" type="number" min="0" step="1" name="arrival_qty" value="${esc(p.arrival_qty ?? '')}" placeholder="예: 300"></label>
    </div></fieldset>
    <fieldset><legend>제품 상세 사양</legend>
      <div class="form-grid">${specInputs(COMMON_SPECS, p.specs)}</div>
      <div class="cat-specs"></div>
      <h4>옵션별 사양 <small class="muted">컬러·사이즈·소재가 옵션별로 다르면 행을 추가하세요</small></h4>
      <div class="opt-rows">${(p.options || []).map(optRow).join('')}</div>
      <button type="button" class="btn btn-sm" data-add-opt>+ 옵션 추가</button>
      <div class="chg-box">
        <h4>사양 변경사항 <small class="muted">리뉴얼 제품의 기존 → 변경 내용</small></h4>
        <div class="chg-rows">${(p.spec_changes || []).map(chgRow).join('')}</div>
        <button type="button" class="btn btn-sm" data-add-chg>+ 변경 항목 추가</button>
      </div>
      <label class="field wide"><span>추가 설명 (예외적인 제품 특징)</span><textarea class="input" rows="2" data-pnote>${esc(p.spec_notes || '')}</textarea></label>
    </fieldset>
    ${withImages ? `<fieldset><legend>제품 이미지</legend>
      <label class="dropzone"><input type="file" accept="image/*" multiple data-pimg><span>이미지 파일을 선택하세요 (여러 장 가능)</span></label>
      <div class="file-list" data-pimg-list></div></fieldset>` : ''}
  </div>`;
}

function bindProductSection(root, p = {}) {
  const sec = $('.prod-fields', root);
  if (!sec) return;
  let specCache = { ...(p.specs || {}) };
  const catSel = $('[name=category]', sec);
  const drawCat = () => {
    $$('.cat-specs [data-spec]', sec).forEach((i) => { specCache[i.dataset.spec] = i.value; });
    const list = CATEGORY_SPECS[catSel.value] || [];
    $('.cat-specs', sec).innerHTML = list.length ? `<h4>${esc(catSel.value)} 세부 사양</h4><div class="form-grid">${specInputs(list, specCache)}</div>` : '';
  };
  catSel.addEventListener('change', drawCat);
  drawCat();
  const kindSel = $('[name=product_kind]', sec);
  const chg = () => { $('.chg-box', sec).hidden = kindSel.value === '신제품' && !$$('.chg-row', sec).length; };
  kindSel.addEventListener('change', chg);
  chg();
  sec.addEventListener('click', (e) => {
    if (e.target.matches('[data-add-opt]')) $('.opt-rows', sec).insertAdjacentHTML('beforeend', optRow());
    if (e.target.matches('[data-add-chg]')) $('.chg-rows', sec).insertAdjacentHTML('beforeend', chgRow());
    if (e.target.matches('[data-rm]')) e.target.parentElement.remove();
  });
  const img = $('[data-pimg]', sec);
  img?.addEventListener('change', () => {
    $('[data-pimg-list]', sec).innerHTML = [...img.files].map((f) => `<span class="file-chip">${esc(f.name)}</span>`).join('');
  });
}

function readProductSection(root) {
  const sec = $('.prod-fields', root);
  const basic = readForm($('.prod-basic', sec));
  const specs = {};
  $$('[data-spec]', sec).forEach((i) => { if (i.value.trim()) specs[i.dataset.spec] = i.value.trim(); });
  const rows = (sel, keys) => $$(sel, sec).map((r) => Object.fromEntries(keys.map((k) => [k, $(`[data-k=${k}]`, r).value.trim()])))
    .filter((o) => Object.values(o).some(Boolean));
  return {
    ...basic,
    brand_id: basic.brand_id ? Number(basic.brand_id) : null,
    arrival_qty: basic.arrival_qty != null && basic.arrival_qty !== '' ? Number(basic.arrival_qty) : null,
    specs,
    options: rows('.opt-row', ['name', 'color', 'size', 'material', 'note']),
    spec_changes: rows('.chg-row', ['field', 'before', 'after']),
    spec_notes: $('[data-pnote]', sec).value.trim() || null,
  };
}

// ---------------------------------------------------------------- 제품 선택 / 자동 표시
function productPicker(selected, { required = true, brandFilter = null } = {}) {
  const list = S.data.products.filter((p) => !brandFilter || String(p.brand_id) === String(brandFilter));
  const byBrand = {};
  list.forEach((p) => { (byBrand[brandName(p.brand_id)] ||= []).push(p); });
  return `<select class="input" name="product_id" ${required ? 'required' : ''}>
    <option value="">${required ? '제품을 선택하세요' : '연관 제품 없음'}</option>
    ${Object.entries(byBrand).map(([b, ps]) => `<optgroup label="${esc(b)}">${ps.map((p) => `
      <option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(pname(p))} · ${esc(p.category)} · ${esc(p.product_kind)}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

function productInfo(pid, kind) {
  const p = product(pid);
  if (!p) return '';
  const specs = [...COMMON_SPECS, ...(CATEGORY_SPECS[p.category] || [])].filter((s) => p.specs?.[s.key]);
  const open = requests(kind).filter((r) => r.product_id === pid && !r.cancelled && r.status !== '완료');
  return `
    ${open.length ? `<div class="dup-warn"><strong>이 제품에 진행 중인 ${KINDS[kind].short} 업무가 ${open.length}건 있습니다.</strong>
      <span>중복 요청인지 확인하세요. 추가 작업이 필요하면 그대로 진행해도 됩니다.</span>
      ${open.map((r) => `<button type="button" class="mini-row" data-open-req="${kind}:${r.id}"><span class="grow"><strong>${esc(r.code)}</strong> <small>${esc(requestType({ ...r, _kind: kind }))} · 희망 ${fmtDate(r.due_date)}</small></span>${statusPill(r.status)}</button>`).join('')}
    </div>` : ''}
    <div class="product-info">
      ${productGallery(pid)}
      <div class="grow">
        <div class="muted small">${esc(brandName(p.brand_id))} · ${esc(p.category)} · ${esc(p.product_kind)} · 입고 예정 ${fmtDate(p.arrival_date)}${p.arrival_qty != null ? ` · ${esc(p.arrival_qty)}개` : ''}</div>
        <strong>${esc(pname(p))}</strong> <span class="small">${p.online_name && p.online_name !== p.retail_name ? `온라인: ${esc(p.online_name)}` : ''}</span>
        <dl class="spec-mini">${specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(p.specs[s.key])}</dd></div>`).join('')}</dl>
        ${p.options?.length ? `<div class="small"><b>옵션</b> ${p.options.map((o) => esc([o.name, o.color, o.size, o.material].filter(Boolean).join(' / '))).join(' · ')}</div>` : ''}
        ${p.spec_changes?.length ? `<div class="small"><b>변경사항</b> ${p.spec_changes.map((c) => `${esc(c.field)}: ${esc(c.before)} → ${esc(c.after)}`).join(' · ')}</div>` : ''}
        ${p.spec_notes ? `<div class="small"><b>특이사항</b> ${esc(p.spec_notes)}</div>` : ''}
        <div class="row gap-sm"><span class="muted small">제품 사양은 물류/발주팀 등록 정보로 고정됩니다.</span>
          <button type="button" class="btn-link small" data-correction="${p.id}">정보 오류 수정 요청</button></div>
      </div>
    </div>`;
}

async function requestCorrection(pid) {
  const text = await confirmBox('제품 정보의 어떤 부분이 잘못되었나요? 물류/발주팀에 알림이 전달됩니다.', { ok: '수정 요청 보내기', input: '예: 상판 두께가 25mm가 아니라 30mm입니다' });
  if (!text || text === true) return;
  try {
    await S.db.insert('comments', { entity_type: 'product', entity_id: pid, kind: 'correction', body: text });
    await loadTable('comments');
    toast('수정 요청을 남겼습니다.');
  } catch (e) { toast(errMsg(e), 'error'); }
}

// ---------------------------------------------------------------- 요청 폼
const MULTI_TYPE_HINT = '여러 개 선택하면 유형별로 업무가 각각 생성됩니다.';

function requestFields(kind, r, { create, multiType }) {
  const pr = `
    <label class="field"><span>우선순위 <b class="req">*</b></span><select class="input" name="priority" required>${options(PRIORITIES, r.priority || '보통')}</select></label>
    <label class="field"><span>희망 완료일 <b class="req">*</b></span><input class="input" type="date" name="due_date" required value="${esc(r.due_date || '')}"></label>`;
  const files = `<label class="field wide"><span>${kind === 'package' ? '제품 이미지, 파일 첨부 <small class="muted">이미지는 제품 이미지로 등록되어 브랜드팀 요청서에도 함께 표시됩니다</small>' : '참고 이미지 첨부'}</span>
    <label class="dropzone"><input type="file" multiple data-reqfiles><span>파일 선택 (여러 개 가능)</span></label><div class="file-list" data-reqfiles-list></div></label>`;

  if (kind === 'package') return `
    <fieldset><legend>패키지 디자인 요청 정보</legend><div class="form-grid">
      ${create ? `<div class="field wide"><span>요청 디자인 유형 <b class="req">*</b> <small class="muted">${MULTI_TYPE_HINT}</small></span>${checks('design_types', PACKAGE_TYPES, r.design_types || (r.design_type ? [r.design_type] : []))}</div>`
        : `<label class="field"><span>요청 디자인 유형 <b class="req">*</b></span><select class="input" name="design_type">${options(PACKAGE_TYPES, r.design_type)}</select></label>`}
      <label class="field"><span>기타 유형 입력</span><input class="input" name="design_type_etc" value="${esc(r.design_type_etc || '')}"></label>
      <label class="field wide"><span>패키지 규격</span><input class="input" name="package_spec" value="${esc(r.package_spec || '')}" placeholder="예: 1250 × 1250 × 120 mm, 골판지 5겹"></label>
      <label class="field wide"><span>필수 기재 문구</span><textarea class="input" rows="2" name="required_text">${esc(r.required_text || '')}</textarea></label>
      <label class="field wide"><span>인쇄 관련 유의사항</span><textarea class="input" rows="2" name="print_notes">${esc(r.print_notes || '')}</textarea></label>
      <label class="field wide"><span>디자인 레퍼런스 URL(카피 제품 URL, ex 비아브 테이블은 피아바 가베 테이블을 카피한 상품으로 가베 테이블 링크 첨부)</span><input class="input" name="reference_url" value="${esc(r.reference_url || '')}" placeholder="https://"></label>
      ${create ? files : ''}
      <label class="field wide"><span>추가 요청사항</span><textarea class="input" rows="2" name="request_note">${esc(r.request_note || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>일정 및 우선순위</legend><div class="form-grid">${pr}</div></fieldset>`;

  if (kind === 'shoot') {
    const p = product(r.product_id);
    const optNames = (p?.options || []).map((o) => o.name || o.color).filter(Boolean);
    return `
    <fieldset><legend>촬영 요청 내용</legend><div class="form-grid">
      <label class="field"><span>촬영 목적 <b class="req">*</b></span><select class="input" name="purpose" required>${options(SHOOT_PURPOSES, r.purpose, { empty: '선택' })}</select></label>
      <label class="field"><span>목적 직접 입력</span><input class="input" name="purpose_etc" value="${esc(r.purpose_etc || '')}"></label>
      <div class="field wide"><span>촬영 유형 <b class="req">*</b> <small class="muted">복수 선택</small></span>${checks('shoot_types', SHOOT_TYPES, r.shoot_types || [])}</div>
      <label class="field wide"><span>기타 촬영 유형</span><input class="input" name="shoot_types_etc" value="${esc(r.shoot_types_etc || '')}"></label>
      <label class="field"><span>촬영 장소</span><select class="input" name="location">${options(SHOOT_LOCATIONS, r.location, { empty: '선택' })}</select></label>
      <label class="field"><span>장소 직접 입력</span><input class="input" name="location_etc" value="${esc(r.location_etc || '')}"></label>
      <div class="field wide shoot-opts"><span>촬영 제품 옵션</span>${optNames.length ? checks('shoot_options', optNames, r.shoot_options || []) : '<small class="muted">등록된 옵션이 없습니다.</small>'}</div>
      <label class="field"><span>촬영 수량 (컷)</span><input class="input" type="number" min="0" name="quantity" value="${esc(r.quantity ?? '')}"></label>
      <label class="field"><span>촬영 희망일</span><input class="input" type="date" name="desired_shoot_date" value="${esc(r.desired_shoot_date || '')}"></label>
      <label class="field wide"><span>촬영 유의사항</span><textarea class="input" rows="2" name="caution">${esc(r.caution || '')}</textarea></label>
      <label class="field wide"><span>촬영 레퍼런스 URL</span><input class="input" name="reference_url" value="${esc(r.reference_url || '')}" placeholder="https://"></label>
      ${create ? files : ''}
      <label class="field wide"><span>추가 요청사항</span><textarea class="input" rows="2" name="request_note">${esc(r.request_note || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>일정 및 우선순위</legend><div class="form-grid">${pr}</div></fieldset>`;
  }

  // design
  const types = S.data.design_work_types.map((w) => w.name);
  const shoots = requests('shoot').filter((x) => r.product_id && x.product_id === r.product_id && !x.cancelled);
  return `
    <fieldset><legend>디자인 작업 요청 내용</legend><div class="form-grid">
      ${create ? `<div class="field wide"><span>작업 유형 <b class="req">*</b> <small class="muted">${MULTI_TYPE_HINT}</small></span>${checks('work_types', types, multiType || r.work_types || (r.work_type ? [r.work_type] : []))}
          ${['admin', 'brand'].includes(S.me.role) ? '<div class="row gap-sm"><input class="input input-sm" data-new-type placeholder="새 작업 유형"><button type="button" class="btn btn-sm" data-add-type>유형 추가</button></div>' : ''}</div>`
        : `<label class="field"><span>작업 유형 <b class="req">*</b></span><select class="input" name="work_type">${options(types.includes(r.work_type) ? types : [r.work_type, ...types], r.work_type)}</select></label>`}
      <label class="field wide"><span>작업명 <b class="req">*</b></span><input class="input" name="title" required value="${esc(r.title || '')}" placeholder="예: X프레임 책장 상세페이지"></label>
      ${shoots.length ? `<label class="field wide"><span>연결 촬영 요청</span><select class="input" name="shoot_request_id">${options(shoots.map((x) => [x.id, `${x.code} · ${(x.shoot_types || []).join(', ')} · ${x.status}`]), r.shoot_request_id, { empty: '연결 안 함' })}</select></label>` : ''}
      <label class="field wide"><span>제작 목적</span><textarea class="input" rows="2" name="purpose">${esc(r.purpose || '')}</textarea></label>
      <div class="field wide"><span>사용 위치 <small class="muted">복수 선택</small></span>${checks('channels', CHANNELS, r.channels || [])}</div>
      <label class="field wide"><span>기타 사용 위치</span><input class="input" name="channels_etc" value="${esc(r.channels_etc || '')}"></label>
      <label class="field wide"><span>기획안 URL</span><input class="input" name="plan_url" value="${esc(r.plan_url || '')}" placeholder="Figma, Notion, Google Docs 등"></label>
      <label class="field wide"><span>레퍼런스 URL</span><input class="input" name="reference_url" value="${esc(r.reference_url || '')}" placeholder="https://"></label>
      ${create ? files : ''}
      <label class="field wide"><span>디자인 유의사항</span><textarea class="input" rows="2" name="caution">${esc(r.caution || '')}</textarea></label>
      <label class="field wide"><span>추가 요청사항</span><textarea class="input" rows="2" name="request_note">${esc(r.request_note || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>일정 및 우선순위</legend><div class="form-grid">${pr}</div></fieldset>`;
}

/**
 * 업무 요청 등록/수정 폼
 * opts: { edit: 기존 행, productId, shootId, multiType, draft: drafts 행 }
 */
export function openRequestForm(kind, opts = {}) {
  if (!can.createRequest(kind) && !opts.edit) return toast('이 요청을 등록할 권한이 없습니다.', 'error');
  const edit = opts.edit;
  const create = !edit;
  const draftPayload = opts.draft?.payload || {};
  let state = {
    productMode: draftPayload.productMode || (opts.productId || kind !== 'package' ? 'existing' : 'new'),
    productId: draftPayload.productId || opts.productId || edit?.product_id || null,
    newProduct: draftPayload.newProduct || {},
    req: draftPayload.req || { ...(edit || {}), product_id: opts.productId || edit?.product_id || null, shoot_request_id: opts.shootId || edit?.shoot_request_id || null },
  };
  if (kind === 'design' && create && !state.req.brand_id && state.productId) state.req.brand_id = product(state.productId)?.brand_id;
  if (kind === 'design' && create && !state.req.title && state.productId && opts.multiType) state.req.title = pname(product(state.productId));
  if (kind === 'shoot' && create && !state.req.purpose && state.productId) {
    const pk = product(state.productId)?.product_kind;
    state.req.purpose = pk === '리뉴얼' ? '제품 리뉴얼' : pk === '신제품' ? '신제품 론칭' : '';
  }

  const m = openModal(`<form class="req-form" novalidate>
    <div class="modal-head"><h2>${KINDS[kind].label} ${create ? '등록' : `수정 <span class="muted mono small">${esc(edit.code)}</span>`}</h2><button type="button" class="icon-btn" data-close>✕</button></div>
    <div class="modal-body"><div class="form-body"></div></div>
    <div class="modal-foot">
      <span class="muted small"><b class="req">*</b> 필수 입력</span><div class="grow"></div>
      ${create ? '<button type="button" class="btn" data-draft>임시저장</button>' : ''}
      <button type="button" class="btn" data-close>닫기</button>
      <button type="submit" class="btn btn-primary">${create ? '요청 제출' : '수정 저장'}</button>
    </div></form>`, { wide: true });
  const form = $('form', m.el);
  const body = $('.form-body', m.el);

  const snapshot = () => {
    if ($('.prod-fields', body)) state.newProduct = readProductSection(body);
    const rf = $('.req-fields', body);
    if (rf) state.req = { ...state.req, ...readForm(rf) };
    const pSel = $('.pick [name=product_id]', body);
    if (pSel) state.productId = pSel.value || null;
    const bSel = $('.pick [name=brand_id]', body);
    if (bSel) state.req.brand_id = bSel.value ? Number(bSel.value) : null;
  };

  const draw = () => {
    if (kind === 'design') state.req.product_id = state.productId;
    if (kind === 'shoot') state.req.product_id = state.productId;
    let top = '';
    if (kind === 'package' && create) {
      top = `<div class="seg-ctl mode">
          <button type="button" data-mode="new" class="${state.productMode === 'new' ? 'on' : ''}">신규 제품 등록 + 요청</button>
          <button type="button" data-mode="existing" class="${state.productMode === 'existing' ? 'on' : ''}">등록된 제품 선택</button></div>
        ${state.productMode === 'new' ? productSection(state.newProduct) : `<fieldset class="pick"><legend>제품 선택</legend>${productPicker(state.productId)}${state.productId ? productInfo(state.productId, 'package') : ''}</fieldset>`}`;
    } else if (kind === 'package') {
      top = `<fieldset><legend>제품</legend>${productInfo(state.productId, 'package').replace(/<div class="dup-warn">[\s\S]*?<\/div>\s*<div class="product-info">/, '<div class="product-info">')}<p class="muted small">제품 정보는 제품 통합 관리에서 수정합니다.</p></fieldset>`;
    } else if (kind === 'shoot') {
      top = `<fieldset class="pick"><legend>제품 선택 <b class="req">*</b></legend>${productPicker(state.productId)}
        ${state.productId ? productInfo(state.productId, 'shoot') : '<p class="muted small">물류/발주팀이 등록한 제품을 선택하면 사양이 자동으로 표시됩니다.</p>'}</fieldset>`;
    } else {
      const brands = S.data.brands.filter((b) => b.active || String(b.id) === String(state.req.brand_id));
      top = `<fieldset class="pick"><legend>브랜드 · 연관 제품</legend><div class="form-grid">
        <label class="field"><span>브랜드 <b class="req">*</b></span><select class="input" name="brand_id" required>${options(brands.map((b) => [String(b.id), b.name]), String(state.req.brand_id ?? ''), { empty: '선택' })}</select></label>
        <label class="field"><span>연관 제품 <small class="muted">선택사항</small></span>${productPicker(state.productId, { required: false, brandFilter: state.req.brand_id })}</label>
        </div>${state.productId ? productInfo(state.productId, 'design') : ''}</fieldset>`;
    }
    body.innerHTML = `${top}<div class="req-fields">${requestFields(kind, state.req, { create, multiType: create ? opts.multiType : null })}</div>`;
    opts.multiType = null;
    bindProductSection(body, state.newProduct);
    $$('[data-mode]', body).forEach((b) => b.addEventListener('click', () => { snapshot(); state.productMode = b.dataset.mode; draw(); }));
    $('.pick [name=product_id]', body)?.addEventListener('change', () => {
      snapshot();
      if (kind === 'design' && state.productId) state.req.brand_id = product(state.productId)?.brand_id;
      draw();
    });
    $('.pick [name=brand_id]', body)?.addEventListener('change', () => {
      snapshot();
      if (state.productId && String(product(state.productId)?.brand_id) !== String(state.req.brand_id)) state.productId = null;
      draw();
    });
    $$('[data-open-req]', body).forEach((b) => b.addEventListener('click', () => { const [k, id] = b.dataset.openReq.split(':'); openDetail(k, id); }));
    $$('[data-correction]', body).forEach((b) => b.addEventListener('click', () => requestCorrection(b.dataset.correction)));
    const rf = $('[data-reqfiles]', body);
    rf?.addEventListener('change', () => { $('[data-reqfiles-list]', body).innerHTML = [...rf.files].map((f) => `<span class="file-chip">${esc(f.name)}</span>`).join(''); });
    $('[data-add-type]', body)?.addEventListener('click', async () => {
      const name = $('[data-new-type]', body).value.trim();
      if (!name) return;
      try {
        if (!S.data.design_work_types.some((w) => w.name === name)) await S.db.insert('design_work_types', { name, sort: 50 });
        await loadTable('design_work_types');
        snapshot();
        state.req.work_types = [...(state.req.work_types || []), name];
        draw();
      } catch (e) { toast(errMsg(e), 'error'); }
    });
  };
  draw();
  form.addEventListener('input', () => form.classList.add('dirty'));

  // 임시저장 (서버에 본인 전용으로 저장)
  $('[data-draft]', m.el)?.addEventListener('click', async () => {
    snapshot();
    const title = state.newProduct?.retail_name || state.newProduct?.online_name || (state.productId && pname(product(state.productId))) || state.req.title || '(제목 없음)';
    const payload = { productMode: state.productMode, productId: state.productId, newProduct: state.newProduct, req: state.req };
    try {
      if (opts.draft) await S.db.update('drafts', { id: opts.draft.id }, { payload, title, updated_at: new Date().toISOString() });
      else opts.draft = (await S.db.insert('drafts', { kind, title, payload }))[0];
      await loadTable('drafts');
      form.classList.remove('dirty');
      toast('임시저장했습니다. 첨부파일은 제출 시 업로드됩니다.');
      S.hooks.rerender();
    } catch (e) { toast(errMsg(e), 'error'); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    snapshot();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const req = { ...state.req };
    const files = [...($('[data-reqfiles]', body)?.files || [])];
    const missing = [];
    if (kind !== 'design' && !state.productId && state.productMode !== 'new') missing.push('제품');
    if (create && kind === 'package' && !(req.design_types || []).length) missing.push('요청 디자인 유형');
    if (kind === 'shoot' && !(req.shoot_types || []).length) missing.push('촬영 유형');
    if (create && kind === 'design' && !(req.work_types || []).length) missing.push('작업 유형');
    if (missing.length) return toast(`필수 항목을 입력하세요: ${missing.join(', ')}`, 'error');

    const btn = $('button[type=submit]', m.el);
    btn.disabled = true;
    try {
      const table = KINDS[kind].table;
      const cols = requestColumns(kind);
      const clean = (o) => Object.fromEntries(cols.filter((c) => c in o).map((c) => [c, o[c] === '' ? null : o[c]]));
      if (req.quantity !== undefined && req.quantity !== null) req.quantity = Number(req.quantity);

      if (edit) {
        const patch = clean(req);
        delete patch.product_id;
        if (kind === 'design') { patch.product_id = state.productId; patch.brand_id = req.brand_id ? Number(req.brand_id) : null; }
        if (kind === 'shoot') patch.product_id = state.productId;
        Object.keys(patch).forEach((k) => { if (JSON.stringify(patch[k] ?? null) === JSON.stringify(edit[k] ?? null)) delete patch[k]; });
        if (Object.keys(patch).length) await S.db.update(table, { id: edit.id }, patch);
        await loadTable(table);
        toast('수정했습니다.');
        form.classList.remove('dirty');
        m.close();
        S.hooks.rerender();
        return;
      }

      // 1) 신규 제품 등록 (패키지 요청)
      let pid = state.productId;
      if (kind === 'package' && state.productMode === 'new') {
        const np = state.newProduct;
        const [row] = await S.db.insert('products', productColumns(np));
        pid = row.id;
        const imgs = [...($('[data-pimg]', body)?.files || [])];
        if (imgs.length) await uploadFiles('product', pid, 'product_image', imgs);
      }
      // 2) 유형별 업무 생성
      const typeList = kind === 'package' ? req.design_types : kind === 'design' ? req.work_types : [null];
      const rows = typeList.map((t) => {
        const r = clean({ ...req, product_id: pid || null });
        if (kind === 'package') r.design_type = t;
        if (kind === 'design') {
          r.work_type = t;
          r.brand_id = req.brand_id ? Number(req.brand_id) : null;
          r.title = typeList.length > 1 ? `${req.title} - ${t}` : req.title;
        }
        return r;
      });
      const created = await S.db.insert(table, rows);
      // 패키지 요청: 이미지는 제품 이미지(모든 팀 공유)로, 그 외 파일은 각 요청의 첨부파일로 저장
      const isImg = (f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(f.name);
      const reqFiles = kind === 'package' && pid ? files.filter((f) => !isImg(f)) : files;
      if (kind === 'package' && pid && files.some(isImg)) await uploadFiles('product', pid, 'product_image', files.filter(isImg));
      for (const c of created) if (reqFiles.length) await uploadFiles(kind, c.id, 'reference', reqFiles);
      if (opts.draft) await S.db.remove('drafts', { id: opts.draft.id }).catch(() => {});
      // 브랜드팀이 후속 업무를 만들면 '후속 진행'으로 표시
      if (pid && kind !== 'package' && can.launch() && launchOf(pid).followup === '미확인') {
        await S.db.update('launch_readiness', { product_id: pid }, { followup: '후속 진행' }).catch(() => {});
      }
      await Promise.all(['products', 'launch_readiness', table, 'drafts', 'attachments'].map(loadTable));
      form.classList.remove('dirty');
      m.close();
      toast(`${created.length}건의 ${KINDS[kind].short} 요청을 등록했습니다. 관련 팀에 바로 공유됩니다.`);
      S.hooks.rerender();
      if (created.length === 1) openDetail(kind, created[0].id);
      else if (pid) openProduct(pid);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally { btn.disabled = false; }
  });
}

function requestColumns(kind) {
  const common = ['product_id', 'priority', 'due_date', 'reference_url', 'request_note'];
  return {
    package: [...common, 'design_type', 'design_type_etc', 'package_spec', 'required_text', 'print_notes'],
    shoot: [...common, 'purpose', 'purpose_etc', 'shoot_types', 'shoot_types_etc', 'location', 'location_etc', 'shoot_options', 'quantity', 'caution', 'desired_shoot_date'],
    design: [...common, 'brand_id', 'shoot_request_id', 'work_type', 'title', 'purpose', 'channels', 'channels_etc', 'plan_url', 'caution'],
  }[kind];
}
function productColumns(p) {
  const cols = ['brand_id', 'online_name', 'retail_name', 'category', 'product_kind', 'arrival_date', 'arrival_qty', 'specs', 'options', 'spec_changes', 'spec_notes'];
  return Object.fromEntries(cols.map((c) => [c, p[c] === '' || p[c] === undefined ? null : p[c]]).filter(([c, v]) => v !== null || !['specs', 'options', 'spec_changes'].includes(c)));
}

// ---------------------------------------------------------------- 제품 등록/수정 (단독)
export function openProductForm(p = null) {
  if (!can.editProduct()) return toast('제품 정보는 물류/발주팀만 등록·수정할 수 있습니다.', 'error');
  const m = openModal(`<form novalidate>
    <div class="modal-head"><h2>${p ? `제품 정보 수정 <span class="muted mono small">${esc(p.code)}</span>` : '제품 등록'}</h2><button type="button" class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">${productSection(p || {}, { withImages: !p })}
      ${p ? '<p class="muted small">이미지는 제품 상세 화면에서 추가·삭제할 수 있습니다. 수정 내용은 변경 이력에 기록됩니다.</p>' : ''}</div>
    <div class="modal-foot"><div class="grow"></div><button type="button" class="btn" data-close>닫기</button><button class="btn btn-primary">${p ? '저장' : '등록'}</button></div></form>`, { wide: true });
  const form = $('form', m.el);
  bindProductSection(m.el, p || {});
  form.addEventListener('input', () => form.classList.add('dirty'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = productColumns(readProductSection(m.el));
    try {
      if (p) {
        Object.keys(data).forEach((k) => { if (JSON.stringify(data[k] ?? null) === JSON.stringify(p[k] ?? null)) delete data[k]; });
        if (Object.keys(data).length) await S.db.update('products', { id: p.id }, data);
      } else {
        const [row] = await S.db.insert('products', data);
        const imgs = [...($('[data-pimg]', m.el)?.files || [])];
        if (imgs.length) await uploadFiles('product', row.id, 'product_image', imgs);
        p = row;
      }
      await Promise.all(['products', 'launch_readiness'].map(loadTable));
      form.classList.remove('dirty');
      m.close();
      toast('저장했습니다.');
      S.hooks.rerender();
      openProduct(p.id);
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

// ---------------------------------------------------------------- 임시저장 목록
export function openDraftList(kind) {
  const list = S.data.drafts.filter((d) => !kind || d.kind === kind);
  const m = openModal(`
    <div class="modal-head"><h2>임시저장한 요청</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">${list.length ? list.map((d) => `
      <div class="mini-row"><span class="grow"><strong>${esc(d.title || '(제목 없음)')}</strong><small>${KINDS[d.kind]?.label || d.kind} · ${timeAgo(d.updated_at)}</small></span>
        <button class="btn btn-sm" data-open="${d.id}">이어서 작성</button><button class="btn-link danger small" data-del="${d.id}">삭제</button></div>`).join('') : '<p class="empty">임시저장한 요청이 없습니다.</p>'}
    </div>`);
  $$('[data-open]', m.el).forEach((b) => b.addEventListener('click', () => {
    const d = list.find((x) => x.id === b.dataset.open);
    m.close();
    openRequestForm(d.kind, { draft: d });
  }));
  $$('[data-del]', m.el).forEach((b) => b.addEventListener('click', async () => {
    try { await S.db.remove('drafts', { id: b.dataset.del }); await loadTable('drafts'); m.close(); S.hooks.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
  }));
}
