import { S, can, product, pname, launchOf, requests, requestType, brandName, loadTable, productImages, ensureUrls, attachmentsOf } from './store.js?v=202611191352';
import { KINDS, PRIORITIES, CATEGORIES, PRODUCT_KINDS, CATEGORY_SPECS, PACKAGE_TYPES, SHOOT_PURPOSES,
  SHOOT_TYPES, SHOOT_LOCATIONS, CHANNELS, optionNames } from './constants.js?v=202611191352';
import { $, $$, esc, openModal, toast, errMsg, readForm, options, checks, statusPill, fmtDate, timeAgo, confirmBox } from './ui.js?v=202611191352';
import { openDetail, openProduct, uploadFiles, productGallery, specSummary } from './detail.js?v=202611191352';

// ---------------------------------------------------------------- 제품 입력 섹션
// same: 다중 옵션의 2번째 옵션부터 — '전 옵션 동일'로 지정된 항목 키 집합 (null 이면 선택 없음)
function specInputs(list, specs = {}, same = null) {
  return list.map((s) => {
    const isSame = same?.has(s.key);
    const dis = isSame ? 'disabled' : '';
    return `
    <label class="field ${s.wide ? 'wide' : ''}"><span class="spec-label">${esc(s.label)}
      ${same ? `<select class="same-sel" data-same="${s.key}">${options([['direct', '직접 입력'], ['same', '전 옵션 동일']], isSame ? 'same' : 'direct')}</select>` : ''}</span>
      ${s.options ? `<select class="input" data-spec="${s.key}" ${dis}>${options(s.options, specs[s.key] || '', { empty: '선택' })}</select>`
        : s.type === 'textarea' ? `<textarea class="input" rows="2" data-spec="${s.key}" ${dis}>${esc(specs[s.key] || '')}</textarea>`
        : `<input class="input" data-spec="${s.key}" value="${esc(specs[s.key] || '')}" ${dis}>`}
    </label>`;
  }).join('');
}
// '전 옵션 동일' 항목을 바로 앞 옵션의 값으로 채운 결과
function resolveVariants(variants) {
  const out = [];
  variants.forEach((v, n) => {
    const r = { ...v };
    (v._same || []).forEach((k) => { r[k] = n ? out[n - 1][k] ?? '' : ''; });
    out.push(r);
  });
  return out;
}
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
      <label class="field wide"><span>요청 구분 <b class="req">*</b></span><select class="input" name="product_kind" required>${options(PRODUCT_KINDS, p.product_kind || '신제품')}</select></label>
      <label class="field"><span>입고 예정일</span><input class="input" type="date" name="arrival_date" value="${esc(p.arrival_date || '')}"></label>
      <label class="field"><span>입고 예정 수량(옵션 총 수량 합계)</span><input class="input" type="number" min="0" step="1" name="arrival_qty" value="${esc(p.arrival_qty ?? '')}" placeholder="예: 300"></label>
    </div></fieldset>
    <fieldset><legend>카테고리별 세부 사양</legend>
      <div class="cat-specs"></div>
      <div class="chg-box">
        <h4>사양 변경사항 <small class="muted">리뉴얼 제품의 기존 → 변경 내용</small></h4>
        <div class="chg-rows">${(p.spec_changes || []).map(chgRow).join('')}</div>
        <button type="button" class="btn btn-sm" data-add-chg>+ 변경 항목 추가</button>
      </div>
      <label class="field wide"><span>추가 설명 (예외적인 제품 특징)</span><textarea class="input" rows="2" data-pnote>${esc(p.spec_notes || '')}</textarea></label>
    </fieldset>
    ${withImages ? `<fieldset><legend>제품 이미지</legend>
      ${fileDrop('pimg', { accept: 'image/*', text: '이미지 파일을 선택하세요 (여러 장 가능)' })}</fieldset>` : ''}
  </div>`;
}

function bindProductSection(root, p = {}) {
  const sec = $('.prod-fields', root);
  if (!sec) return;
  const sp0 = p.specs || {};
  const multi0 = sp0.option_mode === 'multi';
  const st = sec._spec || (sec._spec = {
    mode: multi0 ? 'multi' : 'single',
    single: multi0 ? {} : { ...sp0 },
    variants: multi0 ? structuredClone(sp0.variants || []) : [],
  });
  const catSel = $('[name=category]', sec);
  const box = $('.cat-specs', sec);
  // 현재 화면의 입력값을 상태에 반영
  const capture = () => {
    if (st.mode === 'single') $$('[data-spec]', box).forEach((i) => { st.single[i.dataset.spec] = i.value; });
    else $$('[data-variant]', box).forEach((card, n) => {
      const v = st.variants[n] || (st.variants[n] = {});
      v.name = $('[data-vname]', card).value;
      const same = new Set();
      $$('[data-spec]', card).forEach((i) => {
        const k = i.dataset.spec;
        if ($(`[data-same="${k}"]`, card)?.value === 'same') same.add(k);
        else v[k] = i.value;
      });
      v._same = [...same];
    });
  };
  sec._captureSpecs = capture;
  const drawCat = () => {
    const list = CATEGORY_SPECS[catSel.value] || [];
    if (!list.length) { box.innerHTML = '<p class="muted small">제품 카테고리를 선택하면 세부 사양 입력란이 나타납니다.</p>'; return; }
    box.innerHTML = `<div class="cat-head"><h4>${esc(catSel.value)} 세부 사양</h4>
        <div class="seg-ctl"><button type="button" data-optmode="single" class="${st.mode === 'single' ? 'on' : ''}">단일 옵션</button>
          <button type="button" data-optmode="multi" class="${st.mode === 'multi' ? 'on' : ''}">다중 옵션</button></div></div>
      ${st.mode === 'single' ? `<div class="form-grid">${specInputs(list, st.single)}</div>`
        : `<p class="muted small">옵션마다 사양을 입력합니다. 두 번째 옵션부터는 항목별로 「전 옵션 동일」을 고르면 바로 앞 옵션의 값이 그대로 들어갑니다.</p>${resolveVariants(st.variants).map((v, n) => `
          <div class="variant-card" data-variant>
            <div class="variant-head"><b>옵션 ${n + 1}</b><input class="input" data-vname value="${esc(v.name || '')}" placeholder="옵션명 (예: 오크 1200)">
              <button type="button" class="icon-btn" data-rm-variant="${n}" title="옵션 삭제">✕</button></div>
            <div class="form-grid">${specInputs(list, v, n ? new Set(v._same || []) : null)}</div>
          </div>`).join('')}
          <button type="button" class="btn btn-sm" data-add-variant>+ 옵션 추가</button>`}`;
  };
  catSel.addEventListener('change', () => { capture(); drawCat(); });
  // '전 옵션 동일' 항목은 앞 옵션 값을 따라가도록 즉시 반영
  const refreshSame = () => {
    const cards = $$('[data-variant]', box);
    cards.forEach((card, n) => {
      if (!n) return;
      $$('[data-same]', card).forEach((sel) => {
        const k = sel.dataset.same;
        const inp = $(`[data-spec="${k}"]`, card);
        const same = sel.value === 'same';
        inp.disabled = same;
        if (same) inp.value = $(`[data-spec="${k}"]`, cards[n - 1])?.value ?? '';
      });
    });
  };
  box.addEventListener('input', refreshSame);
  box.addEventListener('change', refreshSame);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.optmode && b.dataset.optmode !== st.mode) {
      capture();
      st.mode = b.dataset.optmode;
      if (st.mode === 'multi' && !st.variants.length) st.variants = [{ ...st.single, name: '' }, {}];
      drawCat();
    } else if (b.matches('[data-add-variant]')) { capture(); st.variants.push({}); drawCat(); }
    else if (b.dataset.rmVariant !== undefined) { capture(); st.variants.splice(Number(b.dataset.rmVariant), 1); drawCat(); }
  });
  drawCat();
  const kindSel = $('[name=product_kind]', sec);
  const chg = () => { $('.chg-box', sec).hidden = kindSel.value === '신제품' && !$$('.chg-row', sec).length; };
  kindSel.addEventListener('change', chg);
  chg();
  sec.addEventListener('click', (e) => {
    if (e.target.matches('[data-add-chg]')) $('.chg-rows', sec).insertAdjacentHTML('beforeend', chgRow());
    if (e.target.matches('[data-rm]')) e.target.parentElement.remove();
  });
}

function readProductSection(root) {
  const sec = $('.prod-fields', root);
  const basic = readForm($('.prod-basic', sec));
  sec._captureSpecs?.();
  const st = sec._spec || { mode: 'single', single: {}, variants: [] };
  const trimObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  const specs = st.mode === 'multi'
    ? { option_mode: 'multi', variants: resolveVariants(st.variants).map((v) => {
        const { _same, ...rest } = v;
        const o = trimObj(rest);
        if (_same?.length) o._same = _same;
        return o;
      }).filter((v) => Object.keys(v).some((k) => k !== '_same')) }
    : trimObj(st.single);
  const rows = (sel, keys) => $$(sel, sec).map((r) => Object.fromEntries(keys.map((k) => [k, $(`[data-k=${k}]`, r).value.trim()])))
    .filter((o) => Object.values(o).some(Boolean));
  return {
    ...basic,
    brand_id: basic.brand_id ? Number(basic.brand_id) : null,
    arrival_qty: basic.arrival_qty != null && basic.arrival_qty !== '' ? Number(basic.arrival_qty) : null,
    specs,
    spec_changes: rows('.chg-row', ['field', 'before', 'after']),
    spec_notes: $('[data-pnote]', sec).value.trim() || null,
  };
}

// ---------------------------------------------------------------- 제품 선택 / 자동 표시
function productPicker(selected, { required = true, brandFilter = null, manual = false } = {}) {
  const list = S.data.products.filter((p) => !brandFilter || String(p.brand_id) === String(brandFilter));
  const byBrand = {};
  list.forEach((p) => { (byBrand[brandName(p.brand_id)] ||= []).push(p); });
  return `<select class="input" name="product_id" ${required ? 'required' : ''}>
    <option value="">${required ? '제품을 선택하세요' : '연관 제품 없음'}</option>
    ${Object.entries(byBrand).map(([b, ps]) => `<optgroup label="${esc(b)}">${ps.map((p) => `
      <option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(pname(p))} · ${esc(p.category)} · ${esc(p.product_kind)}</option>`).join('')}</optgroup>`).join('')}
    ${manual ? `<option value="__manual" ${selected === '__manual' ? 'selected' : ''}>직접 입력</option>` : ''}
  </select>`;
}

function productInfo(pid, kind) {
  const p = product(pid);
  if (!p) return '';
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
        <strong>${esc(pname(p))}</strong>
        ${specSummary(p)}
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

// ---------------------------------------------------------------- 촬영 참고 이미지: 기존 이미지 선택 / 새 업로드
const isImgAtt = (a) => /^image\//.test(a.mime_type || '') || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(a.file_name || '');
// 물류/발주팀이 올린 이미지: 제품 이미지 + 해당 제품 패키지 요청에 첨부된 이미지
function logisticsImages(pid) {
  if (!pid) return [];
  const pkgIds = new Set(S.data.package_requests.filter((r) => r.product_id === pid).map((r) => r.id));
  const seen = new Set();
  return S.data.attachments.filter((a) => isImgAtt(a) && (
    (a.entity_type === 'product' && a.entity_id === pid) || (a.entity_type === 'package' && pkgIds.has(a.entity_id))
  )).filter((a) => !seen.has(a.storage_path) && seen.add(a.storage_path));
}
function shootRefField(r) {
  const imgs = logisticsImages(r.product_id);
  const picked = new Set(r.ref_existing || []);
  // 물류/발주팀 이미지 선택 + 새 이미지 추가 업로드를 함께 사용 (둘 다 제출 시 첨부)
  return `<div class="field wide ref-field"><span>참고 이미지 첨부</span>
    <div class="ref-sec">
      <h5>물류/발주팀 등록 이미지에서 선택</h5>
      ${!r.product_id ? '<p class="muted small">먼저 제품을 선택하세요.</p>'
        : imgs.length ? `<div class="ref-pick">${imgs.map((a) => `
          <label class="ref-item"><input type="checkbox" data-multi name="ref_existing" value="${a.id}" ${picked.has(a.id) ? 'checked' : ''}>
            <img data-src-path="${esc(a.storage_path)}" src="${esc(S.urls[a.storage_path] || '')}" alt=""><span>${esc(a.file_name)}</span></label>`).join('')}</div>
          <p class="muted small">선택한 이미지는 다시 업로드하지 않고 원본 파일을 그대로 연결합니다.</p>`
        : '<p class="muted small">이 제품에 물류/발주팀이 등록한 이미지가 없습니다.</p>'}
    </div>
    <div class="ref-sec">
      <h5>추가 이미지 업로드 <small class="muted">선택한 이미지와 함께 첨부됩니다</small></h5>
      ${fileDrop('req', { accept: 'image/*', text: '이미지 파일 선택 (여러 장 가능)' })}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- 파일 선택 (선택한 파일 개별 삭제·추가 가능)
