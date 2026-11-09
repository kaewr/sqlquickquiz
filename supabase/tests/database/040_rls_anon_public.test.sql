-- ผู้ไม่ล็อกอิน: อ่านอะไรไม่ได้นอกจาก get_public_results / get_public_results ไม่คืน SQL หรือชื่อ
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(22);

create temp table ids as
select tests.create_student('65123678') as s1,
       tests.create_student('65876321') as s2,
       tests.create_student('65000303') as s3,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('ข้อประกาศแล้ว', true, 10) as p_rel,
       tests.create_problem('ข้อยังไม่ประกาศ', true, 10) as p_unrel;
grant select on ids to anon, authenticated;

select tests.login_as(s1) from ids;
select public.submit_answer((select p_rel from ids), 'SELECT secret_sql_s1 FROM t;');
select public.submit_answer((select p_unrel from ids), 'SELECT secret_sql_s1_b FROM t;');
reset role;
select tests.login_as(s2) from ids;
select public.submit_answer((select p_rel from ids), 'SELECT secret_sql_s2 FROM t;');
reset role;
select tests.login_as(s3) from ids;
select public.submit_answer((select p_rel from ids), 'SELECT secret_sql_s3 FROM t;');
reset role;
-- ให้คะแนน s1, s2 (s3 ยังไม่ได้ให้คะแนน)
insert into public.results (submission_id, score, verdict)
select s.id, case when s.student_user_id = (select s1 from ids) then 10 else 5 end,
       case when s.student_user_id = (select s1 from ids) then 'correct'::public.verdict else 'partial' end
from public.submissions s where s.student_user_id in ((select s1 from ids), (select s2 from ids));

create temp table tok (rel text, unrel text);
grant select, insert on tok to anon, authenticated;
select tests.login_as(t1) from ids;
insert into tok (rel) select public_token from public.release_results((select p_rel from ids));
reset role;

-- ================= ผู้ไม่ล็อกอิน: อ่านตารางไม่ได้ =================
select tests.login_anon();

select throws_ok($$ select * from public.instructors $$,       '42501', null, 'anon อ่าน instructors ไม่ได้');
select throws_ok($$ select * from public.profiles $$,          '42501', null, 'anon อ่าน profiles ไม่ได้');
select throws_ok($$ select * from public.problems $$,          '42501', null, 'anon อ่าน problems ไม่ได้');
select throws_ok($$ select * from public.problem_solutions $$, '42501', null, 'anon อ่าน problem_solutions ไม่ได้');
select throws_ok($$ select * from public.problem_status $$,    '42501', null, 'anon อ่าน problem_status ไม่ได้');
select throws_ok($$ select * from public.submissions $$,       '42501', null, 'anon อ่าน submissions ไม่ได้');
select throws_ok($$ select * from public.results $$,           '42501', null, 'anon อ่าน results ไม่ได้');
select throws_ok($$ select * from public.grading_jobs $$,      '42501', null, 'anon อ่าน grading_jobs ไม่ได้');
select throws_ok($$ select * from public.v_daily_problem_summary $$,  '42501', null, 'anon อ่าน view สรุปรายวันไม่ได้');
select throws_ok($$ select * from public.v_student_problem_scores $$, '42501', null, 'anon อ่าน view รายงานรายคนไม่ได้');
select throws_ok($$ select public.release_results(1) $$,       '42501', null, 'anon เรียก release_results ไม่ได้');

-- ================= get_public_results =================
select results_eq(
  $$ select submit_order, student_id_masked, score
     from public.get_public_results((select rel from tok)) order by submit_order $$,
  $$ values (1, '65xxx678', 10.00::numeric(6,2)),
            (2, '65xxx321', 5.00::numeric(6,2)),
            (3, '65xxx303', null::numeric(6,2)) $$,
  'anon ได้อันดับตามเวลาส่ง รหัสปิดบางส่วน และคะแนน (ยังไม่ให้คะแนน = ว่าง)'
);
select results_eq(
  $$ select distinct problem_title, max_score from public.get_public_results((select rel from tok)) $$,
  $$ values ('ข้อประกาศแล้ว'::text, 10.00::numeric(6,2)) $$,
  'คืนชื่อโจทย์และคะแนนเต็ม'
);

-- ไม่มีคอลัมน์ SQL / ชื่อ / user_id / รหัสเต็ม
select is_empty(
  $$ select 1 from information_schema.parameters p
     join information_schema.routines r on r.specific_name = p.specific_name
     where r.routine_schema = 'public' and r.routine_name = 'get_public_results'
       and p.parameter_mode = 'OUT'
       and p.parameter_name not in ('problem_title', 'max_score', 'problem_date', 'released_at',
                                    'submit_order', 'student_id_masked', 'score', 'submitted_at') $$,
  'get_public_results คืนเฉพาะคอลัมน์ที่อนุญาต'
);
select is_empty(
  $$ select 1 from public.get_public_results((select rel from tok)) g
     where g::text ilike '%secret_sql%' or g::text ilike '%SELECT%' $$,
  'get_public_results ไม่คืน SQL'
);
select is_empty(
  $$ select 1 from public.get_public_results((select rel from tok)) g
     where g::text like '%ชื่อ65%' or g::text like '%นามสกุล%'
        or g::text like '%65123678%' or g::text like '%65876321%' $$,
  'get_public_results ไม่คืนชื่อและรหัสนิสิตเต็ม'
);

-- token ผิด / ข้อที่ยังไม่ประกาศ
select is_empty($$ select * from public.get_public_results('no-such-token-xxxxxxxx') $$, 'token ผิดได้ผลว่าง');
select is_empty($$ select * from public.get_public_results(null) $$, 'token null ได้ผลว่าง');
select is_empty($$ select * from public.get_public_results('') $$, 'token ว่างได้ผลว่าง');

reset role;
select results_eq(
  $$ select public_token is null, results_released_at is null from public.problems where id = (select p_unrel from ids) $$,
  $$ values (true, true) $$,
  'ข้อที่ยังไม่ประกาศไม่มี token'
);

-- นิสิตที่ล็อกอินเรียกได้เหมือนกัน
select tests.login_as(s3) from ids;
select results_eq(
  $$ select count(*)::int from public.get_public_results((select rel from tok)) $$,
  $$ values (3) $$,
  'นิสิตที่ล็อกอินเรียก get_public_results ได้ (เห็นทุกคนในข้อนั้น)'
);
reset role;

-- token เดาไม่ได้: ยาว >= 16 และใช้อักขระ URL-safe
select ok(
  (select length(rel) >= 16 and rel ~ '^[A-Za-z0-9_-]+$' from tok),
  'public_token ยาวอย่างน้อย 16 ตัว และใช้อักขระ URL-safe'
);

select * from finish();
rollback;
