# CLAUDE.md — SQL Quick Quiz

ระบบ quiz สั้นในห้องเรียนวิชา SQL นิสิตทดลองคำสั่งบนเครื่องตัวเอง (MySQL บน Docker + HeidiSQL) จนมั่นใจ แล้วนำ SQL มาส่งผ่านหน้าเว็บ อาจารย์เปิด/ปิดโจทย์ ดูการส่งแบบ realtime ให้คะแนน และประกาศผล
แผนพัฒนาแต่ละระยะอยู่ที่ `docs/PLAN.md` — ทำเฉพาะระยะที่ได้รับคำสั่งเท่านั้น

## สถานะปัจจุบัน

- ระยะที่กำลังทำ: — (รอคำสั่งเริ่มระยะที่ 2)
- ระยะที่เสร็จแล้ว: 0 (tag `phase-0`), 1 (tag `phase-1`)
- งานค้าง / หมายเหตุ:
  - ปิดการสมัครเองแล้วทั้ง local (`config.toml`) และ project จริง (Dashboard, ตรวจแล้ว `disable_signup: true`)
  - Supabase project จริง: `anyvflatoeedytlrntmp` (region Singapore) — `supabase link` แล้ว, migration ระยะ 1 push แล้ว (ไม่มี seed); คำสั่ง CLI ใช้ local เป็นค่าเริ่มต้น ต้องใส่ `--remote` เพื่อทำกับ project จริง
  - GitHub: `kaewr/sqlquickquiz` · Vercel: https://sqlquickquiz.vercel.app (deploy อัตโนมัติจาก `main`)
  - ตัวแปร key ฝั่ง client ใช้ชื่อ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (key แบบ `sb_publishable_...`)
  - Next.js 16: อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด (ดู AGENTS.md); `npm run typecheck` รัน `next typegen` ก่อน tsc
  - Supabase CLI เป็น devDependency เรียกผ่าน `npx supabase`; แก้ค่า auth ใน `config.toml` แล้วต้อง `db:stop` + `db:start` (db reset ไม่พอ)
  - เทสต์ pgTAP: ใช้ `\ir _helpers.psql` (สร้างผู้ใช้/โจทย์, `tests.login_as`, `tests.reset_data()` ล้าง seed ใน transaction); `070_concurrency` ใช้ dblink และ commit จริงแล้วล้างเอง
  - รหัสข้อผิดพลาดจากฐานข้อมูล: `NOT_STUDENT`, `INVALID_SQL_TEXT`, `PROBLEM_CLOSED`, `ALREADY_SUBMITTED` (submit_answer), `NOT_INSTRUCTOR`, `PROBLEM_NOT_FOUND` (release_results), `SCORE_OUT_OF_RANGE`, `MANUAL_RESULT_PROTECTED` (results) — errcode P0001 ยกเว้น NOT_INSTRUCTOR = 42501
  - `submitted_at` ตั้งด้วย `clock_timestamp()` หลังได้ล็อก (เรียงตามเวลาตรงกับ submit_order เสมอ)
  - ระยะที่ 5: verdict ยังเป็นค่าที่ผู้ให้คะแนนส่งมา — ต้องทำให้คำนวณจากคะแนนตามเกณฑ์ระยะ 5
  - ทดสอบบน Vercel ได้ด้วย `PLAYWRIGHT_BASE_URL=https://sqlquickquiz.vercel.app npx playwright test`
  - `npm audit`: moderate 8 รายการใน `@typescript-eslint` (devDependency) ยังไม่แก้
  - ยังต้องตั้ง `NEXT_PUBLIC_SITE_URL=https://sqlquickquiz.vercel.app` บน Vercel และ Site URL ใน Supabase Auth ก่อนระยะที่ 2

(อัปเดตส่วนนี้ทุกครั้งที่จบระยะ)

## ขอบเขต

**ในรุ่นนี้:** ส่งคำตอบ, realtime, ให้คะแนนด้วยมือ, ประกาศผล, ประวัติของนิสิต, รายงาน
**ภายหลัง (ไม่ทำตอนนี้):** ตรวจอัตโนมัติด้วย `grading-worker` บนเครื่องอาจารย์ ซึ่งเรียกใช้แพ็กเกจ `sql-grader` (repo แยก ใช้ร่วมกับระบบสอบ SQL ในอนาคต) — แต่ต้องออกแบบฐานข้อมูลเผื่อไว้ตามหัวข้อ “การเตรียมรับตัวตรวจอัตโนมัติ”
**นอกขอบเขต:** การรัน SQL ของนิสิตบนเซิร์ฟเวอร์ (ระบบนี้เก็บ SQL เป็นข้อความเท่านั้น ไม่รัน), ระบบสอบเต็มรูปแบบ

