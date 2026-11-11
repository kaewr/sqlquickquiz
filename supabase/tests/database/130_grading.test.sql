-- ระยะที่ 5: verdict จากคะแนน, คำนวณใหม่เมื่อแก้คะแนนเต็ม, การมองเห็นผลก่อน/หลังประกาศ
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(18);

create temp table ids as
select tests.create_student('65004001') as s1,
       tests.create_student('65004002') as s2,
       tests.create_student('65004003') as s3,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('grading', true, 10) as p1;
grant select on ids to authenticated;

select tests.login_as(s1) from ids; select public.submit_answer((select p1 from ids), 'SELECT 1;'); reset role;
select tests.login_as(s2) from ids; select public.submit_answer((select p1 from ids), 'SELECT 2;'); reset role;
select tests.login_as(s3) from ids; select public.submit_answer((select p1 from ids), 'SELECT 3;'); reset role;

create temp table subs as
select (select id from public.submissions where student_user_id = (select s1 from ids)) as sub1,
       (select id from public.submissions where student_user_id = (select s2 from ids)) as sub2,
       (select id from public.submissions where student_user_id = (select s3 from ids)) as sub3;
grant select on subs to authenticated;

-- ================= verdict =================
select tests.login_as(t1) from ids;

select lives_ok(
  $$ insert into public.results (submission_id, score, feedback) values ((select sub1 from subs), 10, 'ดีมาก') $$,
  'บันทึกคะแนนโดยไม่ส่ง verdict ได้'
);
select lives_ok(
  $$ insert into public.results (submission_id, score, verdict) values ((select sub2 from subs), 5, 'correct') $$,
  'ส่ง verdict ที่ไม่ตรงกับคะแนนมาได้ (จะถูกแก้)'
);
select lives_ok(
  $$ insert into public.results (submission_id, score) values ((select sub3 from subs), 0) $$,
  'คะแนน 0 บันทึกได้'
);
select results_eq(
  $$ select submission_id, verdict::text from public.results order by submission_id $$,
  $$ values ((select sub1 from subs), 'correct'), ((select sub2 from subs), 'partial'), ((select sub3 from subs), 'incorrect') $$,
  'verdict: เต็ม = correct, บางส่วน = partial, 0 = incorrect'
);
select results_eq(
  $$ select count(*)::int from public.results where graded_by = (select t1 from ids) and source = 'manual' $$,
  $$ values (3) $$,
  'graded_by = อาจารย์ที่ให้คะแนน, source = manual'
);

update public.results set score = 10 where submission_id = (select sub2 from subs);
select results_eq(
  $$ select verdict::text from public.results where submission_id = (select sub2 from subs) $$,
  $$ values ('correct') $$,
  'แก้คะแนนเป็นเต็ม → verdict เปลี่ยนเป็น correct'
);
select results_eq(
  $$ with u as (update public.results set verdict = 'incorrect'
                where submission_id = (select sub1 from subs) returning verdict::text)
     select * from u $$,
  $$ values ('correct') $$,
  'แก้ verdict ตรงๆ ไม่ได้ (คำนวณจากคะแนนเสมอ)'
);
select throws_ok(
  $$ update public.results set feedback = repeat('ก', 2001) where submission_id = (select sub1 from subs) $$,
  '23514', null, 'ความเห็นยาวเกิน 2,000 ตัวอักษรถูกปฏิเสธ'
);
select lives_ok(
  $$ update public.results set feedback = repeat('ก', 2000) where submission_id = (select sub1 from subs) $$,
  'ความเห็นยาว 2,000 ตัวอักษรพอดีบันทึกได้'
);
select throws_ok(
  $$ update public.results set score = 10.5 where submission_id = (select sub1 from subs) $$,
  'P0001', 'SCORE_OUT_OF_RANGE', 'คะแนนเกินคะแนนเต็มถูกปฏิเสธ'
);

