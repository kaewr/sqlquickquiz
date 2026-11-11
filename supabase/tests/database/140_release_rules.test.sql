-- ระยะ 7.2: เงื่อนไขประกาศผล (ปิดรับแล้ว + ให้คะแนนครบ + มีผู้ส่ง) และห้ามเปิดข้อที่ประกาศแล้ว
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(14);

create temp table ids as
select tests.create_student('65007001') as s1,
       tests.create_student('65007002') as s2,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('rules', true, 10) as p1,
       tests.create_problem('empty', true, 10) as p_empty,
       tests.create_problem('other', false, 10) as p_other;
grant select on ids to authenticated;

select tests.login_as(s1) from ids; select public.submit_answer((select p1 from ids), 'SELECT 1;'); reset role;
select tests.login_as(s2) from ids; select public.submit_answer((select p1 from ids), 'SELECT 2;'); reset role;

select tests.login_as(t1) from ids;

-- ---------- ยังเปิดรับอยู่ ----------
select throws_ok(
  $$ select public.release_results((select p1 from ids)) $$,
  'P0001', 'PROBLEM_STILL_OPEN', 'ข้อยังเปิดรับคำตอบ → ประกาศไม่ได้'
);

update public.problem_status set is_open = false where problem_id in ((select p1 from ids), (select p_empty from ids));

-- ---------- ไม่มีผู้ส่ง ----------
select throws_ok(
  $$ select public.release_results((select p_empty from ids)) $$,
  'P0001', 'NO_SUBMISSIONS', 'ยังไม่มีใครส่ง → ประกาศไม่ได้'
);

-- ---------- ยังให้คะแนนไม่ครบ ----------
select throws_ok(
  $$ select public.release_results((select p1 from ids)) $$,
  'P0001', 'UNGRADED_SUBMISSIONS', 'ยังไม่ได้ให้คะแนนเลย → ประกาศไม่ได้'
);
insert into public.results (submission_id, score)
select id, 10 from public.submissions where student_user_id = (select s1 from ids);
select throws_ok(
  $$ select public.release_results((select p1 from ids)) $$,
  'P0001', 'UNGRADED_SUBMISSIONS', 'ให้คะแนนแล้ว 1 จาก 2 → ประกาศไม่ได้'
);
select results_eq(
  $$ select results_released_at is null, public_token is null from public.problems where id = (select p1 from ids) $$,
  $$ values (true, true) $$,
  'ประกาศไม่สำเร็จ → ไม่ตั้งเวลาประกาศและไม่สร้าง token'
);

-- ---------- ครบเงื่อนไข ----------
insert into public.results (submission_id, score)
select id, 0 from public.submissions where student_user_id = (select s2 from ids);
select lives_ok(
  $$ select public.release_results((select p1 from ids)) $$,
  'ปิดรับแล้ว + ให้คะแนนครบ (รวมคะแนน 0) → ประกาศได้'
);
select ok(
  (select results_released_at is not null and public_token is not null from public.problems where id = (select p1 from ids)),
  'ประกาศแล้วมีเวลาประกาศและ token'
);

-- ---------- ห้ามเปิดข้อที่ประกาศแล้ว ----------
select throws_ok(
  $$ update public.problem_status set is_open = true where problem_id = (select p1 from ids) $$,
  'P0001', 'PROBLEM_RELEASED', 'ข้อที่ประกาศผลแล้วเปิดรับคำตอบอีกไม่ได้'
);
select results_eq(
  $$ select is_open from public.problem_status where problem_id = (select p1 from ids) $$,
  $$ values (false) $$,
  'ข้อที่ประกาศแล้วยังปิดอยู่'
);
select lives_ok(
  $$ update public.problem_status set is_open = false where problem_id = (select p1 from ids) $$,
  'สั่งปิดซ้ำข้อที่ประกาศแล้วได้ (ไม่มีผล)'
);
select lives_ok(
  $$ update public.problem_status set is_open = true where problem_id = (select p_other from ids) $$,
  'ข้อที่ยังไม่ประกาศเปิดได้ตามปกติ'
);

-- ---------- หลังประกาศ ----------
-- แก้คะแนนได้ และเรียกประกาศซ้ำได้ token เดิม (ไม่ตรวจเงื่อนไขซ้ำ)
select lives_ok(
  $$ update public.results set score = 7
      where submission_id = (select id from public.submissions where student_user_id = (select s2 from ids)) $$,
  'แก้คะแนนหลังประกาศได้'
);
select results_eq(
  $$ select public_token from public.release_results((select p1 from ids)) $$,
  $$ select public_token from public.problems where id = (select p1 from ids) $$,
  'เรียกประกาศซ้ำได้ token เดิม'
);

-- อันดับคะแนนคำนวณใหม่ตามคะแนนล่าสุด
reset role;
create temp table tok as select public_token from public.problems where id = (select p1 from ids);
grant select on tok to anon;
select tests.login_anon();
select results_eq(
  $$ select submit_order, score_rank from public.get_public_results((select public_token from tok)) order by submit_order $$,
  $$ values (1, 1), (2, 2) $$,
  'อันดับคะแนนใช้คะแนนล่าสุด (10 > 7)'
);
reset role;

select * from finish();
rollback;
