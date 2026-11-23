-- 2026-11-23 v1.28: 디자인팀 촬영 요청 작성 (1회 실행)
--   - 디자인팀도 촬영 요청 등록 가능
--   - 디자인팀이 직접 작성한 요청은 작성자처럼 수정·취소 가능 (그 외 요청은 기존처럼 처리 항목만)
--   - 디자인팀이 촬영 요청에 참고·제품 이미지 첨부 가능

drop policy if exists sht_insert on public.shoot_requests;
create policy sht_insert on public.shoot_requests for insert to authenticated with check (public.my_role() in ('admin','brand','design'));

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

  -- 디자인팀이 직접 작성한 요청(촬영 요청)은 작성자처럼 내용 수정 가능
  if r = 'design' and old.requester_id = auth.uid() then
    return new;
  end if;

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

create or replace function public.can_attach(p_entity text, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when p_entity = 'dev' then public.is_member() and p_kind = 'file'
    when p_kind = 'result' then public.my_role() = 'design'
    when p_entity in ('product','package') then public.my_role() = 'logistics'
    when p_entity = 'shoot' then public.my_role() in ('brand','design')
    when p_entity = 'design' then public.my_role() = 'brand'
    else false end
$$;

-- 확인용
select policyname, with_check from pg_policies where tablename = 'shoot_requests' and policyname = 'sht_insert';
