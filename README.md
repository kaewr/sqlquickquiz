# SQL Quick Quiz

ระบบ quiz สั้นในห้องเรียนวิชา SQL: นิสิตส่งคำสั่ง SQL ผ่านเว็บ อาจารย์เปิด/ปิดโจทย์ ดูการส่งแบบ realtime ให้คะแนน และประกาศผล

- ข้อกำหนดและการตัดสินใจทั้งหมด: [CLAUDE.md](CLAUDE.md)
- แผนพัฒนาแต่ละระยะ: [docs/PLAN.md](docs/PLAN.md)

| ส่วน | เทคโนโลยี |
| --- | --- |
| เว็บ | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 → deploy บน Vercel |
| ฐานข้อมูล / Auth / Realtime | Supabase (PostgreSQL) — migration อยู่ใน `supabase/migrations/` |
| เทสต์ | pgTAP (`supabase/tests/database/`), Playwright (`e2e/`) |

## สิ่งที่ต้องติดตั้ง

- Node.js LTS (≥ 20.9)
- Docker Desktop (ต้องเปิดไว้ตอนรัน Supabase local)
- Git

Supabase CLI ติดตั้งมากับโปรเจกต์ (`devDependencies`) แล้ว เรียกผ่าน `npx supabase ...` ไม่ต้องติดตั้งทั้งเครื่อง

## รันในเครื่อง

```bash
npm install
npx playwright install chromium     # ครั้งแรกครั้งเดียว

npm run db:start                    # = supabase start (ครั้งแรกจะดึง Docker image นาน)
npx supabase status                 # ดู API URL และ key ของ local
```

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจาก `supabase status`:

| ตัวแปร | ค่าจาก `supabase status` |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL (`http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (service_role key) — ใช้เฉพาะ server route |

Google login บนเครื่อง: ใส่ `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` ใน `supabase/.env` (ไม่ถูก commit)
แก้ค่า auth ใน `supabase/config.toml` หรือ `supabase/.env` แล้วต้อง `npm run db:stop && npm run db:start`

```bash
npm run dev                         # http://localhost:3000
```

Supabase Studio local: http://127.0.0.1:54323 · หยุด Supabase: `npm run db:stop`

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รันเว็บโหมดพัฒนา |
| `npm run lint` / `npm run typecheck` | ตรวจโค้ด |
| `npm run build` | build แบบ production (เหมือนบน Vercel) |
| `npm run db:start` / `db:stop` / `db:status` | เปิด / ปิด / ดูสถานะ Supabase local |
| `npm run db:reset` | ล้างฐานข้อมูล local แล้วรัน migration + seed ใหม่ |
| `npm run test:db` | รันเทสต์ pgTAP (`supabase test db`) — ต้อง `db:start` ก่อน |
| `npm run test:e2e` | รันเทสต์ Playwright (สตาร์ต `next dev` ให้เอง) ทั้งจอคอมและมือถือ |
| `npm test` | รันทั้งสองชุด |

### รายชื่อนิสิต (CSV)

แม่แบบ: [docs/students-template.csv](docs/students-template.csv) — คอลัมน์ `student_id` (ตัวเลข 8 หลัก), `first_name`, `last_name`, `section` ห้ามว่าง
แก้ใน Excel แล้ว Save As เป็น **CSV UTF-8 (Comma delimited)** จากนั้นอัปโหลดที่หน้า `/admin/students`

### ข้อมูลทดสอบ (seed, เฉพาะ local)

`npm run db:reset` สร้างข้อมูลจาก [supabase/seed.sql](supabase/seed.sql):

| บัญชี | ล็อกอิน | รหัสผ่าน |
| --- | --- | --- |
| อาจารย์ | `instructor@example.com` | `instructor-local` (มี identity Google จำลองไว้แล้ว) |
| นิสิต 5 คน | `65000001` – `65000005` (อีเมลภายใน `<รหัส>@quiz.local`) | เท่ากับรหัสนิสิต |
| อาจารย์จริง | `pornthep.ro@up.ac.th` | ไม่มีรหัสผ่าน — ล็อกอิน Google ที่ `/admin` แล้วผูกบัญชีให้เอง |

โจทย์ 3 ข้อ: ข้อ 1 เปิดอยู่, ข้อ 2 ปิดแล้ว ประกาศผลแล้ว (token `local-demo-token-problem-2`), ข้อ 3 ยังไม่เปิด

### เทสต์ฐานข้อมูล

ไฟล์อยู่ใน `supabase/tests/database/` ใช้ตัวช่วยจาก `_helpers.psql` (`\ir _helpers.psql`)
— ทุกไฟล์ห่อด้วย `begin … rollback` และล้าง seed ภายใน transaction ยกเว้น `070_concurrency` ที่ใช้ `dblink`
ยิงพร้อมกันหลาย connection จริงแล้วล้างข้อมูลของตัวเองตอนจบ

### Migration

```bash
npx supabase migration new <ชื่อ>   # สร้างไฟล์ใน supabase/migrations/
npm run db:reset                    # ทดลองบน local
npx supabase db push                # ส่งขึ้น project จริง (หลัง link แล้ว)
```

## เชื่อมกับ Supabase project จริง

Project: `anyvflatoeedytlrntmp` (https://anyvflatoeedytlrntmp.supabase.co, region Singapore)

```bash
npx supabase login                                   # เปิดเบราว์เซอร์ให้ล็อกอิน
npx supabase link --project-ref anyvflatoeedytlrntmp # จะถามรหัสผ่านฐานข้อมูล
```

รหัสผ่านฐานข้อมูลอยู่ที่ Dashboard > Project Settings > Database (รีเซ็ตได้ถ้าลืม) ห้ามเก็บใน repo

## Deploy บน Vercel

1. push โค้ดขึ้น GitHub (private repo `kaewr/sqlquickquiz`)
2. ที่ https://vercel.com/new เลือก **Import** repo นี้ — Framework จะตรวจเป็น Next.js เอง ไม่ต้องแก้ build command
3. ใส่ **Environment Variables** (Production และ Preview):

   | ตัวแปร | ค่า |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://anyvflatoeedytlrntmp.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard > Project Settings > API Keys > publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Dashboard > Project Settings > API Keys > secret key (**ติ๊ก Sensitive**) — ใช้ในหน้าจัดการนิสิต |
   | `NEXT_PUBLIC_COUNT_MODE` | `realtime` |
   | `NEXT_PUBLIC_SITE_URL` | URL ของเว็บบน Vercel `https://sqlquickquiz.vercel.app` |

4. **Deploy** — หลังจากนี้ทุก push ที่ `main` จะ deploy production อัตโนมัติ และทุก branch/PR ได้ preview URL
5. แนะนำ: Project Settings > Functions > Function Region เลือก **Singapore (sin1)** ให้ใกล้ฐานข้อมูล
6. ที่ Supabase Dashboard > Authentication > URL Configuration ตั้ง Site URL เป็น URL ของ Vercel และเพิ่ม `https://<โดเมน>/**` ใน Redirect URLs (ใช้ตอนเปิด Google login ในระยะที่ 2)

หมายเหตุ: ตัวแปร `NEXT_PUBLIC_*` ถูกฝังตอน build — แก้ค่าแล้วต้อง Redeploy

### ค่าตั้งของ Supabase project จริง (ทำใน Dashboard)

| ที่ | ค่า |
| --- | --- |
| Authentication > Sign In / Providers | ปิด *Allow new users to sign up*, เปิด Google (Client ID/Secret) |
| Authentication > Sign In / Providers > Email | Minimum password length = **8** |
| Authentication > Rate Limits | sign-ups and sign-ins ≥ **1000** / 5 นาที, token refreshes ≥ **1800** / 5 นาที (ทั้งห้องใช้ IP เดียวกัน) |
| Authentication > URL Configuration | Site URL = `https://sqlquickquiz.vercel.app`, Redirect URLs = `https://sqlquickquiz.vercel.app/**`, `http://localhost:3000/**` |
| Authentication > Users > Add user | สร้าง `pornthep.ro@up.ac.th` (Auto Confirm) ครั้งเดียว — Google จะผูกเข้ากับบัญชีนี้ตอนล็อกอินครั้งแรก |

## โครงสร้างโฟลเดอร์

```
src/app/              หน้าเว็บ (App Router)
e2e/                  เทสต์ Playwright
supabase/config.toml  ค่าตั้ง Supabase local
supabase/migrations/  migration ฐานข้อมูล
supabase/tests/       เทสต์ pgTAP
docs/PLAN.md          แผนพัฒนา
```