-- ================= แก้คะแนนเต็ม → verdict คำนวณใหม่ =================
-- ตอนนี้: sub1 = 10, sub2 = 10, sub3 = 0 (เต็ม 10) → ปรับ sub1 = 8, sub2 = 6 แล้วลดคะแนนเต็มเป็น 8
update public.results set score = 8 where submission_id = (select sub1 from subs);
update public.results set score = 6 where submission_id = (select sub2 from subs);
reset role;
-- ตั้งเวลาให้คะแนนเก่า (trigger กันการแก้ graded_at ตรงๆ จึงปิดชั่วคราวใน transaction ของเทสต์)
alter table public.results disable trigger results_validate;
update public.results set graded_at = '2026-01-01 10:00+07' where submission_id = (select sub1 from subs);
alter table public.results enable trigger results_validate;
select tests.login_as(t1) from ids;

update public.problems set max_score = 8 where id = (select p1 from ids);
select results_eq(
  $$ select submission_id, verdict::text from public.results order by submission_id $$,
  $$ values ((select sub1 from subs), 'correct'), ((select sub2 from subs), 'partial'), ((select sub3 from subs), 'incorrect') $$,
  'ลดคะแนนเต็มเป็น 8 → คนที่ได้ 8 กลายเป็น correct'
);
select results_eq(
  $$ select graded_at from public.results where submission_id = (select sub1 from subs) $$,
  $$ values ('2026-01-01 10:00+07'::timestamptz) $$,
  'คำนวณ verdict ใหม่ไม่เปลี่ยนเวลาให้คะแนน'
);
update public.problems set max_score = 10 where id = (select p1 from ids);
select results_eq(
  $$ select verdict::text from public.results where submission_id = (select sub1 from subs) $$,
  $$ values ('partial') $$,
  'เพิ่มคะแนนเต็มกลับเป็น 10 → คนที่ได้ 8 กลับเป็น partial'
);
reset role;

-- ================= การมองเห็นของนิสิต =================
select tests.login_as(s2) from ids;
select is_empty($$ select 1 from public.results $$, 'ก่อนประกาศ: นิสิตไม่เห็นผลแม้อาจารย์ให้คะแนนแล้ว');
reset role;

select tests.login_as(t1) from ids;
update public.problem_status set is_open = false where problem_id = (select p1 from ids);
select public.release_results((select p1 from ids));
reset role;

select tests.login_as(s2) from ids;
select results_eq(
  $$ select submission_id, score, verdict::text from public.results $$,
  $$ values ((select sub2 from subs), 6.00::numeric(6,2), 'partial') $$,
  'หลังประกาศ: นิสิตเห็นผลของตัวเองเท่านั้น'
);
reset role;

-- แก้คะแนนหลังประกาศ → นิสิตเห็นค่าล่าสุด
select tests.login_as(t1) from ids;
update public.results set score = 10, feedback = 'ตรวจใหม่แล้วถูก' where submission_id = (select sub2 from subs);
reset role;
select tests.login_as(s2) from ids;
select results_eq(
  $$ select score, verdict::text, feedback from public.results $$,
  $$ values (10.00::numeric(6,2), 'correct', 'ตรวจใหม่แล้วถูก') $$,
  'แก้คะแนนหลังประกาศ → นิสิตเห็นค่าล่าสุด'
);
select throws_ok(
  $$ insert into public.results (submission_id, score) values ((select sub2 from subs), 10) $$,
  '42501', null, 'นิสิตให้คะแนนตัวเองไม่ได้'
);
reset role;

-- คนที่ยังไม่ได้ให้คะแนนตอนประกาศ: ไม่มีผล (หน้าเว็บแสดง "รอตรวจ")
select tests.login_as(t1) from ids;
delete from public.results where submission_id = (select sub3 from subs);
reset role;
select tests.login_as(s3) from ids;
select is_empty($$ select 1 from public.results $$, 'คนที่ยังไม่ได้ให้คะแนนหลังประกาศ: ยังไม่มีผล (รอตรวจ)');
reset role;

select * from finish();
rollback;
