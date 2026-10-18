# IssueDesk

IssueDesk เป็นเว็บแอปสำหรับแจ้งปัญหา IT ภายในองค์กร ติดตามสถานะ Ticket และจัดการงานสำหรับผู้ดูแลระบบ

## ความสามารถ

- แจ้งปัญหา พร้อมหมวดหมู่ ความสำคัญ รายละเอียด และไฟล์แนบ
- ติดตาม Ticket ด้วยหมายเลข โดยหน้าสาธารณะแสดงเฉพาะสถานะและเวลา
- สมัครสมาชิกและเข้าสู่ระบบด้วยบัญชีอีเมล
- เก็บ Session ใน HttpOnly Cookie และตรวจสอบสิทธิ์ที่ Pages Functions
- จำกัด Dashboard และ API สำหรับดูหรือจัดการ Ticket ให้เฉพาะ Admin
- ใช้ Cloudflare D1 เก็บ Ticket, ข้อมูลผู้ใช้, Session และ metadata ของไฟล์แนบ

## เทคโนโลยี

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend | React 19, React Router, Vite |
| Styling | Tailwind CSS v4 |
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| File storage | Storage API ภายนอก; เอกสารระบบจัดเก็บระบุ Garage ผ่าน S3-compatible API |
| Package manager | pnpm |
| Code quality | ESLint |

> `wrangler.jsonc` ไม่มี R2 bucket binding โดยตรง ปัจจุบัน Pages Functions ติดต่อ Storage API ผ่าน URL และ secrets ที่ตั้งค่าไว้ด้านล่าง

## สิ่งที่ต้องเตรียม

- Node.js และ pnpm
- บัญชี Cloudflare ที่มีสิทธิ์ Pages และ D1 สำหรับ preview/deploy และ migration บน remote
- Storage API ที่ Pages Functions ติดต่อถึงได้ผ่าน HTTPS/Access หากต้องทดสอบไฟล์แนบ

Pages Functions ไม่สามารถเข้าถึง private network ของ Storage API ได้โดยอัตโนมัติ เอกสาร Storage API ใน `public/storage-docs-operations.md` แนะนำให้จัดเตรียม HTTPS tunnel/Access หรือช่องทางเชื่อมต่อที่ตั้งใจไว้ ห้ามเปิด Garage โดยตรงสู่อินเทอร์เน็ตเพื่อแก้ปัญหาการเชื่อมต่อ

## ติดตั้งและเริ่มพัฒนา

```sh
pnpm install
pnpm dev
```

`pnpm dev` เปิด Vite สำหรับพัฒนา frontend เท่านั้น หากต้องการเรียก Pages Functions และ D1 ในเครื่อง ให้เตรียม local D1 แล้วใช้ preview:

```sh
pnpm exec wrangler d1 migrations apply issuedesk-db --local
pnpm preview
```

`pnpm preview` จะ build frontend แล้วเปิด `wrangler pages dev` ตาม script ใน `package.json` หากทดสอบไฟล์แนบ ให้สร้าง `.dev.vars` ในโฟลเดอร์โปรเจกต์โดยใส่ค่าจริงเฉพาะในเครื่อง:

```dotenv
STORAGE_API_URL=
STORAGE_APP_SECRET=
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
```

อย่า commit `.dev.vars` หรือส่ง secrets ผ่าน source code, browser หรือ log

## คำสั่งที่ใช้บ่อย

| คำสั่ง | การทำงาน |
| --- | --- |
| `pnpm dev` | เปิด Vite dev server สำหรับ frontend |
| `pnpm lint` | ตรวจ JavaScript/JSX ด้วย ESLint |
| `pnpm build` | สร้าง production bundle ใน `dist/` |
| `pnpm preview` | build แล้วเปิด Pages Functions ในเครื่อง |
| `pnpm migrate` | แสดงสถานะ D1 migrations บน remote |
| `pnpm migrate-apply` | ใช้ migrations ที่ยังไม่รันกับ D1 remote |
| `pnpm deploy` | build แล้ว deploy ด้วย Wrangler Pages |
| `pnpm cf-typegen` | สร้าง Cloudflare environment types ด้วย Wrangler |

ตรวจ `wrangler.jsonc` และ Cloudflare project ให้ถูกต้องก่อน deploy หรือ apply migration บน remote

## Cloudflare และฐานข้อมูล

`wrangler.jsonc` กำหนด Pages output directory เป็น `dist` และ D1 binding ชื่อ `DB` ซึ่งชี้ไปยังฐานข้อมูล `issuedesk-db` โดยไม่ต้องใส่ Database ID ในเอกสารนี้

Migrations ใน repository:

| Migration | ตาราง/ข้อมูลที่สร้าง |
| --- | --- |
| `0001_create_issues.sql` | `issues` |
| `0002_create_issue_attachments.sql` | `issue_attachments` และ index ตาม Ticket |
| `0003_create_auth_tables.sql` | `users`, `sessions`, `login_attempts` และ index ที่เกี่ยวข้อง |

ตรวจสอบหรือ apply migration บน remote:

```sh
pnpm migrate
pnpm migrate-apply
```

