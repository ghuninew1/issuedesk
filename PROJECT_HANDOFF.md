# IssueDesk — Project Handoff

สรุปสถานะจาก source code ใน repository ณ วันที่ 22 ตุลาคม 2026 เพื่อให้กลับมาพัฒนาต่อได้โดยไม่ต้องไล่อ่านทั้งโปรเจกต์ เอกสารนี้อธิบายสิ่งที่โค้ดทำและค่าที่ต้องตั้งก่อนเปิดใช้ ส่วนการตั้งค่า production และสถานะ migration บน Cloudflare ต้องตรวจจาก Cloudflare ก่อนเปลี่ยนแปลงเสมอ

## ภาพรวม

IssueDesk เป็นระบบ IT Help Desk ภายในองค์กร ผู้แจ้งสร้าง Ticket และติดตามสถานะได้ ส่วน Admin จัดการ Ticket ไฟล์แนบ รูปใน Storage และทะเบียนอุปกรณ์จาก Google Sheets

| ส่วน | เทคโนโลยี/แหล่งข้อมูล |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Lucide |
| Backend | Cloudflare Pages Functions ใน `functions/api/` |
| Database | Cloudflare D1 / SQLite ผ่าน binding `DB` |
| File storage | Storage API ภายนอก (Garage ตามเอกสาร Storage) ผ่าน Cloudflare Access |
| Email | Resend HTTP API |
| Asset inventory | Google Sheets API โดยตรงจาก browser |
| Package manager | pnpm |

Version ใน `package.json` ปัจจุบันคือ `1.1.1` (README มี version เก่ากว่า)

## เส้นทางหน้าเว็บ

| Route | สิทธิ์ | จุดเริ่มต้น |
| --- | --- | --- |
| `/` | สาธารณะ | `src/pages/PortalHome.jsx` |
| `/report` | สาธารณะ | `src/pages/ReportIssue.jsx` |
| `/track/:ticketNumber` | สาธารณะ | `src/pages/TrackTicket.jsx` |
| `/login` | สาธารณะ | `src/pages/LoginRegister.jsx`; ถ้ามี session แล้วจะ redirect ตาม role |
| `/dashboard` | Admin | `DashboardPage` ใน `src/App.jsx` + dashboard components |
| `/issues` | Admin | `src/pages/Issues.jsx` |
| `/issues/:ticketNumber` | Admin | `src/pages/IssueDetail.jsx` |
| `/storage/images` | Admin | `src/pages/StorageImages.jsx` |
| `/sheet` | Admin | `src/pages/Sheet.jsx` |

`src/auth/ProtectedRoute.jsx` คุมหน้า Admin ฝั่ง client; Pages Functions ต้องคุม role ซ้ำที่ API ด้วย `requireRole` ใน `functions/api/auth/_utils.js`.

## API ที่มีอยู่

### Authentication

| Method / route | พฤติกรรม |
| --- | --- |
| `POST /api/auth/register` | สร้างบัญชี role `user`; รหัสผ่าน 12–128 ตัวอักษร, PBKDF2-SHA-256; จำกัดจำนวนครั้งตามอีเมล |
| `POST /api/auth/login` | ตรวจอีเมล/รหัสผ่าน, สร้าง session 7 วัน, ออก HttpOnly cookie |
| `GET /api/auth/me` | อ่านผู้ใช้จาก session cookie |
| `POST /api/auth/logout` | ยกเลิก session และล้าง cookie |
| `GET /api/auth/oauth?provider=google\|facebook` | เริ่ม OAuth authorization code flow และตั้ง state cookie |
| `GET /api/auth/oauth/callback/:provider` | แลก code, อ่านโปรไฟล์, ผูก provider ID, ออก session |

