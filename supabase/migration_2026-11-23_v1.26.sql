-- 2026-11-23 v1.26: 02 협업 요청 (1회 실행)
--   - 촬영·기타 업무를 위해 물류/발주팀 구성원에게 시간 협업을 요청하는 collab_requests 테이블
--   - 모든 구성원: 등록·조회·댓글 / 요청자: '요청' 상태일 때 수정·삭제
--   - 물류/발주팀·관리자: 담당자 배정, 상태(요청·수락·완료·반려), 답변 처리
--   - 알림(→ 슬랙 DM): 신규 요청 → 물류/발주팀 / 상태 변경·답변 → 요청자 / 담당자 배정 → 담당자

create sequence if not exists public.seq_collab;

create table if not exists public.collab_requests (
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  purpose           text not null check (length(trim(purpose)) > 0),
  purpose_etc       text,
  reason            text not null check (length(trim(reason)) > 0),
  req_date          date not null,
  time_start        time,
  time_end          time,
  location          text,
  requester_id      uuid not null default auth.uid() references public.profiles(id),
  assignee_ids      uuid[] not null default '{}',
  status            text not null default '요청' check (status in ('요청','수락','완료','반려')),
  response          text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);
create index if not exists collab_requests_date_idx on public.collab_requests (req_date);

-- 권한 검증 + 자동 기록
create or replace function public.collab_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r    text := public.my_role();
  proc boolean := r in ('admin','logistics');
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.requester_id := auth.uid();
      if not proc then new.status := '요청'; new.assignee_ids := '{}'; new.response := null; end if;
    end if;
    new.assignee_ids := coalesce(new.assignee_ids, '{}');
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    return new;
  end if;

  if new.code is distinct from old.code or new.requester_id is distinct from old.requester_id
     or new.created_at is distinct from old.created_at then
    raise exception '요청번호, 요청자, 등록일은 변경할 수 없습니다.';
  end if;
  if auth.uid() is not null and not proc then
    if old.requester_id <> auth.uid() then
      raise exception '본인이 등록한 요청만 수정할 수 있습니다.';
    end if;
    if new.status is distinct from old.status or new.assignee_ids is distinct from old.assignee_ids
       or new.response is distinct from old.response then
      raise exception '진행 상태·담당자·답변은 물류/발주팀만 변경할 수 있습니다.';
    end if;
    if old.status <> '요청' then
      raise exception '물류/발주팀이 수락한 요청은 수정할 수 없습니다. 변경 사항은 댓글로 남겨 주세요.';
    end if;
  end if;
  new.assignee_ids := coalesce(new.assignee_ids, '{}');
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
  end if;
  return new;
end $$;