## สถาปัตยกรรม

| ส่วน | อยู่ที่ไหน | หน้าที่ |
| --- | --- | --- |
| เว็บแอป Next.js | Vercel | หน้านิสิต, หน้าอาจารย์, หน้าประกาศอันดับ, server route ที่ต้องใช้ service key |
| ฐานข้อมูล + Auth + Realtime | Supabase (PostgreSQL) | ข้อมูลทั้งหมด, ล็อกอิน, กฎการส่งคำตอบ, realtime |
| grading-worker (อนาคต) | Docker บนเครื่องอาจารย์ | รับงานตรวจผ่าน Supabase, ตรวจด้วย MySQL ในเครื่อง |

**เส้นทางเว็บ**
- `/` — นิสิต: หน้าล็อกอิน → หน้าเดียวมี 2 แท็บ “โจทย์ปัจจุบัน” และ “ประวัติของฉัน” + เมนูเปลี่ยนรหัสผ่าน/ออกจากระบบ
- `/admin` — อาจารย์ (ล็อกอิน Google)
- `/r/[token]` — หน้าประกาศอันดับสาธารณะของแต่ละข้อ

## Tech stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend + server routes | Next.js (App Router) + TypeScript + Tailwind CSS |
| ฐานข้อมูล | Supabase PostgreSQL, migration ด้วย Supabase CLI ใน `supabase/migrations/` |
| Auth | Supabase Auth: นิสิตใช้อีเมลภายใน + รหัสผ่าน, อาจารย์ใช้ Google |
| Realtime | Supabase Realtime (Postgres Changes) |
| เทสต์ฐานข้อมูล/RLS | pgTAP ผ่าน `supabase test db` บน Supabase local |
| เทสต์หน้าเว็บ | Playwright |
| พัฒนาในเครื่อง | `supabase start` (ใช้ Docker) + `next dev` |

## กฎการเขียนโค้ด

- กฎทางธุรกิจที่สำคัญ (ส่งครั้งเดียว, ข้อต้องเปิด, เวลาเซิร์ฟเวอร์, ตัวนับ) บังคับที่ฐานข้อมูลเสมอ ห้ามพึ่งการตรวจฝั่งหน้าเว็บอย่างเดียว
- ทุกตารางเปิด RLS และทุก policy ต้องมีเทสต์ pgTAP ทั้งกรณีที่ควรได้และกรณีที่ต้องถูกปฏิเสธ
- `SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะใน server route ของ Next.js ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_` ห้ามอยู่ใน repo
- คำสั่งเฉลยห้ามถูกส่งไปถึงหน้านิสิตหรือหน้าสาธารณะในทุกกรณี
- เวลาทั้งหมดเก็บเป็น `timestamptz` และการจัดกลุ่ม “รายวัน” ใช้เขตเวลา `Asia/Bangkok`
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ชื่อในโค้ดและฐานข้อมูลเป็นภาษาอังกฤษ
- หน้านิสิตต้องใช้งานบนมือถือได้ดี
- ทำเฉพาะขอบเขตของระยะที่สั่ง ห้ามทำฟีเจอร์ของระยะถัดไปล่วงหน้า
- เสนอแผนก่อนเริ่มเขียนโค้ดทุกครั้ง
- ถ้าผู้ใช้สั่งงานที่ขัดกับข้อกำหนดในไฟล์นี้หรือ PLAN.md ให้ถามยืนยันก่อน แล้วอัปเดตไฟล์ให้ตรงกับการตัดสินใจใหม่ก่อนเขียนโค้ด

## บัญชีผู้ใช้

**นิสิต**
- ล็อกอินด้วยรหัสนิสิต + รหัสผ่าน ระบบแปลงรหัสนิสิตเป็นอีเมลภายใน `<student_id>@quiz.local` เอง นิสิตไม่ต้องรู้
- บัญชีสร้างจากการอัปโหลด CSV ของอาจารย์ รหัสผ่านเริ่มต้น = รหัสนิสิต
- **ไม่บังคับเปลี่ยนรหัสผ่าน** แต่แสดงแถบเตือนแนะนำให้เปลี่ยนทุกครั้งที่เข้าใช้ จนกว่าจะเปลี่ยน (`password_changed = false`)
- เปลี่ยนรหัสผ่านเองได้ (ใส่รหัสเดิม, รหัสใหม่อย่างน้อย 8 ตัว)
- ลืมรหัสผ่าน: อาจารย์รีเซ็ตกลับเป็นรหัสนิสิต (`password_changed` กลับเป็น false)

