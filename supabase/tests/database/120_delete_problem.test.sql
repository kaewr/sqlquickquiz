-- ระยะที่ 4 (ส่วนเสริม): delete_problem
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(14);

create temp table ids as
select tests.create_student('65003001') as s1,
       tests.create_student('65003002') as s2,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('ข้อทดลอง', true, 10) as p_used,
       tests.create_problem('ข้อร่าง', false, 10) as p_draft;
grant select on ids to anon, authenticated;
create temp table t0 as select now() as at;

-- มีคนส่ง 2 คน ให้คะแนน 1 คน
select tests.login_as(s1) from ids;
select public.submit_answer((select p_used from ids), 'SELECT 1;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select p_used from ids), 'SELECT 2;');
reset role;
insert into public.results (submission_id, score, verdict)
select id, 10, 'correct' from public.submissions where student_user_id = (select s1 from ids);

-- ลบตรงจากตารางไม่ได้ (restrict)
select throws_ok(
  $$ delete from public.problems where id = (select p_used from ids) $$,
  '23503', null, 'ลบโจทย์ที่มีคนส่งตรงจากตารางไม่ได้ (FK restrict)'
);

-- นิสิต / ผู้ไม่ล็อกอิน
select tests.login_as(s1) from ids;
select throws_ok(
  $$ select * from public.delete_problem((select p_used from ids), 'ข้อทดลอง') $$,
  '42501', 'NOT_INSTRUCTOR', 'นิสิตลบโจทย์ไม่ได้'
);
reset role;
select tests.login_anon();
select throws_ok(
  $$ select * from public.delete_problem(1, 'x') $$,
  '42501', null, 'ผู้ไม่ล็อกอินเรียก delete_problem ไม่ได้'
);
reset role;

-- อาจารย์
select tests.login_as(t1) from ids;
select throws_ok(
  $$ select * from public.delete_problem((select p_used from ids), 'ข้อทดลอ') $$,
  'P0001', 'CONFIRM_TITLE_MISMATCH', 'ชื่อยืนยันไม่ตรงถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.delete_problem((select p_used from ids), ' ข้อทดลอง') $$,
  'P0001', 'CONFIRM_TITLE_MISMATCH', 'ชื่อยืนยันมีช่องว่างเกินถูกปฏิเสธ'
);
select throws_ok(
  $$ select * from public.delete_problem(-1, 'x') $$,
  'P0001', 'PROBLEM_NOT_FOUND', 'โจทย์ที่ไม่มีอยู่แจ้ง PROBLEM_NOT_FOUND'
);
select results_eq(
  $$ select deleted_submissions, deleted_results from public.delete_problem((select p_used from ids), 'ข้อทดลอง') $$,
  $$ values (2, 1) $$,
  'อาจารย์ลบโจทย์ที่มีคนส่งได้ (ลบคำตอบ 2 คะแนน 1)'
);
select results_eq(
  $$ select deleted_submissions, deleted_results from public.delete_problem((select p_draft from ids), 'ข้อร่าง') $$,
  $$ values (0, 0) $$,
  'อาจารย์ลบโจทย์ที่ยังไม่มีคนส่งได้'
);
reset role;

-- ไม่มีข้อมูลค้าง
select is_empty($$ select 1 from public.problems where id in ((select p_used from ids), (select p_draft from ids)) $$, 'โจทย์ถูกลบ');
select is_empty($$ select 1 from public.problem_status where problem_id = (select p_used from ids) $$, 'สถานะถูกลบ');
select is_empty($$ select 1 from public.problem_solutions where problem_id = (select p_used from ids) $$, 'เฉลยถูกลบ');
select is_empty($$ select 1 from public.submissions where problem_id = (select p_used from ids) $$, 'คำตอบถูกลบ');
select is_empty($$ select 1 from public.results $$, 'คะแนนถูกลบ');

-- ปิดข้อก่อนลบ → นิสิตได้ broadcast is_open = false
select ok(
  exists (select 1 from realtime.messages
          where topic = 'problem-state' and inserted_at >= (select at from t0)::timestamp
            and payload->>'problem_id' = (select p_used from ids)::text
            and (payload->>'is_open')::boolean = false),
  'ข้อที่เปิดอยู่ถูกปิดก่อนลบ (ส่ง problem-state is_open = false)'
);

select * from finish();
rollback;
