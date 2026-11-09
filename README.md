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
   | `SUPABASE_SERVICE_ROLE_KEY` | Dashboard > Project Settings > API Keys > secret / service_role (**ติ๊ก Sensitive**) |
   | `NEXT_PUBLIC_COUNT_MODE` | `realtime` |
   | `NEXT_PUBLIC_SITE_URL` | URL ของเว็บบน Vercel เช่น `https://sqlquickquiz.vercel.app` |

4. **Deploy** — หลังจากนี้ทุก push ที่ `main` จะ deploy production อัตโนมัติ และทุก branch/PR ได้ preview URL
5. แนะนำ: Project Settings > Functions > Function Region เลือก **Singapore (sin1)** ให้ใกล้ฐานข้อมูล
6. ที่ Supabase Dashboard > Authentication > URL Configuration ตั้ง Site URL เป็น URL ของ Vercel และเพิ่ม `https://<โดเมน>/**` ใน Redirect URLs (ใช้ตอนเปิด Google login ในระยะที่ 2)

หมายเหตุ: ตัวแปร `NEXT_PUBLIC_*` ถูกฝังตอน build — แก้ค่าแล้วต้อง Redeploy

## โครงสร้างโฟลเดอร์

```
src/app/              หน้าเว็บ (App Router)
e2e/                  เทสต์ Playwright
supabase/config.toml  ค่าตั้ง Supabase local
supabase/migrations/  migration ฐานข้อมูล
supabase/tests/       เทสต์ pgTAP
docs/PLAN.md          แผนพัฒนา
```