คำสั่งเหล่านี้เปลี่ยนหรืออ่านฐานข้อมูล remote ตามลำดับ ควรตรวจ environment และ migration ที่กำลังจะรันก่อนเสมอ

## API

สิทธิ์ด้านล่างอ้างอิงการตรวจสอบใน Pages Functions ปัจจุบัน

| Method | Route | สิทธิ์/หน้าที่ |
| --- | --- | --- |
| `GET` | `/api/health` | ตรวจการเชื่อมต่อ D1 |
| `GET` | `/api/storage-health` | ตรวจการเชื่อมต่อ Storage API |
| `POST` | `/api/auth/register` | สมัครสมาชิก; role ใหม่เป็น `user` เสมอ |
| `POST` | `/api/auth/login` | ตรวจรหัสผ่านและออก Session Cookie |
| `GET` | `/api/auth/me` | แสดงผู้ใช้ของ Session ปัจจุบัน |
| `POST` | `/api/auth/logout` | ยกเลิก Session และล้าง Cookie |
| `POST` | `/api/issues` | สร้าง Ticket; ใช้โดยผู้แจ้งทั่วไป |
| `GET` | `/api/issues` | รายการ Ticket; ต้องเป็น Admin |
| `GET` | `/api/issues/stats` | สถิติ Ticket; ต้องเป็น Admin |
| `GET` | `/api/issues/:ticketNumber` | รายละเอียด Ticket; ต้องเป็น Admin |
| `PATCH` | `/api/issues/:ticketNumber` | เปลี่ยนสถานะ Ticket; ต้องเป็น Admin |
| `GET` | `/api/issues/:ticketNumber/attachments` | รายการไฟล์แนบ; ต้องเป็น Admin |
| `POST` | `/api/issues/:ticketNumber/attachments` | อัปโหลดไฟล์แนบของ Ticket |
| `GET` | `/api/issues/:ticketNumber/attachments/:attachmentId` | ดาวน์โหลดไฟล์; ต้องเป็น Admin |
| `DELETE` | `/api/issues/:ticketNumber/attachments/:attachmentId` | ลบไฟล์แนบ; ต้องเป็น Admin |
| `GET` | `/api/track/:ticketNumber` | ติดตามสาธารณะ; คืนเฉพาะหมายเลข สถานะ และเวลา |

รหัสผ่านใช้ PBKDF2-SHA-256 ผ่าน Web Crypto API ที่ 100,000 iterations ตามเพดานที่ Cloudflare Workers รองรับใน runtime ที่ตรวจพบ โทเคน Session จริงส่งผ่าน HttpOnly, Secure, SameSite=Lax Cookie ส่วน D1 เก็บเฉพาะ SHA-256 hash ของโทเคน

## สถานะโปรเจกต์

- Frontend สำหรับหน้า Portal, แจ้งปัญหา, ติดตาม Ticket, Dashboard และจัดการ Ticket มีอยู่ใน `src/`
- Pages Functions สำหรับ Issue, Authentication, Ticket tracking และ Storage API มีอยู่ใน `functions/api/`
- Authentication และการคุมสิทธิ์ Admin ถูกเชื่อมกับ routes และ API แล้ว การสมัครสมาชิกสำเร็จหลังปรับ PBKDF2 เป็น 100,000 รอบ
- `scripts/bootstrap-admin.py` เตรียมไว้สร้าง Admin คนแรกแบบ interactive โดยรับรหัสผ่านผ่าน terminal และป้องกันการสร้าง Admin ซ้ำ สคริปต์นี้เชื่อม D1 remote เมื่อรันจริง
- ยังควรยืนยันว่ามี Admin ใช้งานได้หลัง bootstrap และทดสอบ flow ของระบบบน deployment ล่าสุด
- Build อาจแสดงคำเตือน JavaScript bundle ใหญ่กว่า 500 kB ซึ่งยังเป็นงานปรับปรุงประสิทธิภาพ

สร้าง Admin คนแรกจากโฟลเดอร์โปรเจกต์:

```sh
python3 scripts/bootstrap-admin.py
```

สคริปต์จะถามชื่อ อีเมล และรหัสผ่านใน terminal จากนั้นต้องพิมพ์ `create` เพื่อยืนยันการเขียนไปยัง D1 remote ห้ามส่งรหัสผ่านให้ผู้อื่นหรือวางไว้ใน command line

## งานที่ควรทำต่อ

1. รัน Admin bootstrap ใน environment ที่ยืนยันว่า Wrangler เชื่อมกับ D1 remote ถูกฐานข้อมูล แล้วทดสอบ Login และหน้า Admin
2. ตรวจ flow หลัง deploy: การสมัคร/เข้าสู่ระบบ, การเข้าถึง API ด้วย user/admin, การแจ้ง Ticket, ไฟล์แนบ และหน้าติดตามสาธารณะ
3. ทบทวน rate limiting ของ Register/Login โดยเฉพาะการจำกัดตาม IP ไม่ใช่อีเมลเพียงอย่างเดียว
4. พิจารณาแยก JavaScript bundle เพื่อลดคำเตือนขนาดไฟล์
5. ตรวจการเชื่อมต่อ Storage API ใน production และนโยบายการเข้าถึง/เก็บรักษาไฟล์แนบ