function fileDrop(key, { accept = '', text = '파일 선택 (여러 개 가능)' } = {}) {
  return `<label class="dropzone"><input type="file" multiple ${accept ? `accept="${accept}"` : ''} data-pick="${key}"><span>${esc(text)}</span></label>
    <div class="file-list" data-picked="${key}"></div>`;
}
const isImgFile = (f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(f.name);
const isImgAtt0 = (a) => /^image\//.test(a.mime_type || '') || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(a.file_name || '');

// ---------------------------------------------------------------- 패키지 규격: 단일 / 다중 패키지
// 다중 패키지는 한 줄에 하나씩 "[패키지명] 규격" 형식으로 저장
function parsePkgSpec(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => /^\[[^\]]*\]/.test(l))) {
    return { mode: 'multi', rows: lines.map((l) => { const m = l.match(/^\[([^\]]*)\]\s*(.*)$/); return { name: m[1], spec: m[2] }; }) };
  }
  return { mode: 'single', single: String(text || ''), rows: [] };
}
const pkgRow = (r = {}, n = 0) => `<div class="pkg-row">
  <input class="input" data-pk="name" value="${esc(r.name || '')}" placeholder="패키지명 (예: 패키지 ${n + 1} · 상판)">
  <input class="input" data-pk="spec" value="${esc(r.spec || '')}" placeholder="가로 × 세로 × 높이(mm), 재질 (예: 1250 × 1250 × 120, 골판지 5겹)">
  <button type="button" class="icon-btn" data-rm-pkg>✕</button></div>`;
