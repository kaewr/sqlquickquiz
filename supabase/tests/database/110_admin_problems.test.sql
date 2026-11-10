-- ระยะที่ 4: Broadcast การส่งรายข้อให้อาจารย์ + กันลดคะแนนเต็มต่ำกว่าคะแนนที่ให้แล้ว
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(11);

create temp table ids as
select tests.create_student('65002001') as s1,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('admin-p', true, 10) as p1;
grant select on ids to anon, authenticated;
create temp table t0 as select now() as at;

create or replace function tests.sub_msgs()
returns setof realtime.messages language sql as $$
  select * from realtime.messages
  where topic = 'problem-submissions:' || (select p1 from ids)
    and inserted_at >= (select at from t0)::timestamp;
$$;

select is_empty($$ select * from tests.sub_msgs() $$, 'ยังไม่มีข้อความก่อนมีคนส่ง');

select tests.login_as(s1) from ids;
select public.submit_answer((select p1 from ids), 'SELECT secret_answer FROM t;');
reset role;

select results_eq(
  $$ select event, (payload->>'submit_order')::int, private,
            (payload->>'submission_id')::bigint = (select id from public.submissions where problem_id = (select p1 from ids))
     from tests.sub_msgs() $$,
  $$ values ('submission'::text, 1, true, true) $$,
  'ส่งคำตอบ → problem-submissions:<id> (submission_id, submit_order) แบบ private'
);
select is_empty(
  $$ select 1 from tests.sub_msgs() m, jsonb_object_keys(m.payload) k
     where k not in ('id', 'submission_id', 'submit_order') $$,
  'payload ไม่มี SQL หรือข้อมูลนิสิต'
);
select is_empty(
  $$ select 1 from tests.sub_msgs() m where m.payload::text like '%secret_answer%' $$,
  'ไม่มีข้อความ SQL ใน payload'
);

-- สิทธิ์รับข้อความ
create or replace function tests.can_receive(p_topic text)
returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('realtime.topic', p_topic, true);
  select count(*) into n from realtime.messages where topic = p_topic and extension = 'broadcast';
  return n > 0;
end $$;
grant execute on function tests.can_receive(text) to anon, authenticated;
create temp table topic as select 'problem-submissions:' || (select p1 from ids) as name;
grant select on topic to anon, authenticated;

select tests.login_as(t1) from ids;
select ok(tests.can_receive((select name from topic)), 'อาจารย์รับ problem-submissions ได้');
reset role;
select tests.login_as(s1) from ids;
select ok(not tests.can_receive((select name from topic)), 'นิสิตรับ problem-submissions ไม่ได้');
reset role;
select tests.login_anon();
select ok(not tests.can_receive((select name from topic)), 'ผู้ไม่ล็อกอินรับ problem-submissions ไม่ได้');
reset role;

-- คะแนนเต็ม
insert into public.results (submission_id, score, verdict)
select id, 8, 'partial' from public.submissions where problem_id = (select p1 from ids);

select tests.login_as(t1) from ids;
select throws_ok(
  $$ update public.problems set max_score = 5 where id = (select p1 from ids) $$,
  'P0001', 'MAX_SCORE_BELOW_GIVEN', 'ลดคะแนนเต็มต่ำกว่าคะแนนที่ให้แล้ว (8) ไม่ได้'
);
select lives_ok(
  $$ update public.problems set max_score = 8 where id = (select p1 from ids) $$,
  'ลดคะแนนเต็มเท่ากับคะแนนสูงสุดที่ให้แล้วได้'
);
select lives_ok(
  $$ update public.problems set max_score = 20, title = 'แก้ชื่อได้' where id = (select p1 from ids) $$,
  'เพิ่มคะแนนเต็มและแก้โจทย์หลังมีคนส่งแล้วได้'
);
select results_eq(
  $$ select title, max_score from public.problems where id = (select p1 from ids) $$,
  $$ values ('แก้ชื่อได้'::text, 20.00::numeric(6,2)) $$,
  'ค่าที่แก้ถูกบันทึก'
);

select * from finish();
rollback;
