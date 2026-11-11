# Handoff → ระยะที่ 7 (ทดสอบภาระและทดลองใช้จริง)

เขียนเมื่อ 2026-11-10 ตอนจบเซสชันที่ทำระยะ 0–6 · ใช้ร่วมกับ `CLAUDE.md` (ข้อกำหนด + “สถานะปัจจุบัน”) และ `docs/PLAN.md` ระยะที่ 7 (เกณฑ์เสร็จ) — เอกสารนี้ไม่คัดลอกสิ่งที่อยู่ในไฟล์เหล่านั้น

## เริ่มเซสชันใหม่

```
อ่าน CLAUDE.md, docs/HANDOFF.md และ docs/PLAN.md ระยะที่ 7 แล้วเสนอแผน (ยังไม่เขียนโค้ด)
```

กติกาเดิมยังใช้: เสนอแผนก่อนเขียนโค้ด · รายงานประเด็นความปลอดภัย**ก่อนแก้** (PLAN ระยะ 7 สั่งไว้) · ส่งขึ้นระบบจริงต้องได้ “ทำเลย”

## ความคืบหน้าระยะ 7 (อัปเดต 2026-11-11)

- **เสร็จ:** load test (`loadtest/`: accounts, run, login-burst, web) ผลใน `docs/LOADTEST.md` · ทบทวนความปลอดภัย `docs/SECURITY-REVIEW.md` (แก้ M1, L1 บางส่วน, L2, L3; M2 ยอมรับ) · ล็อกอินลองใหม่เอง · keep-alive workflow · `vercel.json` sin1 · เทสต์หน้าค้างเกินอายุ JWT ผ่าน
- **production ตั้งแล้ว (ตรวจแล้ว):** `NEXT_PUBLIC_COUNT_MODE=polling`, Vercel region sin1, token refresh 6000
- **production 2026-11-11:** push `80b3906` แล้ว (deploy ตรวจแล้ว: header, polling, sin1, ข้อความรอคิว) · web load test 40 คนผ่าน · ลบบัญชีทดสอบแล้ว (นิสิต 110, โจทย์ 2, คำตอบ 1 เท่าเดิม)
- **รอผู้ใช้:** หลัง deploy เปิด Secure password change · ตั้ง GitHub secret `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` แล้วกด Run workflow ครั้งแรก · กรอกตัวเลข Dashboard ใน LOADTEST.md
- **คู่มือ:** `docs/manual-student.md`, `docs/manual-instructor.md`, checklist ซ้อม/ทดลอง `docs/PILOT.md`
- **ยังไม่ทำ:** ผู้ใช้ซ้อมเอง (PILOT ก), ทดลองตอน 1 (PILOT ข), reset ข้อมูล (PILOT ค), tag `phase-7`

## สถานะ ณ ตอนส่งต่อ (จบระยะ 6)

- ระยะ 0–6 เสร็จ ขึ้น production แล้ว (tag `phase-6` = `2a94b06`), working tree สะอาด, ไม่มีงานค้างในบทสนทนา
- Production มีนิสิตจริง 110 คน (ตอน 1) และโจทย์ทดลองของอาจารย์ 2 ข้อ — **ยังไม่เคยมีข้อที่ประกาศผล** จึงยังไม่ได้เห็นหน้า `/r/[token]` ที่ token ถูกบน production (เทสต์บนเครื่องครอบคลุมแล้ว)
- ผู้ใช้ยังไม่ได้ทดลองครบวง realtime บน production ด้วยตัวเอง (สร้าง → เปิด → นิสิตส่ง → ปิด) — ควรให้ทำระหว่างระยะ 7

## ต้องให้ผู้ใช้เตรียม (ถามตอนเสนอแผน)

1. ~~Supabase project ทดสอบแยก~~ — **ตัดสินใจ 2026-11-10: load test บน project จริง `anyvflatoeedytlrntmp`** เพราะยังไม่เปิดใช้จริงและผู้ใช้จะ reset ข้อมูลก่อนเปิดใช้
   - ผู้ใช้ใส่ `LOADTEST_SUPABASE_URL`, `LOADTEST_PUBLISHABLE_KEY`, `LOADTEST_SECRET_KEY` ใน `.env.loadtest` เอง (`.env*` อยู่ใน `.gitignore` แล้ว)
   - บัญชีทดสอบ `99xxxxxx` ตอน `LT` (ตรวจแล้ว: production ไม่มีรหัสขึ้นต้น 99) · สคริปต์แตะเฉพาะข้อมูลที่ตัวเองสร้าง + คำสั่งเก็บกวาด · ต้องได้ “ทำเลย” ทุกรอบที่รันกับ production
   - อาจารย์จำลองฟัง `problem-submissions:<id>` ด้วย service key (ไม่สร้าง identity Google ปลอมบน production; RLS ช่องนี้ครอบคลุมด้วย pgTAP แล้ว)
