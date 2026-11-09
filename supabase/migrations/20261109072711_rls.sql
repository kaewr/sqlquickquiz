-- ระยะที่ 1: สิทธิ์ (GRANT) + RLS ตาม "สิทธิ์การเข้าถึง (RLS)" ใน CLAUDE.md
-- หลัก: ถอนสิทธิ์เริ่มต้นของ Supabase ทั้งหมด แล้วให้เท่าที่จำเป็น
--       anon ไม่ได้สิทธิ์ตารางใดเลย เข้าถึงข้อมูลได้ผ่าน get_public_results เท่านั้น

-- ===========================================================================
-- เปิด RLS ทุกตาราง
-- ===========================================================================
alter table public.instructors       enable row level security;
alter table public.profiles          enable row level security;
alter table public.problems          enable row level security;
alter table public.problem_solutions enable row level security;
alter table public.problem_status    enable row level security;
alter table public.submissions       enable row level security;
alter table public.results           enable row level security;
alter table public.grading_jobs      enable row level security;

-- ===========================================================================
-- GRANT ระดับตาราง/คอลัมน์ (RLS กรองแถวอีกชั้น)
-- ===========================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select                         on public.instructors       to authenticated;
grant select, insert, update, delete on public.profiles          to authenticated;
grant select, insert, update, delete on public.problems          to authenticated;
grant select, insert, update, delete on public.problem_solutions to authenticated;
grant select                         on public.problem_status    to authenticated;
grant update (is_open)               on public.problem_status    to authenticated;  -- ตัวนับ/เวลาแก้เองไม่ได้
grant select                         on public.submissions       to authenticated;  -- เพิ่มผ่าน submit_answer เท่านั้น
grant select, insert, update, delete on public.results           to authenticated;
grant select, insert, update, delete on public.grading_jobs      to authenticated;

-- ===========================================================================
-- GRANT ฟังก์ชัน (Supabase ให้ execute กับทุก role เป็นค่าเริ่มต้น จึงถอนก่อน)
-- ===========================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_instructor()                  to authenticated, anon;
grant execute on function public.is_active_student()              to authenticated;
grant execute on function public.submit_answer(bigint, text)      to authenticated;
grant execute on function public.release_results(bigint)          to authenticated;
grant execute on function public.mark_password_changed()          to authenticated;
grant execute on function public.get_public_results(text)         to anon, authenticated;
grant execute on function public.mask_student_id(text)            to anon, authenticated;

-- ฟังก์ชันที่สร้างภายหลังไม่ได้ execute อัตโนมัติ
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ===========================================================================
-- POLICIES  (ใช้ (select ...) ให้ฟังก์ชันถูกเรียกครั้งเดียวต่อคำสั่ง)
-- ===========================================================================

-- instructors: อาจารย์อ่านได้ เพิ่ม/ลบผ่าน SQL หรือ Dashboard
create policy instructors_select_instructor on public.instructors
  for select to authenticated
  using ((select public.is_instructor()));

-- profiles: นิสิตอ่านของตัวเอง, อาจารย์ทำได้ทั้งหมด
-- (นิสิตแก้ได้แค่ password_changed ผ่าน mark_password_changed)
create policy profiles_select_own_or_instructor on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_instructor()));
create policy profiles_insert_instructor on public.profiles
  for insert to authenticated
  with check ((select public.is_instructor()));
create policy profiles_update_instructor on public.profiles
  for update to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));
create policy profiles_delete_instructor on public.profiles
  for delete to authenticated
  using ((select public.is_instructor()));

-- problems: นิสิต (บัญชีเปิด) อ่านข้อที่เปิดอยู่ + ข้อที่ตัวเองเคยส่ง, อาจารย์ทำได้ทั้งหมด
create policy problems_select on public.problems
  for select to authenticated
  using (
    (select public.is_instructor())
    or ((select public.is_active_student())
        and exists (select 1 from public.problem_status ps where ps.problem_id = problems.id and ps.is_open))
    or exists (select 1 from public.submissions s
               where s.problem_id = problems.id and s.student_user_id = (select auth.uid()))
  );
create policy problems_insert_instructor on public.problems
  for insert to authenticated
  with check ((select public.is_instructor()));
create policy problems_update_instructor on public.problems
  for update to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));
create policy problems_delete_instructor on public.problems
  for delete to authenticated
  using ((select public.is_instructor()));

-- problem_solutions: อาจารย์เท่านั้น
create policy problem_solutions_instructor on public.problem_solutions
  for all to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));

-- problem_status: นิสิต (บัญชีเปิด) อ่าน, อาจารย์อ่านและเปิด/ปิด
create policy problem_status_select on public.problem_status
  for select to authenticated
  using ((select public.is_instructor()) or (select public.is_active_student()));
create policy problem_status_update_instructor on public.problem_status
  for update to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));

-- submissions: นิสิตอ่านของตัวเอง, อาจารย์อ่านทั้งหมด (ไม่มีใครแก้/ลบผ่าน API)
create policy submissions_select_own_or_instructor on public.submissions
  for select to authenticated
  using (student_user_id = (select auth.uid()) or (select public.is_instructor()));

-- results: นิสิตอ่านของตัวเองเฉพาะข้อที่ประกาศแล้ว, อาจารย์ทำได้ทั้งหมด
create policy results_select on public.results
  for select to authenticated
  using (
    (select public.is_instructor())
    or exists (
      select 1
      from public.submissions s
      join public.problems p on p.id = s.problem_id
      where s.id = results.submission_id
        and s.student_user_id = (select auth.uid())
        and p.results_released_at is not null
    )
  );
create policy results_insert_instructor on public.results
  for insert to authenticated
  with check ((select public.is_instructor()));
create policy results_update_instructor on public.results
  for update to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));
create policy results_delete_instructor on public.results
  for delete to authenticated
  using ((select public.is_instructor()));

-- grading_jobs: อาจารย์เท่านั้น
create policy grading_jobs_instructor on public.grading_jobs
  for all to authenticated
  using ((select public.is_instructor()))
  with check ((select public.is_instructor()));
