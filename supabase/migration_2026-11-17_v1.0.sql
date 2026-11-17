-- 2026-11-17 v1.0 변경 마이그레이션 (이미 schema.sql 을 실행한 프로젝트에 1회 실행)
-- 1) 유통 제품명 필수, 온라인 제품명 선택  2) 입고 예정 수량 추가  3) 알림/이력의 제품명 표시를 유통 제품명 기준으로

update public.products set retail_name = coalesce(nullif(retail_name, ''), online_name) where retail_name is null or retail_name = '';
alter table public.products alter column online_name drop not null;
alter table public.products alter column retail_name set not null;
alter table public.products add column if not exists arrival_qty int check (arrival_qty >= 0);

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

-- 확인용
select column_name, is_nullable, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'products' and column_name in ('online_name','retail_name','arrival_qty')
 order by column_name;
