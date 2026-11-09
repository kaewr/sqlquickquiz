-- โครงสร้างตาราง, RLS เปิดทุกตาราง, constraint สำคัญ
begin;
\ir _helpers.psql
select tests.reset_data();

select plan(28);

select tables_are('public', array[
  'instructors', 'profiles', 'problems', 'problem_solutions', 'problem_status',
  'submissions', 'results', 'grading_jobs'
], 'มีตารางครบตามโมเดลข้อมูล');

-- RLS เปิดทุกตาราง
select ok(c.relrowsecurity, 'เปิด RLS: ' || c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('instructors', 'profiles', 'problems', 'problem_solutions',
                    'problem_status', 'submissions', 'results', 'grading_jobs')
order by c.relname;

select col_is_unique('public', 'profiles', 'student_id', 'student_id ไม่ซ้ำ');
select col_is_unique('public', 'submissions', array['problem_id', 'student_user_id'],
                     'ส่งได้ครั้งเดียวต่อข้อ: unique (problem_id, student_user_id)');
select col_is_unique('public', 'submissions', array['problem_id', 'submit_order'],
                     'ลำดับการส่งไม่ซ้ำในข้อเดียวกัน');
select col_is_unique('public', 'results', 'submission_id', 'ผลตรวจ 1 รายการต่อ 1 คำตอบ');
select col_is_unique('public', 'problems', 'public_token', 'public_token ไม่ซ้ำ');

select col_default_is('public', 'submissions', 'submitted_at', 'now()', 'submitted_at default now()');
select col_type_is('public', 'submissions', 'submitted_at', 'timestamp with time zone', 'submitted_at เป็น timestamptz');
select col_default_is('public', 'problems', 'max_score', '10', 'max_score ค่าเริ่มต้น 10');
select col_default_is('public', 'profiles', 'password_changed', 'false', 'password_changed ค่าเริ่มต้น false');
select col_default_is('public', 'results', 'source', 'manual', 'results.source ค่าเริ่มต้น manual');

select enum_has_labels('public', 'verdict', array['correct', 'partial', 'incorrect'], 'verdict ครบ');
select enum_has_labels('public', 'result_source', array['manual', 'auto'], 'result_source ครบ');

select has_function('public', 'submit_answer', array['bigint', 'text'], 'มี submit_answer');
select has_function('public', 'release_results', array['bigint'], 'มี release_results');
select has_function('public', 'get_public_results', array['text'], 'มี get_public_results');
select has_function('public', 'is_instructor', 'มี is_instructor');
select has_function('public', 'mark_password_changed', 'มี mark_password_changed');

-- สร้างโจทย์แล้วมีแถว problem_status ปิดอยู่ ตัวนับเป็น 0
select lives_ok($$ select tests.create_problem('schema-test', false) $$, 'สร้างโจทย์ได้');
select results_eq(
  $$ select s.is_open, s.submission_count from public.problem_status s
     join public.problems p on p.id = s.problem_id where p.title = 'schema-test' $$,
  $$ values (false, 0) $$,
  'สร้างโจทย์แล้วได้ problem_status (ปิด, ตัวนับ 0) อัตโนมัติ'
);

select * from finish();
rollback;
