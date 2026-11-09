-- ระยะที่ 1: เปิด Realtime (Postgres Changes) — RLS ยังมีผลกับข้อความที่ส่งออก
-- หน้านิสิต subscribe problem_status, หน้าอาจารย์ subscribe submissions
alter publication supabase_realtime add table public.problem_status, public.submissions;
