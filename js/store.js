// 공유 상태, 조회 헬퍼, 권한 판별
import { KINDS, PRIORITY_RANK } from './constants.js?v=202611201047';
import { today, addDays } from './ui.js?v=202611201047';

export const S = {
  db: null,
  user: null,
  me: null,
  data: {
    profiles: [], brands: [], design_work_types: [], products: [], launch_readiness: [],
    package_requests: [], shoot_requests: [], design_requests: [],
    dev_requests: [],
    attachments: [], comments: [], history: [], notifications: [], notification_reads: [], drafts: [],
  },
  urls: {},
  filters: {},
  live: 'connecting',
  hooks: { rerender: () => {} },
};

const LIST_OPTS = {
  history: { limit: 300 },
  notifications: { limit: 200 },
  design_work_types: { order: 'sort', asc: true },
  brands: { order: 'sort', asc: true },
  launch_readiness: { order: 'updated_at' },
  notification_reads: { order: 'read_at' },
  drafts: { order: 'updated_at' },
};

export async function loadTable(t) {
  S.data[t] = await S.db.list(t, LIST_OPTS[t] || {});
}
export async function loadAll() {
  await Promise.all(Object.keys(S.data).map((t) => loadTable(t)));
  await ensureUrls(thumbPaths());
}
export async function ensureUrls(paths) {
  const need = [...new Set(paths)].filter((p) => p && !S.urls[p]);
  if (!need.length) return;
  try { Object.assign(S.urls, await S.db.signedUrls(need)); } catch (e) { console.warn(e); }
}

// ---- 조회 헬퍼 ----
export const role = () => S.me?.role;
export const profileName = (id) => (id ? S.data.profiles.find((p) => p.id === id)?.name || '알 수 없음' : '-');
export const profileRole = (id) => S.data.profiles.find((p) => p.id === id)?.role;
export const brandName = (id) => S.data.brands.find((b) => String(b.id) === String(id))?.name || '-';
export const product = (id) => S.data.products.find((p) => p.id === id);
// 대표 제품명: 유통 제품명(필수) 우선, 없으면 온라인 제품명
export const pname = (p) => (p ? p.retail_name || p.online_name || '(이름 없음)' : '');
export const psub = (p) => (p && p.retail_name && p.online_name && p.online_name !== p.retail_name ? `온라인: ${p.online_name}` : '');
export const launchOf = (pid) => S.data.launch_readiness.find((l) => l.product_id === pid) || {};
// 담당자 (여러 명). 예전 단일 담당자(assignee_id)만 있는 데이터도 지원
export const assigneesOf = (r) => (r?.assignee_ids?.length ? r.assignee_ids : r?.assignee_id ? [r.assignee_id] : []);
export const isAssignee = (r, uid) => assigneesOf(r).includes(uid);
export const assigneeNames = (r) => assigneesOf(r).map(profileName).join(', ');
export const designers = () => S.data.profiles.filter((p) => p.active && (p.role === 'design' || p.role === 'admin'));

