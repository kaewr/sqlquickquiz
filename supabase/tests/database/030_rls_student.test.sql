-- RLS ฝั่งนิสิต: เห็นเฉพาะของตัวเอง, ไม่เห็นเฉลย, ไม่เห็นผลก่อนประกาศ
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(24);

create temp table ids as
select tests.create_student('65000201', '1') as s1,
       tests.create_student('65000202', '2') as s2,
       tests.create_student('65000203', '1', false) as s_inactive,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('p-released', true) as p_rel,
       tests.create_problem('p-graded-unreleased', true) as p_unrel,
       tests.create_problem('p-never-opened', false) as p_hidden;
grant select on ids to authenticated;

-- s1, s2 ส่งทั้ง 2 ข้อ แล้วอาจารย์ให้คะแนนทุกคน
select tests.login_as(s1) from ids;
select public.submit_answer((select p_rel from ids), 'SELECT s1_rel;');
select public.submit_answer((select p_unrel from ids), 'SELECT s1_unrel;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select p_rel from ids), 'SELECT s2_rel;');
select public.submit_answer((select p_unrel from ids), 'SELECT s2_unrel;');
reset role;
insert into public.results (submission_id, score, verdict, feedback)
select id, 10, 'correct', 'ดีมาก' from public.submissions;
create temp table s2_subs as
select id from public.submissions where student_user_id = (select s2 from ids);
grant select on s2_subs to authenticated;
-- ประกาศผลข้อ p_rel อย่างเดียว แล้วปิดข้อ p_unrel
select tests.login_as(t1) from ids;
update public.problem_status set is_open = false where problem_id = (select p_rel from ids);
select public.release_results((select p_rel from ids));
update public.problem_status set is_open = false where problem_id = (select p_unrel from ids);
reset role;

-- ================= นิสิต s1 =================
select tests.login_as(s1) from ids;

-- submissions
select results_eq(
  $$ select count(*)::int from public.submissions $$, $$ values (2) $$,
  'นิสิตเห็น submissions ของตัวเองเท่านั้น (2 แถว)'
);
select is_empty(
  $$ select 1 from public.submissions where student_user_id = (select s2 from ids) $$,
  'นิสิตอ่าน submissions ของคนอื่นไม่ได้'
);

-- results
select results_eq(
  $$ select r.score from public.results r $$, $$ values (10.00::numeric(6,2)) $$,
  'นิสิตเห็น results ของตัวเองเฉพาะข้อที่ประกาศแล้ว (1 แถว)'
);
select is_empty(
  $$ select 1 from public.results r join public.submissions s on s.id = r.submission_id
     where s.problem_id = (select p_unrel from ids) $$,
  'นิสิตอ่าน results ก่อนประกาศไม่ได้ แม้อาจารย์ให้คะแนนแล้ว'
);
select is_empty(
  $$ select 1 from public.results where submission_id in (select id from s2_subs) $$,
  'นิสิตอ่าน results ของคนอื่นไม่ได้ (แม้ข้อประกาศแล้ว)'
);

-- problem_solutions
select is_empty($$ select 1 from public.problem_solutions $$, 'นิสิตอ่าน problem_solutions ไม่ได้');
select throws_ok(
  $$ insert into public.problem_solutions (problem_id, reference_sql) values ((select p_hidden from ids), 'x') $$,
  '42501', null, 'นิสิตเพิ่มเฉลยไม่ได้'
);

-- problems: เห็นข้อที่เปิดอยู่ + ข้อที่ตัวเองเคยส่ง ไม่เห็นข้อที่ไม่เคยเปิด
select set_eq(
  $$ select title from public.problems $$,
  $$ values ('p-released'), ('p-graded-unreleased') $$,
  'นิสิตเห็นโจทย์ที่เปิดอยู่และที่ตัวเองเคยส่ง ไม่เห็นข้อที่ยังไม่เปิด'
);
select results_eq(
  $$ with u as (update public.problems set title = 'hack' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'นิสิตแก้โจทย์ไม่ได้'
);

-- problem_status: อ่านได้ แก้ไม่ได้
select ok((select count(*) from public.problem_status) >= 3, 'นิสิตอ่าน problem_status ได้');
select results_eq(
  $$ with u as (update public.problem_status set is_open = true returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'นิสิตเปิด/ปิดโจทย์ไม่ได้'
);
select throws_ok(
  $$ update public.problem_status set submission_count = 0 $$,
  '42501', null, 'นิสิตแก้ตัวนับไม่ได้'
);

-- results: แก้คะแนนตัวเองไม่ได้
select results_eq(
  $$ with u as (update public.results set score = 0 returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'นิสิตแก้คะแนนไม่ได้'
);

-- profiles
select results_eq(
  $$ select student_id from public.profiles $$, $$ values ('65000201') $$,
  'นิสิตอ่าน profiles ได้เฉพาะของตัวเอง'
);
select results_eq(
  $$ with u as (update public.profiles set first_name = 'แก้ชื่อ', is_active = true returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'นิสิตแก้ profiles ตรงไม่ได้'
);
select lives_ok($$ select public.mark_password_changed() $$, 'นิสิตเรียก mark_password_changed ได้');
select results_eq(
  $$ select password_changed from public.profiles $$, $$ values (true) $$,
  'mark_password_changed ตั้ง password_changed = true ของตัวเอง'
);

-- ตารางของอาจารย์
select is_empty($$ select 1 from public.instructors $$, 'นิสิตอ่าน instructors ไม่ได้');
select is_empty($$ select 1 from public.grading_jobs $$, 'นิสิตอ่าน grading_jobs ไม่ได้');
select ok(not public.is_instructor(), 'นิสิตไม่ใช่อาจารย์');

-- release_results เรียกไม่ได้
select throws_ok(
  $$ select public.release_results((select p_unrel from ids)) $$,
  '42501', 'NOT_INSTRUCTOR', 'นิสิตประกาศผลไม่ได้'
);

-- ================= s2 ไม่ถูกกระทบจาก mark_password_changed ของ s1 =================
reset role;
select results_eq(
  $$ select password_changed from public.profiles where user_id = (select s2 from ids) $$,
  $$ values (false) $$,
  'mark_password_changed ไม่กระทบคนอื่น'
);

-- ================= นิสิตที่ถูกปิดบัญชี =================
select tests.login_as(s_inactive) from ids;
select is_empty($$ select 1 from public.problems $$, 'นิสิตที่ถูกปิดบัญชีไม่เห็นโจทย์ที่เปิดอยู่');
select is_empty($$ select 1 from public.problem_status $$, 'นิสิตที่ถูกปิดบัญชีไม่เห็น problem_status');

select * from finish();
rollback;
