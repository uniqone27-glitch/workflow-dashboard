-- 2026-11-19 v1.8: 촬영 요청에서 선택했던 물류/발주팀 이미지를 '촬영 제품 이미지'로 분류 (1회 실행, 데이터만 변경)
-- 이전에는 선택한 물류/발주팀 이미지가 참고 이미지(reference)로 저장되었습니다.
update public.attachments
   set kind = 'product_image'
 where entity_type = 'shoot' and kind = 'reference' and storage_path not like 'shoot/%';

-- 확인용
select entity_id, kind, file_name from public.attachments where entity_type = 'shoot' order by created_at;
