-- ระยะที่ 2: รหัสนิสิต 8 หลัก, อาจารย์คนเดียวจาก migration
begin;
\ir _helpers.psql

select plan(6);

select ok(exists (select 1 from public.instructors where email = 'pornthep.ro@up.ac.th'),
          'อาจารย์ pornthep.ro@up.ac.th อยู่ใน instructors (จาก migration)');

select tests.reset_data();

select lives_ok($$ select tests.create_student('65012345') $$, 'รหัสนิสิต 8 หลักสร้างได้');
select throws_ok($$ select tests.create_student('6501234') $$,   '23514', null, 'รหัส 7 หลักถูกปฏิเสธ');
select throws_ok($$ select tests.create_student('650123456') $$, '23514', null, 'รหัส 9 หลักถูกปฏิเสธ');
select throws_ok($$ select tests.create_student('6501234A') $$,  '23514', null, 'รหัสมีตัวอักษรถูกปฏิเสธ');
select throws_ok($$ select tests.create_student(' 65012346') $$, '23514', null, 'รหัสมีช่องว่างถูกปฏิเสธ');

select * from finish();
rollback;
