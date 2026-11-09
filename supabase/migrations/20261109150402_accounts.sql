-- ระยะที่ 2: ระบบบัญชี
-- 1) รหัสนิสิตเป็นตัวเลข 8 หลัก (รหัสผ่านเริ่มต้น = รหัสนิสิต และขั้นต่ำของ Auth = 8 ตัว)
alter table public.profiles drop constraint profiles_student_id_format;
alter table public.profiles
  add constraint profiles_student_id_format check (student_id ~ '^[0-9]{8}$');

-- 2) อาจารย์คนเดียว (เป็นผู้ดูแลระบบด้วย) — ไม่มีฟีเจอร์เพิ่มอาจารย์
insert into public.instructors (email) values ('pornthep.ro@up.ac.th')
on conflict (email) do nothing;
