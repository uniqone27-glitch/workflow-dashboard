// 검색 가능한 드롭다운 (모든 <select>에 자동 적용)
//  - 원래 <select>는 숨긴 채 그대로 두고 값·이벤트(change/input)를 그대로 사용 → 기존 저장·필터 로직 변경 없음
//  - 펼치면 맨 위에 검색칸: 입력한 글자가 포함된 항목만 표시 (띄어쓰기·대소문자 무시)
//  - 키보드: ↑↓ 이동, Enter 선택, Esc 닫기. 버튼에서 바로 타이핑해도 검색 시작
//  - 적용 제외: <select multiple>, data-native 속성이 있는 select

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
let openState = null;   // { sel, trigger, panel }

function labelOf(sel) {
  const o = sel.options[sel.selectedIndex];
  return o ? o.text : '';
}

function sync(sel) {
  const t = sel._ssTrigger;
  if (!t) return;
  const text = labelOf(sel);
  t.querySelector('.ss-label').textContent = text || ' ';
  t.classList.toggle('ss-placeholder', !sel.value);
  t.disabled = sel.disabled;
  t.title = text;
}

function close() {
  if (!openState) return;
  const { panel, trigger } = openState;
  panel.remove();
  trigger.classList.remove('ss-open');
  trigger.setAttribute('aria-expanded', 'false');
  openState = null;
  document.removeEventListener('mousedown', onDocDown, true);
  window.removeEventListener('resize', close);
  document.removeEventListener('scroll', onScroll, true);
}
function onDocDown(e) {
  if (openState && !openState.panel.contains(e.target) && !openState.trigger.contains(e.target)) close();
}
function onScroll(e) {
  if (openState && !openState.panel.contains(e.target)) close();
}

function choose(sel, value) {
  if (sel.value !== value) {
    sel.value = value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  sync(sel);
  const t = sel._ssTrigger;
  close();
  t?.focus();
}

function open(sel, initial = '') {
  if (openState?.sel === sel) return close();
  close();
  const trigger = sel._ssTrigger;
  const panel = document.createElement('div');
  panel.className = 'ss-panel';
  panel.innerHTML = `<input class="ss-search" type="text" placeholder="입력해서 검색" autocomplete="off"><div class="ss-list" role="listbox"></div>`;
  document.body.appendChild(panel);
  const search = panel.querySelector('.ss-search');
  const list = panel.querySelector('.ss-list');
  let active = -1;
  let items = [];

  const render = () => {
    const q = norm(search.value);
    list.innerHTML = '';
    items = [];
    let lastGroup = null;
    [...sel.options].forEach((o) => {
      if (o.hidden) return;
      const group = o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : '';
      // 빈 값(선택/전체)은 검색어가 없을 때만 표시
      if (q && !o.value) return;
      if (q && !norm(o.text).includes(q) && !norm(group).includes(q)) return;
      if (group && group !== lastGroup) {
        const g = document.createElement('div');
        g.className = 'ss-group';
        g.textContent = group;
        list.appendChild(g);
      }
      lastGroup = group;
      const d = document.createElement('div');
      d.className = 'ss-opt' + (o.value === sel.value ? ' ss-selected' : '') + (o.disabled ? ' ss-disabled' : '');
      d.setAttribute('role', 'option');
      d.textContent = o.text || ' ';
      if (!o.disabled) {
        d.addEventListener('mousedown', (e) => { e.preventDefault(); choose(sel, o.value); });
        items.push({ el: d, value: o.value });
      }
      list.appendChild(d);
    });
    if (!items.length) list.innerHTML = '<div class="ss-empty">일치하는 항목이 없습니다</div>';
    active = q ? 0 : Math.max(0, items.findIndex((i) => i.value === sel.value));
    highlight();
  };
  const highlight = () => {
    items.forEach((it, i) => it.el.classList.toggle('ss-active', i === active));
    items[active]?.el.scrollIntoView({ block: 'nearest' });
  };

  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 무시 (조합 완료 후 동작)
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; highlight(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; highlight(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) choose(sel, items[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); trigger.focus(); }
    else if (e.key === 'Tab') close();
  });

  // 위치: 버튼 아래 (공간이 부족하면 위로)
  const r = trigger.getBoundingClientRect();
  const width = Math.max(r.width, 200);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.min(r.left, window.innerWidth - width - 8)}px`;
  const below = window.innerHeight - r.bottom;
  if (below < 260 && r.top > below) { panel.style.bottom = `${window.innerHeight - r.top + 4}px`; panel.style.maxHeight = `${Math.min(340, r.top - 12)}px`; }
  else { panel.style.top = `${r.bottom + 4}px`; panel.style.maxHeight = `${Math.min(340, below - 12)}px`; }

  search.value = initial;
  render();
  trigger.classList.add('ss-open');
  trigger.setAttribute('aria-expanded', 'true');
  openState = { sel, trigger, panel };
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', onScroll, true);
  });
  search.focus();
}

function enhance(sel) {
  if (sel._ssTrigger || sel.multiple || sel.hasAttribute('data-native')) return;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `${sel.className} ss-trigger`.trim();
  if (sel.style.cssText) trigger.style.cssText = sel.style.cssText;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="ss-label"></span>';
  sel._ssTrigger = trigger;
  sel.classList.add('ss-native');
  sel.tabIndex = -1;
  sel.after(trigger);

  trigger.addEventListener('click', () => { if (!sel.disabled) open(sel); });
  trigger.addEventListener('keydown', (e) => {
    if (sel.disabled) return;
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(sel); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(sel, e.key); }
  });
  // 값이 코드나 다른 화면 갱신으로 바뀌어도 표시를 맞춤
  sel.addEventListener('change', () => sync(sel));
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() { return proto.get.call(this); },
    set(v) { proto.set.call(this, v); sync(this); },
  });
  new MutationObserver(() => sync(sel)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  sync(sel);
}

export function initCombos(root = document.body) {
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SELECT') enhance(node);
    else node.querySelectorAll?.('select').forEach(enhance);
  };
  scan(root);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach(scan));
    // 열려 있는 드롭다운의 select가 화면에서 사라지면 닫기
    if (openState && !document.body.contains(openState.sel)) close();
  }).observe(root, { childList: true, subtree: true });
}
