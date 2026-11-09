-- อาจารย์: is_instructor, สิทธิ์ทุกตาราง, เปิด/ปิดโจทย์, release_results
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(27);

create temp table ids as
select tests.create_instructor('Teacher@Example.com') as t1,
       -- สมัครด้วยรหัสผ่านโดยใช้อีเมลเดียวกับอาจารย์คนอื่น (ไม่ใช่ Google)
       tests.create_user('teacher2@example.com', 'email') as fake_t,
       -- ล็อกอิน Google แต่อีเมลไม่อยู่ใน instructors
       tests.create_user('stranger@gmail.com', 'google') as stranger,
       tests.create_student('65000401') as s1,
       tests.create_student('65000402') as s2;
insert into public.instructors (email) values ('teacher2@example.com');
grant select on ids to authenticated;

-- ---------- is_instructor ----------
select tests.login_as(t1) from ids;
select ok(public.is_instructor(), 'อาจารย์ Google ที่อยู่ใน instructors ผ่าน (ไม่สนตัวพิมพ์ใหญ่เล็ก)');
reset role;
select tests.login_as(fake_t) from ids;
select ok(not public.is_instructor(), 'ผู้ใช้รหัสผ่านที่ใช้อีเมลอาจารย์ ไม่ผ่าน is_instructor');
select is_empty($$ select 1 from public.problem_solutions $$, 'ผู้ใช้รหัสผ่านที่ใช้อีเมลอาจารย์ อ่านเฉลยไม่ได้');
reset role;
select tests.login_as(stranger) from ids;
select ok(not public.is_instructor(), 'Google ที่อีเมลไม่อยู่ใน instructors ไม่ผ่าน');
select is_empty($$ select 1 from public.profiles $$, 'ผู้ใช้ Google ทั่วไปอ่าน profiles ไม่ได้');
reset role;
select tests.login_anon();
select ok(not public.is_instructor(), 'ผู้ไม่ล็อกอินไม่ใช่อาจารย์');
reset role;

-- ---------- อาจารย์จัดการโจทย์ ----------
select tests.login_as(t1) from ids;

select lives_ok(
  $$ insert into public.problems (title, description, max_score, order_matters, dataset_name)
     values ('โจทย์อาจารย์', 'คำอธิบาย', 5, true, 'world') $$,
  'อาจารย์สร้างโจทย์ได้'
);
select lives_ok(
  $$ insert into public.problem_solutions (problem_id, reference_sql)
     select id, 'SELECT * FROM city;' from public.problems where title = 'โจทย์อาจารย์' $$,
  'อาจารย์เพิ่มเฉลยได้'
);
select results_eq(
  $$ select reference_sql from public.problem_solutions s join public.problems p on p.id = s.problem_id
     where p.title = 'โจทย์อาจารย์' $$,
  $$ values ('SELECT * FROM city;') $$,
  'อาจารย์อ่านเฉลยได้'
);
select results_eq(
  $$ select is_open, opened_at is null from public.problem_status s join public.problems p on p.id = s.problem_id
     where p.title = 'โจทย์อาจารย์' $$,
  $$ values (false, true) $$,
  'โจทย์ใหม่เริ่มต้นปิด'
);

-- เปิด: opened_at = เวลาเปิดครั้งแรก
update public.problem_status set is_open = true
where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์');
select results_eq(
  $$ select is_open, opened_at = now(), closed_at is null from public.problem_status
     where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์') $$,
  $$ values (true, true, true) $$,
  'อาจารย์เปิดโจทย์ได้ และ opened_at ถูกตั้งเป็นเวลาฐานข้อมูล'
);
-- ปิด: closed_at ถูกตั้ง
update public.problem_status set is_open = false
where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์');
select results_eq(
  $$ select is_open, closed_at is not null from public.problem_status
     where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์') $$,
  $$ values (false, true) $$,
  'อาจารย์ปิดโจทย์ได้ และ closed_at ถูกตั้ง'
);
-- เปิดซ้ำ: opened_at ไม่ถูกเขียนทับ
reset role;
update public.problem_status set opened_at = '2026-01-01 09:00+07'
where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์');
select tests.login_as(t1) from ids;
update public.problem_status set is_open = true
where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์');
select results_eq(
  $$ select opened_at from public.problem_status
     where problem_id = (select id from public.problems where title = 'โจทย์อาจารย์') $$,
  $$ values ('2026-01-01 09:00+07'::timestamptz) $$,
  'เปิดซ้ำแล้ว opened_at ยังเป็นเวลาเปิดครั้งแรก'
);
select throws_ok(
  $$ update public.problem_status set submission_count = 99 $$,
  '42501', null, 'อาจารย์แก้ตัวนับเองไม่ได้'
);
select throws_ok(
  $$ update public.problem_status set opened_at = now() $$,
  '42501', null, 'อาจารย์แก้ opened_at เองไม่ได้'
);

