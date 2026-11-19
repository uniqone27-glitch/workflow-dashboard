-- 2026-11-19 v1.3: 협업 댓글 멘션 (1회 실행)
--   comments.mentions      : 멘션된 사용자 id 목록
--   comments.mention_roles : 멘션된 팀(logistics / brand / design)
--   댓글 등록 시 멘션 대상에게 🔔 알림을 서버에서 생성

alter table public.comments add column if not exists mentions uuid[] not null default '{}';
alter table public.comments add column if not exists mention_roles text[] not null default '{}';
alter table public.comments drop constraint if exists comments_mentions_limit;
alter table public.comments add constraint comments_mentions_limit
  check (cardinality(mentions) <= 50 and cardinality(mention_roles) <= 5);

create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u       uuid;
  r       text;
  label   text;
  who     text;
  title_t text;
  body_t  text;
begin
  if cardinality(new.mentions) = 0 and cardinality(new.mention_roles) = 0 then
    return new;
  end if;
  label := case new.entity_type
    when 'package' then (select code from public.package_requests where id = new.entity_id)
    when 'shoot'   then (select code from public.shoot_requests   where id = new.entity_id)
    when 'design'  then (select code from public.design_requests  where id = new.entity_id)
    when 'product' then (select coalesce(retail_name, online_name) from public.products where id = new.entity_id)
  end;
  select name into who from public.profiles where id = new.author_id;
  title_t := coalesce(who, '') || '님이 댓글에서 언급했습니다';
  body_t  := coalesce(label || ' · ', '') || left(new.body, 100);

  for u in
    select distinct x from unnest(new.mentions) x
      join public.profiles p on p.id = x
     where p.active and p.deleted_at is null and p.role <> 'pending' and x <> new.author_id
       and not (p.role = any(new.mention_roles))  -- 팀 멘션으로 이미 받는 사람은 중복 알림 제외
  loop
    insert into public.notifications (target_user, entity_type, entity_id, title, body, actor_id)
    values (u, new.entity_type, new.entity_id, title_t, body_t, new.author_id);
  end loop;

  for r in
    select distinct x from unnest(new.mention_roles) x where x in ('logistics', 'brand', 'design')
  loop
    insert into public.notifications (target_role, entity_type, entity_id, title, body, actor_id)
    values (r, new.entity_type, new.entity_id, title_t, body_t, new.author_id);
  end loop;
  return new;
end $$;

drop trigger if exists t91_mention on public.comments;
create trigger t91_mention after insert on public.comments
  for each row execute function public.notify_mentions();

-- 확인용
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'comments' and column_name in ('mentions', 'mention_roles');
