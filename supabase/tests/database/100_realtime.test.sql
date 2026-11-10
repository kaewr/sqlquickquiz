-- ระยะที่ 3: Broadcast จากฐานข้อมูล + สิทธิ์รับข้อความบนช่อง private
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(16);

create temp table ids as
select tests.create_student('65001001') as s1,
       tests.create_student('65001002', '1', false) as s_inactive,
       tests.create_instructor('teacher@example.com') as t1,
       tests.create_problem('rt-problem', false) as p1;
grant select on ids to anon, authenticated;

-- ข้อความที่สร้างระหว่างเทสต์ (ข้อความเก่าไม่เกี่ยว)
create temp table t0 as select now() as at;
grant select on t0 to anon, authenticated;
create or replace function tests.msgs(p_topic text)
returns setof realtime.messages language sql as $$
  select * from realtime.messages
  where topic = p_topic and inserted_at >= (select at from t0)::timestamp and payload->>'problem_id' = (select p1 from ids)::text
  order by id;
$$;

-- ---------- trigger ----------
select is_empty($$ select * from tests.msgs('problem-state') $$, 'ยังไม่มีข้อความก่อนเปิดข้อ');

update public.problem_status set is_open = true where problem_id = (select p1 from ids);
select results_eq(
  $$ select event, (payload->>'is_open')::boolean, private from tests.msgs('problem-state') $$,
  $$ values ('state'::text, true, true) $$,
  'เปิดข้อ → ส่ง problem-state (is_open = true) แบบ private'
);
select is_empty($$ select * from tests.msgs('problem-counts') $$, 'เปิดข้อไม่ส่ง problem-counts');

select tests.login_as(s1) from ids;
select public.submit_answer((select p1 from ids), 'SELECT 1;');
reset role;
select results_eq(
  $$ select event, (payload->>'submission_count')::int from tests.msgs('problem-counts') $$,
  $$ values ('count'::text, 1) $$,
  'ส่งคำตอบ → ส่ง problem-counts (submission_count = 1)'
);
select results_eq(
  $$ select count(*)::int from tests.msgs('problem-state') $$, $$ values (1) $$,
  'ส่งคำตอบไม่ส่ง problem-state เพิ่ม'
);

update public.problem_status set is_open = false where problem_id = (select p1 from ids);
select set_eq(
  $$ select (payload->>'is_open')::boolean from tests.msgs('problem-state') $$,
  $$ values (true), (false) $$,
  'ปิดข้อ → ส่ง problem-state (is_open = false)'
);

-- payload มีเฉพาะคีย์ที่อนุญาต (ไม่มีเนื้อหาโจทย์/เฉลย/SQL)
select is_empty(
  $$ select 1 from tests.msgs('problem-state') m, jsonb_object_keys(m.payload) k
     where k not in ('id', 'problem_id', 'is_open')
     union all
     select 1 from tests.msgs('problem-counts') m, jsonb_object_keys(m.payload) k
     where k not in ('id', 'problem_id', 'submission_count') $$,
  'payload มีเฉพาะ id ของข้อความ, problem_id, is_open / submission_count'
);

-- ---------- สิทธิ์รับข้อความ (Realtime ตรวจด้วย role + realtime.topic) ----------
create or replace function tests.can_receive(p_topic text)
returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('realtime.topic', p_topic, true);
  select count(*) into n from realtime.messages where topic = p_topic and extension = 'broadcast';
  return n > 0;
end $$;
grant execute on function tests.can_receive(text) to anon, authenticated;

select tests.login_as(s1) from ids;
select ok(tests.can_receive('problem-state'), 'นิสิตรับ problem-state ได้');
select ok(tests.can_receive('problem-counts'), 'นิสิตรับ problem-counts ได้');
select ok(not tests.can_receive('other-topic'), 'นิสิตรับ topic อื่นไม่ได้');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload, private)
     values ('problem-state', 'broadcast', 'state', '{"problem_id": 1, "is_open": false}', true) $$,
  '42501', null, 'นิสิตปลอมข้อความ problem-state ไม่ได้'
);
reset role;

select tests.login_as(s_inactive) from ids;
select ok(not tests.can_receive('problem-state'), 'นิสิตที่ถูกปิดบัญชีรับ problem-state ไม่ได้');
reset role;

select tests.login_as(t1) from ids;
select ok(tests.can_receive('problem-state'), 'อาจารย์รับ problem-state ได้');
reset role;

select tests.login_anon();
select ok(not tests.can_receive('problem-state'), 'ผู้ไม่ล็อกอินรับ problem-state ไม่ได้');
select ok(not tests.can_receive('problem-counts'), 'ผู้ไม่ล็อกอินรับ problem-counts ไม่ได้');
reset role;

-- ไม่ใช้ Postgres Changes แล้ว
select is_empty(
  $$ select 1 from pg_publication_tables where pubname = 'supabase_realtime'
     and schemaname = 'public' and tablename in ('problem_status', 'submissions') $$,
  'problem_status / submissions ไม่อยู่ใน publication ของ Postgres Changes'
);

select * from finish();
rollback;
