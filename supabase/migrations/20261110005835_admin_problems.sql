-- ระยะที่ 4: หน้าอาจารย์ — โจทย์และการติดตาม

-- 1) Broadcast การส่งรายข้อให้อาจารย์: topic problem-submissions:<problem_id>
--    payload ไม่มี SQL / ชื่อ — หน้าอาจารย์ดึงรายละเอียดผ่าน RLS เอง
create function public.tg_submissions_broadcast()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('submission_id', new.id, 'submit_order', new.submit_order),
    'submission', 'problem-submissions:' || new.problem_id, true);
  return null;
end;
$$;

revoke execute on function public.tg_submissions_broadcast() from public, anon, authenticated;

create trigger submissions_broadcast
after insert on public.submissions
for each row execute function public.tg_submissions_broadcast();

create policy problem_submissions_receive_instructor on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'problem-submissions:%'
    and (select public.is_instructor())
  );

-- 2) คะแนนเต็มต้องไม่ต่ำกว่าคะแนนที่ให้ไปแล้ว
create function public.tg_problems_max_score_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.max_score < old.max_score and exists (
    select 1
    from public.results r
    join public.submissions s on s.id = r.submission_id
    where s.problem_id = new.id and r.score > new.max_score
  ) then
    raise exception using errcode = 'P0001', message = 'MAX_SCORE_BELOW_GIVEN';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_problems_max_score_guard() from public, anon, authenticated;

create trigger problems_max_score_guard
before update of max_score on public.problems
for each row execute function public.tg_problems_max_score_guard();