function pkgSpecField(r) {
  const cur = r.pkg_mode ? { mode: r.pkg_mode, single: r.pkg_single ?? '', rows: r.pkg_rows || [] } : parsePkgSpec(r.package_spec);
  if (cur.mode === 'multi' && !cur.rows.length) cur.rows = [{}, {}];
  return `<div class="field wide pkg-spec"><span>패키지 규격(mm)</span>
    <div class="seg-ctl sm"><button type="button" data-pkgmode="single" class="${cur.mode === 'single' ? 'on' : ''}">단일 패키지</button>
      <button type="button" data-pkgmode="multi" class="${cur.mode === 'multi' ? 'on' : ''}">다중 패키지</button></div>
    <input type="hidden" name="pkg_mode" value="${cur.mode}">
    <input type="hidden" name="package_spec" value="">
    <div data-pkg-pane="single" ${cur.mode === 'single' ? '' : 'hidden'}><input class="input" data-pkg-single value="${esc(cur.single || '')}" placeholder="예: 1250 × 1250 × 120, 골판지 5겹"></div>
    <div data-pkg-pane="multi" ${cur.mode === 'multi' ? '' : 'hidden'}>
      <div class="pkg-rows">${cur.rows.map(pkgRow).join('')}</div>
      <button type="button" class="btn btn-sm" data-add-pkg>+ 패키지 추가</button>
    </div>
  </div>`;
}
function bindPkgSpec(root) {
  const box = $('.pkg-spec', root);
  if (!box) return;
  const sync = () => {
    const mode = $('[name=pkg_mode]', box).value;
    const rows = $$('.pkg-row', box).map((r, n) => ({ name: $('[data-pk=name]', r).value.trim() || `패키지 ${n + 1}`, spec: $('[data-pk=spec]', r).value.trim() }))
      .filter((r) => r.spec);
    $('[name=package_spec]', box).value = mode === 'multi' ? rows.map((r) => `[${r.name}] ${r.spec}`).join('\n') : $('[data-pkg-single]', box).value.trim();
  };
  box.addEventListener('input', sync);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pkgmode) {
      $('[name=pkg_mode]', box).value = b.dataset.pkgmode;
      $$('[data-pkgmode]', box).forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-pkg-pane]', box).forEach((x) => { x.hidden = x.dataset.pkgPane !== b.dataset.pkgmode; });
      if (b.dataset.pkgmode === 'multi' && !$$('.pkg-row', box).length) $('.pkg-rows', box).innerHTML = [pkgRow({ spec: $('[data-pkg-single]', box).value.trim() }, 0), pkgRow({}, 1)].join('');
    } else if (b.matches('[data-add-pkg]')) $('.pkg-rows', box).insertAdjacentHTML('beforeend', pkgRow({}, $$('.pkg-row', box).length));
    else if (b.matches('[data-rm-pkg]')) b.parentElement.remove();
    sync();
  });
  sync();
}
// 다시 그릴 때 입력 중이던 다중 패키지 행을 보존
function readPkgState(root) {
  const box = $('.pkg-spec', root);
  if (!box) return {};
  return {
    pkg_mode: $('[name=pkg_mode]', box).value,
    pkg_single: $('[data-pkg-single]', box).value,
    pkg_rows: $$('.pkg-row', box).map((r) => ({ name: $('[data-pk=name]', r).value, spec: $('[data-pk=spec]', r).value })),
  };
}

