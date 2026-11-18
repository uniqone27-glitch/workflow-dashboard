-- 2026-11-18 v1.1 변경 마이그레이션 (v1.0 마이그레이션까지 실행한 프로젝트에 1회 실행)
-- 1) 관리자 사용자 삭제: 로그인 계정(auth.users)은 삭제하고, 이력 표시용 이름만 profiles 에 남김
-- 2) 브랜드 선택값에 '유통' 추가

-- profiles 가 auth.users 삭제 시 함께 지워지지 않도록 FK 해제 (요청/이력의 작성자 이름 보존)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass and contype = 'f'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles add column if not exists deleted_at timestamptz;

-- 관리자 전용: 사용자 삭제
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

-- 브랜드 '유통' 추가
insert into public.brands (name, sort)
select '유통', coalesce(max(sort), 0) + 1 from public.brands
where not exists (select 1 from public.brands where name = '유통');

-- 확인용
select name, active from public.brands order by sort;
