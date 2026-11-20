-- 2026-11-20 v1.20: 촬영 요청 직접 입력 시 브랜드 (1회 실행)
alter table public.shoot_requests add column if not exists product_brand_id bigint references public.brands(id) on delete set null;

-- 확인용
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'shoot_requests' and column_name = 'product_brand_id';
