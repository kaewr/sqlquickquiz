-- ระยะที่ 5: ให้คะแนนด้วยมือ
-- verdict คำนวณที่ฐานข้อมูลเสมอ (ไม่เชื่อค่าที่ส่งมา):
--   score = max_score → correct, score = 0 → incorrect, นอกนั้น → partial

create or replace function public.tg_results_validate()
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

  new.verdict := case
    when new.score = v_max then 'correct'::public.verdict
    when new.score = 0 then 'incorrect'::public.verdict
    else 'partial'::public.verdict
  end;

  -- ผู้ให้คะแนน/เวลา เปลี่ยนเฉพาะเมื่อคะแนน ความเห็น หรือแหล่งที่มาเปลี่ยน
  -- (การคำนวณ verdict ใหม่เพราะแก้คะแนนเต็ม ไม่นับเป็นการให้คะแนนใหม่)
  if tg_op = 'INSERT'
     or new.score is distinct from old.score
     or new.feedback is distinct from old.feedback
     or new.source is distinct from old.source then
    if new.source = 'manual' then
      new.graded_by := coalesce(auth.uid(), new.graded_by);
    end if;
    new.graded_at := now();
  else
    new.graded_by := old.graded_by;
    new.graded_at := old.graded_at;
  end if;
  return new;
end;
$$;

-- แก้คะแนนเต็มของโจทย์ → คำนวณ verdict ของทุกคนในข้อนั้นใหม่ (trigger ข้างบนทำให้)
create function public.tg_problems_recompute_verdicts()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.results r
     set verdict = r.verdict
    from public.submissions s
   where s.id = r.submission_id and s.problem_id = new.id;
  return null;
end;
$$;

revoke execute on function public.tg_problems_recompute_verdicts() from public, anon, authenticated;

create trigger problems_recompute_verdicts
after update of max_score on public.problems
for each row
when (new.max_score is distinct from old.max_score)
execute function public.tg_problems_recompute_verdicts();

-- ความเห็นยาวไม่เกิน 2,000 ตัวอักษร
alter table public.results
  add constraint results_feedback_length check (feedback is null or length(feedback) <= 2000);

-- มุมมองรายวัน: เพิ่มสถานะประกาศผล (ต่อท้ายคอลัมน์เดิม)
create or replace view public.v_daily_problem_summary
with (security_invoker = true)
as
select (ps.opened_at at time zone 'Asia/Bangkok')::date as day,
       p.id                                             as problem_id,
       p.title,
       ps.is_open,
       ps.opened_at,
       ps.closed_at,
       ps.submission_count,
       count(*) over (partition by (ps.opened_at at time zone 'Asia/Bangkok')::date) as problems_in_day,
       p.results_released_at is not null                as results_released
from public.problems p
join public.problem_status ps on ps.problem_id = p.id
where ps.opened_at is not null;
