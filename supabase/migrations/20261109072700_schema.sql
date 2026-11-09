-- ระยะที่ 1: ตารางทั้งหมดตาม "โมเดลข้อมูล" ใน CLAUDE.md
-- เวลาทั้งหมดเป็น timestamptz, ข้อความผู้ใช้ภาษาไทย ชื่อในฐานข้อมูลภาษาอังกฤษ

create type public.verdict as enum ('correct', 'partial', 'incorrect');
create type public.result_source as enum ('manual', 'auto');
create type public.grading_job_status as enum ('queued', 'running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- อาจารย์ที่อนุญาต (ล็อกอิน Google)
create table public.instructors (
  email      text primary key
             constraint instructors_email_format check (email = lower(btrim(email)) and email like '_%@_%'),
  created_at timestamptz not null default now()
);
comment on table public.instructors is 'อีเมลอาจารย์ที่อนุญาต (เก็บตัวพิมพ์เล็ก)';

-- ---------------------------------------------------------------------------
-- นิสิต: ผูกกับ auth.users (อีเมลภายใน <student_id>@quiz.local)
create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  student_id       text not null unique
                   constraint profiles_student_id_format check (student_id ~ '^[0-9A-Za-z]{6,20}$'),
  first_name       text not null constraint profiles_first_name_not_blank check (btrim(first_name) <> ''),
  last_name        text not null default '',
  section          text not null default '',
  password_changed boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index profiles_section_idx on public.profiles (section);

-- ---------------------------------------------------------------------------
-- โจทย์
create table public.problems (
  id                  bigint generated always as identity primary key,
  title               text not null
                      constraint problems_title_valid check (btrim(title) <> '' and length(title) <= 200),
  description         text not null default '',
  schema_info         text not null default '',
  expected_example    text not null default '',
  max_score           numeric(6, 2) not null default 10 constraint problems_max_score_positive check (max_score > 0),
  order_matters       boolean not null default false,
  dataset_name        text,
  created_at          timestamptz not null default now(),
  results_released_at timestamptz,
  public_token        text unique
                      constraint problems_public_token_length check (public_token is null or length(public_token) >= 16),
  -- ประกาศผลกับลิงก์อันดับเกิดพร้อมกันเสมอ
  constraint problems_release_consistent check ((results_released_at is null) = (public_token is null))
);

-- เฉลย (แยกตาราง ห้ามถึงมือนิสิต)
create table public.problem_solutions (
  problem_id    bigint primary key references public.problems (id) on delete cascade,
  reference_sql text not null default ''
);

-- สถานะที่นิสิตเห็นแบบ realtime (สร้างอัตโนมัติเมื่อเพิ่มโจทย์)
create table public.problem_status (
  problem_id       bigint primary key references public.problems (id) on delete cascade,
  is_open          boolean not null default false,
  submission_count integer not null default 0 constraint problem_status_count_nonneg check (submission_count >= 0),
  opened_at        timestamptz,  -- เวลาเปิดครั้งแรก (ไม่เขียนทับ) = "วันของโจทย์"
  closed_at        timestamptz   -- เวลาปิดล่าสุด
);
create index problem_status_open_idx on public.problem_status (problem_id) where is_open;

-- ---------------------------------------------------------------------------
-- คำตอบ: ส่งได้ครั้งเดียวต่อข้อ
-- ลบนิสิตที่เคยส่งไม่ได้ (restrict) — ต้องปิดบัญชีแทน
create table public.submissions (
  id              bigint generated always as identity primary key,
  problem_id      bigint not null references public.problems (id) on delete restrict,
  student_user_id uuid not null references public.profiles (user_id) on delete restrict,
  sql_text        text not null
                  constraint submissions_sql_text_valid check (sql_text !~ '^\s*$' and length(sql_text) <= 10000),
  submitted_at    timestamptz not null default now(),
  submit_order    integer not null constraint submissions_submit_order_positive check (submit_order > 0),
  constraint submissions_one_per_student unique (problem_id, student_user_id),
  constraint submissions_order_unique unique (problem_id, submit_order)
);
create index submissions_student_idx on public.submissions (student_user_id);

-- ผลการตรวจ
create table public.results (
  id            bigint generated always as identity primary key,
  submission_id bigint not null unique references public.submissions (id) on delete cascade,
  score         numeric(6, 2) not null constraint results_score_nonneg check (score >= 0),
  verdict       public.verdict not null,
  feedback      text,
  source        public.result_source not null default 'manual',
  graded_by     uuid references auth.users (id) on delete set null,
  graded_at     timestamptz not null default now()
);

-- งานตรวจอัตโนมัติ (อนาคต: grading-worker รับผ่าน Realtime)
create table public.grading_jobs (
  id         bigint generated always as identity primary key,
  problem_id bigint not null references public.problems (id) on delete cascade,
  status     public.grading_job_status not null default 'queued',
  total      integer not null default 0 constraint grading_jobs_total_nonneg check (total >= 0),
  done       integer not null default 0 constraint grading_jobs_done_nonneg check (done >= 0),
  error      text,
  created_at timestamptz not null default now()
);
create index grading_jobs_problem_idx on public.grading_jobs (problem_id);
