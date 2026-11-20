-- 2026-11-20 v1.21: 촬영 요청에 저장된 유통 제품명을 최신 제품 정보로 맞춤 (1회 실행, 데이터만 변경)
--   화면은 등록 제품의 최신 유통 제품명을 바로 표시하므로, 이 SQL은 저장된 사본만 정리합니다.
begin;
alter table public.shoot_requests disable trigger user;
update public.shoot_requests s
   set product_retail_name = p.retail_name
  from public.products p
 where p.id = s.product_id
   and p.retail_name is not null
   and s.product_retail_name is distinct from p.retail_name;
alter table public.shoot_requests enable trigger user;
commit;

-- 확인용
select s.code, s.product_retail_name as shoot_name, p.retail_name as product_name
  from public.shoot_requests s join public.products p on p.id = s.product_id
 order by s.code;
