-- ระยะที่ 4 (ส่วนเสริม): ลบโจทย์ได้แม้มีคนส่งแล้ว — ผ่านฟังก์ชันนี้เท่านั้น
-- FK submissions → problems ยังเป็น on delete restrict (ลบตรงจากตารางไม่ได้ถ้ามีคนส่ง)

create function public.delete_problem(p_problem_id bigint, p_confirm_title text)
returns table (deleted_submissions integer, deleted_results integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_title   text;
  v_subs    integer;
  v_results integer;
begin
  if not public.is_instructor() then
    raise exception using errcode = '42501', message = 'NOT_INSTRUCTOR';
  end if;

  select p.title into v_title from public.problems p where p.id = p_problem_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROBLEM_NOT_FOUND';
  end if;

  -- ต้องพิมพ์ชื่อโจทย์ให้ตรงทุกตัวอักษร (กันลบผิดข้อ)
  if p_confirm_title is distinct from v_title then
    raise exception using errcode = 'P0001', message = 'CONFIRM_TITLE_MISMATCH';
  end if;

  -- ปิดก่อน: trigger ส่ง problem-state ให้นิสิตเห็น "ปิดรับคำตอบแล้ว" ทันที
  -- และล็อกแถวสถานะ ทำให้ submit_answer ที่มาพร้อมกันรอแล้วได้ PROBLEM_CLOSED
  update public.problem_status set is_open = false where problem_id = p_problem_id and is_open;
  perform 1 from public.problem_status where problem_id = p_problem_id for update;

  delete from public.results r
   using public.submissions s
   where r.submission_id = s.id and s.problem_id = p_problem_id;
  get diagnostics v_results = row_count;

  delete from public.submissions where problem_id = p_problem_id;
  get diagnostics v_subs = row_count;

  -- problem_solutions, problem_status, grading_jobs ลบตามด้วย on delete cascade
  delete from public.problems where id = p_problem_id;

  return query select v_subs, v_results;
end;
$$;

revoke execute on function public.delete_problem(bigint, text) from public, anon, authenticated;
grant execute on function public.delete_problem(bigint, text) to authenticated;
