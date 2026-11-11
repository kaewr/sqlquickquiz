# ทบทวนความปลอดภัย (ระยะที่ 7)

ทบทวน 2026-11-10 แบบอ่านอย่างเดียว:
- โค้ดและ migration ทั้งหมด
- catalog และ advisors ของ project จริง
- ประวัติ git ทั้งหมด
- bundle หลัง `npm run build`

ไม่พบประเด็นระดับสูง

## ประเด็นและการตัดสินใจ

| # | ระดับ | ประเด็น | การตัดสินใจ / สถานะ |
| --- | --- | --- | --- |
| M1 | กลาง | CSV (สำรองข้อมูล/รายงาน) ไม่กันสูตร Excel ซึ่งอาจมาจาก SQL ที่นิสิตส่ง | **แก้แล้ว** `toCsv` ใส่ `'` นำหน้าข้อความที่ขึ้นต้นด้วย `= + - @ tab CR` (มีเทสต์ใน `reports.spec.ts`) |
| M2 | กลาง | รหัสผ่านเริ่มต้นคือรหัสนิสิต เพื่อนจึงล็อกอินแทนแล้วส่งคำตอบได้ | **ยอมรับความเสี่ยง** (ผู้ใช้ตัดสิน 2026-11-11): ไม่บังคับเปลี่ยน คงแถบเตือนให้เปลี่ยนไว้ตามเดิม |
| L1 | ต่ำ | ผู้ถือ session เปลี่ยนรหัสผ่านได้โดยไม่ต้องใส่รหัสเดิม (เรียกผ่าน console) | **แก้บางส่วน** ดูรายละเอียดด้านล่าง |
| L2 | ต่ำ | `/r/%E0%A4%A` ตอบ 500 | **แก้แล้ว** `proxy.ts` ตอบ 404 (มีเทสต์) |
| L3 | ต่ำ | ไม่มี security header (clickjacking หน้าอาจารย์) | **แก้แล้ว** `next.config.ts`: `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` (มีเทสต์) |
| L4 | ต่ำ | หน้าอันดับแสดงรหัส 5 จาก 8 หลัก เพื่อนร่วมรุ่นอาจเดาเจ้าของได้ | คงเดิม (ตรงกับข้อกำหนด) |
| L5 | ต่ำ | สิทธิ์ระดับตารางของ `authenticated` กว้างกว่า RLS (ตอนนี้ RLS ยังกันได้) | คงเดิม ระวังเมื่อเพิ่ม policy ใหม่ |
| L6 | ต่ำ | origin ของลิงก์อันดับมาจาก header ของคำขอ | คงเดิม (ภายหลัง: ใช้ `NEXT_PUBLIC_SITE_URL` บน production) |

**รายละเอียด L1**
- ตั้ง `secure_password_change = true` แล้ว และ `changePassword` เปลี่ยนรหัสด้วย session ที่เพิ่งยืนยันรหัสเดิม
- **ข้อจำกัด:** กันได้เฉพาะ session ที่เก่าเกิน 24 ชั่วโมง ทดสอบแล้วว่า session ที่เพิ่งล็อกอินยังเปลี่ยนรหัสได้โดยไม่ต้องใส่รหัสเดิม
- คู่มือนิสิตจึงต้องเตือนให้ออกจากระบบเมื่อใช้เครื่องส่วนกลาง
- project จริงต้องเปิด *Secure password change* ใน Dashboard **หลัง** deploy โค้ดนี้

## ตรวจแล้วผ่าน

**ฐานข้อมูล**
- RLS เปิดครบ 8 ตาราง และ policy ตรงกับตารางสิทธิ์ใน CLAUDE.md
- view ใช้ `security_invoker` และ anon ไม่มีสิทธิ์ตาราง
- `realtime.messages` มี policy SELECT เท่านั้น:
  - `problem-state` และ `problem-counts` รับได้เฉพาะนิสิตที่ active และอาจารย์
  - `problem-submissions:%` รับได้เฉพาะอาจารย์
  - ไม่มี policy INSERT
- ฟังก์ชัน SECURITY DEFINER ทุกตัวตั้ง `search_path = ''` (ตรวจบน project จริง) และตรวจผู้เรียกเอง anon เรียกได้เฉพาะ `get_public_results`, `is_instructor` และ `mask_student_id`
- `get_public_results` ไม่คืน SQL หรือชื่อ และ token สุ่มยาว 24 ตัว

**หน้าเว็บและ server**
- `/api/admin/**` เรียก `requireInstructor()` ก่อนทำงาน
- server action ใช้ session ของผู้เรียก ให้ RLS/RPC เป็นตัวบังคับ
- callback ของ auth ไม่มี open redirect
- markdown ไม่มี `rehype-raw` และไม่มี `dangerouslySetInnerHTML`

**key และ dependency**
- service key ใช้เฉพาะ `src/lib/supabase/admin.ts` (`server-only`)
- ไม่พบ `sb_secret_`, JWT หรือ `GOCSPX-` ในไฟล์ใน repo และใน `git log -p --all`
- bundle ใน `.next/static` ไม่มีค่า key หรือเฉลย
- `npm audit --omit=dev` ไม่พบช่องโหว่ ทั้งหมดเหลือ 7 moderate ใน devDependency (`@typescript-eslint`)

**Supabase advisors (project จริง)**
- WARN “SECURITY DEFINER executable” ของฟังก์ชันที่ตั้งใจให้เรียกได้ ทุกตัวตรวจผู้เรียกเอง
- WARN leaked password protection ปิดอยู่
- INFO index ของ `results.graded_by`
