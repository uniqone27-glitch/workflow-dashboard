-- 2026-11-19 v1.11: 06 개발요청 (1회 실행)
--   - 대시보드 구성원이 수정·보완·신규 기능·오류를 요청하는 dev_requests 테이블
--   - 모든 구성원: 등록·조회·댓글·파일 첨부 / 요청자: '접수' 상태일 때 수정·삭제
--   - 관리자: 진행 상태·답변 처리, 삭제
--   - 알림(→ 슬랙 DM): 신규 요청 → 관리자 / 상태 변경·답변 → 요청자

create sequence if not exists public.seq_dev;

create table if not exists public.dev_requests (
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  req_type          text not null check (req_type in ('오류','수정','보완','신규 기능')),
  area              text not null default '공통',
  title             text not null check (length(trim(title)) > 0),
  body              text not null check (length(trim(body)) > 0),
  priority          text not null default '보통' check (priority in ('긴급','보통','낮음')),
  status            text not null default '접수' check (status in ('접수','검토중','진행중','완료','보류')),
  answer            text,
  requester_id      uuid not null default auth.uid() references public.profiles(id),
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);
create index if not exists dev_requests_created_idx on public.dev_requests (created_at desc);

-- 권한 검증 + 자동 기록
create or replace function public.dev_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := public.my_role();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.requester_id := auth.uid();
      if r <> 'admin' then new.status := '접수'; new.answer := null; end if;
    end if;
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    return new;
  end if;

  if new.code is distinct from old.code or new.requester_id is distinct from old.requester_id
     or new.created_at is distinct from old.created_at then
    raise exception '요청번호, 요청자, 등록일은 변경할 수 없습니다.';
  end if;
  if auth.uid() is not null and r <> 'admin' then
    if old.requester_id <> auth.uid() then
      raise exception '본인이 등록한 요청만 수정할 수 있습니다.';
    end if;
    if new.status is distinct from old.status or new.answer is distinct from old.answer then
      raise exception '진행 상태와 답변은 관리자만 변경할 수 있습니다.';
    end if;
    if old.status <> '접수' then
      raise exception '관리자가 확인을 시작한 요청은 수정할 수 없습니다. 추가 내용은 댓글로 남겨 주세요.';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
  end if;
  return new;
end $$;

-- 알림
create or replace function public.dev_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text := new.code || ' · ' || new.title;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
    values ('admin', 'dev', new.id, '신규 개발 요청 (' || new.req_type || ')', label, auth.uid());
  else
    if new.status is distinct from old.status then
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      values (new.requester_id, 'dev', new.id,
              case when new.status = '완료' then '개발 요청 완료' else '개발 요청 상태 변경: ' || new.status end,
              label, auth.uid());
    end if;
    if new.answer is distinct from old.answer and coalesce(trim(new.answer), '') <> '' then
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      values (new.requester_id, 'dev', new.id, '개발 요청에 관리자 답변이 등록되었습니다', label || ' · ' || left(new.answer, 80), auth.uid());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t10_guard on public.dev_requests;
create trigger t10_guard  before insert or update on public.dev_requests for each row execute function public.dev_guard();
drop trigger if exists t20_code on public.dev_requests;
create trigger t20_code   before insert on public.dev_requests for each row execute function public.set_code('DEV', 'public.seq_dev');
drop trigger if exists t90_notify on public.dev_requests;
create trigger t90_notify after insert or update on public.dev_requests for each row execute function public.dev_notify();

-- RLS
alter table public.dev_requests enable row level security;
drop policy if exists dev_select on public.dev_requests;
drop policy if exists dev_insert on public.dev_requests;
drop policy if exists dev_update on public.dev_requests;
drop policy if exists dev_delete on public.dev_requests;
create policy dev_select on public.dev_requests for select to authenticated using (public.is_member());
create policy dev_insert on public.dev_requests for insert to authenticated
  with check (public.is_member() and requester_id = auth.uid());
create policy dev_update on public.dev_requests for update to authenticated
  using (public.is_member() and (requester_id = auth.uid() or public.my_role() = 'admin'))
  with check (public.is_member() and (requester_id = auth.uid() or public.my_role() = 'admin'));
create policy dev_delete on public.dev_requests for delete to authenticated
  using (public.my_role() = 'admin' or (requester_id = auth.uid() and status = '접수'));
revoke all on public.dev_requests from anon;

-- 첨부파일·댓글에 개발 요청(dev) 허용
alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('product','package','shoot','design','dev'));
alter table public.comments drop constraint if exists comments_entity_type_check;
alter table public.comments add constraint comments_entity_type_check
  check (entity_type in ('product','package','shoot','design','dev'));

create or replace function public.can_attach(p_entity text, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when p_entity = 'dev' then public.is_member() and p_kind = 'file'
    when p_kind = 'result' then public.my_role() = 'design'
    when p_entity in ('product','package') then public.my_role() = 'logistics'
    when p_entity in ('shoot','design') then public.my_role() = 'brand'
    else false end
$$;

-- 실시간 반영
do $$ begin
  alter publication supabase_realtime add table public.dev_requests;
exception when duplicate_object then null; end $$;

-- 댓글 멘션 알림: 개발 요청 번호 표시
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
select count(*) as dev_requests from public.dev_requests;