Social account ใช้ provider ID ใน `oauth_accounts`; ระบบไม่ผูกบัญชีเดิมอัตโนมัติด้วยอีเมล หากอีเมลนั้นมีบัญชีอยู่แล้ว ให้ใช้รหัสผ่านก่อน การเชื่อมบัญชีภายหลังยังไม่มี UI/API รองรับ การใช้งาน OAuth ต้องตั้ง client ID/secret ใน environment และลงทะเบียน callback URL ที่ตรงกับ origin จริง

### Issues และการติดตาม

| Method / route | สิทธิ์ / พฤติกรรม |
| --- | --- |
| `POST /api/issues` | สาธารณะ; ตรวจข้อมูล, ออก Ticket `IT-YYYYMM-NNNN` ตามเวลา Bangkok, บันทึก D1 และพยายามส่งอีเมล Resend |
| `GET /api/issues` | Admin; รายการและตัวกรอง/limit |
| `GET /api/issues/stats` | Admin; สถิติ Dashboard |
| `GET /api/issues/:ticketNumber` | Admin; รายละเอียด Ticket |
| `PATCH /api/issues/:ticketNumber` | Admin; เปลี่ยน `Open`, `In Progress`, `Resolved` |
| `DELETE /api/issues/:ticketNumber` | Admin; ลบไฟล์แนบจาก Storage ก่อน แล้วลบ metadata และ Ticket |
| `GET /api/issues/:ticketNumber/attachments` | Admin; แสดง metadata ไฟล์แนบ |
| `POST /api/issues/:ticketNumber/attachments` | อัปโหลดไฟล์ไป Storage และบันทึก metadata ใน D1 |
| `GET /api/issues/:ticketNumber/attachments/:attachmentId` | Admin; preview หรือดาวน์โหลดผ่าน proxy |
| `DELETE /api/issues/:ticketNumber/attachments/:attachmentId` | Admin; ลบไฟล์และ metadata |
| `GET /api/track/:ticketNumber` | สาธารณะ; คืนเฉพาะ Ticket number, status และ timestamps ที่ใช้ติดตาม |

การส่งอีเมลเป็น best effort: ถ้า Resend ล้มเหลว ระบบยังสร้าง Ticket สำเร็จและบันทึก error ใน Worker log

### Storage image management

| Method / route | สิทธิ์ / พฤติกรรม |
| --- | --- |
| `GET /api/storage/files` | Admin; list รูปจาก Storage (สูงสุด 100, ไม่มี pagination) |
| `POST /api/storage/files` | Admin; multipart field `file`, JPEG/PNG/WebP/GIF/AVIF, สูงสุด 10 MiB |
| `GET /api/storage/files/:fileId` | Admin; inline preview หรือดาวน์โหลดเมื่อ `?download=1` |
| `DELETE /api/storage/files/:fileId` | Admin; ลบจาก Storage และล้างแถวที่อ้างใน `issue_attachments` |

ลิงก์ที่คัดลอกจากหน้า Storage เป็น URL proxy ที่ต้องใช้ Admin session ไม่ใช่ public image URL บริการ Storage project ID ถูกกำหนดใน Pages Functions (`functions/api/storage/_utils.js` และ routes ไฟล์แนบ); หากเปลี่ยน project ให้ตรวจทุกจุดที่อ้างถึง

## Google Sheets: ทะเบียนอุปกรณ์

`src/hooks/useGoogleSheet.js` เรียก Google Sheets API โดยตรงจาก browser อ่าน tab `issuedesk` ช่วง `A1:L`; แถวแรกต้องเป็น header และแถวถัดไปถูก map เป็น object ตามชื่อ column เช่น `assetId`, `employeeName`, `department`, `computerName`, `computerImage`, `monitor1Image`, `monitor2Image`, `mouseImage`, `keyboardImage`, `wacomImage`, `status`, `notes`.

`src/pages/Sheet.jsx` ค้นหาและกรองข้อมูล แสดง 20 รายการต่อหน้า และโหลดรูปตัวอย่างเดียวต่ออุปกรณ์ในตาราง รูปช่องอื่นโหลดเมื่อเปิด preview/เลือกช่องรูป

Environment ที่ต้องมีตอน build:

| Variable | หมายเหตุ |
| --- | --- |
| `VITE_GOOGLE_SHEET_ID` | ID ของ Google Sheet |
| `VITE_GOOGLE_SHEETS_API_KEY` | ใช้ใน browser และถูก bundle ไปกับ frontend; จำกัด API key ใน Google Cloud ตาม HTTP referrer และเปิดเฉพาะ Sheets API ที่ต้องใช้ |

Sheet ต้องอนุญาตให้อ่านผ่าน API key ตามรูปแบบการแชร์ขององค์กร อย่าใส่ข้อมูลลับหรือข้อมูลส่วนบุคคลที่ไม่ควรเปิดเผยใน Sheet ที่หน้าเว็บอ่านได้

## D1 schema และ migrations

เรียงตาม migration file ปัจจุบัน:

| Migration | สิ่งที่เปลี่ยน |
| --- | --- |
| `0001_create_issues.sql` | ตาราง `issues` |
| `0002_create_issue_attachments.sql` | `issue_attachments` และ index ตาม issue |
| `0003_create_auth_tables.sql` | `users`, `sessions`, `login_attempts` |
| `0004_add_issue_in_progress_at.sql` | เพิ่ม `issues.in_progress_at` และ backfill สำหรับ Ticket ที่กำลังดำเนินการ |
| `0005_create_oauth_accounts.sql` | ตาราง provider identity และ unique `(provider, provider_user_id)` |

ตารางหลัก: `issues`, `issue_attachments`, `users`, `sessions`, `login_attempts`, `oauth_accounts`. มี migration file ใน repo ไม่ได้ยืนยันว่า migration ถูก apply แล้วใน remote D1; ใช้ `pnpm migrate` ตรวจสถานะก่อน และตรวจ target/environment ก่อน `pnpm migrate-apply`.

## Environment และ secrets

ตั้งค่าตาม environment จริง (local `.dev.vars`, Cloudflare Pages preview, production) อย่า commit ค่า secret:

| ชื่อ | ใช้กับ |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ISSUE_NOTIFICATION_EMAIL` | อีเมล Ticket ใหม่ |
| `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | ไฟล์แนบและหน้า Storage |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Facebook OAuth |
| `FACEBOOK_GRAPH_API_VERSION` | ไม่บังคับ; ใช้รูปแบบ `vN.N`, default ในโค้ดปัจจุบันคือ `v26.0` |
| `VITE_GOOGLE_SHEET_ID`, `VITE_GOOGLE_SHEETS_API_KEY` | Google Sheet; เป็น frontend build variables ไม่ใช่ secrets ฝั่ง server |

OAuth callback ต้องลงทะเบียนทั้งใน provider console และ URL ต้องตรงกับ host ที่แอปใช้ เช่น `/api/auth/oauth/callback/google` หรือ `/api/auth/oauth/callback/facebook`. Local callback ต้องใช้ host/port ของ `wrangler pages dev` จริง

## เริ่มพัฒนาและคำสั่ง

```sh
pnpm install
pnpm dev
```

`pnpm dev` เปิด Vite frontend เท่านั้น; Pages Functions/D1 ให้ใช้ local migration แล้ว `pnpm preview` ตาม scripts ใน `package.json`.

| คำสั่ง | ผล |
| --- | --- |
| `pnpm lint` | ESLint ทั้ง repository |
| `pnpm build` | build frontend ไป `dist/` |
| `pnpm preview` | build แล้วเปิด Pages Functions ผ่าน Wrangler |
| `pnpm migrate` | ดู migration state ของ remote D1 |
| `pnpm migrate-apply` | apply migrations ที่ยังไม่ใช้กับ remote D1; ตรวจ target ก่อนเรียก |
| `pnpm deploy` | build และ deploy Cloudflare Pages; ตรวจ project/environment ก่อนเรียก |
| `python3 scripts/bootstrap-admin.py` | สร้าง Admin แรกแบบ interactive บน remote D1 |

