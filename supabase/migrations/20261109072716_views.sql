-- ระยะที่ 1: view สำหรับรายงาน (security_invoker: ใช้ RLS ของผู้เรียก)
-- "วันของโจทย์" = วันที่เปิดครั้งแรก ตามเขตเวลา Asia/Bangkok

-- สรุปรายวัน: 1 แถวต่อโจทย์ที่เคยเปิด
create view public.v_daily_problem_summary
with (security_invoker = true)
as
select (ps.opened_at at time zone 'Asia/Bangkok')::date as day,
       p.id                                             as problem_id,
       p.title,
       ps.is_open,
       ps.opened_at,
       ps.closed_at,
       ps.submission_count,
       count(*) over (partition by (ps.opened_at at time zone 'Asia/Bangkok')::date) as problems_in_day
from public.problems p
join public.problem_status ps on ps.problem_id = p.id
where ps.opened_at is not null;

-- รายงานรายคน: นิสิต × โจทย์ที่เคยเปิด
-- submitted = false → ไม่ได้ส่ง, submitted = true และ score ว่าง → ยังไม่ให้คะแนน
create view public.v_student_problem_scores
with (security_invoker = true)
as
select pr.user_id                                       as student_user_id,
       pr.student_id,
       pr.first_name,
       pr.last_name,
       pr.section,
       pr.is_active,
       p.id                                             as problem_id,
       p.title,
       (ps.opened_at at time zone 'Asia/Bangkok')::date as day,
       p.max_score,
       s.id is not null                                 as submitted,
       s.submitted_at,
       s.submit_order,
       r.score,
       r.verdict
from public.profiles pr
cross join public.problems p
join public.problem_status ps on ps.problem_id = p.id
left join public.submissions s on s.problem_id = p.id and s.student_user_id = pr.user_id
left join public.results r on r.submission_id = s.id
where ps.opened_at is not null;

revoke all on public.v_daily_problem_summary, public.v_student_problem_scores from anon, authenticated;
grant select on public.v_daily_problem_summary, public.v_student_problem_scores to authenticated;
