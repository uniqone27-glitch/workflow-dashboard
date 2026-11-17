// 공통 UI 유틸리티
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function fmtDate(v) {
  if (!v) return '-';
  return String(v).slice(0, 10).replace(/-/g, '.');
}
export function fmtDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function timeAgo(v) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return fmtDate(v);
}
export function linkify(url) {
  if (!url) return '-';
  const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return `<a href="${esc(safe)}" target="_blank" rel="noopener">${esc(url)}</a>`;
}
export function nl(v) {
  return v ? esc(v).replace(/\n/g, '<br>') : '-';
}

export function statusPill(status, cancelled) {
  if (cancelled) return `<span class="pill pill-cancel">취소</span>`;
  const cls = { 요청: 'pill-req', 작업중: 'pill-wip', 완료: 'pill-done' }[status] || '';
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}
export function priorityTag(p) {
  const cls = { 긴급: 'pr-urgent', 높음: 'pr-high', 보통: 'pr-mid', 낮음: 'pr-low' }[p] || '';
  return `<span class="prio ${cls}">${esc(p)}</span>`;
}

let toastTimer;
export function toast(msg, type = 'info') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast show ${type}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 6000 : 2800);
}

export function errMsg(e) {
  const m = e?.message || String(e);
  if (/JSON object requested|0 rows|no rows/i.test(m)) return '권한이 없거나 대상을 찾을 수 없습니다.';
  if (/row-level security/i.test(m)) return '권한이 없습니다. (서버에서 거부됨)';
  return m;
}

// 모달 / 드로어
export function openModal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const close = () => {
    wrap.remove();
    if (!$('.modal-backdrop') && !$('.drawer-backdrop')) document.body.classList.remove('no-scroll');
    onClose?.();
  };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap.dataset.down = '1'; });
  wrap.addEventListener('mouseup', (e) => {
    if (e.target === wrap && wrap.dataset.down === '1' && !wrap.querySelector('.dirty')) close();
    wrap.dataset.down = '';
  });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: wrap.firstElementChild, close };
}

export function confirmBox(message, { ok = '확인', danger = false, input = null } = {}) {
  return new Promise((resolve) => {
    const m = openModal(`
      <div class="modal-body confirm">
        <p>${esc(message)}</p>
        ${input ? `<input class="input" id="cf-input" placeholder="${esc(input)}">` : ''}
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>취소</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(ok)}</button>
      </div>`, { onClose: () => resolve(null) });
    $('#cf-ok', m.el).addEventListener('click', () => {
      const v = input ? $('#cf-input', m.el).value : true;
      resolve(v === '' ? true : v);
      m.close();
    });
  });
}

// 폼 값 읽기
export function readForm(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    const name = el.name;
    if (el.type === 'checkbox' && el.dataset.multi !== undefined) {
      out[name] = out[name] || [];
      if (el.checked) out[name].push(el.value);
    } else if (el.type === 'checkbox') {
      out[name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[name] = el.value;
    } else if (el.type === 'file') {
      // 파일은 별도 처리
    } else {
      out[name] = el.value.trim() === '' ? null : el.value.trim();
    }
  });
  return out;
}

export function options(list, selected, { empty } = {}) {
  const sel = Array.isArray(selected) ? selected : [selected];
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${sel.includes(v) || sel.map(String).includes(String(v)) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
}

export function checks(name, list, selected = []) {
  return `<div class="checks">${list.map((v) => `
    <label class="check"><input type="checkbox" data-multi name="${esc(name)}" value="${esc(v)}" ${selected?.includes(v) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fileSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// 이미지 확대 보기 (요청서·상세 화면의 모든 이미지 공통)
// items: [{ src, name, path }], onDownload(item): 원본 다운로드
export function openLightbox(items, start = 0, { onDownload } = {}) {
  if (!items.length) return;
  let i = Math.max(0, Math.min(start, items.length - 1));
  const wrap = document.createElement('div');
  wrap.className = 'lightbox';
  wrap.innerHTML = `
    <div class="lb-bar">
      <span class="lb-name"></span><span class="lb-count"></span><div class="grow"></div>
      <button class="lb-btn" data-lb="zoom" title="실제 크기 / 화면 맞춤">실제 크기</button>
      <button class="lb-btn" data-lb="open" title="새 탭에서 원본 열기">새 탭</button>
      ${onDownload ? '<button class="lb-btn" data-lb="dl">다운로드</button>' : ''}
      <button class="lb-btn lb-close" data-lb="close" title="닫기 (Esc)">✕</button>
    </div>
    <div class="lb-stage"><img alt=""></div>
    ${items.length > 1 ? '<button class="lb-nav prev" data-lb="prev" aria-label="이전">‹</button><button class="lb-nav next" data-lb="next" aria-label="다음">›</button>' : ''}`;
  document.body.appendChild(wrap);
  const img = wrap.querySelector('img');
  const stage = wrap.querySelector('.lb-stage');
  const show = () => {
    const it = items[i];
    stage.classList.remove('zoomed');
    wrap.querySelector('[data-lb=zoom]').textContent = '실제 크기';
    img.src = it.src;
    wrap.querySelector('.lb-name').textContent = it.name || '';
    wrap.querySelector('.lb-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
  };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); };
  const move = (d) => { i = (i + d + items.length) % items.length; show(); };
  const toggleZoom = () => {
    const z = stage.classList.toggle('zoomed');
    wrap.querySelector('[data-lb=zoom]').textContent = z ? '화면 맞춤' : '실제 크기';
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'ArrowLeft') move(-1);
    if (e.key === 'ArrowRight') move(1);
  }
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lb]')?.dataset.lb;
    if (a === 'close') close();
    else if (a === 'prev') move(-1);
    else if (a === 'next') move(1);
    else if (a === 'zoom') toggleZoom();
    else if (a === 'open') window.open(items[i].src, '_blank', 'noopener');
    else if (a === 'dl') onDownload(items[i]);
    else if (e.target === img) toggleZoom();
    else if (e.target === stage) close();
  });
  show();
}
