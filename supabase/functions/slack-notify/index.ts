// Supabase Edge Function: slack-notify
// 대시보드 🔔 알림(notifications)이 생기면 DB 트리거가 { id } 를 보내고,
// 이 함수가 받는 사람을 찾아 슬랙 DM 으로 전달합니다.
//
// 필요한 Secrets (Supabase > Edge Functions > Secrets):
//   SLACK_BOT_TOKEN : 슬랙 앱의 Bot User OAuth Token (xoxb-...)
//   DASHBOARD_URL   : (선택) 대시보드 주소. 기본값은 아래 SITE
//
// 보안: 알림 id 만 받으며, 실제 내용은 서비스 권한으로 DB 에서 다시 읽습니다.
// 이미 보낸 알림(slack_sent_at)은 다시 보내지 않으므로 외부에서 호출해도 중복·위조 전송이 되지 않습니다.

import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const SITE = Deno.env.get('DASHBOARD_URL') ?? 'https://uniqone27-glitch.github.io/workflow-dashboard/';
const KIND_ICON: Record<string, string> = { package: '📦', shoot: '📷', design: '🎨', product: '🗂' };

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function slack(token: string, method: string, body: Record<string, unknown> | null, query = '') {
  const res = await fetch(`https://slack.com/api/${method}${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const token = Deno.env.get('SLACK_BOT_TOKEN');
  if (!token) return json({ skipped: 'SLACK_BOT_TOKEN not set' });

  const { id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return json({ error: 'id required' }, 400);

  // 서비스 키: 기존 방식(SUPABASE_SERVICE_ROLE_KEY) 또는 새 방식(SUPABASE_SECRET_KEYS)
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    try { key = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'))[0] as string; } catch { /* noop */ }
  }
  if (!key) return json({ error: 'service key not available' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });

  // 한 번만 보내도록 선점
  const { data: n, error: claimErr } = await sb.from('notifications')
    .update({ slack_sent_at: new Date().toISOString() })
    .eq('id', id).is('slack_sent_at', null)
    .select().maybeSingle();
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!n) return json({ skipped: 'already sent or not found' });

  // 받는 사람: 지정 사용자 또는 해당 팀 전원 (본인이 한 일은 제외)
  let q = sb.from('profiles').select('id, name, email, role, slack_user_id, slack_enabled')
    .eq('active', true).is('deleted_at', null).neq('role', 'pending');
  q = n.target_user ? q.eq('id', n.target_user) : q.eq('role', n.target_role);
  const { data: people, error: pErr } = await q;
  if (pErr) return json({ error: pErr.message }, 500);
  const targets = (people ?? []).filter((p) => p.id !== n.actor_id && p.slack_enabled !== false);

  const actor = n.actor_id
    ? (await sb.from('profiles').select('name').eq('id', n.actor_id).maybeSingle()).data?.name
    : null;
  const link = `${SITE}#/dashboard?open=${n.entity_type}:${n.entity_id}`;
  const icon = KIND_ICON[n.entity_type] ?? '🔔';
  const text = `${icon} ${n.title}${n.body ? ` — ${n.body}` : ''}`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `${icon} *${slackEsc(n.title)}*${n.body ? `\n${slackEsc(n.body)}` : ''}` } },
    ...(actor ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `${slackEsc(actor)} · FBG Cooperation Dashboard` }] }] : []),
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '대시보드에서 보기' }, url: link }] },
  ];

  const result: Record<string, string> = {};
  for (const p of targets) {
    let sid = p.slack_user_id as string | null;
    if (!sid && p.email) {
      const r = await slack(token, 'users.lookupByEmail', null, `?email=${encodeURIComponent(p.email)}`);
      if (r.ok) {
        sid = r.user.id;
        await sb.from('profiles').update({ slack_user_id: sid }).eq('id', p.id);
      } else { result[p.name] = `lookup:${r.error}`; continue; }
    }
    if (!sid) { result[p.name] = 'no slack id'; continue; }
    const r = await slack(token, 'chat.postMessage', { channel: sid, text, blocks, unfurl_links: false });
    result[p.name] = r.ok ? 'sent' : `post:${r.error}`;
  }

  const errors = Object.entries(result).filter(([, v]) => v !== 'sent').map(([k, v]) => `${k} ${v}`);
  if (errors.length) await sb.from('notifications').update({ slack_error: errors.join('; ').slice(0, 500) }).eq('id', id);
  return json({ id, result });
});
