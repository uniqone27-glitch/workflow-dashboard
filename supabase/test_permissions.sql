-- 권한 검수(Test 05): 각 팀 사용자로 가장해 API 를 거치지 않고 직접 DB 접근을 시도합니다.
-- 허용된 변경도 즉시 롤백되므로 실제 데이터는 바뀌지 않습니다.
-- 사용법: 하단 이메일을 실제 테스트 계정으로 맞추고, 패키지 요청이 1건 이상 있는 상태에서 SQL Editor 로 실행

create or replace function pg_temp.try_as(p_email text, q text) returns text
language plpgsql as $f$
declare
  uid uuid := (select id from public.profiles where email = p_email);
  n int;
begin
  if uid is null then return '계정 없음: ' || p_email; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    execute 'set local role authenticated';
    execute q;
    get diagnostics n = row_count;
    raise exception 'OK_ROWS:%', n;
  exception when others then
    if sqlerrm like 'OK_ROWS:%' then
      return case when split_part(sqlerrm, ':', 2) = '0' then '차단 (대상 0건 · RLS)'
                  else '허용 (' || split_part(sqlerrm, ':', 2) || '건, 롤백됨)' end;
    end if;
    return '차단: ' || sqlerrm;
  end;
end $f$;

with ids as (
  select id as pkg, product_id as prd from public.package_requests order by created_at limit 1
), t(no, who, action, expect, q) as (
  select v.* from ids, lateral (values
    (1, 'testlogistics@gmail.com', '물류팀 → 자기 패키지 요청 내용 수정', '허용',
        format('update public.package_requests set request_note = %L where id = %L', 'x', pkg)),
    (2, 'testlogistics@gmail.com', '물류팀 → 패키지 상태를 완료로 변경', '차단',
        format('update public.package_requests set status = %L where id = %L', '완료', pkg)),
    (3, 'testlogistics@gmail.com', '물류팀 → 촬영 요청 생성', '차단',
        format('insert into public.shoot_requests (product_id, purpose, shoot_types) values (%L, %L, %L)', prd, '기타', '{기타}')),
    (4, 'testlogistics@gmail.com', '물류팀 → 론칭 준비 상태 변경', '차단',
        format('update public.launch_readiness set launch_state = %L where product_id = %L', '론칭 완료', prd)),
    (5, 'testlogistics@gmail.com', '물류팀 → 본인 권한을 관리자로 변경', '차단',
        'update public.profiles set role = ''admin'' where email = ''testlogistics@gmail.com'''),
    (6, 'testdesign@gmail.com',    '디자인팀 → 패키지 상태·담당자 변경', '허용',
        format('update public.package_requests set status = %L, work_memo = %L where id = %L', '완료', 'ok', pkg)),
    (7, 'testdesign@gmail.com',    '디자인팀 → 패키지 요청 내용(필수 문구) 수정', '차단',
        format('update public.package_requests set required_text = %L where id = %L', 'x', pkg)),
    (8, 'testdesign@gmail.com',    '디자인팀 → 제품 기본 사양 수정', '차단',
        format('update public.products set online_name = %L where id = %L', 'x', prd)),
    (9, 'testdesign@gmail.com',    '디자인팀 → 업무 삭제', '차단',
        format('delete from public.package_requests where id = %L', pkg)),
    (10, 'testbrand@gmail.com',    '브랜드팀 → 촬영 요청 생성', '허용',
        format('insert into public.shoot_requests (product_id, purpose, shoot_types) values (%L, %L, %L)', prd, '신제품 론칭', '{제품 누끼 촬영}')),
    (12, 'testbrand@gmail.com',    '브랜드팀 → 론칭 준비 상태 변경', '허용',
        format('update public.launch_readiness set launch_state = %L where product_id = %L', '준비중', prd)),
    (13, 'testbrand@gmail.com',    '브랜드팀 → 패키지 요청 생성', '차단',
        format('insert into public.package_requests (product_id, design_type) values (%L, %L)', prd, '라벨')),
    (14, 'testbrand@gmail.com',    '브랜드팀 → 제품 정보 수정', '차단',
        format('update public.products set online_name = %L where id = %L', 'x', prd))
  ) v(no, who, action, expect, q)
)
select no, action, expect, pg_temp.try_as(who, q) as result from t order by no;