export function productImages(pid) {
  return S.data.attachments.filter((a) => a.entity_type === 'product' && a.entity_id === pid && a.kind === 'product_image');
}
export function productThumb(pid) {
  const a = productImages(pid)[0];
  return a ? S.urls[a.storage_path] : null;
}
const isImgAtt = (a) => /^image\//.test(a.mime_type || '') || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(a.file_name || '');
// 촬영 요청 목록 썸네일: 요청서에서 선택한 물류/발주팀 이미지 → 없으면 새로 올린 첫 이미지 → 없으면 제품 대표 이미지
function shootImage(id) {
  // 촬영 제품 이미지(선택한 물류/발주팀 이미지 → 추가한 제품 이미지) 우선, 레퍼런스 이미지는 마지막
  const rank = (a) => (a.kind === 'product_image' ? (a.storage_path.startsWith('shoot/') ? 1 : 0) : a.storage_path.startsWith('shoot/') ? 3 : 2);
  return S.data.attachments
    .filter((a) => a.entity_type === 'shoot' && a.entity_id === id && isImgAtt(a))
    .sort((a, b) => rank(a) - rank(b) || (a.created_at > b.created_at ? 1 : -1))[0];
}
export function requestThumb(r) {
  if (r?._kind === 'shoot') {
    const a = shootImage(r.id);
    if (a && S.urls[a.storage_path]) return S.urls[a.storage_path];
  }
  return r?.product_id ? productThumb(r.product_id) : null;
}
// 목록 썸네일 첨부파일 (클릭 시 확대용)
export function requestThumbAtt(r) {
  if (r?._kind === 'shoot') {
    const a = shootImage(r.id);
    if (a && S.urls[a.storage_path]) return a;
  }
  return r?.product_id ? productImages(r.product_id)[0] : null;
}
export const productThumbAtt = (pid) => (pid ? productImages(pid)[0] : null);
// 목록 썸네일에 필요한 파일 경로 (제품 대표 이미지 + 촬영 요청 첫 이미지)
export function thumbPaths() {
  const shoots = S.data.shoot_requests.map((r) => shootImage(r.id)?.storage_path);
  return [...S.data.attachments.filter((a) => a.kind === 'product_image').map((a) => a.storage_path), ...shoots].filter(Boolean);
}
export function attachmentsOf(entity, id) {
  return S.data.attachments.filter((a) => a.entity_type === entity && a.entity_id === id);
}

export function requests(kind) {
  return S.data[KINDS[kind].table].map((r) => ({ ...r, _kind: kind }));
}
export function allRequests() {
  return [...requests('package'), ...requests('shoot'), ...requests('design')];
}
export function findRequest(kind, id) {
  return S.data[KINDS[kind].table].find((r) => r.id === id);
}
export function requestTitle(r) {
  if (r._kind === 'design' || r.title) return r.title;
  const p = product(r.product_id);
  if (p) return pname(p);
  return r.product_retail_name || r.product_online_name || '(삭제된 제품)';
}
export function requestType(r) {
  if (r._kind === 'package') return r.design_type === '기타' && r.design_type_etc ? r.design_type_etc : r.design_type;
  if (r._kind === 'shoot') return (r.shoot_types || []).join(', ') || r.purpose;
  return r.work_type;
}
export function requestBrand(r) {
  if (r._kind === 'design' && r.brand_id) return brandName(r.brand_id);
  return brandName(product(r.product_id)?.brand_id);
}
export function isOpen(r) { return !r.cancelled && r.status !== '완료'; }
export function isOverdue(r) { return isOpen(r) && r.due_date && r.due_date < today(); }
export function dueThisWeek(r) {
  if (!isOpen(r) || !r.due_date) return false;
  const t = today();
  return r.due_date >= t && r.due_date <= addDays(t, 7);
}

export function sortRequests(list, mode) {
  const by = {
    recent: (a, b) => (b.created_at > a.created_at ? 1 : -1),
    due: (a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1,
    priority: (a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || ((a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1),
  }[mode || 'recent'];
  return [...list].sort(by);
}

// ---- 권한 (화면 표시용. 실제 권한은 DB RLS/트리거가 최종 검증) ----
export const can = {
  createRequest: (kind) => ['admin', KINDS[kind].requester].includes(role()),
  editRequest: (kind) => ['admin', KINDS[kind].requester].includes(role()),
  work: () => ['admin', 'design'].includes(role()),
  editProduct: () => ['admin', 'logistics'].includes(role()),
  launch: () => ['admin', 'brand'].includes(role()),
  admin: () => role() === 'admin',
  attach: (entity, kind) => {
    const r = role();
    if (r === 'admin') return true;
    if (entity === 'dev') return kind === 'file';
    if (kind === 'result') return r === 'design';
    if (entity === 'product' || entity === 'package') return r === 'logistics';
    return r === 'brand';
  },
};

// 알림: 본인이 발생시킨 알림은 제외
export function myNotifications() {
  const read = new Set(S.data.notification_reads.map((r) => r.notification_id));
  return S.data.notifications
    .filter((n) => n.actor_id !== S.me?.id)
    .map((n) => ({ ...n, read: read.has(n.id) }));
}