2. ไม่ต้องมีหน้าเว็บสำหรับ load test (สคริปต์ยิง Supabase ตรง)
3. หมุน Google OAuth Client Secret (ค่าเดิมเคยถูกพิมพ์ในแชต) — อัปเดตทั้ง Supabase Dashboard และ `supabase/.env`

## ทิศทางที่แนะนำ

**สคริปต์บัญชีทดสอบ + load test**
- สร้าง 100 บัญชีด้วย admin API (รูปแบบเดียวกับ `src/app/api/admin/students/import/route.ts`, รหัส 8 หลักที่ไม่ชนกับของจริง เช่นขึ้นต้น `99`)
- ตัวจำลองนิสิต: Node + `@supabase/supabase-js` (ไม่ต้องมีเบราว์เซอร์) — แต่ละคน sign in, subscribe `problem-state` + `problem-counts` แบบ private, รอ broadcast เปิดข้อ, ส่ง `submit_answer` สุ่มภายใน 60 วินาที
- จำลองหน้าอาจารย์ 1 ตัว subscribe `problem-submissions:<id>` นับว่าได้ครบ 100
- ตรวจ: ส่งสำเร็จครบ 100, `submission_count` = 100, `submit_order` 1..100 ไม่ซ้ำ, ทุก client ได้ broadcast ปิดข้อ
- รันทั้ง `NEXT_PUBLIC_COUNT_MODE=realtime` และ `polling` เทียบจำนวนข้อความ (polling = ไม่ subscribe `problem-counts`)
- โครงเทสต์ concurrency ที่มีอยู่: `supabase/tests/database/070_concurrency.test.sql` (dblink 25 connections)

**วัดโควตา** (Supabase Dashboard → Usage / Realtime reports ของ project จริง): จำนวนข้อความ realtime, peak connections, DB CPU/egress — เทียบเพดานแผนฟรี แล้วสรุปว่าควรใช้โหมดตัวนับแบบไหน (ประมาณการ: realtime mode ≈ n² ข้อความต่อข้อสำหรับตัวนับ)

**ทบทวนความปลอดภัย** (รายงานก่อนแก้)
- RLS ทุกตาราง + policy บน `realtime.messages` (3 policy: `problem_broadcast_receive`, `problem_submissions_receive_instructor`)
- service key: ใช้เฉพาะ `src/lib/supabase/admin.ts` → `/api/admin/students/*`; ค้นหาใน repo และใน `.next/static` หลัง build (เคยตรวจแล้วว่าไม่หลุด — ทำซ้ำ)
- server action ทุกตัวตรวจอาจารย์ (`src/app/actions/*.ts`) — server action เรียกได้จากภายนอกเหมือน API
- `SECURITY DEFINER` ทุกฟังก์ชันตั้ง `search_path = ''` และ revoke จาก anon ตามสมควร (`supabase/migrations/*_rls.sql`)
- `npx supabase db advisors --remote` (security/performance advisors) และ `npm audit`
- หน้า `/r/[token]` ไม่มีชื่อ/SQL (มีเทสต์ `e2e/ranking.spec.ts`)

**คู่มือ**: `docs/` — นิสิต (ล็อกอิน, เปลี่ยนรหัส, ส่งคำตอบ, ดูประวัติ) และอาจารย์ (ขั้นตอนต่อ 1 คาบ: สร้าง/เปิด → ติดตาม → ปิด → ให้คะแนน → ประกาศ → รายงาน/สำรอง) อ้างอิง `docs/problem-examples.md` และ `docs/students-template.csv` ที่มีแล้ว

## Skill ที่แนะนำ

- `/security-review` — สำหรับหัวข้อทบทวนความปลอดภัย
- `/code-review` — ทบทวนสคริปต์ load test ก่อนรัน
- `/handoff` (ติดตั้งที่ `~/.claude/skills/handoff/` แล้ว — ถ้าไม่เห็นในรายการ `/` ให้เปิด VS Code ใหม่) — ใช้ตอนจบเซสชันถัดไป
