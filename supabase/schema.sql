-- =====================================================================
-- Product Launch & Design Workflow Dashboard — Supabase(PostgreSQL) 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행하세요.
-- (새 프로젝트 기준. 재실행이 필요하면 reset.sql 을 먼저 실행)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 사용자 / 권한
-- ---------------------------------------------------------------------
create table public.profiles (
  -- auth.users 를 참조하지만 FK 는 두지 않음: 사용자를 삭제해도 이력의 작성자 이름은 남김
  id         uuid primary key,
  email      text,
  name       text not null default '',
  role       text not null default 'pending'
             check (role in ('pending','admin','logistics','brand','design')),
  active     boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 현재 로그인 사용자의 역할 (비활성 / 승인 대기 사용자는 권한 없음)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','logistics','brand','design'), false)
$$;

-- 회원가입 시 프로필 자동 생성. 최초 가입자는 관리자, 이후 가입자는 '승인 대기'
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 역할/활성 상태는 관리자만 변경
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.my_role(), '') <> 'admin' then
    if new.role   is distinct from old.role
    or new.active is distinct from old.active
    or new.email  is distinct from old.email
    or new.id     is distinct from old.id then
      raise exception '권한이 없습니다: 역할과 계정 상태는 관리자만 변경할 수 있습니다.';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- 관리자 전용: 사용자 삭제 (로그인 계정 삭제, 이름은 이력 표시용으로 보존)
create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception '권한이 없습니다: 사용자 삭제는 관리자만 할 수 있습니다.';
  end if;
  if target = auth.uid() then
    raise exception '본인 계정은 삭제할 수 없습니다.';
  end if;
  update public.profiles
     set active = false, role = 'pending', email = null, deleted_at = now()
   where id = target;
  delete from public.drafts where user_id = target;
  delete from auth.users where id = target;
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. 기준 정보 (브랜드, 디자인 작업 유형)
-- ---------------------------------------------------------------------
create table public.brands (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.brands (name, sort) values ('퍼니츠', 1), ('뽀뽀백번', 2), ('유통', 3);

create table public.design_work_types (
  name       text primary key,
  sort       int not null default 100,
  created_at timestamptz not null default now()
);
insert into public.design_work_types (name, sort) values
  ('상세페이지 신규 제작', 1), ('상세페이지 수정', 2), ('썸네일 신규 제작', 3),
  ('썸네일 수정', 4), ('프로모션 배너', 5), ('SNS 이미지', 6),
  ('영상 제작 및 편집', 7), ('광고 소재', 8), ('기타 디자인 작업', 99);

-- ---------------------------------------------------------------------
-- 3. 제품 (One Product) + 론칭 준비 상태
-- ---------------------------------------------------------------------
create sequence public.seq_product;
create sequence public.seq_package;
create sequence public.seq_shoot;
create sequence public.seq_design;

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  brand_id      bigint references public.brands(id),
  online_name   text,
  retail_name   text not null,
  sku           text,
  category      text not null,
  product_kind  text not null default '신제품'
                check (product_kind in ('신제품','리뉴얼','패키지 변경','기존 제품')),
  arrival_date  date,
  arrival_qty   int check (arrival_qty >= 0),
  reference_url text,
  specs         jsonb not null default '{}'::jsonb,   -- 공통 + 카테고리별 상세 사양 {필드키: 값}
  options       jsonb not null default '[]'::jsonb,   -- [{name,color,size,material,note}]
  spec_changes  jsonb not null default '[]'::jsonb,   -- 리뉴얼 변경사항 [{field,before,after}]
  spec_notes    text,                                  -- 예외적인 제품 특징 자유 기입
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id)
);
create index on public.products (brand_id);

