-- ระยะที่ 1: ฟังก์ชันและ trigger ที่บังคับกฎทางธุรกิจที่ฐานข้อมูล
-- รหัสข้อผิดพลาดส่งเป็นข้อความ (เช่น PROBLEM_CLOSED) ให้หน้าเว็บแปลเป็นภาษาไทย

-- ===========================================================================
-- ตรวจสิทธิ์
-- ===========================================================================

-- อาจารย์ = อีเมลอยู่ใน instructors และล็อกอินด้วย Google
-- (กันการสมัครด้วยรหัสผ่านโดยใช้อีเมลอาจารย์)
create function public.is_instructor()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.instructors i on i.email = lower(u.email)
    where u.id = auth.uid()
      and exists (select 1 from auth.identities x where x.user_id = u.id and x.provider = 'google')
  );
$$;

-- นิสิตที่บัญชียังเปิดอยู่
create function public.is_active_student()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active);
$$;

-- ===========================================================================
-- problems / problem_status
-- ===========================================================================

-- เพิ่มโจทย์แล้วสร้างแถว problem_status (ปิดอยู่) ให้อัตโนมัติ
create function public.tg_problems_create_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.problem_status (problem_id) values (new.id);
  return new;
end;
$$;

create trigger problems_create_status
after insert on public.problems
for each row execute function public.tg_problems_create_status();

-- เปิด/ปิด: opened_at = เวลาเปิดครั้งแรก (ไม่เขียนทับ), closed_at = เวลาปิดล่าสุด
create function public.tg_problem_status_open_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_open and not old.is_open then
    new.opened_at := coalesce(old.opened_at, now());
  elsif old.is_open and not new.is_open then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger problem_status_open_close
before update of is_open on public.problem_status
for each row execute function public.tg_problem_status_open_close();

-- ===========================================================================
-- submissions: ตัวนับ + ลำดับ + เวลาส่ง
-- ===========================================================================

-- BEFORE INSERT: เพิ่มตัวนับด้วย update ... returning แล้วใช้เป็น submit_order
-- - การ update ล็อกแถว problem_status ทำให้ส่งพร้อมกันได้ลำดับไม่ซ้ำ
-- - ถ้า insert ล้ม ตัวนับย้อนกลับไปพร้อมกัน
-- - เวลาส่งใช้ clock_timestamp() หลังได้ล็อก ให้เรียงตามเวลาแล้วตรงกับลำดับเสมอ
create function public.tg_submissions_assign_order()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.problem_status
     set submission_count = submission_count + 1
   where problem_id = new.problem_id
  returning submission_count into new.submit_order;

  if new.submit_order is null then
    raise exception using errcode = 'P0001', message = 'PROBLEM_CLOSED';
  end if;

  new.submitted_at := clock_timestamp();
  return new;
end;
$$;

create trigger submissions_assign_order
before insert on public.submissions
for each row execute function public.tg_submissions_assign_order();