-- 알림
create or replace function public.collab_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text := coalesce(new.code, '') || ' · '
             || case when new.purpose = '기타' and coalesce(new.purpose_etc, '') <> '' then new.purpose_etc else new.purpose end
             || ' · ' || to_char(new.req_date, 'MM/DD')
             || coalesce(' ' || to_char(new.time_start, 'HH24:MI'), '');
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
    values ('logistics', 'collab', new.id, '신규 협업 요청 (' || new.purpose || ')', label, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (new.requester_id, 'collab', new.id,
            case when new.status = '완료' then '협업 요청 완료' else '협업 요청 상태 변경: ' || new.status end,
            label, auth.uid());
  end if;
  -- 새로 배정된 담당자에게만
  insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
  select u, 'collab', new.id, '협업 요청 담당자로 배정됨', label, auth.uid()
    from unnest(new.assignee_ids) u
   where not (u = any(coalesce(old.assignee_ids, '{}')));
  if new.response is distinct from old.response and coalesce(trim(new.response), '') <> '' then
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (new.requester_id, 'collab', new.id, '협업 요청에 답변이 등록되었습니다', label || ' · ' || left(new.response, 80), auth.uid());
  end if;
  return new;
end $$;

-- 삭제 시 댓글·알림 정리
create or replace function public.collab_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.comments      where entity_type = 'collab' and entity_id = old.id;
  delete from public.notifications where entity_type = 'collab' and entity_id = old.id;
  return old;
end $$;

drop trigger if exists t10_guard on public.collab_requests;
create trigger t10_guard  before insert or update on public.collab_requests for each row execute function public.collab_guard();
drop trigger if exists t20_code on public.collab_requests;
create trigger t20_code   before insert on public.collab_requests for each row execute function public.set_code('COL', 'public.seq_collab');
drop trigger if exists t90_notify on public.collab_requests;
create trigger t90_notify after insert or update on public.collab_requests for each row execute function public.collab_notify();
drop trigger if exists t95_cleanup on public.collab_requests;
create trigger t95_cleanup after delete on public.collab_requests for each row execute function public.collab_cleanup();

-- RLS
alter table public.collab_requests enable row level security;
drop policy if exists collab_select on public.collab_requests;
drop policy if exists collab_insert on public.collab_requests;
drop policy if exists collab_update on public.collab_requests;
drop policy if exists collab_delete on public.collab_requests;
create policy collab_select on public.collab_requests for select to authenticated using (public.is_member());
create policy collab_insert on public.collab_requests for insert to authenticated
  with check (public.is_member() and requester_id = auth.uid());
create policy collab_update on public.collab_requests for update to authenticated
  using (public.is_member() and (requester_id = auth.uid() or public.my_role() in ('admin','logistics')))
  with check (public.is_member() and (requester_id = auth.uid() or public.my_role() in ('admin','logistics')));
create policy collab_delete on public.collab_requests for delete to authenticated
  using (public.my_role() = 'admin' or (requester_id = auth.uid() and status = '요청'));
revoke all on public.collab_requests from anon;

-- 댓글에 협업 요청(collab) 허용
alter table public.comments drop constraint if exists comments_entity_type_check;
alter table public.comments add constraint comments_entity_type_check
  check (entity_type in ('product','package','shoot','design','dev','collab'));

-- 실시간 반영
do $$ begin
  alter publication supabase_realtime add table public.collab_requests;
exception when duplicate_object then null; end $$;

-- 댓글 멘션 알림: 협업 요청 번호 표시
create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u       uuid;
  r       text;
  label   text;
  who     text;
  title_t text;
  body_t  text;
begin
  if cardinality(new.mentions) = 0 and cardinality(new.mention_roles) = 0 then
    return new;
  end if;
  label := case new.entity_type
    when 'package' then (select code from public.package_requests where id = new.entity_id)
    when 'shoot'   then (select code from public.shoot_requests   where id = new.entity_id)
    when 'design'  then (select code from public.design_requests  where id = new.entity_id)
    when 'product' then (select coalesce(retail_name, online_name) from public.products where id = new.entity_id)
    when 'dev'     then (select code from public.dev_requests where id = new.entity_id)
    when 'collab'  then (select code from public.collab_requests where id = new.entity_id)
  end;
  select name into who from public.profiles where id = new.author_id;
  title_t := coalesce(who, '') || '님이 댓글에서 언급했습니다';
  body_t  := coalesce(label || ' · ', '') || left(new.body, 100);

  for u in
    select distinct x from unnest(new.mentions) x
      join public.profiles p on p.id = x
     where p.active and p.deleted_at is null and p.role <> 'pending' and x <> new.author_id
       and not (p.role = any(new.mention_roles))  -- 팀 멘션으로 이미 받는 사람은 중복 알림 제외
  loop
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (u, new.entity_type, new.entity_id, title_t, body_t, new.author_id);
  end loop;

  for r in
    select distinct x from unnest(new.mention_roles) x where x in ('logistics', 'brand', 'design')
  loop
    insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
    values (r, new.entity_type, new.entity_id, title_t, body_t, new.author_id);
  end loop;
  return new;
end $$;

-- 확인용
select count(*) as collab_requests from public.collab_requests;
