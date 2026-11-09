-- ข้อมูลทดสอบสำหรับ Supabase local เท่านั้น (รันด้วย `npm run db:reset`)
-- ห้ามใช้กับ project จริง (`supabase db push` ไม่ส่งไฟล์นี้)
--
-- อาจารย์ 1: instructor@example.com / รหัสผ่าน instructor-local
--            (มี identity Google จำลองให้ผ่าน is_instructor และมีรหัสผ่านไว้ทดสอบในเครื่อง)
-- นิสิต 5:   6500000001–6500000005 รหัสผ่านเริ่มต้น = รหัสนิสิต (ตอน 1: 3 คน, ตอน 2: 2 คน)
-- โจทย์ 3:   ข้อ 1 เปิดอยู่ / ข้อ 2 ปิดแล้ว ให้คะแนนและประกาศผลแล้ว / ข้อ 3 ยังไม่เปิด

do $$
declare
  v_instructor uuid := '00000000-0000-4000-a000-000000000001';
  v_student    uuid;
  v_p1 bigint; v_p2 bigint; v_p3 bigint;
  r record;
begin
  -- ---------- อาจารย์ ----------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_instructor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'instructor@example.com', extensions.crypt('instructor-local', extensions.gen_salt('bf')), now(),
          '{"provider":"google","providers":["google","email"]}', '{"full_name":"อาจารย์ทดสอบ"}',
          now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values ('google-local-instructor', v_instructor,
          jsonb_build_object('sub', 'google-local-instructor', 'email', 'instructor@example.com', 'email_verified', true),
          'google', now(), now(), now()),
         (v_instructor::text, v_instructor,
          jsonb_build_object('sub', v_instructor::text, 'email', 'instructor@example.com', 'email_verified', true),
          'email', now(), now(), now());
  insert into public.instructors (email) values ('instructor@example.com');

  -- ---------- นิสิต ----------
  for r in
    select * from (values
      ('6500000001', 'สมชาย',   'ใจดี',     '1'),
      ('6500000002', 'สมหญิง',  'รักเรียน', '1'),
      ('6500000003', 'ประเสริฐ', 'มั่นคง',   '1'),
      ('6500000004', 'วิภาวดี',  'สุขใจ',    '2'),
      ('6500000005', 'ธนากร',   'ศรีสุข',   '2')
    ) as t(student_id, first_name, last_name, section)
  loop
    v_student := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            r.student_id || '@quiz.local', extensions.crypt(r.student_id, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (v_student::text, v_student,
            jsonb_build_object('sub', v_student::text, 'email', r.student_id || '@quiz.local', 'email_verified', true),
            'email', now(), now());
    insert into public.profiles (user_id, student_id, first_name, last_name, section)
    values (v_student, r.student_id, r.first_name, r.last_name, r.section);
  end loop;

  -- ---------- โจทย์ ----------
  insert into public.problems (title, description, schema_info, expected_example, dataset_name)
  values ('เลือกเมืองในประเทศไทย',
          'เขียนคำสั่ง SQL แสดง **ชื่อเมือง** และ **จำนวนประชากร** ของทุกเมืองในประเทศไทย (`THA`)',
          E'```\ncity(ID, Name, CountryCode, District, Population)\n```',
          E'| Name | Population |\n| --- | --- |\n| Bangkok | 6320174 |',
          'world')
  returning id into v_p1;
  insert into public.problems (title, description, schema_info, expected_example, max_score, order_matters, dataset_name)
  values ('นับจำนวนเมืองแต่ละประเทศ',
          'แสดงรหัสประเทศและจำนวนเมือง เรียงจากมากไปน้อย',
          E'```\ncity(ID, Name, CountryCode, District, Population)\n```',
          E'| CountryCode | cnt |\n| --- | --- |\n| CHN | 363 |',
          10, true, 'world')
  returning id into v_p2;
  insert into public.problems (title, description, schema_info, dataset_name)
  values ('ภาษาที่ใช้มากที่สุด',
          'แสดงภาษาที่เป็นภาษาราชการในจำนวนประเทศมากที่สุด 5 อันดับ',
          E'```\ncountrylanguage(CountryCode, Language, IsOfficial, Percentage)\n```',
          'world')
  returning id into v_p3;

  insert into public.problem_solutions (problem_id, reference_sql) values
    (v_p1, 'SELECT Name, Population FROM city WHERE CountryCode = ''THA'';'),
    (v_p2, 'SELECT CountryCode, COUNT(*) AS cnt FROM city GROUP BY CountryCode ORDER BY cnt DESC;'),
    (v_p3, 'SELECT Language, COUNT(*) AS n FROM countrylanguage WHERE IsOfficial = ''T'' GROUP BY Language ORDER BY n DESC LIMIT 5;');

  -- ข้อ 2: เปิด → นิสิต 4 คนส่ง → ปิด → ให้คะแนน → ประกาศผล
  update public.problem_status set is_open = true where problem_id = v_p2;
  insert into public.submissions (problem_id, student_user_id, sql_text)
  select v_p2, p.user_id, sql
  from (values
    ('6500000001', 'SELECT CountryCode, COUNT(*) AS cnt FROM city GROUP BY CountryCode ORDER BY cnt DESC;'),
    ('6500000003', 'SELECT CountryCode, COUNT(*) FROM city GROUP BY CountryCode;'),
    ('6500000004', 'SELECT COUNT(*) FROM city;'),
    ('6500000002', 'SELECT CountryCode, COUNT(Name) cnt FROM city GROUP BY 1 ORDER BY 2 DESC;')
  ) as t(student_id, sql)
  join public.profiles p on p.student_id = t.student_id;
  update public.problem_status set is_open = false where problem_id = v_p2;

  insert into public.results (submission_id, score, verdict, feedback, graded_by)
  select s.id, x.score, x.verdict::public.verdict, x.feedback, v_instructor
  from public.submissions s
  join public.profiles p on p.user_id = s.student_user_id
  join (values
    ('6500000001', 10, 'correct',   null),
    ('6500000002', 10, 'correct',   null),
    ('6500000003', 5,  'partial',   'ยังไม่ได้เรียงลำดับ'),
    ('6500000004', 0,  'incorrect', 'ต้องจัดกลุ่มตามประเทศ')
  ) as x(student_id, score, verdict, feedback) on x.student_id = p.student_id
  where s.problem_id = v_p2;

  update public.problems
     set results_released_at = now(),
         public_token = 'local-demo-token-problem-2'
   where id = v_p2;

  -- ข้อ 1: เปิดอยู่ (ยังไม่มีใครส่ง)
  update public.problem_status set is_open = true where problem_id = v_p1;
  -- ข้อ 3: ยังไม่เปิด
end $$;