// 목록에서 빠진 예전 값이 기존 요청에 있으면 수정 화면에서도 보이도록 유지
const keep = (list, cur) => [...list, ...[].concat(cur || []).filter((v) => v && !list.includes(v))];

// ---------------------------------------------------------------- 요청 폼
const MULTI_TYPE_HINT = '여러 개 선택하면 유형별로 업무가 각각 생성됩니다.';

function requestFields(kind, r, { create, multiType }) {
  const pr = `
    <label class="field"><span>우선순위 <b class="req">*</b></span><select class="input" name="priority" required>${options(PRIORITIES, r.priority || '보통')}</select></label>
    <label class="field"><span>희망 완료일 <b class="req">*</b></span><input class="input" type="date" name="due_date" required value="${esc(r.due_date || '')}"></label>`;
  const files = `<div class="field wide"><span>${kind === 'package' ? '작업 진행에 참고가 필요한 파일 첨부 <small class="muted">이미지는 제품 이미지로 등록되어 브랜드팀 요청서에도 함께 표시됩니다</small>' : '참고 이미지 첨부'}</span>
    ${create ? '' : '<div class="file-list existing" data-existing></div>'}
    ${fileDrop('req', { text: create ? '파일 선택 (여러 개 가능)' : '파일 추가 (저장 시 업로드)' })}</div>`;

  if (kind === 'package') return `
    <fieldset><legend>패키지 디자인 요청 정보</legend><div class="form-grid">
      ${create ? `<div class="field wide"><span>요청 디자인 유형 <b class="req">*</b> <small class="muted">${MULTI_TYPE_HINT}</small></span>${checks('design_types', PACKAGE_TYPES, r.design_types || (r.design_type ? [r.design_type] : []))}</div>`
        : `<label class="field"><span>요청 디자인 유형 <b class="req">*</b></span><select class="input" name="design_type">${options(PACKAGE_TYPES, r.design_type)}</select></label>`}
      <label class="field"><span>직접 입력(기타 선택 시)</span><input class="input" name="design_type_etc" value="${esc(r.design_type_etc || '')}"></label>
      ${pkgSpecField(r)}
      <label class="field wide"><span>필수 기재 문구</span><textarea class="input" rows="2" name="required_text">${esc(r.required_text || '')}</textarea></label>
      <label class="field wide"><span>인쇄 관련 유의사항</span><textarea class="input" rows="2" name="print_notes">${esc(r.print_notes || '')}</textarea></label>
      <label class="field wide"><span>디자인 레퍼런스 URL(카피 제품 URL, ex 비아브 테이블은 피아바 가베 테이블을 카피한 상품으로 가베 테이블 링크 첨부)</span><input class="input" name="reference_url" value="${esc(r.reference_url || '')}" placeholder="https://"></label>
      ${files}
      <label class="field wide"><span>추가 요청사항</span><textarea class="input" rows="2" name="request_note">${esc(r.request_note || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>일정 및 우선순위</legend><div class="form-grid">${pr}</div></fieldset>`;

  if (kind === 'shoot') {
    const p = product(r.product_id);
    const optNames = optionNames(p);
    return `
    <fieldset><legend>촬영 요청 내용</legend><div class="form-grid">
      <label class="field"><span>촬영 목적 <b class="req">*</b></span><select class="input" name="purpose" required>${options(keep(SHOOT_PURPOSES, r.purpose), r.purpose, { empty: '선택' })}</select></label>
      <label class="field"><span>직접 입력(기타 선택 시)</span><input class="input" name="purpose_etc" value="${esc(r.purpose_etc || '')}"></label>
      <div class="field wide"><span>촬영 유형 <b class="req">*</b> <small class="muted">복수 선택</small></span>${checks('shoot_types', keep(SHOOT_TYPES, r.shoot_types), r.shoot_types || [])}</div>
      <label class="field wide"><span>직접 입력(기타 선택 시)</span><input class="input" name="shoot_types_etc" value="${esc(r.shoot_types_etc || '')}"></label>
      <label class="field"><span>촬영 장소</span><select class="input" name="location">${options(SHOOT_LOCATIONS, r.location, { empty: '선택' })}</select></label>
      <label class="field"><span>직접 입력(기타 선택 시)</span><input class="input" name="location_etc" value="${esc(r.location_etc || '')}"></label>
      <div class="field wide shoot-opts"><span>촬영 제품 옵션</span>${optNames.length ? checks('shoot_options', optNames, r.shoot_options || []) : '<small class="muted">등록된 옵션이 없습니다.</small>'}</div>
      <label class="field"><span>촬영 최소 수량(컷)</span><input class="input" type="number" min="0" name="quantity" value="${esc(r.quantity ?? '')}"></label>
      <label class="field"><span>촬영 희망일</span><input class="input" type="date" name="desired_shoot_date" value="${esc(r.desired_shoot_date || '')}"></label>
      <label class="field wide"><span>촬영 유의사항</span><textarea class="input" rows="2" name="caution">${esc(r.caution || '')}</textarea></label>
      <label class="field wide"><span>촬영 레퍼런스 URL</span><input class="input" name="reference_url" value="${esc(r.reference_url || '')}" placeholder="https://"></label>
      ${create ? shootRefField(r) : files}
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
      ${files}
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
  state.files = { req: [], pimg: [] };
  state.removeAtt = new Set();
  // 수정 화면: 이 요청의 기존 첨부 (패키지는 제품 이미지 포함)
  const existingAtts = () => (edit ? [...attachmentsOf(kind, edit.id), ...(kind === 'package' ? productImages(edit.product_id) : [])] : [])
    .filter((a) => !state.removeAtt.has(a.id));
  if (kind === 'design' && create && !state.req.brand_id && state.productId) state.req.brand_id = product(state.productId)?.brand_id;
  if (kind === 'design' && create && !state.req.title && state.productId && opts.multiType) state.req.title = pname(product(state.productId));
  if (kind === 'shoot') {
    state.manual = draftPayload.manual ?? (!!edit && !edit.product_id);
    state._wasLinked = !!state.productId;
    if (state.productId && !state.req.product_retail_name) {
      const p0 = product(state.productId);
      state.req.product_retail_name = p0?.retail_name || '';
      state.req.product_online_name ??= p0?.online_name || '';
    }
  }
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
    if (rf) state.req = { ...state.req, ...readForm(rf), ...readPkgState(rf) };
    const pSel = $('.pick [name=product_id]', body);
    if (pSel) {
      state.manual = kind === 'shoot' && pSel.value === '__manual';
      state.productId = state.manual ? null : pSel.value || null;
    }
    $$('.prod-names [name]', body).forEach((i) => { state.req[i.name] = i.value.trim(); });
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
      const chosen = state.manual || !!state.productId;
      top = `<fieldset class="pick"><legend>제품 선택 <b class="req">*</b></legend>${productPicker(state.manual ? '__manual' : state.productId, { manual: true })}
        <div class="form-grid prod-names">
          <label class="field"><span>유통 제품명 <b class="req">*</b>${state.productId ? ' <small class="muted">물류/발주팀 등록 정보</small>' : ''}</span>
            <input class="input" name="product_retail_name" value="${esc(state.req.product_retail_name || '')}" ${state.productId ? 'readonly' : ''} ${chosen ? '' : 'disabled'}
              placeholder="${chosen ? '유통 제품명' : '제품을 선택하거나 「직접 입력」을 고르세요'}"></label>
          <label class="field"><span>온라인 제품명</span>
            <input class="input" name="product_online_name" value="${esc(state.req.product_online_name || '')}" ${chosen ? '' : 'disabled'} placeholder="온라인 제품명"></label>
        </div>
        ${state.productId ? productInfo(state.productId, 'shoot')
          : state.manual ? '<p class="muted small">등록되지 않은 제품입니다. 유통 제품명과 온라인 제품명을 직접 입력하세요.</p>'
          : '<p class="muted small">물류/발주팀이 등록한 제품을 선택하면 사양과 유통 제품명이 자동으로 표시됩니다. 목록에 없으면 「직접 입력」을 고르세요.</p>'}</fieldset>`;
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
      if (kind === 'shoot') {
        // 제품이 바뀌면 물류/발주팀 이미지 선택만 초기화 (추가 업로드한 이미지는 유지)
        delete state.req.ref_existing;
        if (state.productId) {
          const p1 = product(state.productId);
          state.req.product_retail_name = p1?.retail_name || '';
          state.req.product_online_name = p1?.online_name || '';
        } else if (state.manual && state._wasLinked) {
          state.req.product_retail_name = '';
          state.req.product_online_name = '';
        }
        state._wasLinked = !!state.productId;
        const pk = product(state.productId)?.product_kind;
        if (!state.req.purpose && pk) state.req.purpose = pk === '리뉴얼' ? '제품 리뉴얼' : '신제품 론칭';
      }
      draw();
    });
    $('.pick [name=brand_id]', body)?.addEventListener('change', () => {
      snapshot();
      if (state.productId && String(product(state.productId)?.brand_id) !== String(state.req.brand_id)) state.productId = null;
      draw();
    });
    $$('[data-open-req]', body).forEach((b) => b.addEventListener('click', () => { const [k, id] = b.dataset.openReq.split(':'); openDetail(k, id); }));
    $$('[data-correction]', body).forEach((b) => b.addEventListener('click', () => requestCorrection(b.dataset.correction)));
    const missing = $$('img[data-src-path]', body).filter((im) => !im.getAttribute('src')).map((im) => im.dataset.srcPath);
    if (missing.length) ensureUrls(missing).then(() => $$('img[data-src-path]', body).forEach((im) => { if (S.urls[im.dataset.srcPath]) im.src = S.urls[im.dataset.srcPath]; }));
    bindPkgSpec(body);
    drawFiles();
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
  // 선택한 파일 목록 (개별 삭제) + 수정 화면의 기존 첨부 (삭제 표시 → 저장 시 반영)
  function drawFiles() {
    $$('[data-picked]', body).forEach((list) => {
      const arr = state.files[list.dataset.picked] || [];
      list.innerHTML = arr.map((f, i) => `<span class="file-chip">${isImgFile(f) ? `<img src="${esc(f._url || (f._url = URL.createObjectURL(f)))}" alt="">` : ''}${esc(f.name)}
        <button type="button" class="chip-x" data-unpick="${list.dataset.picked}:${i}" title="선택 취소">✕</button></span>`).join('');
    });
    const ex = $('[data-existing]', body);
    if (ex) {
      const list = existingAtts();
      ex.innerHTML = list.length ? list.map((a) => `<span class="file-chip">${isImgAtt0(a) && S.urls[a.storage_path] ? `<img src="${esc(S.urls[a.storage_path])}" alt="">` : ''}${esc(a.file_name)}
        ${a.uploaded_by === S.me.id || can.admin() ? `<button type="button" class="chip-x" data-unatt="${a.id}" title="삭제">✕</button>` : ''}</span>`).join('')
        : '<span class="muted small">첨부된 파일이 없습니다.</span>';
      if (state.removeAtt.size) ex.insertAdjacentHTML('beforeend', `<span class="muted small">삭제 ${state.removeAtt.size}건은 저장 시 반영됩니다.</span>`);
    }
  }
  body.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-pick]');
    if (!inp) return;
    state.files[inp.dataset.pick].push(...inp.files);
    inp.value = '';
    drawFiles();
    form.classList.add('dirty');
  });
  body.addEventListener('click', (e) => {
    const un = e.target.closest('[data-unpick]');
    if (un) { e.preventDefault(); const [k, i] = un.dataset.unpick.split(':'); state.files[k].splice(Number(i), 1); drawFiles(); return; }
    const ua = e.target.closest('[data-unatt]');
    if (ua) { e.preventDefault(); state.removeAtt.add(ua.dataset.unatt); drawFiles(); form.classList.add('dirty'); }
  });
  draw();
  if (edit) ensureUrls(existingAtts().filter(isImgAtt0).map((a) => a.storage_path)).then(drawFiles);
  form.addEventListener('input', () => form.classList.add('dirty'));

  // 임시저장 (서버에 본인 전용으로 저장)
  $('[data-draft]', m.el)?.addEventListener('click', async () => {
    snapshot();
    const title = state.newProduct?.retail_name || state.newProduct?.online_name || (state.productId && pname(product(state.productId))) || state.req.title || '(제목 없음)';
    const payload = { productMode: state.productMode, productId: state.productId, manual: state.manual, newProduct: state.newProduct, req: state.req };
    try {
      if (opts.draft) await S.db.update('drafts', { id: opts.draft.id }, { payload, title, updated_at: new Date().toISOString() });
      else opts.draft = (await S.db.insert('drafts', { kind, title, payload }))[0];
      await loadTable('drafts');
      form.classList.remove('dirty');
      toast('임시저장했습니다. 첨부파일은 임시저장되지 않으니 제출 전에 다시 선택하세요.');
      S.hooks.rerender();
    } catch (e) { toast(errMsg(e), 'error'); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    snapshot();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const req = { ...state.req };
    const files = [...state.files.req];
    const linkIds = kind === 'shoot' && create ? (state.req.ref_existing || []) : [];
    const missing = [];
    if (kind === 'shoot') {
      if (!state.productId && !state.manual) missing.push('제품');
      else if (!state.req.product_retail_name) missing.push('유통 제품명');
    } else if (kind !== 'design' && !state.productId && state.productMode !== 'new') missing.push('제품');
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
        // 첨부 삭제 (다른 곳에서 같은 파일을 쓰면 저장소 파일은 유지)
        for (const id of state.removeAtt) {
          const a = S.data.attachments.find((x) => x.id === id);
          if (!a) continue;
          await S.db.remove('attachments', { id });
          const shared = S.data.attachments.some((x) => x.id !== id && x.storage_path === a.storage_path);
          if (!shared) await S.db.removeFile(a.storage_path).catch(() => {});
        }
        // 첨부 추가 (패키지 요청의 이미지는 제품 이미지로 등록)
        if (files.length) {
          const toProduct = kind === 'package' && edit.product_id ? files.filter(isImgFile) : [];
          if (toProduct.length) await uploadFiles('product', edit.product_id, 'product_image', toProduct);
          const rest = files.filter((x) => !toProduct.includes(x));
          if (rest.length) await uploadFiles(kind, edit.id, 'reference', rest);
        }
        await Promise.all([table, 'attachments'].map(loadTable));
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
        const imgs = [...state.files.pimg];
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
      const isImg = isImgFile;
      const reqFiles = kind === 'package' && pid ? files.filter((f) => !isImg(f)) : files;
      if (kind === 'package' && pid && files.some(isImg)) await uploadFiles('product', pid, 'product_image', files.filter(isImg));
      for (const c of created) if (reqFiles.length) await uploadFiles(kind, c.id, 'reference', reqFiles);
      // 촬영 요청: 물류/발주팀 이미지를 다시 올리지 않고 같은 파일로 연결
      if (linkIds.length) {
        const src = S.data.attachments.filter((a) => linkIds.includes(a.id));
        const rows = created.flatMap((c) => src.map((a) => ({ entity_type: kind, entity_id: c.id, kind: 'reference', storage_path: a.storage_path, file_name: a.file_name, mime_type: a.mime_type, size_bytes: a.size_bytes })));
        if (rows.length) await S.db.insert('attachments', rows);
      }
      if (opts.draft) await S.db.remove('drafts', { id: opts.draft.id }).catch(() => {});
      // 브랜드팀이 후속 업무를 만들면 '후속 진행'으로 표시
      if (pid && kind !== 'package' && can.launch() && launchOf(pid).followup === '미확인') {
        await S.db.update('launch_readiness', { product_id: pid }, { followup: '후속 진행' }).catch(() => {});
      }
      await Promise.all(['products', 'launch_readiness', table, 'drafts', 'attachments'].map(loadTable));
      if (kind === 'shoot') await ensureUrls(S.data.attachments.filter((a) => a.entity_type === 'shoot' && created.some((c) => c.id === a.entity_id)).map((a) => a.storage_path));
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
    shoot: [...common, 'product_retail_name', 'product_online_name', 'purpose', 'purpose_etc', 'shoot_types', 'shoot_types_etc', 'location', 'location_etc', 'shoot_options', 'quantity', 'caution', 'desired_shoot_date'],
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
  const picked = [];
  const drawPicked = () => {
    const list = $('[data-picked=pimg]', m.el);
    if (list) list.innerHTML = picked.map((f, i) => `<span class="file-chip"><img src="${esc(f._url || (f._url = URL.createObjectURL(f)))}" alt="">${esc(f.name)}<button type="button" class="chip-x" data-unpick="${i}">✕</button></span>`).join('');
  };
  $('[data-pick=pimg]', m.el)?.addEventListener('change', (e) => { picked.push(...e.target.files); e.target.value = ''; drawPicked(); });
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-unpick]'); if (b) { e.preventDefault(); picked.splice(Number(b.dataset.unpick), 1); drawPicked(); } });
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
        if (picked.length) await uploadFiles('product', row.id, 'product_image', picked);
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
