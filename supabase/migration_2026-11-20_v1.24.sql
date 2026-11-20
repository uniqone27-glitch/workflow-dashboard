-- 2026-11-20 v1.24: 유통 제품명(영문) (1회 실행)
alter table public.products add column if not exists retail_name_en text;

-- 확인용
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'products' and column_name = 'retail_name_en';
