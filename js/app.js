import { supabaseBackend, demoBackend } from './db.js?v=202611200909';
import { S, loadAll, loadTable, ensureUrls, thumbPaths, myNotifications, can, allRequests, isOverdue, requestTitle, isAssignee } from './store.js?v=202611200909';
import { KINDS } from './constants.js?v=202611200909';
import { ROLES } from './constants.js?v=202611200909';
import { $, $$, esc, toast, errMsg, timeAgo, openModal, openLightbox } from './ui.js?v=202611200909';
import { renderView, ROUTES, hasNewPatchNotes } from './views.js?v=202611200909';
import { openDetail, openProduct, refreshOpenPanels, closeAllPanels } from './detail.js?v=202611200909';
import { openDevRequest } from './devreq.js?v=202611200909';

const cfg = window.APP_CONFIG || {};
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo');
const root = $('#root');
let booted = false;
let hashBound = false;

async function boot() {
  if (!isDemo && (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('YOUR-PROJECT'))) {
    root.innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="logo">FBG Cooperation Dashboard_v1.0</div>
        <h1>서버 연결 설정이 필요합니다</h1>
        <p class="muted">js/config.js 파일에 Supabase 프로젝트 URL과 anon key를 입력한 뒤 다시 접속하세요.
        설정 방법은 README.md 의 「1. Supabase 설정」을 참고하세요.</p>
        <a class="btn btn-block" href="?demo=1">체험 모드로 화면 미리보기</a>
      </div></div>`;
    return;
  }
  S.db = isDemo ? demoBackend() : supabaseBackend(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  S.hooks.rerender = rerender;

  S.db.auth.onChange((event, user) => {
    if (event === 'PASSWORD_RECOVERY') return askNewPassword();
    if (event === 'SIGNED_OUT') { closeAllPanels(); unsub?.(); unsub = null; S.user = null; S.me = null; renderLogin(); }
    if (booted && event === 'SIGNED_IN' && user && (!S.user || S.user.id !== user.id)) { S.user = user; startApp(); }
  });

  S.user = await S.db.auth.getUser();
  booted = true;
  if (S.user) startApp(); else renderLogin();
}

// ---------------------------------------------------------------- 로그인
function renderLogin(mode = 'login') {
  const demoUsers = isDemo ? `
    <div class="demo-users">
      <p class="muted small">체험 모드 — 서버에 저장되지 않으며 이 브라우저에서만 보입니다.</p>
      ${[['admin@demo', '관리자'], ['logistics@demo', '물류/발주팀 김물류'], ['brand@demo', '브랜드팀 이브랜드'], ['design@demo', '디자인팀 박디자인']]
        .map(([e, l]) => `<button class="btn btn-block" data-demo="${e}">${l}로 로그인</button>`).join('')}
      <button class="btn-link small" id="demo-reset">체험 데이터 초기화</button>
    </div>` : '';
  root.innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="logo">FBG Cooperation Dashboard_v1.0</div>
      <h1>${mode === 'signup' ? '계정 만들기' : mode === 'reset' ? '비밀번호 재설정' : '로그인'}</h1>
      <p class="muted">물류/발주 · 브랜드 · 디자인 통합 업무관리</p>
      ${isDemo ? demoUsers : `
      <form id="auth-form" class="stack">
        ${mode === 'signup' ? '<label class="field"><span>이름</span><input class="input" name="name" required autocomplete="name"></label>' : ''}
        <label class="field"><span>이메일</span><input class="input" type="email" name="email" required autocomplete="email"></label>
        ${mode !== 'reset' ? `<label class="field"><span>비밀번호</span><input class="input" type="password" name="password" required minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>` : ''}
        <button class="btn btn-primary btn-block" type="submit">${mode === 'signup' ? '가입 신청' : mode === 'reset' ? '재설정 메일 보내기' : '로그인'}</button>
      </form>
      <div class="auth-links">
        ${mode !== 'login' ? '<button class="btn-link" data-mode="login">로그인으로 돌아가기</button>' : `
        <button class="btn-link" data-mode="signup">계정 만들기</button>
        <button class="btn-link" data-mode="reset">비밀번호를 잊으셨나요?</button>`}
      </div>
      ${mode === 'signup' ? '<p class="muted small">가입 후 관리자가 소속 팀(권한)을 지정하면 이용할 수 있습니다.</p>' : ''}`}
    </div></div>`;

  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => renderLogin(b.dataset.mode)));
  $$('[data-demo]').forEach((b) => b.addEventListener('click', () => S.db.auth.signIn(b.dataset.demo).catch((e) => toast(errMsg(e), 'error'))));
  $('#demo-reset')?.addEventListener('click', () => S.db.resetDemo());
  $('#auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (mode === 'login') await S.db.auth.signIn(f.email, f.password);
      if (mode === 'signup') {
        const res = await S.db.auth.signUp(f.email, f.password, f.name);
        if (!res.session) { toast('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.'); renderLogin('login'); }
      }
      if (mode === 'reset') { await S.db.auth.resetPassword(f.email); toast('재설정 메일을 보냈습니다.'); renderLogin('login'); }
    } catch (err) {
      toast(/Invalid login/i.test(err.message) ? '이메일 또는 비밀번호가 올바르지 않습니다.' : errMsg(err), 'error');
    } finally { btn.disabled = false; }
  });
}

