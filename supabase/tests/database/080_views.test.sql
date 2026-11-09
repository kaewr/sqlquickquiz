-- view รายงาน: แบ่งวันตาม Asia/Bangkok, รายงานรายคนแยก "ไม่ได้ส่ง" กับ "ยังไม่ให้คะแนน"
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(8);

create temp table ids as
select tests.create_student('65000801', 'A') as s1,
       tests.create_student('65000802', 'B') as s2,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('ค่ำวันที่ 9', true) as p_a,       -- 2026-11-08 17:30 UTC = 9 พ.ย. 00:30 BKK
       tests.create_problem('ปลายวันที่ 9', true) as p_b,      -- 2026-11-09 16:59 UTC = 9 พ.ย. 23:59 BKK
       tests.create_problem('ต้นวันที่ 10', false) as p_c,     -- 2026-11-09 17:00 UTC = 10 พ.ย. 00:00 BKK
       tests.create_problem('ไม่เคยเปิด', false) as p_never;
grant select on ids to authenticated;

update public.problem_status set is_open = true where problem_id = (select p_c from ids);
update public.problem_status set opened_at = '2026-11-08 17:30:00+00' where problem_id = (select p_a from ids);
update public.problem_status set opened_at = '2026-11-09 16:59:00+00' where problem_id = (select p_b from ids);
update public.problem_status set opened_at = '2026-11-09 17:00:00+00' where problem_id = (select p_c from ids);

-- s1 ส่ง p_a (ให้คะแนน 8), s2 ส่ง p_b (ยังไม่ให้คะแนน)
select tests.login_as(s1) from ids;
select public.submit_answer((select p_a from ids), 'SELECT 1;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select p_b from ids), 'SELECT 2;');
reset role;
insert into public.results (submission_id, score, verdict)
select id, 8, 'partial' from public.submissions where student_user_id = (select s1 from ids);

select tests.login_as(t1) from ids;

-- ---------- สรุปรายวัน ----------
select results_eq(
  $$ select day, title, submission_count, problems_in_day::int
     from public.v_daily_problem_summary order by day, title $$,
  $$ values ('2026-11-09'::date, 'ค่ำวันที่ 9'::text, 1, 2),
            ('2026-11-09'::date, 'ปลายวันที่ 9'::text, 1, 2),
            ('2026-11-10'::date, 'ต้นวันที่ 10'::text, 0, 1) $$,
  'สรุปรายวันแบ่งวันตามเวลากรุงเทพ และไม่รวมข้อที่ไม่เคยเปิด'
);

-- ---------- รายงานรายคน ----------
select results_eq(
  $$ select count(*)::int from public.v_student_problem_scores $$,
  $$ values (6) $$,
  'รายงานรายคน = นิสิต 2 คน × โจทย์ที่เคยเปิด 3 ข้อ'
);
select results_eq(
  $$ select submitted, score from public.v_student_problem_scores
     where student_id = '65000801' and problem_id = (select p_a from ids) $$,
  $$ values (true, 8.00::numeric(6,2)) $$,
  'ส่งแล้วและให้คะแนนแล้ว แสดงคะแนน'
);
select results_eq(
  $$ select submitted, score from public.v_student_problem_scores
     where student_id = '65000801' and problem_id = (select p_b from ids) $$,
  $$ values (false, null::numeric(6,2)) $$,
  'ไม่ได้ส่ง: submitted = false คะแนนว่าง'
);
select results_eq(
  $$ select submitted, score from public.v_student_problem_scores
     where student_id = '65000802' and problem_id = (select p_b from ids) $$,
  $$ values (true, null::numeric(6,2)) $$,
  'ส่งแล้วแต่ยังไม่ให้คะแนน: submitted = true คะแนนว่าง'
);
select results_eq(
  $$ select section, day from public.v_student_problem_scores
     where student_id = '65000802' and problem_id = (select p_c from ids) $$,
  $$ values ('B'::text, '2026-11-10'::date) $$,
  'รายงานรายคนมีตอนเรียนและวันของโจทย์ (กรองได้)'
);

-- ---------- นิสิตเห็นเฉพาะของตัวเองผ่าน view ----------
reset role;
select tests.login_as(s2) from ids;
select is_empty(
  $$ select 1 from public.v_student_problem_scores where student_id <> '65000802' $$,
  'นิสิตเห็นรายงานรายคนเฉพาะของตัวเอง'
);
select is_empty(
  $$ select 1 from public.v_student_problem_scores where score is not null $$,
  'นิสิตไม่เห็นคะแนนที่ยังไม่ประกาศผ่าน view'
);

select * from finish();
rollback;
