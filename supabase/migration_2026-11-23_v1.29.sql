-- 2026-11-23 v1.29: 협업 요청 파일 첨부 (1회 실행)
--   - attachments.entity_type 에 'collab' 추가
--   - 구성원 누구나 협업 요청에 일반 파일(file) 첨부 가능
--   - 협업 요청 삭제 시 첨부 기록도 정리

alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('product','package','shoot','design','dev','collab'));

create or replace function public.can_attach(p_entity text, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when p_entity in ('dev','collab') then public.is_member() and p_kind = 'file'
    when p_kind = 'result' then public.my_role() = 'design'
    when p_entity in ('product','package') then public.my_role() = 'logistics'
    when p_entity = 'shoot' then public.my_role() in ('brand','design')
    when p_entity = 'design' then public.my_role() = 'brand'
    else false end
$$;

create or replace function public.collab_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.comments      where entity_type = 'collab' and entity_id = old.id;
  delete from public.attachments   where entity_type = 'collab' and entity_id = old.id;
  delete from public.notifications where entity_type = 'collab' and entity_id = old.id;
  return old;
end $$;

-- 확인용
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'attachments_entity_type_check';