create table public.launch_readiness (
  product_id     uuid primary key references public.products(id) on delete cascade,
  followup       text not null default '미확인' check (followup in ('미확인','후속 진행','후속 불필요')),
  shoot_needed   text not null default '미정' check (shoot_needed  in ('미정','필요','불필요')),
  detail_needed  text not null default '미정' check (detail_needed in ('미정','필요','불필요')),
  thumb_needed   text not null default '미정' check (thumb_needed  in ('미정','필요','불필요')),
  launch_date    date,
  launch_state   text not null default '준비 전'
                 check (launch_state in ('준비 전','준비중','론칭 준비 완료','론칭 완료')),
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

-- ---------------------------------------------------------------------
-- 4. 업무 요청 3종
-- ---------------------------------------------------------------------
create table public.package_requests (
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  product_id        uuid not null references public.products(id) on delete cascade,
  design_type       text not null check (design_type in ('제품 박스','라벨','스티커','설명서','기타')),
  design_type_etc   text,
  package_spec      text,
  required_text     text,
  print_notes       text,
  reference_url     text,
  request_note      text,
  priority          text not null default '보통' check (priority in ('긴급','높음','보통','낮음')),
  due_date          date,
  requester_id      uuid references public.profiles(id) default auth.uid(),
  cancelled         boolean not null default false,
  cancel_reason     text,
  -- 디자인팀 처리 항목
  status            text not null default '요청' check (status in ('요청','작업중','완료')),
  assignee_id       uuid references public.profiles(id),
  expected_date     date,
  work_memo         text,
  work_url          text,
  result_url        text,
  completed_date    date,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);
create index on public.package_requests (product_id);

create table public.shoot_requests (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,
  product_id         uuid not null references public.products(id) on delete cascade,
  purpose            text not null,
  purpose_etc        text,
  shoot_types        text[] not null default '{}',
  shoot_types_etc    text,
  location           text,
  location_etc       text,
  shoot_options      text[] not null default '{}',
  quantity           int,
  caution            text,
  reference_url      text,
  desired_shoot_date date,
  request_note       text,
  priority           text not null default '보통' check (priority in ('긴급','높음','보통','낮음')),
  due_date           date,
  requester_id       uuid references public.profiles(id) default auth.uid(),
  cancelled          boolean not null default false,
  cancel_reason      text,
  -- 디자인팀 처리 항목
  status             text not null default '요청' check (status in ('요청','작업중','완료')),
  assignee_id        uuid references public.profiles(id),
  scheduled_date     date,
  expected_date      date,
  work_memo          text,
  result_url         text,
  completed_date     date,
  status_changed_at  timestamptz,
  status_changed_by  uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id)
);
create index on public.shoot_requests (product_id);

create table public.design_requests (
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  brand_id          bigint references public.brands(id),
  product_id        uuid references public.products(id) on delete set null,
  shoot_request_id  uuid references public.shoot_requests(id) on delete set null,
  work_type         text not null,
  title             text not null,
  purpose           text,
  channels          text[] not null default '{}',
  channels_etc      text,
  plan_url          text,
  reference_url     text,
  caution           text,
  request_note      text,
  priority          text not null default '보통' check (priority in ('긴급','높음','보통','낮음')),
  due_date          date,
  requester_id      uuid references public.profiles(id) default auth.uid(),
  cancelled         boolean not null default false,
  cancel_reason     text,
  -- 디자인팀 처리 항목
  status            text not null default '요청' check (status in ('요청','작업중','완료')),
  assignee_id       uuid references public.profiles(id),
  expected_date     date,
  work_memo         text,
  figma_url         text,
  result_url        text,
  completed_date    date,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);
create index on public.design_requests (product_id);
create index on public.design_requests (shoot_request_id);

-- ---------------------------------------------------------------------
-- 5. 첨부파일 / 댓글 / 이력 / 알림 / 임시저장
-- ---------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('product','package','shoot','design')),
  entity_id    uuid not null,
  kind         text not null default 'file' check (kind in ('product_image','reference','result','file')),
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index on public.attachments (entity_type, entity_id);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','package','shoot','design')),
  entity_id   uuid not null,
  kind        text not null default 'comment' check (kind in ('comment','correction')),
  body        text not null check (length(trim(body)) > 0),
  author_id   uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.comments (entity_type, entity_id);