function askNewPassword() {
  const m = openModal(`
    <div class="modal-head"><h2>새 비밀번호 설정</h2></div>
    <div class="modal-body"><input class="input" type="password" id="np" minlength="8" placeholder="8자 이상"></div>
    <div class="modal-foot"><button class="btn btn-primary" id="np-ok">저장</button></div>`);
  $('#np-ok', m.el).addEventListener('click', async () => {
    try { await S.db.auth.updatePassword($('#np', m.el).value); toast('비밀번호를 변경했습니다.'); m.close(); }
    catch (e) { toast(errMsg(e), 'error'); }
  });
}

// ---------------------------------------------------------------- 앱 시작
let unsub = null;
async function startApp() {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    await loadTable('profiles');
    S.me = S.data.profiles.find((p) => p.id === S.user.id);
    if (!S.me || S.me.role === 'pending' || !S.me.active) return renderPending();
    await loadAll();
  } catch (e) {
    root.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>데이터를 불러오지 못했습니다</h1><p class="muted">${esc(errMsg(e))}</p>
      <p class="muted small">schema.sql 이 실행되었는지, config.js 의 URL/키가 맞는지 확인하세요.</p>
      <button class="btn" id="lo">로그아웃</button></div></div>`;
    $('#lo').addEventListener('click', () => S.db.auth.signOut());
    return;
  }
  renderShell();
  unsub?.();
  unsub = S.db.subscribe(onRealtime);
  if (!hashBound) { window.addEventListener('hashchange', route); hashBound = true; }
  route();
}

function renderPending() {
  root.innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="logo">FBG Cooperation Dashboard_v1.0</div>
    <h1>승인 대기 중</h1>
    <p class="muted">${esc(S.me?.name || S.user.email)} 님의 계정이 생성되었습니다.<br>관리자가 소속 팀을 지정하면 대시보드를 이용할 수 있습니다.</p>
    <div class="row gap"><button class="btn" id="re">다시 확인</button><button class="btn" id="lo">로그아웃</button></div>
  </div></div>`;
  $('#re').addEventListener('click', startApp);
  $('#lo').addEventListener('click', () => S.db.auth.signOut());
}

