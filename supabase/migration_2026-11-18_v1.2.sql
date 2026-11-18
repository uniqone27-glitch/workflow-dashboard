-- 2026-11-18 v1.2: 촬영 유형 명칭 변경을 기존 촬영 요청에도 반영 (1회 실행)
--   제품 누끼 촬영       → 호리존 촬영
--   제품 단독 연출 촬영  → 콘셉트 촬영(세트장 연출)
--   제품 디테일 촬영     → 제품 디테일 추가 촬영
-- 삭제된 유형/목적(공간 스타일링 촬영 등)은 기존 요청에 그대로 남겨 둡니다.
-- 명칭 정리는 업무 수정이 아니므로 변경 이력·알림 트리거를 잠시 끄고 실행합니다.

begin;
alter table public.shoot_requests disable trigger user;

update public.shoot_requests
   set shoot_types = (
     select array_agg(case t
              when '제품 누끼 촬영' then '호리존 촬영'
              when '제품 단독 연출 촬영' then '콘셉트 촬영(세트장 연출)'
              when '제품 디테일 촬영' then '제품 디테일 추가 촬영'
              else t end order by ord)
       from unnest(shoot_types) with ordinality as u(t, ord))
 where shoot_types && array['제품 누끼 촬영', '제품 단독 연출 촬영', '제품 디테일 촬영'];

alter table public.shoot_requests enable trigger user;
commit;

-- 확인용
select code, purpose, shoot_types from public.shoot_requests order by created_at;