-- เปิดหลายข้อพร้อมกันได้
select lives_ok(
  $$ insert into public.problems (title) values ('ข้อ A'), ('ข้อ B');
     update public.problem_status set is_open = true
     where problem_id in (select id from public.problems where title in ('ข้อ A', 'ข้อ B')) $$,
  'เปิดหลายข้อพร้อมกันได้'
);
select results_eq(
  $$ select count(*)::int from public.problem_status where is_open $$,
  $$ values (3) $$,
  'มี 3 ข้อเปิดพร้อมกัน'
);

-- ---------- นิสิตส่ง แล้วอาจารย์เห็นทุกคน ----------
reset role;
select tests.login_as(s1) from ids;
select public.submit_answer((select id from public.problems where title = 'โจทย์อาจารย์'), 'SELECT 1;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select id from public.problems where title = 'โจทย์อาจารย์'), 'SELECT 2;');
reset role;
select tests.login_as(t1) from ids;

select results_eq(
  $$ select count(*)::int from public.submissions $$, $$ values (2) $$,
  'อาจารย์อ่าน submissions ทั้งหมดได้'
);
select results_eq(
  $$ select count(*)::int from public.profiles $$, $$ values (2) $$,
  'อาจารย์อ่าน profiles ทั้งหมดได้'
);
select lives_ok(
  $$ update public.profiles set is_active = false where student_id = '65000402' $$,
  'อาจารย์ปิดบัญชีนิสิตได้'
);
select throws_ok(
  $$ update public.submissions set sql_text = 'x' $$,
  '42501', null, 'อาจารย์ก็แก้คำตอบของนิสิตไม่ได้'
);

-- ให้คะแนน
select lives_ok(
  $$ insert into public.results (submission_id, score, verdict, feedback)
     select id, 5, 'correct', 'ถูกต้อง' from public.submissions $$,
  'อาจารย์ให้คะแนนได้'
);
select results_eq(
  $$ select count(*)::int from public.results where graded_by = (select t1 from ids) and source = 'manual' $$,
  $$ values (2) $$,
  'ผลที่อาจารย์ให้บันทึก graded_by และ source = manual'
);

-- ---------- release_results ----------
select results_eq(
  $$ select results_released_at = now(), length(public_token) >= 16
     from public.release_results((select id from public.problems where title = 'โจทย์อาจารย์')) $$,
  $$ values (true, true) $$,
  'release_results ตั้งเวลาประกาศและสร้าง token พร้อมกัน'
);
create temp table first_tok as
select public_token from public.problems where title = 'โจทย์อาจารย์';
select results_eq(
  $$ select public_token from public.release_results((select id from public.problems where title = 'โจทย์อาจารย์')) $$,
  $$ select public_token from first_tok $$,
  'เรียก release_results ซ้ำได้ token เดิม'
);
select throws_ok(
  $$ select public.release_results(-1) $$,
  'P0001', 'PROBLEM_NOT_FOUND', 'release_results ข้อที่ไม่มีอยู่แจ้ง PROBLEM_NOT_FOUND'
);

-- ---------- grading_jobs ----------
select lives_ok(
  $$ insert into public.grading_jobs (problem_id, total)
     select id, 2 from public.problems where title = 'โจทย์อาจารย์' $$,
  'อาจารย์สร้าง grading_jobs ได้'
);

select * from finish();
rollback;
