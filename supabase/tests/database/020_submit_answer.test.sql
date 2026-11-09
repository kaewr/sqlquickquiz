-- submit_answer: ส่งสำเร็จ, ส่งซ้ำ, ข้อปิด, ไม่ใช่นิสิต, SQL ไม่ถูกต้อง, เวลาและลำดับจากฐานข้อมูล
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(21);

create temp table ids as
select tests.create_student('6500000101') as s1,
       tests.create_student('6500000102') as s2,
       tests.create_student('6500000103', '1', false) as s_inactive,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('open-problem', true) as p_open,
       tests.create_problem('closed-problem', false) as p_closed;
grant select on ids to authenticated;

-- ---------- ส่งสำเร็จ ----------
select tests.login_as(s1) from ids;

select results_eq(
  $$ select submit_order, submitted_at >= now() and submitted_at <= clock_timestamp() from public.submit_answer((select p_open from ids), 'SELECT 1;') $$,
  $$ values (1, true) $$,
  'นิสิตส่งสำเร็จ ได้ลำดับที่ 1 และเวลาส่งเป็นเวลาของฐานข้อมูล'
);

-- ---------- ส่งซ้ำ ----------
select throws_ok(
  $$ select * from public.submit_answer((select p_open from ids), 'SELECT 2;') $$,
  'P0001', 'ALREADY_SUBMITTED', 'ส่งซ้ำข้อเดิมถูกปฏิเสธ'
);

-- ---------- ข้อปิด / ไม่มีข้อนี้ ----------
select throws_ok(
  $$ select * from public.submit_answer((select p_closed from ids), 'SELECT 1;') $$,
  'P0001', 'PROBLEM_CLOSED', 'ส่งตอนข้อปิดถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.submit_answer(-999, 'SELECT 1;') $$,
  'P0001', 'PROBLEM_CLOSED', 'ข้อที่ไม่มีอยู่ตอบ PROBLEM_CLOSED (ไม่บอกว่าไม่มี)'
);

-- ---------- SQL ไม่ถูกต้อง ----------
select throws_ok(
  $$ select * from public.submit_answer((select p_closed from ids), '') $$,
  'P0001', 'INVALID_SQL_TEXT', 'SQL ว่างถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.submit_answer((select p_closed from ids), E'  \n\t ') $$,
  'P0001', 'INVALID_SQL_TEXT', 'SQL มีแต่ช่องว่างถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.submit_answer((select p_closed from ids), null) $$,
  'P0001', 'INVALID_SQL_TEXT', 'SQL เป็น null ถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.submit_answer((select p_closed from ids), repeat('x', 10001)) $$,
  'P0001', 'INVALID_SQL_TEXT', 'SQL ยาวเกิน 10,000 ตัวอักษรถูกปฏิเสธ'
);

-- ---------- นิสิตคนที่ 2: ยาวพอดี 10,000 ตัว (ภาษาไทยนับเป็นตัวอักษร) ----------
reset role;
select tests.login_as(s2) from ids;
select results_eq(
  $$ select submit_order from public.submit_answer((select p_open from ids), repeat('ก', 10000)) $$,
  $$ values (2) $$,
  'SQL ยาว 10,000 ตัวอักษรพอดีส่งได้ และได้ลำดับที่ 2'
);

-- ---------- ไม่ใช่นิสิต ----------
reset role;
select tests.login_as(s_inactive) from ids;
select throws_ok(
  $$ select * from public.submit_answer((select p_open from ids), 'SELECT 1;') $$,
  'P0001', 'NOT_STUDENT', 'นิสิตที่ถูกปิดบัญชีส่งไม่ได้'
);

reset role;
select tests.login_as(t1) from ids;
select throws_ok(
  $$ select * from public.submit_answer((select p_open from ids), 'SELECT 1;') $$,
  'P0001', 'NOT_STUDENT', 'อาจารย์ส่งคำตอบไม่ได้'
);

reset role;
select tests.login_anon();
select throws_ok(
  $$ select * from public.submit_answer(1, 'SELECT 1;') $$,
  '42501', null, 'ผู้ไม่ล็อกอินเรียก submit_answer ไม่ได้'
);

-- ---------- ส่งตรงเข้าตารางไม่ได้ ----------
reset role;
select tests.login_as(s1) from ids;
select throws_ok(
  $$ insert into public.submissions (problem_id, student_user_id, sql_text)
     values ((select p_closed from ids), (select s1 from ids), 'SELECT 1;') $$,
  '42501', null, 'นิสิต insert submissions ตรงไม่ได้ (ต้องผ่าน submit_answer)'
);
select throws_ok(
  $$ update public.submissions set sql_text = 'แก้แล้ว' $$,
  '42501', null, 'นิสิตแก้ submissions ไม่ได้'
);
select throws_ok(
  $$ delete from public.submissions $$,
  '42501', null, 'นิสิตลบ submissions ไม่ได้'
);

-- ---------- ผลในฐานข้อมูล ----------
reset role;
select results_eq(
  $$ select submission_count from public.problem_status where problem_id = (select p_open from ids) $$,
  $$ values (2) $$,
  'ตัวนับข้อที่เปิด = 2'
);
select results_eq(
  $$ select submission_count from public.problem_status where problem_id = (select p_closed from ids) $$,
  $$ values (0) $$,
  'การส่งที่ถูกปฏิเสธไม่เพิ่มตัวนับ'
);
select results_eq(
  $$ select sql_text from public.submissions
     where student_user_id = (select s1 from ids) and problem_id = (select p_open from ids) $$,
  $$ values ('SELECT 1;') $$,
  'คำตอบแรกไม่ถูกเขียนทับโดยการส่งซ้ำ'
);

-- เวลาส่งที่ตั้งเองถูกแทนด้วยเวลาฐานข้อมูล (แม้ postgres insert ตรง)
update public.problem_status set is_open = true where problem_id = (select p_closed from ids);
insert into public.submissions (problem_id, student_user_id, sql_text, submitted_at, submit_order)
values ((select p_closed from ids), (select s2 from ids), 'SELECT 9;', '2000-01-01', 99);
select results_eq(
  $$ select submitted_at >= now() and submitted_at <= clock_timestamp(), submit_order from public.submissions
     where problem_id = (select p_closed from ids) and student_user_id = (select s2 from ids) $$,
  $$ values (true, 1) $$,
  'submitted_at และ submit_order ที่ส่งมาเองถูกแทนด้วยค่าจากฐานข้อมูล'
);

-- ---------- ลบนิสิตที่เคยส่งไม่ได้ / ยังไม่เคยส่งลบได้ ----------
select throws_ok(
  $$ delete from auth.users where id = (select s1 from ids) $$,
  '23503', null, 'ลบนิสิตที่เคยส่งคำตอบแล้วไม่ได้'
);
select lives_ok(
  $$ delete from auth.users where id = (select s_inactive from ids) $$,
  'ลบนิสิตที่ยังไม่เคยส่งได้'
);

select * from finish();
rollback;
