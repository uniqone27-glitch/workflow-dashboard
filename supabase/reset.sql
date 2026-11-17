-- 주의: 모든 업무 데이터가 삭제됩니다. 개발/테스트 단계에서 schema.sql 을 다시 실행해야 할 때만 사용하세요.
-- (auth.users 계정은 유지되므로, 재실행 후에는 profiles 를 다시 채워야 합니다 — 하단 참고)

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists files_read   on storage.objects;
drop policy if exists files_insert on storage.objects;
drop policy if exists files_delete on storage.objects;

drop table if exists public.drafts, public.notification_reads, public.notifications, public.history,
  public.comments, public.attachments, public.design_requests, public.shoot_requests, public.package_requests,
  public.launch_readiness, public.products, public.design_work_types, public.brands, public.profiles cascade;
drop sequence if exists public.seq_product, public.seq_package, public.seq_shoot, public.seq_design;
drop function if exists public.my_role, public.is_member, public.handle_new_user, public.guard_profile,
  public.set_code, public.stamp_row, public.stamp_status, public.guard_request, public.log_history,
  public.create_launch_row, public.notify_correction, public.can_attach cascade;

-- schema.sql 재실행 후, 기존 로그인 계정의 프로필을 복구하려면:
-- insert into public.profiles (id, email, name, role)
--   select id, email, split_part(email, '@', 1), 'pending' from auth.users on conflict do nothing;
-- update public.profiles set role = 'admin' where email = '관리자이메일@회사.com';
