-- ระยะ 7.2: อันดับตามคะแนน และเงื่อนไขประกาศผล
--   1) release_results ประกาศได้เฉพาะเมื่อปิดรับคำตอบแล้ว + ทุกคำตอบมีคะแนน + มีผู้ส่ง ≥ 1
--      (ครั้งแรกเท่านั้น — เรียกซ้ำหลังประกาศได้ token เดิม)
--   2) ข้อที่ประกาศผลแล้วเปิดรับคำตอบอีกไม่ได้ (PROBLEM_RELEASED)
--   3) get_public_results คืน score_rank: คะแนนมาก → น้อย, เท่ากันใครส่งก่อนได้อันดับดีกว่า (ไม่ซ้ำ)

-- ---------------------------------------------------------------------------
-- 1) release_results
-- ---------------------------------------------------------------------------
create or replace function public.release_results(p_problem_id bigint)
returns table (results_released_at timestamptz, public_token text)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_open     boolean;
  v_released timestamptz;
begin
  if not public.is_instructor() then
    raise exception using errcode = '42501', message = 'NOT_INSTRUCTOR';
  end if;

  -- ล็อกแถวสถานะ: กันการเปิดข้อ/ส่งคำตอบแทรกระหว่างตรวจเงื่อนไข
  select ps.is_open, p.results_released_at
    into v_open, v_released
    from public.problems p
    join public.problem_status ps on ps.problem_id = p.id
   where p.id = p_problem_id
   for update of ps;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROBLEM_NOT_FOUND';
  end if;

  if v_released is null then
    if v_open then
      raise exception using errcode = 'P0001', message = 'PROBLEM_STILL_OPEN';
    end if;
    if not exists (select 1 from public.submissions s where s.problem_id = p_problem_id) then
      raise exception using errcode = 'P0001', message = 'NO_SUBMISSIONS';
    end if;
    if exists (
      select 1
        from public.submissions s
        left join public.results r on r.submission_id = s.id
       where s.problem_id = p_problem_id and r.submission_id is null
    ) then
      raise exception using errcode = 'P0001', message = 'UNGRADED_SUBMISSIONS';
    end if;
  end if;

  return query
    update public.problems p
       set results_released_at = coalesce(p.results_released_at, now()),
           -- 18 ไบต์สุ่ม = 24 ตัวอักษร base64url
           public_token = coalesce(p.public_token,
                                   translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'))
     where p.id = p_problem_id
    returning p.results_released_at, p.public_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) ห้ามเปิดข้อที่ประกาศผลแล้ว (security definer เพื่ออ่าน problems ได้เสมอไม่ขึ้นกับ RLS)
-- ---------------------------------------------------------------------------
create or replace function public.tg_problem_status_open_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_open and not old.is_open then
    if exists (select 1 from public.problems p
                where p.id = new.problem_id and p.results_released_at is not null) then
      raise exception using errcode = 'P0001', message = 'PROBLEM_RELEASED';
    end if;
    new.opened_at := coalesce(old.opened_at, now());
  elsif old.is_open and not new.is_open then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_problem_status_open_close() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) get_public_results + score_rank (เปลี่ยนชนิดผลลัพธ์ จึงต้อง drop แล้วสร้างใหม่)
-- ---------------------------------------------------------------------------
drop function public.get_public_results(text);

create function public.get_public_results(p_token text)
returns table (
  problem_title     text,
  max_score         numeric,
  problem_date      date,
  released_at       timestamptz,
  submit_order      integer,
  score_rank        integer,
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
         (row_number() over (order by r.score desc nulls last, s.submit_order))::integer,
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

revoke execute on function public.get_public_results(text) from public;
grant execute on function public.get_public_results(text) to anon, authenticated;