// ---------------------------------------------------------------- 실시간 동기화
const pending = new Set();
let timer = null;
function onRealtime(table, payload) {
  if (table === '__status') {
    S.live = payload.status === 'SUBSCRIBED' ? 'live' : payload.status === 'CLOSED' ? 'off' : 'connecting';
    updateLive();
    if (payload.status === 'SUBSCRIBED' && S._wasOff) { S._wasOff = false; resync(); }
    if (payload.status !== 'SUBSCRIBED') S._wasOff = true;
    return;
  }
  pending.add(table);
  if (table === 'notifications') pending.add('notification_reads');
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
async function flush() {
  const tables = [...pending];
  pending.clear();
  try {
    await Promise.all(tables.map((t) => loadTable(t)));
    if (tables.includes('profiles')) {
      S.me = S.data.profiles.find((p) => p.id === S.user.id);
      if (!S.me || S.me.role === 'pending' || !S.me.active) return renderPending();
    }
    if (tables.includes('attachments') || tables.includes('shoot_requests')) {
      await ensureUrls(thumbPaths());
    }
  } catch (e) { console.warn(e); }
  rerender();
}
async function resync() {
  try { await loadAll(); rerender(); } catch (e) { console.warn(e); }
}
// 탭이 다시 보일 때 최신 데이터로 맞춤 (절전/네트워크 끊김 대비)
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && S.me.role !== 'pending') resync(); });

export function rerender() {
  if (!$('#view')) return;
  renderNav();
  updateBell();
  renderView(currentRoute(), $('#view'));
  refreshOpenPanels();
}

