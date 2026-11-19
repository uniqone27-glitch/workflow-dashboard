-- 2026-11-19 v1.5: 촬영 유형 명칭 되돌림 — 제품 디테일 추가 촬영 → 제품 디테일 촬영 (1회 실행)
-- 명칭 정리는 업무 수정이 아니므로 변경 이력·알림 트리거를 잠시 끄고 실행합니다.

begin;
alter table public.shoot_requests disable trigger user;

update public.shoot_requests
   set shoot_types = array_replace(shoot_types, '제품 디테일 추가 촬영', '제품 디테일 촬영')
 where '제품 디테일 추가 촬영' = any(shoot_types);

alter table public.shoot_requests enable trigger user;
commit;

-- 확인용
select code, shoot_types from public.shoot_requests order by created_at;
