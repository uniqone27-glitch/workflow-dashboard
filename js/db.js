// 데이터 접근 계층
//  - supabase: 실제 운영용 (중앙 DB + 인증 + 파일 저장소 + 실시간)
//  - demo: 화면 확인용 체험 모드 (index.html?demo=1). 이 브라우저에만 저장되므로 운영 용도로 쓰지 않습니다.

import { CATEGORIES } from './constants.js?v=202611201504';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';

export const TABLES = [
  'profiles', 'brands', 'design_work_types', 'categories', 'products', 'launch_readiness',
  'package_requests', 'shoot_requests', 'design_requests', 'dev_requests',
  'attachments', 'comments', 'history', 'notifications', 'notification_reads', 'drafts',
];
const BUCKET = 'files';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export function supabaseBackend(url, anonKey) {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return {
    kind: 'supabase',
    auth: {
      async getUser() { return (await sb.auth.getSession()).data.session?.user ?? null; },
      async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
      async signUp(email, password, name) {
        return check(await sb.auth.signUp({ email, password, options: { data: { name } } }));
      },
      async signOut() { await sb.auth.signOut(); },
      onChange(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session?.user ?? null)); },
      async resetPassword(email) {
        check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
      },
      async updatePassword(password) { check(await sb.auth.updateUser({ password })); },
    },
    // 전체 행 조회 (1,000행 단위 페이지 반복)
    async list(table, { order = 'created_at', asc = false, limit = null, eq = null } = {}) {
      const page = 1000;
      let all = [];
      for (let from = 0; ; from += page) {
        let q = sb.from(table).select('*');
        if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
        if (order) q = q.order(order, { ascending: asc });
        const to = limit ? Math.min(from + page, limit) - 1 : from + page - 1;
        const rows = check(await q.range(from, to));
        all = all.concat(rows);
        if (rows.length < page || (limit && all.length >= limit)) break;
      }
      return all;
    },
    async insert(table, rows) {
      return check(await sb.from(table).insert(rows).select());
    },
    async update(table, match, patch) {
      let q = sb.from(table).update(patch);
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
      const rows = check(await q.select());
      if (!rows.length) throw new Error('권한이 없거나 대상을 찾을 수 없습니다.');
      return rows[0];
    },
    async remove(table, match) {
      let q = sb.from(table).delete();
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
      const rows = check(await q.select());
      if (!rows.length) throw new Error('삭제 권한이 없거나 대상을 찾을 수 없습니다.');
    },
    async upload(path, file) {
      check(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
      return path;
    },
    async signedUrls(paths) {
      if (!paths.length) return {};
      const data = check(await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6));
      const out = {};
      data.forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
      return out;
    },
    async downloadUrl(path, fileName) {
      const data = check(await sb.storage.from(BUCKET).createSignedUrl(path, 300, { download: fileName || true }));
      return data.signedUrl;
    },
    async removeFile(path) { check(await sb.storage.from(BUCKET).remove([path])); },
    async rpc(fn, args) { return check(await sb.rpc(fn, args)); },
    subscribe(onChange) {
      const ch = sb.channel('workflow-all');
      TABLES.filter((t) => !['drafts', 'notification_reads'].includes(t)).forEach((t) => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => onChange(t, p));
      });
      ch.subscribe((status) => onChange('__status', { status }));
      return () => sb.removeChannel(ch);
    },
  };
}

