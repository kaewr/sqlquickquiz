-- กฎของ results: คะแนนไม่เกินคะแนนเต็ม, คะแนนอัตโนมัติห้ามทับผลที่ให้ด้วยมือ
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(9);

create temp table ids as
select tests.create_student('65000501') as s1,
       tests.create_student('65000502') as s2,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('max5', true, 5) as p1;
grant select on ids to authenticated;

select tests.login_as(s1) from ids;
select public.submit_answer((select p1 from ids), 'SELECT 1;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select p1 from ids), 'SELECT 2;');
reset role;

create temp table subs as
select (select id from public.submissions where student_user_id = (select s1 from ids)) as sub1,
       (select id from public.submissions where student_user_id = (select s2 from ids)) as sub2;
grant select on subs to authenticated;

select tests.login_as(t1) from ids;

select throws_ok(
  $$ insert into public.results (submission_id, score, verdict) values ((select sub1 from subs), 5.5, 'correct') $$,
  'P0001', 'SCORE_OUT_OF_RANGE', 'คะแนนเกินคะแนนเต็มถูกปฏิเสธ'
);
select throws_ok(
  $$ insert into public.results (submission_id, score, verdict) values ((select sub1 from subs), -1, 'incorrect') $$,
  '23514', null, 'คะแนนติดลบถูกปฏิเสธ'
);
select lives_ok(
  $$ insert into public.results (submission_id, score, verdict) values ((select sub1 from subs), 2.5, 'partial') $$,
  'คะแนนครึ่ง (2.5) บันทึกได้'
);
select throws_ok(
  $$ insert into public.results (submission_id, score, verdict) values ((select sub1 from subs), 1, 'partial') $$,
  '23505', null, 'ผลตรวจซ้ำสำหรับคำตอบเดียวกันไม่ได้'
);

-- แก้คะแนนด้วยมือได้
select lives_ok(
  $$ update public.results set score = 5, verdict = 'correct' where submission_id = (select sub1 from subs) $$,
  'อาจารย์แก้คะแนนด้วยมือได้'
);

-- คะแนนอัตโนมัติห้ามทับผล manual
select throws_ok(
  $$ update public.results set score = 0, verdict = 'incorrect', source = 'auto'
     where submission_id = (select sub1 from subs) $$,
  'P0001', 'MANUAL_RESULT_PROTECTED', 'คะแนนอัตโนมัติทับผลที่ให้ด้วยมือไม่ได้'
);

-- ผล auto ถูกแทนด้วย manual ได้
select lives_ok(
  $$ insert into public.results (submission_id, score, verdict, source) values ((select sub2 from subs), 0, 'incorrect', 'auto') $$,
  'บันทึกผล auto ได้'
);
select lives_ok(
  $$ update public.results set score = 5, verdict = 'correct', source = 'manual' where submission_id = (select sub2 from subs) $$,
  'อาจารย์แก้ผล auto เป็น manual ได้'
);
select results_eq(
  $$ select score, source::text from public.results order by submission_id $$,
  $$ values (5.00::numeric(6,2), 'manual'), (5.00::numeric(6,2), 'manual') $$,
  'ค่าสุดท้ายถูกต้อง'
);

select * from finish();
rollback;
