-- ส่งพร้อมกันหลายคน: ตัวนับและลำดับต้องถูกต้อง
-- ใช้ dblink เปิดหลาย connection จริง ข้อมูลต้อง commit เพื่อให้ connection อื่นเห็น
-- จึงไม่ห่อด้วย transaction และล้างข้อมูลทดสอบเองทั้งก่อนและหลัง
-- นิสิตทดสอบใช้รหัสขึ้นต้น 6599, โจทย์ชื่อ __concurrency_test__
\ir _helpers.psql

create or replace function tests.cleanup_concurrency()
returns void language plpgsql as $$
begin
  delete from public.results r using public.submissions s, public.problems p
   where r.submission_id = s.id and s.problem_id = p.id and p.title = '__concurrency_test__';
  delete from public.submissions s using public.problems p
   where s.problem_id = p.id and p.title = '__concurrency_test__';
  delete from public.problems where title = '__concurrency_test__';
  delete from auth.users where email like '6599%@quiz.local';
end $$;

select tests.cleanup_concurrency();

-- 20 นิสิต, 1 โจทย์เปิด
select tests.create_student('659900' || lpad(i::text, 2, '0')) from generate_series(1, 20) i;
select tests.create_problem('__concurrency_test__', true);

create temp table conc_plan as
-- 20 คนส่งคนละครั้ง + 5 คนแรกกดส่งซ้ำพร้อมกันอีกครั้ง = 25 คำขอ
select row_number() over () as n, p.user_id, pr.id as problem_id
from (select user_id, student_id from public.profiles where student_id like '6599%'
      union all
      select user_id, student_id from public.profiles where student_id like '6599%' and student_id <= '65990005') p
cross join (select id from public.problems where title = '__concurrency_test__') pr;

-- เปิด connection และตั้งให้เป็นนิสิตแต่ละคน
select extensions.dblink_connect('c' || n,
         'dbname=' || current_database() || ' user=postgres password=postgres host=' || host(inet_server_addr()))
from conc_plan;
select extensions.dblink_exec('c' || n,
         format('set request.jwt.claims = %L',
                jsonb_build_object('sub', user_id, 'role', 'authenticated')::text))
from conc_plan;
select extensions.dblink_exec('c' || n, 'set role authenticated') from conc_plan;

-- ล็อกแถว problem_status ไว้ก่อน ให้ทุกคำขอรอพร้อมกัน แล้วปล่อยทีเดียว
begin;
select 1 from public.problem_status
 where problem_id = (select id from public.problems where title = '__concurrency_test__') for update;
select extensions.dblink_send_query('c' || n,
         format('select submit_order from public.submit_answer(%s, %L)', problem_id, 'SELECT ' || n || ';'))
from conc_plan;
select pg_sleep(0.5);
commit;

-- เก็บผล (คำขอที่ error เช่น ALREADY_SUBMITTED ไม่คืนแถว)
create temp table conc_results (n bigint, submit_order int);
do $$
declare r record;
begin
  for r in select n from conc_plan order by n loop
    insert into conc_results
    select r.n, x.submit_order
    from extensions.dblink_get_result('c' || r.n, false) as x(submit_order int);
    perform extensions.dblink_disconnect('c' || r.n);
  end loop;
end $$;

select plan(5);

select results_eq(
  $$ select count(*)::int from conc_results $$, $$ values (20) $$,
  '25 คำขอพร้อมกัน สำเร็จ 20 (ส่งซ้ำ 5 คำขอถูกปฏิเสธ)'
);
select results_eq(
  $$ select array_agg(submit_order order by submit_order) from conc_results $$,
  $$ select array_agg(i) from generate_series(1, 20) i $$,
  'submit_order ที่คืนให้นิสิตเป็น 1..20 ไม่ซ้ำ ไม่ข้าม'
);
select results_eq(
  $$ select submission_count from public.problem_status
     where problem_id = (select id from public.problems where title = '__concurrency_test__') $$,
  $$ values (20) $$,
  'ตัวนับ submission_count = 20 ตรงกับจำนวนที่ส่งสำเร็จ'
);
select results_eq(
  $$ select count(*)::int, count(distinct student_user_id)::int, min(submit_order), max(submit_order)
     from public.submissions s join public.problems p on p.id = s.problem_id
     where p.title = '__concurrency_test__' $$,
  $$ values (20, 20, 1, 20) $$,
  'ในตาราง submissions มี 20 แถว คนละ 1 แถว ลำดับ 1..20'
);
select results_eq(
  $$ select array_agg(submit_order order by submitted_at, submit_order)
     from public.submissions s join public.problems p on p.id = s.problem_id
     where p.title = '__concurrency_test__' $$,
  $$ select array_agg(i) from generate_series(1, 20) i $$,
  'เรียงตามเวลาส่งแล้วได้ลำดับเดียวกับ submit_order (เวลาส่งไม่สลับกับลำดับ)'
);

select * from finish();

select tests.cleanup_concurrency();
drop schema tests cascade;