// ---------------------------------------------------------------- 레이아웃
function renderShell() {
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand-mark">FBG Cooperation<br>Dashboard_v1.0</div>
        <nav id="nav"></nav>
        <div class="me">
          <div class="avatar">${esc((S.me.name || '?').slice(0, 1))}</div>
          <div class="me-info"><strong>${esc(S.me.name)}</strong><span>${esc(ROLES[S.me.role])}${isDemo ? ' · 체험' : ''}</span></div>
          <button class="icon-btn" id="logout" title="로그아웃">⎋</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <h1 id="page-title"></h1>
          <div class="topbar-right">
            <span id="live" class="live"></span>
            <button class="icon-btn bell" id="bell" title="알림">🔔<span id="bell-count"></span></button>
          </div>
        </header>
        ${isDemo ? '<div class="demo-banner">체험 모드입니다. 입력한 데이터는 이 브라우저에만 저장되며 다른 PC와 공유되지 않습니다.</div>' : ''}
        <section id="view" class="view"></section>
      </main>
    </div>`;
  $('#logout').addEventListener('click', () => { unsub?.(); S.db.auth.signOut(); });
  $('#bell').addEventListener('click', openNotifications);
  renderNav();
  updateLive();
  updateBell();
}

function renderNav() {
  const r = currentRoute().name;
  const counts = {
    package: S.data.package_requests.filter((x) => !x.cancelled && x.status === '요청').length,
    shoot: S.data.shoot_requests.filter((x) => !x.cancelled && x.status === '요청').length,
    design: S.data.design_requests.filter((x) => !x.cancelled && x.status === '요청').length,
    devreq: can.admin() ? (S.data.dev_requests || []).filter((x) => x.status === '접수').length : 0,
  };
  $('#nav').innerHTML = ROUTES.filter((x) => !x.hidden && (!x.admin || can.admin())).map((x) => `
    <a href="#/${x.name}" class="nav-item ${r === x.name ? 'active' : ''}">
      <span class="nav-no">${x.no || ''}</span><span>${x.label}</span>
      ${counts[x.name] ? `<span class="nav-count" title="신규 요청">${counts[x.name]}</span>` : ''}
      ${x.name === 'patchnotes' && r !== 'patchnotes' && hasNewPatchNotes() ? '<span class="nav-new" title="새 업데이트">N</span>' : ''}
    </a>`).join('');
}

function updateLive() {
  const el = $('#live');
  if (!el) return;
  const map = { live: ['실시간 연결됨', 'on'], connecting: ['연결 중…', ''], off: ['연결 끊김 — 재연결 중', 'off'] };
  const [t, c] = map[S.live] || map.connecting;
  el.className = `live ${c}`;
  el.textContent = t;
}

// 기한 초과 업무: 담당자 본인 + 관리자에게 표시
function myOverdue() {
  return allRequests().filter((r) => isOverdue(r) && (isAssignee(r, S.me.id) || S.me.role === 'admin'));
}

function updateBell() {
  const n = myNotifications().filter((x) => !x.read).length + myOverdue().length;
  const el = $('#bell-count');
  if (el) { el.textContent = n > 99 ? '99+' : n || ''; el.className = n ? 'badge' : ''; }
}

function openNotifications() {
  const list = myNotifications().slice(0, 80);
  const m = openModal(`
    <div class="modal-head"><h2>알림</h2><div class="row gap">
      <button class="btn btn-sm" id="read-all">모두 읽음</button><button class="icon-btn" data-close>✕</button></div></div>
    <div class="modal-body noti-list">
      ${myOverdue().map((r) => `
        <button class="noti unread overdue" data-type="${r._kind}" data-eid="${r.id}">
          <strong>기한 초과 · ${esc(KINDS[r._kind].short)}</strong><span>${esc(r.code)} · ${esc(requestTitle(r))} (희망 ${esc(r.due_date)})</span><time>${esc(r.status)}</time>
        </button>`).join('')}
      ${list.length ? list.map((n) => `
        <button class="noti ${n.read ? '' : 'unread'}" data-id="${n.id}" data-type="${esc(n.entity_type)}" data-eid="${esc(n.entity_id)}">
          <strong>${esc(n.title)}</strong><span>${esc(n.body || '')}</span><time>${timeAgo(n.created_at)}</time>
        </button>`).join('') : myOverdue().length ? '' : '<p class="empty">새 알림이 없습니다.</p>'}
    </div>`);
  const markRead = async (ids) => {
    const read = new Set(S.data.notification_reads.map((r) => r.notification_id));
    const rows = ids.filter((id) => !read.has(id)).map((id) => ({ notification_id: id }));
    if (!rows.length) return;
    try { await S.db.insert('notification_reads', rows); await loadTable('notification_reads'); updateBell(); } catch (e) { console.warn(e); }
  };
  $('#read-all', m.el).addEventListener('click', async () => { await markRead(list.map((n) => n.id)); m.close(); });
  $$('.noti', m.el).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.id) markRead([Number(b.dataset.id)]);
    m.close();
    if (b.dataset.type === 'product') openProduct(b.dataset.eid);
    else if (b.dataset.type === 'dev') openDevRequest(b.dataset.eid);
    else openDetail(b.dataset.type, b.dataset.eid);
  }));
}

// ---------------------------------------------------------------- 라우팅
export function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, qs] = h.split('?');
  return { name: ROUTES.some((r) => r.name === name) ? name : 'dashboard', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function route() {
  const r = currentRoute();
  const def = ROUTES.find((x) => x.name === r.name);
  if (def.admin && !can.admin()) { location.hash = '#/dashboard'; return; }
  $('#page-title').textContent = def.title || def.label;
  renderNav();
  renderView(r, $('#view'), true);
  $('#view').scrollTop = 0;
  // 슬랙 알림의 「대시보드에서 보기」 링크: ?open=package:<id>
  if (r.query.open) {
    const [type, id] = r.query.open.split(':');
    history.replaceState(null, '', `#/${r.name}`);
    if (type === 'product') openProduct(id);
    else if (type === 'dev') openDevRequest(id);
    else if (KINDS[type]) openDetail(type, id);
  }
}

// 이미지 확대: 같은 갤러리 안의 이미지끼리 좌우로 넘겨 볼 수 있음
document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-zoom]');
  if (!img) return;
  e.preventDefault();
  e.stopPropagation();
  const group = img.closest('[data-gallery]');
  const imgs = group ? [...group.querySelectorAll('img[data-zoom]')] : [img];
  const items = imgs.map((x) => ({ src: x.src, name: x.dataset.name, path: x.dataset.path }));
  openLightbox(items, imgs.indexOf(img), {
    onDownload: async (it) => {
      try { window.open(await S.db.downloadUrl(it.path, it.name), '_blank'); } catch (err) { toast(errMsg(err), 'error'); }
    },
  });
}, true);

boot();