create table public.history (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid not null,
  entity_code text,
  action      text not null,          -- create / update / status / cancel / delete
  changes     jsonb not null default '{}'::jsonb,  -- {컬럼: {from, to}}
  from_status text,
  to_status   text,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.history (entity_type, entity_id);
create index on public.history (created_at desc);

create table public.notifications (
  id          bigint generated always as identity primary key,
  target_role text,
  target_user uuid references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  title       text not null,
  body        text,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.notifications (created_at desc);

create table public.notification_reads (
  notification_id bigint references public.notifications(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade default auth.uid(),
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind       text not null,          -- package / shoot / design / product
  title      text,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. 트리거 함수
-- ---------------------------------------------------------------------

-- 6-1. 업무/제품 고유번호 자동 생성: PKG-2611-0001
create or replace function public.set_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or new.code = '' then
    new.code := tg_argv[0] || '-' || to_char(now() at time zone 'Asia/Seoul', 'YYMM') || '-'
             || lpad(nextval(tg_argv[1]::regclass)::text, 4, '0');
  end if;
  return new;
end $$;

-- 6-2. 등록자/수정자/수정시각/상태 변경 시각 자동 기록
create or replace function public.stamp_row() returns trigger
language plpgsql as $$
declare
  j jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if j ? 'requester_id' and auth.uid() is not null then new.requester_id := auth.uid(); end if;
    if j ? 'created_by'   and auth.uid() is not null then new.created_by   := auth.uid(); end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create or replace function public.stamp_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := coalesce(auth.uid(), new.status_changed_by);
    if new.status = '완료' and new.completed_date is null then
      new.completed_date := (now() at time zone 'Asia/Seoul')::date;
    elsif new.status <> '완료' then
      new.completed_date := null;
    end if;
  end if;
  return new;
end $$;

-- 6-3. 컬럼 단위 수정 권한 검증 (화면 우회/직접 API 호출에도 적용)
--   tg_argv[0] = 요청 부서 역할, tg_argv[1] = 디자인팀이 수정 가능한 컬럼 목록(csv)
create or replace function public.guard_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r         text := public.my_role();
  work_cols text[] := string_to_array(tg_argv[1], ',');
  sys_cols  text[] := array['updated_at','updated_by','status_changed_at','status_changed_by'];
  changed   text[];
  bad       text[];
begin
  if auth.uid() is null or r = 'admin' then
    return new;  -- SQL Editor(서비스 계정) 또는 관리자
  end if;

  if tg_op = 'INSERT' then
    -- 요청 등록 시 처리 항목(담당자/상태/결과물)은 초기값으로 고정
    new := jsonb_populate_record(new,
      (select jsonb_object_agg(c, case when c = 'status' then to_jsonb('요청'::text) else 'null'::jsonb end)
         from unnest(work_cols) c));
    new.cancelled := false;
    return new;
  end if;

  if new.id is distinct from old.id or new.code is distinct from old.code
     or new.requester_id is distinct from old.requester_id
     or new.created_at is distinct from old.created_at then
    raise exception '요청번호, 요청자, 등록일은 변경할 수 없습니다.';
  end if;

  select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and not (n.key = any(sys_cols));

  if r = 'design' then
    bad := array(select unnest(changed) except select unnest(work_cols));
    if cardinality(bad) > 0 then
      raise exception '디자인팀은 담당자·진행 상태·일정·결과물·작업 메모만 수정할 수 있습니다. (수정 불가 항목: %)', array_to_string(bad, ', ');
    end if;
    return new;
  elsif r = tg_argv[0] then
    bad := array(select unnest(changed) intersect select unnest(work_cols));
    if cardinality(bad) > 0 then
      raise exception '담당자와 진행 상태는 디자인팀만 변경할 수 있습니다. (수정 불가 항목: %)', array_to_string(bad, ', ');
    end if;
    return new;
  end if;

  raise exception '이 업무를 수정할 권한이 없습니다.';
end $$;

-- 6-4. 변경 이력 + 알림
--   tg_argv[0] = entity_type, tg_argv[1] = 요청 부서 역할, tg_argv[2] = 신규 등록 시 알림 대상 역할(csv)
create or replace function public.log_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ent      text := tg_argv[0];
  req_role text := nullif(tg_argv[1], '');
  new_to   text[] := string_to_array(nullif(tg_argv[2], ''), ',');
  o        jsonb;
  n        jsonb;
  diff     jsonb := '{}'::jsonb;
  k        text;
  act      text;
  rid      uuid;
  rcode    text;
  label    text;
  title    text;
  ent_name text;
  role_t   text;
begin
  if tg_op = 'DELETE' then
    o := to_jsonb(old);
    rid := coalesce((o->>'id')::uuid, (o->>'product_id')::uuid);
    insert into public.history (entity_type, entity_id, entity_code, action, changes, actor_id)
    values (ent, rid, o->>'code', 'delete', '{}'::jsonb, auth.uid());
    return old;
  end if;

  n := to_jsonb(new);
  rid := coalesce((n->>'id')::uuid, (n->>'product_id')::uuid);
  rcode := n->>'code';

  if tg_op = 'INSERT' then
    act := 'create';
  else
    o := to_jsonb(old);
    for k in select jsonb_object_keys(n) loop
      if k in ('updated_at','updated_by','status_changed_at','status_changed_by') then continue; end if;
      if (n->k) is distinct from (o->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
    act := case
      when diff ? 'status' then 'status'
      when diff ? 'cancelled' then 'cancel'
      else 'update' end;
  end if;

  insert into public.history (entity_type, entity_id, entity_code, action, changes, from_status, to_status, actor_id)
  values (ent, rid, rcode, act, diff,
          case when act = 'status' then o->>'status' end,
          case when act = 'status' then n->>'status' end,
          auth.uid());

  -- ---- 알림 ----
  if ent = 'product' then
    if tg_op = 'INSERT' and n ? 'retail_name' and n->>'product_kind' in ('신제품','리뉴얼') then
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values ('brand', 'product', rid, n->>'product_kind' || ' 등록', coalesce(n->>'retail_name', n->>'online_name'), auth.uid());
    end if;
    return new;
  end if;

  if n ? 'product_id' and (n->>'product_id') is not null then
    select coalesce(retail_name, online_name) into ent_name from public.products where id = (n->>'product_id')::uuid;
  end if;
  label := rcode || ' · ' || coalesce(n->>'title', ent_name, '');
  title := case ent when 'package' then '패키지 디자인 요청'
                    when 'shoot'   then '촬영 요청'
                    else '디자인 작업 요청' end;

  if tg_op = 'INSERT' then
    foreach role_t in array coalesce(new_to, '{}') loop
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values (role_t, ent, rid, '신규 ' || title, label, auth.uid());
    end loop;
  else
    if diff ? 'status' then
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values (req_role, ent, rid,
              case when n->>'status' = '완료' then title || ' 완료' else title || ' 상태 변경: ' || (n->>'status') end,
              label, auth.uid());
    end if;
    if diff ? 'assignee_id' and (n->>'assignee_id') is not null then
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      values ((n->>'assignee_id')::uuid, ent, rid, title || ' 담당자로 배정됨', label, auth.uid());
    end if;
    if diff ? 'cancelled' and (n->>'cancelled')::boolean then
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values ('design', ent, rid, title || ' 취소', label, auth.uid());
    end if;
  end if;
  return new;
end $$;

-- 6-5. 제품 등록 시 론칭 준비 레코드 자동 생성
create or replace function public.create_launch_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.launch_readiness (product_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- 6-6. 제품 정보 수정 요청(댓글 유형 correction) → 물류/발주팀 알림
create or replace function public.notify_correction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'correction' then
    insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
    values ('logistics', new.entity_type, new.entity_id, '제품 정보 수정 요청', left(new.body, 120), auth.uid());
  end if;
  return new;
end $$;
create trigger t90_correction after insert on public.comments for each row execute function public.notify_correction();

-- 트리거 연결 (BEFORE 트리거는 이름순 실행: t10_guard → t20_code → t30_stamp → t40_status)
create trigger t20_code   before insert on public.products for each row execute function public.set_code('PRD', 'public.seq_product');
create trigger t30_stamp  before insert or update on public.products for each row execute function public.stamp_row();
create trigger t90_hist   after insert or update or delete on public.products for each row execute function public.log_history('product', '', '');
create trigger t91_launch after insert on public.products for each row execute function public.create_launch_row();

create trigger t30_stamp  before update on public.launch_readiness for each row execute function public.stamp_row();
create trigger t90_hist   after update on public.launch_readiness for each row execute function public.log_history('product', '', '');

create trigger t10_guard  before insert or update on public.package_requests for each row
  execute function public.guard_request('logistics', 'status,assignee_id,expected_date,work_memo,work_url,result_url,completed_date');
create trigger t20_code   before insert on public.package_requests for each row execute function public.set_code('PKG', 'public.seq_package');
create trigger t30_stamp  before insert or update on public.package_requests for each row execute function public.stamp_row();
create trigger t40_status before insert or update on public.package_requests for each row execute function public.stamp_status();
create trigger t90_hist   after insert or update or delete on public.package_requests for each row
  execute function public.log_history('package', 'logistics', 'design,brand');

create trigger t10_guard  before insert or update on public.shoot_requests for each row
  execute function public.guard_request('brand', 'status,assignee_id,scheduled_date,expected_date,work_memo,result_url,completed_date');
create trigger t20_code   before insert on public.shoot_requests for each row execute function public.set_code('SHT', 'public.seq_shoot');
create trigger t30_stamp  before insert or update on public.shoot_requests for each row execute function public.stamp_row();
create trigger t40_status before insert or update on public.shoot_requests for each row execute function public.stamp_status();
create trigger t90_hist   after insert or update or delete on public.shoot_requests for each row
  execute function public.log_history('shoot', 'brand', 'design');

create trigger t10_guard  before insert or update on public.design_requests for each row
  execute function public.guard_request('brand', 'status,assignee_id,expected_date,work_memo,figma_url,result_url,completed_date');
create trigger t20_code   before insert on public.design_requests for each row execute function public.set_code('DSN', 'public.seq_design');
create trigger t30_stamp  before insert or update on public.design_requests for each row execute function public.stamp_row();
create trigger t40_status before insert or update on public.design_requests for each row execute function public.stamp_status();
create trigger t90_hist   after insert or update or delete on public.design_requests for each row
  execute function public.log_history('design', 'brand', 'design');

-- ---------------------------------------------------------------------
-- 7. Row Level Security (모든 권한은 DB 에서 최종 검증)
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.brands             enable row level security;
alter table public.design_work_types  enable row level security;
alter table public.products           enable row level security;
alter table public.launch_readiness   enable row level security;
alter table public.package_requests   enable row level security;
alter table public.shoot_requests     enable row level security;
alter table public.design_requests    enable row level security;
alter table public.attachments        enable row level security;
alter table public.comments           enable row level security;
alter table public.history            enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.drafts             enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin')
  with check (id = auth.uid() or public.my_role() = 'admin');

-- brands / work types
create policy brands_select on public.brands for select to authenticated using (public.is_member());
create policy brands_insert on public.brands for insert to authenticated with check (public.my_role() in ('admin','logistics','brand'));
create policy brands_update on public.brands for update to authenticated using (public.my_role() = 'admin');
create policy brands_delete on public.brands for delete to authenticated using (public.my_role() = 'admin');

create policy wtypes_select on public.design_work_types for select to authenticated using (public.is_member());
create policy wtypes_insert on public.design_work_types for insert to authenticated with check (public.my_role() in ('admin','brand'));
create policy wtypes_delete on public.design_work_types for delete to authenticated using (public.my_role() = 'admin');

-- products: 물류/발주팀 + 관리자만 등록/수정, 삭제는 관리자
create policy products_select on public.products for select to authenticated using (public.is_member());
create policy products_insert on public.products for insert to authenticated with check (public.my_role() in ('admin','logistics'));
create policy products_update on public.products for update to authenticated
  using (public.my_role() in ('admin','logistics')) with check (public.my_role() in ('admin','logistics'));
create policy products_delete on public.products for delete to authenticated using (public.my_role() = 'admin');

-- launch readiness: 브랜드팀 + 관리자
create policy launch_select on public.launch_readiness for select to authenticated using (public.is_member());
create policy launch_update on public.launch_readiness for update to authenticated
  using (public.my_role() in ('admin','brand')) with check (public.my_role() in ('admin','brand'));

-- package requests: 요청 = 물류/발주팀, 처리 = 디자인팀
create policy pkg_select on public.package_requests for select to authenticated using (public.is_member());
create policy pkg_insert on public.package_requests for insert to authenticated with check (public.my_role() in ('admin','logistics'));
create policy pkg_update on public.package_requests for update to authenticated
  using (public.my_role() in ('admin','logistics','design')) with check (public.my_role() in ('admin','logistics','design'));
create policy pkg_delete on public.package_requests for delete to authenticated using (public.my_role() = 'admin');

-- shoot requests: 요청 = 브랜드팀, 처리 = 디자인팀
create policy sht_select on public.shoot_requests for select to authenticated using (public.is_member());
create policy sht_insert on public.shoot_requests for insert to authenticated with check (public.my_role() in ('admin','brand'));
create policy sht_update on public.shoot_requests for update to authenticated
  using (public.my_role() in ('admin','brand','design')) with check (public.my_role() in ('admin','brand','design'));
create policy sht_delete on public.shoot_requests for delete to authenticated using (public.my_role() = 'admin');

-- design requests: 요청 = 브랜드팀, 처리 = 디자인팀
create policy dsn_select on public.design_requests for select to authenticated using (public.is_member());
create policy dsn_insert on public.design_requests for insert to authenticated with check (public.my_role() in ('admin','brand'));
create policy dsn_update on public.design_requests for update to authenticated
  using (public.my_role() in ('admin','brand','design')) with check (public.my_role() in ('admin','brand','design'));
create policy dsn_delete on public.design_requests for delete to authenticated using (public.my_role() = 'admin');

-- attachments: 역할별 업로드 범위 제한
create or replace function public.can_attach(p_entity text, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when p_kind = 'result' then public.my_role() = 'design'
    when p_entity in ('product','package') then public.my_role() = 'logistics'
    when p_entity in ('shoot','design') then public.my_role() = 'brand'
    else false end
$$;
create policy att_select on public.attachments for select to authenticated using (public.is_member());
create policy att_insert on public.attachments for insert to authenticated
  with check (public.is_member() and uploaded_by = auth.uid() and public.can_attach(entity_type, kind));
create policy att_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.my_role() = 'admin');

-- comments
create policy cmt_select on public.comments for select to authenticated using (public.is_member());
create policy cmt_insert on public.comments for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy cmt_update on public.comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy cmt_delete on public.comments for delete to authenticated using (author_id = auth.uid() or public.my_role() = 'admin');

-- history: 조회만 가능 (기록은 트리거가 수행)
create policy hist_select on public.history for select to authenticated using (public.is_member());

-- notifications
create policy noti_select on public.notifications for select to authenticated
  using (public.is_member() and (target_user = auth.uid() or target_role = public.my_role()));
create policy nread_select on public.notification_reads for select to authenticated using (user_id = auth.uid());
create policy nread_insert on public.notification_reads for insert to authenticated with check (user_id = auth.uid());

-- drafts: 본인 것만
create policy drafts_all on public.drafts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 익명(anon) 키로는 어떤 테이블도 접근할 수 없음 (정책이 모두 authenticated 대상)
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- 8. 파일 저장소 (비공개 버킷, 로그인한 팀원만 열람)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_member());
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.is_member());
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (owner_id = auth.uid()::text or public.my_role() = 'admin'));

-- ---------------------------------------------------------------------
-- 9. 실시간 반영 (Realtime)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles, public.brands, public.design_work_types,
  public.products, public.launch_readiness,
  public.package_requests, public.shoot_requests, public.design_requests,
  public.attachments, public.comments, public.history, public.notifications;