-- ส่งคำตอบ: ทางเดียวที่นิสิตเพิ่ม submissions ได้
create function public.submit_answer(p_problem_id bigint, p_sql_text text)
returns table (submission_id bigint, submitted_at timestamptz, submit_order integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_open boolean;
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.user_id = v_uid and p.is_active) then
    raise exception using errcode = 'P0001', message = 'NOT_STUDENT';
  end if;

  -- ว่าง = มีแต่ช่องว่าง/แท็บ/ขึ้นบรรทัด (btrim ตัดแค่ space จึงใช้ regex)
  if p_sql_text is null or p_sql_text ~ '^\s*$' or length(p_sql_text) > 10000 then
    raise exception using errcode = 'P0001', message = 'INVALID_SQL_TEXT';
  end if;

  -- ล็อกแถวสถานะ: กันกรณีอาจารย์ปิดข้อพร้อมกับที่นิสิตกดส่ง
  select ps.is_open into v_open
    from public.problem_status ps
   where ps.problem_id = p_problem_id
     for update;

  if not coalesce(v_open, false) then
    raise exception using errcode = 'P0001', message = 'PROBLEM_CLOSED';
  end if;

  if exists (select 1 from public.submissions s
              where s.problem_id = p_problem_id and s.student_user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'ALREADY_SUBMITTED';
  end if;

  begin
    return query
      insert into public.submissions as s (problem_id, student_user_id, sql_text)
      values (p_problem_id, v_uid, p_sql_text)
      returning s.id, s.submitted_at, s.submit_order;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'ALREADY_SUBMITTED';
  end;
end;
$$;

-- ===========================================================================
-- results: คะแนนไม่เกินคะแนนเต็ม, auto ห้ามทับ manual
-- ===========================================================================
create function public.tg_results_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_max numeric;
begin
  if tg_op = 'UPDATE' and old.source = 'manual' and new.source = 'auto' then
    raise exception using errcode = 'P0001', message = 'MANUAL_RESULT_PROTECTED';
  end if;

  select p.max_score into v_max
    from public.submissions s join public.problems p on p.id = s.problem_id
   where s.id = new.submission_id;

  if new.score > v_max then
    raise exception using errcode = 'P0001', message = 'SCORE_OUT_OF_RANGE';
  end if;

  if new.source = 'manual' then
    new.graded_by := coalesce(auth.uid(), new.graded_by);
  end if;
  new.graded_at := now();
  return new;
end;
$$;

create trigger results_validate
before insert or update on public.results
for each row execute function public.tg_results_validate();

-- ===========================================================================
-- ประกาศผล
-- ===========================================================================

-- ตั้ง results_released_at และ public_token พร้อมกัน (เรียกซ้ำได้ token เดิม)
create function public.release_results(p_problem_id bigint)
returns table (results_released_at timestamptz, public_token text)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_instructor() then
    raise exception using errcode = '42501', message = 'NOT_INSTRUCTOR';
  end if;

  return query
    update public.problems p
       set results_released_at = coalesce(p.results_released_at, now()),
           -- 18 ไบต์สุ่ม = 24 ตัวอักษร base64url
           public_token = coalesce(p.public_token,
                                   translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'))
     where p.id = p_problem_id
    returning p.results_released_at, p.public_token;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROBLEM_NOT_FOUND';
  end if;
end;
$$;

-- รหัสนิสิตแบบปิดบางส่วน: 2 ตัวแรก + x + 3 ตัวท้าย (เช่น 65xxxx678)
create function public.mask_student_id(p_student_id text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when length(p_student_id) >= 6
      then left(p_student_id, 2) || repeat('x', length(p_student_id) - 5) || right(p_student_id, 3)
    else repeat('x', length(p_student_id))
  end;
$$;

-- หน้าอันดับสาธารณะ: เรียกได้โดยไม่ล็อกอิน คืนเฉพาะข้อที่ประกาศแล้ว
-- ห้ามคืน SQL, ชื่อ หรือรหัสนิสิตเต็ม
create function public.get_public_results(p_token text)
returns table (
  problem_title     text,
  max_score         numeric,
  problem_date      date,
  released_at       timestamptz,
  submit_order      integer,
  student_id_masked text,
  score             numeric,
  submitted_at      timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select p.title,
         p.max_score,
         (ps.opened_at at time zone 'Asia/Bangkok')::date,
         p.results_released_at,
         s.submit_order,
         public.mask_student_id(pr.student_id),
         r.score,
         s.submitted_at
  from public.problems p
  join public.problem_status ps on ps.problem_id = p.id
  join public.submissions s on s.problem_id = p.id
  join public.profiles pr on pr.user_id = s.student_user_id
  left join public.results r on r.submission_id = s.id
  where p_token is not null
    and length(p_token) >= 16
    and p.public_token = p_token
    and p.results_released_at is not null
  order by s.submit_order;
$$;

-- ===========================================================================
-- บัญชี
-- ===========================================================================

-- นิสิตแจ้งว่าเปลี่ยนรหัสผ่านแล้ว (ทางเดียวที่นิสิตแก้ profiles ได้)
create function public.mark_password_changed()
returns void
language sql security definer
set search_path = ''
as $$
  update public.profiles set password_changed = true where user_id = auth.uid();
$$;
