-- เทสต์ตัวอย่างระยะที่ 0: ตรวจว่า pgTAP และฐานข้อมูล local พร้อมใช้งาน
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select has_extension('pgtap', 'ติดตั้ง pgTAP แล้ว');
select has_schema('public', 'มี schema public');
select has_schema('auth', 'มี schema auth ของ Supabase');

select * from finish();
rollback;
