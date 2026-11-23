-- 2026-11-23 v1.27: 협업 요청 「요청 받는 자」 (1회 실행)
--   - 요청자가 등록 시 물류/발주팀 구성원을 직접 지정 (assignee_ids = 요청 받는 자 = 담당자)
--   - 지정하면 그 사람에게만, 지정하지 않으면 물류/발주팀 전체에 알림
--   - 요청자는 '요청' 상태일 때 요청 받는 자를 바꿀 수 있음 (상태·답변은 물류/발주팀만)

create or replace function public.collab_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r    text := public.my_role();
  proc boolean := r in ('admin','logistics');
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.requester_id := auth.uid();
      if not proc then new.status := '요청'; new.response := null; end if;
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
    if new.status is distinct from old.status or new.response is distinct from old.response then
      raise exception '진행 상태·답변은 물류/발주팀만 변경할 수 있습니다.';
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

create or replace function public.collab_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text := coalesce(new.code, '') || ' · '
             || case when new.purpose = '기타' and coalesce(new.purpose_etc, '') <> '' then new.purpose_etc else new.purpose end
             || ' · ' || to_char(new.req_date, 'MM/DD')
             || coalesce(' ' || to_char(new.time_start, 'HH24:MI'), '');
begin
  if tg_op = 'INSERT' then
    if cardinality(new.assignee_ids) > 0 then
      -- 요청 받는 자에게만
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      select distinct u, 'collab', new.id, '협업 요청이 도착했습니다 (' || new.purpose || ')', label, auth.uid()
        from unnest(new.assignee_ids) u;
    else
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values ('logistics', 'collab', new.id, '신규 협업 요청 (' || new.purpose || ')', label, auth.uid());
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (new.requester_id, 'collab', new.id,
            case when new.status = '완료' then '협업 요청 완료' else '협업 요청 상태 변경: ' || new.status end,
            label, auth.uid());
  end if;
  -- 새로 지정된 요청 받는 자(담당자)에게만
  insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
  select u, 'collab', new.id,
         case when auth.uid() = new.requester_id then '협업 요청이 도착했습니다 (' || new.purpose || ')' else '협업 요청 담당자로 배정됨' end,
         label, auth.uid()
    from unnest(new.assignee_ids) u
   where not (u = any(coalesce(old.assignee_ids, '{}')));
  if new.response is distinct from old.response and coalesce(trim(new.response), '') <> '' then
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (new.requester_id, 'collab', new.id, '협업 요청에 답변이 등록되었습니다', label || ' · ' || left(new.response, 80), auth.uid());
  end if;
  return new;
end $$;