// ---------------------------------------------------------------------------
// 체험 모드 (서버 없이 화면/흐름 확인용) — 서버의 트리거 동작을 간단히 흉내냅니다.
// ---------------------------------------------------------------------------
export function demoBackend() {
  const KEY = 'wf-demo-db-v3';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('wf-demo') : null;
  const listeners = [];
  const blobs = {};
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) db = seed();
  db.dev_requests ||= [];
  db.categories ||= CATEGORIES.map((name, i) => ({ name, sort: i + 1, active: true }));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 용량 초과 무시 */ } };
  const emit = (table, eventType, row) => {
    listeners.forEach((l) => l(table, { eventType, new: row }));
    bc?.postMessage({ table, eventType });
  };
  // 다른 탭에서 변경 시 동기화 (체험 모드 전용 — 운영 모드는 Supabase Realtime 사용)
  const syncFromOtherTab = (tables) => {
    try { db = JSON.parse(localStorage.getItem(KEY)) || db; } catch { /* noop */ }
    tables.forEach((t) => listeners.forEach((l) => l(t, { eventType: 'SYNC' })));
  };
  bc && (bc.onmessage = (e) => syncFromOtherTab([e.data.table]));
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) syncFromOtherTab(['products', 'launch_readiness', 'package_requests', 'shoot_requests', 'design_requests', 'dev_requests', 'attachments', 'comments', 'history', 'notifications']);
  });

  let session = JSON.parse(sessionStorage.getItem('wf-demo-user') || 'null');
  const authCbs = [];
  const uid = () => session?.id;
  const role = () => db.profiles.find((p) => p.id === uid())?.role;
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const codeOf = (prefix) => {
    const seqs = db.__seq || (db.__seq = {});
    seqs[prefix] = (seqs[prefix] || 0) + 1;
    const d = new Date();
    return `${prefix}-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(seqs[prefix]).padStart(4, '0')}`;
  };
  const ENT = { products: 'product', package_requests: 'package', shoot_requests: 'shoot', design_requests: 'design', launch_readiness: 'product' };
  const REQ = { package_requests: ['logistics', 'PKG', ['design', 'brand']], shoot_requests: ['brand', 'SHT', ['design']], design_requests: ['brand', 'DSN', ['design']] };
  const WORK = {
    package_requests: ['status', 'assignee_id', 'assignee_ids', 'expected_date', 'work_memo', 'work_url', 'result_url', 'completed_date'],
    shoot_requests: ['status', 'assignee_id', 'assignee_ids', 'scheduled_date', 'expected_date', 'work_memo', 'result_url', 'completed_date'],
    design_requests: ['status', 'assignee_id', 'assignee_ids', 'expected_date', 'work_memo', 'figma_url', 'result_url', 'completed_date'],
  };
  const WRITE = {
    products: ['admin', 'logistics'], launch_readiness: ['admin', 'brand'], brands: ['admin', 'logistics', 'brand'],
    design_work_types: ['admin', 'brand'],
    categories: ['admin'],
  };

  function log(table, op, row, before) {
    const ent = ENT[table];
    if (!ent) return;
    const id = row.id || row.product_id;
    let changes = {}, action = op;
    if (op === 'update') {
      for (const k of Object.keys(row)) {
        if (['updated_at', 'updated_by', 'status_changed_at', 'status_changed_by'].includes(k)) continue;
        if (JSON.stringify(row[k]) !== JSON.stringify(before[k])) changes[k] = { from: before[k] ?? null, to: row[k] ?? null };
      }
      if (!Object.keys(changes).length) return;
      action = changes.status ? 'status' : changes.cancelled ? 'cancel' : 'update';
    }
    const h = { id: (db.history.at(-1)?.id || 0) + 1, entity_type: ent, entity_id: id, entity_code: row.code, action, changes,
      from_status: changes.status?.from ?? null, to_status: changes.status?.to ?? null, actor_id: uid(), created_at: now() };
    db.history.push(h);
    emit('history', 'INSERT', h);
    const notify = (n) => {
      const r = { id: (db.notifications.at(-1)?.id || 0) + 1, entity_type: ent, entity_id: id, actor_id: uid(), created_at: now(), target_role: null, target_user: null, ...n };
      db.notifications.push(r);
      emit('notifications', 'INSERT', r);
    };
    if (table === 'products' && op === 'create' && ['신제품', '리뉴얼'].includes(row.product_kind)) {
      notify({ target_role: 'brand', title: `${row.product_kind} 등록`, body: row.retail_name || row.online_name });
    }
    const req = REQ[table];
    if (!req) return;
    const title = { package: '패키지 디자인 요청', shoot: '촬영 요청', design: '디자인 작업 요청' }[ent];
    const pp = db.products.find((p) => p.id === row.product_id); const pname = pp ? pp.retail_name || pp.online_name : '';
    const body = `${row.code} · ${row.title || pname}`;
    if (op === 'create') req[2].forEach((r) => notify({ target_role: r, title: `신규 ${title}`, body }));
    if (changes.status) notify({ target_role: req[0], title: row.status === '완료' ? `${title} 완료` : `${title} 상태 변경: ${row.status}`, body });
    if (changes.assignee_ids) {
      const prev = before?.assignee_ids?.length ? before.assignee_ids : before?.assignee_id ? [before.assignee_id] : [];
      (row.assignee_ids || []).filter((u) => !prev.includes(u)).forEach((u) => notify({ target_user: u, title: `${title} 담당자로 배정됨`, body }));
    } else if (changes.assignee_id && row.assignee_id) notify({ target_user: row.assignee_id, title: `${title} 담당자로 배정됨`, body });
  }

  function devNotify(n, row) {
    const x = { id: (db.notifications.at(-1)?.id || 0) + 1, entity_type: 'dev', entity_id: row.id, actor_id: uid(), created_at: now(), target_role: null, target_user: null, ...n };
    db.notifications.push(x);
    emit('notifications', 'INSERT', x);
  }

  const api = {
    kind: 'demo',
    auth: {
      async getUser() { return session; },
      async signIn(email) {
        const p = db.profiles.find((x) => x.email === email);
        if (!p) throw new Error('체험 모드: 아래 계정 버튼으로 로그인하세요.');
        session = { id: p.id, email: p.email };
        sessionStorage.setItem('wf-demo-user', JSON.stringify(session));
        authCbs.forEach((c) => c('SIGNED_IN', session));
      },
      async signUp() { throw new Error('체험 모드에서는 회원가입을 지원하지 않습니다.'); },
      async signOut() {
        session = null;
        sessionStorage.removeItem('wf-demo-user');
        authCbs.forEach((c) => c('SIGNED_OUT', null));
      },
      onChange(cb) { authCbs.push(cb); },
      async resetPassword() { throw new Error('체험 모드에서는 지원하지 않습니다.'); },
      async updatePassword() {},
    },
    async list(table, { order = 'created_at', asc = false, limit = null, eq = null } = {}) {
      let rows = [...(db[table] || [])];
      if (table === 'drafts' || table === 'notification_reads') rows = rows.filter((r) => r.user_id === uid());
      if (table === 'notifications') rows = rows.filter((n) => n.target_user === uid() || n.target_role === role());
      if (eq) rows = rows.filter((r) => Object.entries(eq).every(([k, v]) => r[k] === v));
      if (order) rows.sort((a, b) => (a[order] > b[order] ? 1 : -1) * (asc ? 1 : -1));
      return structuredClone(limit ? rows.slice(0, limit) : rows);
    },
    async insert(table, rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      const r = role();
      if (WRITE[table] && !WRITE[table].includes(r)) throw new Error('권한이 없습니다. (서버에서 거부됨)');
      if (REQ[table] && !['admin', REQ[table][0]].includes(r)) throw new Error('권한이 없습니다. (서버에서 거부됨)');
      const out = list.map((src) => {
        const row = { id: uuid(), created_at: now(), updated_at: now(), updated_by: uid(), ...src };
        if (table === 'products') { row.code = codeOf('PRD'); row.created_by = uid(); row.specs ??= {}; row.options ??= []; row.spec_changes ??= []; }
        if (REQ[table]) {
          row.code = codeOf(REQ[table][1]); row.requester_id = uid(); row.cancelled = false;
          if (r !== 'admin') WORK[table].forEach((c) => { row[c] = null; });
          row.status ||= '요청'; row.priority ||= '보통'; row.status_changed_at = now();
        }
        if (['comments', 'attachments', 'drafts', 'notification_reads'].includes(table)) {
          if (table === 'comments') row.author_id = uid();
          if (table === 'attachments') row.uploaded_by = uid();
          if (table === 'drafts' || table === 'notification_reads') row.user_id = uid();
        }
        if (table === 'brands') row.id = (db.brands.at(-1)?.id || 0) + 1;
        if (table === 'dev_requests') {
          row.code = codeOf('DEV'); row.requester_id = uid(); row.status_changed_at = now(); row.status_changed_by = uid();
          if (r !== 'admin') { row.status = '접수'; row.answer = null; }
          row.status ||= '접수'; row.priority ||= '보통';
          devNotify({ target_role: 'admin', title: `신규 개발 요청 (${row.req_type})`, body: `${row.code} · ${row.title}` }, row);
        }
        db[table].push(row);
        if (table === 'comments' && ((row.mentions || []).length || (row.mention_roles || []).length)) {
          const who = db.profiles.find((p) => p.id === uid())?.name || '';
          const t = { package: db.package_requests, shoot: db.shoot_requests, design: db.design_requests, dev: db.dev_requests }[row.entity_type];
          const target = t?.find((x) => x.id === row.entity_id);
          const pr = row.entity_type === 'product' ? db.products.find((x) => x.id === row.entity_id) : null;
          const label = target?.code || pr?.retail_name || '';
          const base = { entity_type: row.entity_type, entity_id: row.entity_id, actor_id: uid(), created_at: now(),
            title: `${who}님이 댓글에서 언급했습니다`, body: `${label ? `${label} · ` : ''}${row.body.slice(0, 100)}` };
          const push = (n) => { const r = { id: (db.notifications.at(-1)?.id || 0) + 1, target_role: null, target_user: null, ...base, ...n }; db.notifications.push(r); emit('notifications', 'INSERT', r); };
          [...new Set(row.mentions || [])].filter((x) => x !== uid() && !(row.mention_roles || []).includes(db.profiles.find((p) => p.id === x)?.role)).forEach((u) => push({ target_user: u }));
          [...new Set(row.mention_roles || [])].forEach((r) => push({ target_role: r }));
        }
        if (table === 'products') db.launch_readiness.push({ product_id: row.id, followup: '미확인', shoot_needed: '미정', detail_needed: '미정', thumb_needed: '미정', launch_date: null, launch_state: '준비 전', note: null, updated_at: now() });
        log(table, 'create', row);
        emit(table, 'INSERT', row);
        return structuredClone(row);
      });
      save();
      return out;
    },
    async update(table, match, patch) {
      const row = db[table].find((x) => Object.entries(match).every(([k, v]) => x[k] === v));
      if (!row) throw new Error('대상을 찾을 수 없습니다.');
      const r = role();
      if (WRITE[table] && !WRITE[table].includes(r)) throw new Error('권한이 없습니다. (서버에서 거부됨)');
      if (table === 'profiles' && r !== 'admin' && (patch.role || patch.active !== undefined)) throw new Error('권한이 없습니다: 역할은 관리자만 변경할 수 있습니다.');
      if (REQ[table] && r !== 'admin') {
        const keys = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(row[k]));
        if (r === 'design') {
          const bad = keys.filter((k) => !WORK[table].includes(k));
          if (bad.length) throw new Error(`디자인팀은 담당자·진행 상태·일정·결과물·작업 메모만 수정할 수 있습니다. (수정 불가 항목: ${bad.join(', ')})`);
        } else if (r === REQ[table][0]) {
          const bad = keys.filter((k) => WORK[table].includes(k));
          if (bad.length) throw new Error(`담당자와 진행 상태는 디자인팀만 변경할 수 있습니다. (수정 불가 항목: ${bad.join(', ')})`);
        } else throw new Error('이 업무를 수정할 권한이 없습니다.');
      }
      if (table === 'dev_requests' && r !== 'admin') {
        if (row.requester_id !== uid()) throw new Error('본인이 등록한 요청만 수정할 수 있습니다.');
        if (('status' in patch && patch.status !== row.status) || ('answer' in patch && patch.answer !== row.answer)) throw new Error('진행 상태와 답변은 관리자만 변경할 수 있습니다.');
        if (row.status !== '접수') throw new Error('관리자가 확인을 시작한 요청은 수정할 수 없습니다. 추가 내용은 댓글로 남겨 주세요.');
      }
      const before = structuredClone(row);
      Object.assign(row, patch, { updated_at: now(), updated_by: uid() });
      if (table === 'dev_requests') {
        const label = `${row.code} · ${row.title}`;
        if (before.status !== row.status) {
          row.status_changed_at = now(); row.status_changed_by = uid();
          devNotify({ target_user: row.requester_id, title: row.status === '완료' ? '개발 요청 완료' : `개발 요청 상태 변경: ${row.status}`, body: label }, row);
        }
        if (row.answer && row.answer !== before.answer) devNotify({ target_user: row.requester_id, title: '개발 요청에 관리자 답변이 등록되었습니다', body: `${label} · ${row.answer.slice(0, 80)}` }, row);
      }
      if (REQ[table] && before.status !== row.status) {
        row.status_changed_at = now(); row.status_changed_by = uid();
        if (row.status === '완료' && !row.completed_date) row.completed_date = new Date().toISOString().slice(0, 10);
        if (row.status !== '완료') row.completed_date = null;
      }
      log(table, 'update', row, before);
      emit(table, 'UPDATE', row);
      save();
      return structuredClone(row);
    },
    async remove(table, match) {
      const idx = db[table].findIndex((x) => Object.entries(match).every(([k, v]) => x[k] === v));
      if (idx < 0) throw new Error('대상을 찾을 수 없습니다.');
      const r = role();
      const own = table === 'dev_requests' && db[table][idx].requester_id === uid() && db[table][idx].status === '접수';
      if (!['drafts', 'comments', 'attachments'].includes(table) && r !== 'admin' && !own) throw new Error('삭제 권한이 없습니다. (관리자 전용)');
      const [row] = db[table].splice(idx, 1);
      if (table === 'products') {
        ['package_requests', 'shoot_requests'].forEach((t) => { db[t] = db[t].filter((x) => x.product_id !== row.id); });
        db.launch_readiness = db.launch_readiness.filter((x) => x.product_id !== row.id);
      }
      log(table, 'delete', row);
      emit(table, 'DELETE', row);
      save();
    },
    async upload(path, file) { blobs[path] = URL.createObjectURL(file); return path; },
    async signedUrls(paths) {
      const out = {};
      paths.forEach((p) => { out[p] = blobs[p] || (p.startsWith('demo:') ? p.slice(5) : ''); });
      return out;
    },
    async downloadUrl(path) { return blobs[path] || (path.startsWith('demo:') ? path.slice(5) : ''); },
    async removeFile(path) { delete blobs[path]; },
    async rpc(fn, args) {
      if (fn !== 'admin_delete_user') throw new Error('지원하지 않는 기능입니다.');
      if (role() !== 'admin') throw new Error('권한이 없습니다: 사용자 삭제는 관리자만 할 수 있습니다.');
      if (args.target === uid()) throw new Error('본인 계정은 삭제할 수 없습니다.');
      const row = db.profiles.find((x) => x.id === args.target);
      if (row) Object.assign(row, { active: false, role: 'pending', email: null, deleted_at: now() });
      db.drafts = db.drafts.filter((x) => x.user_id !== args.target);
      emit('profiles', 'UPDATE', row);
      save();
      return null;
    },
    subscribe(cb) {
      listeners.push(cb);
      setTimeout(() => cb('__status', { status: 'SUBSCRIBED' }), 50);
      return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
    },
    resetDemo() { localStorage.removeItem(KEY); sessionStorage.removeItem('wf-demo-user'); location.reload(); },
  };
  return api;

  function seed() {
    const t = new Date();
    const d = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const ts = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString(); };
    const P = (id, email, name, role) => ({ id, email, name, role, active: true, created_at: ts(-30) });
    const profiles = [
      P('u-admin', 'admin@demo', '관리자', 'admin'),
      P('u-log', 'logistics@demo', '김물류', 'logistics'),
      P('u-brand', 'brand@demo', '이브랜드', 'brand'),
      P('u-design', 'design@demo', '박디자인', 'design'),
      P('u-design2', 'design2@demo', '최디자인', 'design'),
    ];
    const img = (txt, bg) => `demo:data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><text x="200" y="215" font-size="40" text-anchor="middle" fill="#555" font-family="sans-serif">${txt}</text></svg>`)}`;
    const products = [
      { id: 'p1', code: 'PRD-DEMO-0001', brand_id: 1, online_name: '오크 원목 라운드 테이블 1200', retail_name: '퍼니츠 라운드 테이블 OAK', sku: 'FN-TB-1200-OAK', category: '테이블', product_kind: '신제품', arrival_date: d(12), arrival_qty: 300, reference_url: '', specs: { color: '오크 / 월넛', size: '1200 × 1200 × 740', material: '오크 원목, 스틸', design_feature: '라운드 상판, 아치형 다리', main_function: '조절발로 수평 조절', top_color: '오크', frame_color: '블랙', top_material: '오크 원목 집성', dimension: '1200 × 1200 × 740', top_thickness: '25mm', shape: '라운드', leveler: '있음', assembly: '반조립' }, options: [{ name: '오크', color: '오크', size: '1200', material: '오크 원목', note: '' }, { name: '월넛', color: '월넛', size: '1200', material: '월넛 원목', note: '+5만원' }], spec_changes: [], spec_notes: '상판 모서리 R30 라운드 처리', created_by: 'u-log', created_at: ts(-6), updated_at: ts(-6) },
      { id: 'p2', code: 'PRD-DEMO-0002', brand_id: 2, online_name: '뽀뽀 패브릭 3인 소파 (리뉴얼)', retail_name: '뽀뽀백번 소파 V2', sku: 'BB-SF-3-V2', category: '소파', product_kind: '리뉴얼', arrival_date: d(5), specs: { color: '아이보리', material: '부클레 패브릭', fabric_color: '아이보리', seats: '3인', cover: '가능' }, options: [{ name: '아이보리', color: '아이보리', size: '2100', material: '부클레', note: '' }], spec_changes: [{ field: '프레임 두께', before: '18mm', after: '25mm' }, { field: '컬러', before: '베이지', after: '아이보리' }], spec_notes: '', created_by: 'u-log', created_at: ts(-3), updated_at: ts(-3) },
      { id: 'p3', code: 'PRD-DEMO-0003', brand_id: 1, online_name: '스틸 X프레임 5단 책장', retail_name: '퍼니츠 X 책장 5단', sku: 'FN-BS-5X', category: '책장', arrival_qty: 150, product_kind: '신제품', arrival_date: d(-2), specs: { body_color: '화이트', shelf_count: '5', reinforcement: 'X 와이어', wall_fix: '필요' }, options: [], spec_changes: [], created_by: 'u-log', created_at: ts(-14), updated_at: ts(-14) },
    ];
    const L = (product_id, o) => ({ product_id, followup: '미확인', shoot_needed: '미정', detail_needed: '미정', thumb_needed: '미정', launch_date: null, launch_state: '준비 전', note: null, updated_at: ts(-1), ...o });
    const base = (o) => ({ cancelled: false, cancel_reason: null, assignee_id: null, expected_date: null, work_memo: null, result_url: null, completed_date: null, status: '요청', priority: '보통', updated_at: o.created_at, status_changed_at: o.created_at, ...o, assignee_ids: o.assignee_ids || (o.assignee_id ? [o.assignee_id] : []) });
    return {
      __seq: { PRD: 3, PKG: 3, SHT: 1, DSN: 2 },
      profiles,
      brands: [{ id: 1, name: '퍼니츠', sort: 1, active: true }, { id: 2, name: '뽀뽀백번', sort: 2, active: true }, { id: 3, name: '유통', sort: 3, active: true }],
      design_work_types: ['상세페이지 신규 제작', '상세페이지 수정', '썸네일 신규 제작', '썸네일 수정', '프로모션 배너', 'SNS 이미지', '영상 제작 및 편집', '광고 소재', '기타 디자인 작업'].map((name, i) => ({ name, sort: i })),
      products,
      launch_readiness: [L('p1', { followup: '미확인' }), L('p2', { followup: '후속 진행', shoot_needed: '필요', detail_needed: '필요', thumb_needed: '필요', launch_state: '준비중', launch_date: d(20) }), L('p3', { followup: '후속 진행', shoot_needed: '필요', detail_needed: '필요', thumb_needed: '불필요', launch_state: '준비중', launch_date: d(7) })],
      package_requests: [
        base({ id: 'k1', code: 'PKG-DEMO-0001', product_id: 'p1', design_type: '제품 박스', package_spec: '1250 × 1250 × 120 (골판지 5겹)', required_text: '제조국, KC 인증번호, 취급주의', priority: '높음', due_date: d(6), requester_id: 'u-log', created_at: ts(-6) }),
        base({ id: 'k2', code: 'PKG-DEMO-0002', product_id: 'p2', design_type: '라벨', priority: '긴급', due_date: d(-1), requester_id: 'u-log', status: '작업중', assignee_id: 'u-design', expected_date: d(1), created_at: ts(-3) }),
        base({ id: 'k3', code: 'PKG-DEMO-0003', product_id: 'p3', design_type: '설명서', priority: '보통', due_date: d(-5), requester_id: 'u-log', status: '완료', assignee_id: 'u-design2', completed_date: d(-6), created_at: ts(-14) }),
      ],
      shoot_requests: [
        base({ id: 's1', code: 'SHT-DEMO-0001', product_id: 'p3', purpose: '신제품 론칭', shoot_types: ['호리존 촬영', '콘셉트 촬영(세트장 연출)'], location: '외부 스튜디오', shoot_options: [], quantity: 30, priority: '높음', due_date: d(3), requester_id: 'u-brand', status: '작업중', assignee_id: 'u-design2', scheduled_date: d(1), created_at: ts(-4) }),
      ],
      design_requests: [
        base({ id: 'd1', code: 'DSN-DEMO-0001', brand_id: 1, product_id: 'p3', shoot_request_id: 's1', work_type: '상세페이지 신규 제작', title: 'X프레임 책장 상세페이지', purpose: '신제품 론칭', channels: ['자사몰', '스마트스토어', '오늘의집'], plan_url: 'https://www.figma.com/', priority: '높음', due_date: d(9), requester_id: 'u-brand', created_at: ts(-2) }),
        base({ id: 'd2', code: 'DSN-DEMO-0002', brand_id: 2, product_id: null, work_type: '프로모션 배너', title: '연말 기획전 메인 배너', channels: ['자사몰', '인스타그램'], priority: '보통', due_date: d(4), requester_id: 'u-brand', created_at: ts(-1) }),
      ],
      attachments: [
        { id: 'a1', entity_type: 'product', entity_id: 'p1', kind: 'product_image', storage_path: img('TABLE', '#ece6dc'), file_name: 'table.svg', uploaded_by: 'u-log', created_at: ts(-6) },
        { id: 'a2', entity_type: 'product', entity_id: 'p2', kind: 'product_image', storage_path: img('SOFA', '#e8e8ec'), file_name: 'sofa.svg', uploaded_by: 'u-log', created_at: ts(-3) },
        { id: 'a3', entity_type: 'product', entity_id: 'p3', kind: 'product_image', storage_path: img('SHELF', '#e3ece8'), file_name: 'shelf.svg', uploaded_by: 'u-log', created_at: ts(-14) },
      ],
      comments: [{ id: 'c1', entity_type: 'package', entity_id: 'k2', kind: 'comment', body: '라벨 사이즈 80×50 기준으로 진행 부탁드립니다.', author_id: 'u-log', created_at: ts(-2) }],
      history: [],
      notifications: [],
      notification_reads: [],
      drafts: [],
    };
  }
}
