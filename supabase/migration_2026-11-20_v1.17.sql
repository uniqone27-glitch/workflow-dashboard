-- 2026-11-20 v1.17: 06 개발요청 신규 요청 알림(🔔·슬랙 DM)은 관리자 정용환에게만 (1회 실행)
--   - 정용환 계정이 비활성/삭제되면 관리자 전체에게 알림 (예비)
--   - 상태 변경·답변 알림은 기존처럼 요청자에게
create or replace function public.dev_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label   text := new.code || ' · ' || new.title;
  dev_mgr uuid := 'e6e64965-2e6d-4fd9-9655-13a35e233b1b';   -- 정용환 (개발요청 담당 관리자)
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.profiles where id = dev_mgr and active and role = 'admin') then
      insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
      values (dev_mgr, 'dev', new.id, '신규 개발 요청 (' || new.req_type || ')', label, auth.uid());
    else
      insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
      values ('admin', 'dev', new.id, '신규 개발 요청 (' || new.req_type || ')', label, auth.uid());
    end if;
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