**อาจารย์**
- ล็อกอิน Google เฉพาะอีเมลที่อยู่ในตาราง `instructors`
- ฟังก์ชัน `is_instructor()` ใช้ใน RLS ทุกที่ที่ต้องตรวจสิทธิ์อาจารย์ — ต้องตรงทั้งอีเมลใน `instructors` **และ** ผู้ใช้มี identity แบบ Google (กันการสมัครด้วยรหัสผ่านโดยใช้อีเมลอาจารย์)

**การสมัครและลบบัญชี**
- ปิดการสมัครเอง (`enable_signup = false` ทั้ง local และ project จริง) บัญชีนิสิตสร้างจาก CSV ผ่าน service key เท่านั้น
- ลบนิสิตได้เฉพาะคนที่ยังไม่เคยส่งคำตอบ (FK `submissions → profiles` เป็น `on delete restrict`) ถ้าเคยส่งแล้วให้ปิดบัญชี (`is_active = false`) แทน

## โมเดลข้อมูล

| ตาราง | เก็บอะไร | ฟิลด์สำคัญ |
| --- | --- | --- |
| instructors | อีเมลอาจารย์ที่อนุญาต | email |
| profiles | ข้อมูลนิสิต ผูกกับบัญชี | user_id (auth.users), student_id (unique), first_name, last_name, section, password_changed, is_active |
| problems | โจทย์ | id, title, description (markdown), schema_info (markdown), expected_example (markdown), max_score (ค่าเริ่มต้น 10), order_matters, dataset_name, created_at, results_released_at, public_token |
| problem_solutions | เฉลย (แยกตาราง) | problem_id, reference_sql |
| problem_status | สถานะที่นิสิตเห็นแบบ realtime | problem_id, is_open, submission_count, opened_at (เวลาเปิดครั้งแรก ไม่เขียนทับ ใช้กำหนด “วันของโจทย์”), closed_at (เวลาปิดล่าสุด) |
| submissions | คำตอบ | id, problem_id, student_user_id, sql_text, submitted_at (`default now()`), submit_order; **unique (problem_id, student_user_id)** |
| results | ผลการตรวจ | submission_id (unique), score, verdict (correct / partial / incorrect), feedback, source (manual / auto), graded_by, graded_at |
| grading_jobs | งานตรวจอัตโนมัติ (อนาคต สร้างตารางไว้ก่อน) | id, problem_id, status, total, done, error, created_at |

**ฟังก์ชันในฐานข้อมูล**
- `submit_answer(problem_id, sql_text)` — security definer: ตรวจว่าผู้เรียกเป็นนิสิตที่ is_active, ข้อเปิดอยู่, SQL ยาวไม่เกิน 10,000 ตัวอักษรและไม่ว่าง, ยังไม่เคยส่งข้อนี้ จากนั้นบันทึกและคืน submitted_at กับ submit_order; ข้อผิดพลาดคืนเป็นรหัสที่หน้าเว็บแปลเป็นข้อความไทย (`PROBLEM_CLOSED`, `ALREADY_SUBMITTED`, `NOT_STUDENT`, `INVALID_SQL_TEXT`)
- trigger **ก่อน** insert submissions (BEFORE INSERT) — เพิ่ม `problem_status.submission_count` ด้วย `update … returning` แล้วใช้ค่าเป็น submit_order ในคำสั่งเดียว (ถ้า insert ล้ม ตัวนับย้อนกลับด้วย, การล็อกแถวทำให้ลำดับไม่ซ้ำเมื่อส่งพร้อมกัน)
- `release_results(problem_id)` — อาจารย์เท่านั้น: ตั้ง results_released_at และสร้าง public_token (สุ่ม ≥ 16 ตัวอักษร เดาไม่ได้) พร้อมกันในครั้งเดียว
- `get_public_results(token)` — security definer เรียกได้โดยไม่ล็อกอิน: คืนอันดับตามเวลาส่ง, รหัสนิสิตแบบปิดบางส่วน, คะแนน ของข้อที่ประกาศแล้วเท่านั้น ห้ามคืน SQL หรือชื่อ

**View สำหรับรายงาน**
- สรุปรายวัน: วันที่ (Asia/Bangkok) → จำนวนโจทย์, จำนวนผู้ส่งต่อข้อ
- รายงานรายคน: รหัสนิสิต × โจทย์ → คะแนน (ว่าง = ไม่ได้ส่ง)

