-- 2026-11-20 v1.19: 촬영 요청 직접 입력 시 카테고리 (1회 실행)
--   - 등록 제품이 아닌 「직접 입력」 촬영 요청에 카테고리를 저장
alter table public.shoot_requests add column if not exists product_category text;

-- 확인용
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'shoot_requests' and column_name = 'product_category';