`wrangler.jsonc` กำหนด Pages output `dist` และ D1 binding `DB`. Local dev secrets ควรอยู่ใน `.dev.vars`, ซึ่งถูก ignore โดย Git.

## สถานะและสิ่งที่ต้องจำ

ฟีเจอร์หลักมีหน้าและ Pages API แล้ว: แจ้ง/ติดตาม Ticket, Admin dashboard/list/detail/status/delete, upload/preview/download/delete attachment, Storage image manager, email notification, email/password authentication, Google/Facebook OAuth flow และ asset inventory จาก Sheets

สิ่งที่ต้องยืนยันก่อนถือว่า production ครบ:

1. ตรวจ migrations `0001`–`0005` บน remote D1 และ apply เฉพาะเมื่อ target ถูกต้อง (โดยเฉพาะ `oauth_accounts` สำหรับ social sign-in)
2. ตรวจ Cloudflare Pages variables/secrets ของ production และ preview แยกกัน รวมทั้ง OAuth redirect URLs, Resend verified sender และ Storage Access
3. Facebook ต้องใช้ `FACEBOOK_GRAPH_API_VERSION` เป็นเลข version เช่น `v26.0`, ไม่ใช่ credential/token; ค่าใน local config เคยถูกแก้แล้ว แต่ยังต้องยืนยันกับ environment ที่กำลังทดสอบ
4. ปุ่ม “Forgot Password?” ใน `LoginRegister.jsx` ยังเป็นข้อความ toast เท่านั้น ไม่มี password reset API
5. หน้า Sheet ใช้ Google API key ที่ frontend มองเห็นได้ตามธรรมชาติของ `VITE_*`; ต้องจำกัด key ด้วย referrer/API restrictions และระวังความเป็นส่วนตัวของข้อมูลใน sheet
6. ทำ regression บน deployed/preview: สมัครและ login, role user/admin, OAuth provider, create Ticket + email, แนบไฟล์, status timeline, delete Ticket + Storage files, image management และโหลด Sheet ที่มีรูปหลายรายการ

เมื่อเขียนสรุปนี้ Git working tree แสดง `src/pages/Sheet.jsx` เป็นไฟล์ที่แก้ค้างอยู่ โปรดเก็บการเปลี่ยนแปลงนั้นไว้และตรวจ diff ก่อนทับหรือ checkout

## แผนผังไฟล์สำหรับแก้ต่อ

| ต้องแก้อะไร | เริ่มดูที่ |
| --- | --- |
| route/guard | `src/App.jsx`, `src/auth/ProtectedRoute.jsx` |
| session/password/OAuth | `functions/api/auth/`, `src/auth/`, `src/pages/LoginRegister.jsx`, `migrations/0005_create_oauth_accounts.sql` |
| Ticket form/API/email | `src/pages/ReportIssue.jsx`, `src/services/issues.js`, `functions/api/issues.js` |
| Ticket list/detail/delete/attachments | `src/pages/Issues.jsx`, `src/pages/IssueDetail.jsx`, `functions/api/issues/[ticketNumber].js`, `functions/api/issues/[ticketNumber]/attachments/` |
| public tracking timeline | `src/pages/TrackTicket.jsx`, `functions/api/track/[ticketNumber].js`, `migrations/0004_add_issue_in_progress_at.sql` |
| Storage UI/API | `src/pages/StorageImages.jsx`, `src/services/storage.js`, `functions/api/storage/`, `STORAGE_DOCS_API_REFERENCE.md` |
| Google Sheet inventory | `src/pages/Sheet.jsx`, `src/hooks/useGoogleSheet.js` |
| D1 setup/Admin bootstrap | `migrations/`, `wrangler.jsonc`, `scripts/bootstrap-admin.py` |

ดู [README.md](README.md) สำหรับเอกสารติดตั้งและรายละเอียดผู้ใช้ และดู `STORAGE_DOCS_*.md` สำหรับเอกสารระบบ Storage API
