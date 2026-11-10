-- ระยะที่ 3: Realtime ด้วย Broadcast จากฐานข้อมูล (แทน Postgres Changes)
-- เหตุผล: ตัวนับกับ is_open อยู่แถวเดียวกัน Postgres Changes จะส่งทุกการเปลี่ยนตัวนับให้ทุกคน
--         แยก topic ทำให้โหมด polling ไม่ต้องรับข้อความตัวนับเลย
--   problem-state  : is_open เปลี่ยน        → { problem_id, is_open }          (นิสิตรับเสมอ)
--   problem-counts : submission_count เปลี่ยน → { problem_id, submission_count } (เฉพาะโหมด realtime)

-- ไม่ใช้ Postgres Changes แล้ว (ลดงานของ realtime ที่ต้องอ่าน WAL)
alter publication supabase_realtime drop table public.problem_status, public.submissions;

create function public.tg_problem_status_broadcast()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.is_open is distinct from old.is_open then
    perform realtime.send(
      jsonb_build_object('problem_id', new.problem_id, 'is_open', new.is_open),
      'state', 'problem-state', true);
  end if;
  if new.submission_count is distinct from old.submission_count then
    perform realtime.send(
      jsonb_build_object('problem_id', new.problem_id, 'submission_count', new.submission_count),
      'count', 'problem-counts', true);
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_problem_status_broadcast() from public, anon, authenticated;

create trigger problem_status_broadcast
after update of is_open, submission_count on public.problem_status
for each row execute function public.tg_problem_status_broadcast();

-- ช่อง private: รับได้เฉพาะนิสิตที่บัญชีเปิดอยู่และอาจารย์ (payload ไม่มีเนื้อหาโจทย์)
create policy problem_broadcast_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) in ('problem-state', 'problem-counts')
    and ((select public.is_active_student()) or (select public.is_instructor()))
  );
