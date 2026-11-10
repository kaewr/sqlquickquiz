# CLAUDE.md — SQL Quick Quiz

ระบบ quiz สั้นในห้องเรียนวิชา SQL นิสิตทดลองคำสั่งบนเครื่องตัวเอง (MySQL บน Docker + HeidiSQL) จนมั่นใจ แล้วนำ SQL มาส่งผ่านหน้าเว็บ อาจารย์เปิด/ปิดโจทย์ ดูการส่งแบบ realtime ให้คะแนน และประกาศผล
แผนพัฒนาแต่ละระยะอยู่ที่ `docs/PLAN.md` — ทำเฉพาะระยะที่ได้รับคำสั่งเท่านั้น

## สถานะปัจจุบัน

- ระยะที่กำลังทำ: — (รอคำสั่งเริ่มระยะที่ 5)
- ระยะที่เสร็จแล้ว: 0 (`phase-0`), 1 (`phase-1`), 2 (`phase-2`), 3 (`phase-3`), 4 (`phase-4`)
- งานค้าง / หมายเหตุ:
  - project จริง: migration ถึง `admin_problems` แล้ว — realtime บน project จริงรอผู้ใช้ทดลองครบวงครั้งแรก (สร้าง → เปิด → นิสิตส่ง → ปิด)
  - ระยะ 2 ใช้งานจริงแล้ว: Google login บน Vercel ผ่าน, นำเข้า CSV ตอน 1 จำนวน 110 คนบน project จริงแล้ว (2026-11-09)
  - commit `ec3ae20` (ข้อความไทยเมื่อ service key ผิด/หาย) **ยังไม่ push** — ถามผู้ใช้ก่อน push
  - project จริง: migration ถึง `accounts` แล้ว, ตั้ง min password 8 / rate limit 1000 & 1800 / site URL / Google / ปิดสมัครเองแล้ว (ตรวจด้วย `supabase config diff`), มีบัญชี Auth ของ `pornthep.ro@up.ac.th`
  - ตรวจค่าตั้ง project จริงแบบอ่านอย่างเดียว: `npx supabase config diff`, `npx supabase db query --remote --read-only "<sql>"` — ห้ามใช้ `config push` (จะส่ง site_url localhost ขึ้นไป)
  - `.env.local` ชี้ Supabase บนเครื่องแล้ว (ค่า project จริงเป็นคอมเมนต์ในไฟล์); Playwright บังคับว่าต้องเป็น local
  - ระยะ 4: หน้าอาจารย์ `/admin/problems` (รายวัน+ร่าง), `/new` (`?from=` = คัดลอก), `/[id]` (ผู้ส่ง realtime + ยังไม่ส่ง), `/[id]/edit`; server action `src/app/actions/problems.ts` ใช้ session อาจารย์ (ไม่ใช้ service key); hook `src/lib/use-broadcast.ts`
  - Cache Components เก็บหน้าก่อนหน้าไว้ใน DOM แบบซ่อน (`<Activity>`) — ใน Playwright ใช้ `.filter({ visible: true })` เมื่อ testid ซ้ำได้หลังเปลี่ยนหน้า
  - ระยะ 3: แท็บโจทย์อยู่ที่ `src/components/student/current-problems.tsx` (realtime/polling/resync) + `problem-card.tsx`; ข้อมูลผ่าน `src/lib/current-problems.ts` (ใช้ได้ทั้ง server/browser); ส่งผ่าน server action `src/app/actions/submit.ts`
  - เทสต์ polling รัน dev server ตัวที่สอง (port 3001, `NEXT_DIST_DIR=.next-polling`, โปรเจกต์ Playwright `polling`)
  - Next 16: `src/proxy.ts` ต่ออายุ session; หน้าที่อ่าน session อยู่ใน `<Suspense>`; `createClient()` ฝั่งเซิร์ฟเวอร์เรียก `await connection()` ก่อน (Cache Components)
  - ตรวจสิทธิ์รวมที่ `src/lib/auth.ts` (`getViewer`, `requireInstructor`); service key อยู่ที่ `src/lib/supabase/admin.ts` (`server-only`); ข้อความไทยที่ `src/lib/errors.ts`
  - ปิดการสมัครเองแล้วทั้ง local (`config.toml`) และ project จริง (Dashboard, ตรวจแล้ว `disable_signup: true`)
  - Supabase project จริง: `anyvflatoeedytlrntmp` (region Singapore) — `supabase link` แล้ว (ไม่ push seed); คำสั่ง CLI ใช้ local เป็นค่าเริ่มต้น ต้องใส่ `--remote` เพื่อทำกับ project จริง
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
  - Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COUNT_MODE`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ผู้ใช้ตั้งเอง ผมตรวจจากฝั่งนี้ไม่ได้)

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
| Realtime | Supabase Realtime — **Broadcast จากฐานข้อมูล** (trigger เรียก `realtime.send`) ช่องแบบ private + RLS บน `realtime.messages` |
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
- รหัสนิสิตเป็นตัวเลข 8 หลัก (บังคับที่ฐานข้อมูล)
- บัญชีสร้างจากการอัปโหลด CSV ของอาจารย์ รหัสผ่านเริ่มต้น = รหัสนิสิต
- รหัสผ่านขั้นต่ำ 8 ตัว ตั้งที่ Supabase Auth (local `config.toml` + Dashboard ของ project จริง) จึงบังคับทุกช่องทาง
- กรอกรหัสผิดแสดงข้อความเตือนเท่านั้น **ไม่ล็อก/ไม่ปิดบัญชี** — เพดานล็อกอินของ Supabase ต้องตั้งให้พอกับทั้งห้องที่ออกเน็ตด้วย IP เดียวกัน
- **ไม่บังคับเปลี่ยนรหัสผ่าน** แต่แสดงแถบเตือนแนะนำให้เปลี่ยนทุกครั้งที่เข้าใช้ จนกว่าจะเปลี่ยน (`password_changed = false`)
- เปลี่ยนรหัสผ่านเองได้ (ใส่รหัสเดิม, รหัสใหม่อย่างน้อย 8 ตัว)
- ลืมรหัสผ่าน: อาจารย์รีเซ็ตกลับเป็นรหัสนิสิต (`password_changed` กลับเป็น false)
- ปิดบัญชี = `is_active = false` **และ** ban ใน Supabase Auth (ล็อกอิน/ต่อ session ไม่ได้) เปิดคืนได้

**อาจารย์**
- มีอาจารย์คนเดียว `pornthep.ro@up.ac.th` เป็นทั้งอาจารย์และผู้ดูแลระบบ — ไม่มีฟีเจอร์เพิ่มอาจารย์ (อีเมลใส่ใน `instructors` ด้วย migration)
- ล็อกอิน Google เฉพาะอีเมลที่อยู่ในตาราง `instructors`
- เพราะปิดการสมัครเอง บัญชี Auth ของอาจารย์ต้องมีอยู่ก่อน (project จริง: สร้างครั้งเดียวใน Dashboard, local: seed) แล้ว Google จะผูกเข้ากับบัญชีนั้นตามอีเมลตอนล็อกอินครั้งแรก
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

ใช้ **Broadcast จากฐานข้อมูล** ไม่ใช้ Postgres Changes — เพราะตัวนับกับ `is_open` อยู่แถวเดียวกัน Postgres Changes จะส่งทุกการเปลี่ยนตัวนับให้ทุกคน ทำให้โหมด polling ประหยัดข้อความไม่ได้จริง

| topic | ส่งเมื่อ (trigger บน `problem_status`) | payload | ใคร subscribe |
| --- | --- | --- | --- |
| `problem-state` | `is_open` เปลี่ยน | `problem_id, is_open` | หน้านิสิต **เสมอ** |
| `problem-counts` | `submission_count` เปลี่ยน | `problem_id, submission_count` | หน้านิสิตเฉพาะ `NEXT_PUBLIC_COUNT_MODE=realtime` |

- ช่องเป็น private: RLS บน `realtime.messages` ให้รับได้เฉพาะนิสิตที่ `is_active` และอาจารย์ — payload ไม่มีเนื้อหาโจทย์/เฉลย หน้าเว็บดึงเนื้อหาผ่าน RLS เอง
- `NEXT_PUBLIC_COUNT_MODE` = `realtime` (ค่าเริ่มต้น) หรือ `polling` (ถามตัวนับทุก 5 วินาที และไม่ subscribe `problem-counts`) — สถานะเปิด/ปิดใช้ realtime เสมอ
- หน้าเว็บดึงสถานะใหม่ทั้งหมดเมื่อ realtime ต่อกลับมาได้หรือแท็บกลับมาแสดง (กันพลาดเหตุการณ์ตอนหลุด)
- หน้าอาจารย์ดูการส่งของข้อที่เปิดดูอยู่ผ่าน topic `problem-submissions:<problem_id>` (trigger หลัง insert `submissions`, payload `submission_id, submit_order` ไม่มี SQL, รับได้เฉพาะอาจารย์) แล้วดึงรายละเอียดผ่าน RLS เอง

## การตัดสินใจที่ตกลงแล้ว

| เรื่อง | ค่าที่ใช้ |
| --- | --- |
| การส่ง | ส่งได้ครั้งเดียวต่อข้อ ห้ามแก้ |
| เวลาส่ง | เวลาของฐานข้อมูลเท่านั้น |
| เปิดโจทย์ | อาจารย์เปิด/ปิดรายข้อ เปิดพร้อมกันได้หลายข้อ · สร้างโจทย์ไว้ล่วงหน้าได้ (ยังไม่เปิด = นิสิตไม่เห็น) · “วันของโจทย์” = วันที่เปิดครั้งแรก (Asia/Bangkok) |
| แก้/ลบโจทย์ | แก้ได้แม้มีคนส่งแล้ว (แสดงคำเตือน) แต่คะแนนเต็มต้องไม่ต่ำกว่าคะแนนที่ให้แล้ว (`MAX_SCORE_BELOW_GIVEN` บังคับที่ฐานข้อมูล) · ยังไม่มีการลบโจทย์ · คำสั่งเฉลยไม่บังคับแต่เตือนถ้าว่าง |
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
