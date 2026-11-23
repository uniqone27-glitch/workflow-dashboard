-- 2026-11-23 v1.25: 촬영 요청 컬러 (1회 실행)
--   - 촬영할 컬러를 옵션별로 저장 (예: {화이트, 블랙})
alter table public.shoot_requests add column if not exists shoot_colors text[] not null default '{}';

-- 확인용
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'shoot_requests' and column_name = 'shoot_colors';
