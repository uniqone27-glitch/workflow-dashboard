-- 2026-11-20 v1.22: 카테고리 관리 (1회 실행)
--   - 「사용자 · 설정」에서 관리자가 카테고리를 추가·삭제·숨김
create table if not exists public.categories (
  name       text primary key,
  sort       int not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.categories (name, sort) values ('테이블', 1), ('의자', 2), ('데스크', 3), ('소파', 4), ('침대프레임', 5), ('매트리스', 6), ('거울', 7), ('서랍장', 8), ('선반', 9), ('책장', 10), ('화장대', 11), ('스툴', 12)
on conflict (name) do nothing;
-- 이미 제품에 쓰인 카테고리가 목록에 없으면 추가
insert into public.categories (name, sort)
select distinct category, 50 from public.products where category is not null
on conflict (name) do nothing;

alter table public.categories enable row level security;
drop policy if exists cat_select on public.categories;
drop policy if exists cat_insert on public.categories;
drop policy if exists cat_update on public.categories;
drop policy if exists cat_delete on public.categories;
create policy cat_select on public.categories for select to authenticated using (public.is_member());
create policy cat_insert on public.categories for insert to authenticated with check (public.my_role() = 'admin');
create policy cat_update on public.categories for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy cat_delete on public.categories for delete to authenticated using (public.my_role() = 'admin');
revoke all on public.categories from anon;

do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;

-- 확인용
select name, sort, active from public.categories order by sort, name;