## สิทธิ์การเข้าถึง (RLS)

| ตาราง | นิสิต | อาจารย์ | ไม่ล็อกอิน |
| --- | --- | --- | --- |
| profiles | อ่านของตัวเอง, แก้ได้แค่ password_changed ผ่าน flow เปลี่ยนรหัส | ทั้งหมด | — |
| problems | อ่านข้อที่เปิดอยู่ และข้อที่ตัวเองเคยส่ง | ทั้งหมด | — |
| problem_solutions | — | ทั้งหมด | — |
| problem_status | อ่าน | ทั้งหมด | — |
| submissions | อ่านของตัวเอง, เพิ่มผ่าน `submit_answer` เท่านั้น, ห้ามแก้/ลบ | อ่านทั้งหมด | — |
| results | อ่านของตัวเอง เฉพาะข้อที่ results_released_at ไม่ว่าง | ทั้งหมด | — |
| grading_jobs | — | ทั้งหมด | — |
| หน้าประกาศอันดับ | ผ่าน `get_public_results` | ผ่าน `get_public_results` | ผ่าน `get_public_results` |

## Realtime

- หน้านิสิต subscribe `problem_status` เพื่อเห็นโจทย์ที่เพิ่งเปิด, จำนวนคนส่ง และการปิดข้อทันที
- หน้าอาจารย์ subscribe `submissions` ของข้อที่เปิดดูอยู่
- มีค่าตั้ง `NEXT_PUBLIC_COUNT_MODE` = `realtime` (ค่าเริ่มต้น) หรือ `polling` (ถามทุก 5 วินาที) สำหรับตัวนับฝั่งนิสิต เผื่อใกล้เพดานข้อความ realtime ของแผนฟรี — สถานะเปิด/ปิดใช้ realtime เสมอ

## การตัดสินใจที่ตกลงแล้ว

| เรื่อง | ค่าที่ใช้ |
| --- | --- |
| การส่ง | ส่งได้ครั้งเดียวต่อข้อ ห้ามแก้ |
| เวลาส่ง | เวลาของฐานข้อมูลเท่านั้น |
| เปิดโจทย์ | อาจารย์เปิด/ปิดรายข้อ เปิดพร้อมกันได้หลายข้อ |
| รหัสผ่านเริ่มต้น | รหัสนิสิต ไม่บังคับเปลี่ยน แต่เตือนตลอดจนกว่าจะเปลี่ยน |
| ประกาศผล | ปุ่มเดียวต่อข้อ: แจ้งผลในประวัตินิสิต + เปิดลิงก์อันดับพร้อมกัน |
| หน้าอันดับ | เรียงตามเวลาส่ง, รหัสนิสิตแบบปิดบางส่วน (เช่น `65xxxx678`), คะแนน, ไม่แสดง SQL และชื่อ |
| สถานะในประวัตินิสิต | ก่อนประกาศ = “รอตรวจ”, หลังประกาศ = ถูก / ได้บางส่วน / ผิด + คะแนน |
| ให้คะแนน | ด้วยมือในรุ่นนี้ (ปุ่มลัด เต็ม / ครึ่ง / ศูนย์ + กรอกเอง + ความเห็น) |
| CSV รายชื่อ | `student_id, first_name, last_name, section` UTF-8 (รองรับ BOM จาก Excel) |

## การเตรียมรับตัวตรวจอัตโนมัติ

- โจทย์บันทึก `dataset_name`, `order_matters` และเฉลยใน `problem_solutions` ตั้งแต่แรก
- `results.source` แยกคะแนนด้วยมือกับอัตโนมัติ — คะแนนอัตโนมัติห้ามทับผลที่ source = manual
- ตาราง `grading_jobs` สร้างไว้แล้ว worker ในอนาคตจะรับงานผ่าน Realtime
- `results.feedback` มีไว้แล้วสำหรับข้อความจากตัวตรวจ

## วิธีทำงานแต่ละระยะ

1. อ่าน `CLAUDE.md` และระยะที่ได้รับคำสั่งใน `docs/PLAN.md`
2. เสนอแผน (ไฟล์, migration, หน้าเว็บ, เทสต์) และรออนุมัติก่อนเขียนโค้ด
3. เขียนเทสต์และรันจนผ่านทั้งหมด
4. ตรวจเกณฑ์เสร็จของระยะทีละข้อ รายงานข้อที่ยังไม่ผ่าน
5. อัปเดตส่วน “สถานะปัจจุบัน” ในไฟล์นี้
