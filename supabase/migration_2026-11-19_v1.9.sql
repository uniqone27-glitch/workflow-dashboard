-- 2026-11-19 v1.9: 담당자 다중 배정 (1회 실행)
--   - 요청 3종에 assignee_ids(uuid[]) 추가, assignee_id는 첫 번째 담당자(대표)로 자동 동기화
--   - 디자인팀이 assignee_ids를 수정할 수 있도록 권한 트리거 갱신
--   - 새로 추가된 담당자 모두에게 알림(→ 슬랙 DM)

alter table public.package_requests add column if not exists assignee_ids uuid[] not null default '{}';
alter table public.shoot_requests add column if not exists assignee_ids uuid[] not null default '{}';
alter table public.design_requests add column if not exists assignee_ids uuid[] not null default '{}';

-- 기존 담당자 옮기기 (이력·알림 트리거 제외)
begin;
alter table public.package_requests disable trigger user;
update public.package_requests set assignee_ids = array[assignee_id] where assignee_id is not null and assignee_ids = '{}';
alter table public.package_requests enable trigger user;
alter table public.shoot_requests disable trigger user;
update public.shoot_requests set assignee_ids = array[assignee_id] where assignee_id is not null and assignee_ids = '{}';
alter table public.shoot_requests enable trigger user;
alter table public.design_requests disable trigger user;
update public.design_requests set assignee_ids = array[assignee_id] where assignee_id is not null and assignee_ids = '{}';
alter table public.design_requests enable trigger user;
commit;

create or replace function public.sync_assignees() returns trigger
language plpgsql set search_path = public as $$
begin
  new.assignee_ids := coalesce(new.assignee_ids, '{}');
  -- 예전 방식(assignee_id만 변경)으로 저장된 경우 배열에 반영
  if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id and new.assignee_ids = coalesce(old.assignee_ids, '{}') then
    new.assignee_ids := case when new.assignee_id is null then '{}'::uuid[] else array[new.assignee_id] end;
  end if;
  new.assignee_id := new.assignee_ids[1];  -- 대표 담당자
  return new;
end $$;

drop trigger if exists t10_guard on public.package_requests;
create trigger t10_guard  before insert or update on public.package_requests for each row
  execute function public.guard_request('logistics', 'status,assignee_id,assignee_ids,expected_date,work_memo,work_url,result_url,completed_date');
drop trigger if exists t15_assignees on public.package_requests;
create trigger t15_assignees before insert or update on public.package_requests for each row execute function public.sync_assignees();
drop trigger if exists t10_guard on public.shoot_requests;
create trigger t10_guard  before insert or update on public.shoot_requests for each row
  execute function public.guard_request('brand', 'status,assignee_id,assignee_ids,scheduled_date,expected_date,work_memo,result_url,completed_date');
drop trigger if exists t15_assignees on public.shoot_requests;
create trigger t15_assignees before insert or update on public.shoot_requests for each row execute function public.sync_assignees();
drop trigger if exists t10_guard on public.design_requests;
create trigger t10_guard  before insert or update on public.design_requests for each row
  execute function public.guard_request('brand', 'status,assignee_id,assignee_ids,expected_date,work_memo,figma_url,result_url,completed_date');
drop trigger if exists t15_assignees on public.design_requests;
create trigger t15_assignees before insert or update on public.design_requests for each row execute function public.sync_assignees();

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
  ent_name := coalesce(ent_name, n->>'product_retail_name', n->>'product_online_name');
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
    -- 담당자(여러 명): 새로 추가된 담당자에게만 알림
    if diff ? 'assignee_ids' then
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      select x::uuid, ent, rid, title || ' 담당자로 배정됨', label, auth.uid()
        from jsonb_array_elements_text(coalesce(n->'assignee_ids', '[]'::jsonb)) x
       where not coalesce(o->'assignee_ids', '[]'::jsonb) ? x;
    end if;
    if diff ? 'cancelled' and (n->>'cancelled')::boolean then
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values ('design', ent, rid, title || ' 취소', label, auth.uid());
    end if;
  end if;
  return new;
end $$;

-- 확인용
select code, assignee_id, assignee_ids from public.package_requests union all select code, assignee_id, assignee_ids from public.shoot_requests union all select code, assignee_id, assignee_ids from public.design_requests;
