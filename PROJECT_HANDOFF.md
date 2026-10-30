# IssueDesk — Project Handoff

## Sidebar navigation highlight — 30 ตุลาคม 2026

- เพิ่มพื้นหลังสีตามธีมที่เลื่อนระหว่างเมนู Sidebar เมื่อ hover หรือ focus โดยคงสถานะ active แยกไว้ และรองรับ reduced motion
- ตรวจ `AGENTS.md` และ `README.md` แล้ว; `pnpm lint` ผ่าน ยังไม่ได้ตรวจ browser หรือ deploy

## Dark theme palette — 30 ตุลาคม 2026

- ปรับ `src/index.css` เฉพาะ `.dark` ให้พื้นหลังและ surfaces เป็นดำอมฟ้า `#090d12` ใกล้ Sites ลดสีเขียวในพื้นที่กว้าง; คงมินต์ไว้ที่ primary/accent/chart และไม่เปลี่ยน Light mode
- ตรวจ `AGENTS.md`, `README.md` และ handoff ให้ตรงกับ source; `pnpm build` และ `git diff --check` รอบปรับเฉดนี้ผ่าน
- ยังไม่ได้ตรวจภาพใน browser หรือ deploy; โหมด Light และ production ยังไม่ได้ตรวจใน browser

## Sidebar NavLink hover — 29 ตุลาคม 2026

- ปรับ `src/components/layout/Sidebar.jsx` และ `src/index.css` ให้ NavLink ใน Sidebar ใช้ Liquid Glass hover โหมด Light ที่อิง currentColor สำหรับพื้นหลัง แสง ขอบ และเงา ให้สอดคล้องกับปุ่ม Collapse; shared `glassHover` และ Dark mode ยังคงเดิม
- ขยาย treatment เดียวกันให้ `.glass-button` เพื่อให้ปุ่ม `GlassButton` ทั่วแอปใช้พื้นหลัง แสง ขอบ และเงาที่อิง currentColor ใน Light mode
- อัปเดต README และ AGENTS.md ให้ตรงกับ interaction ปัจจุบัน
- ตรวจ `git diff --check` ผ่าน; ยังไม่ได้รัน lint/build หรือ browser QA รอบนี้

## Shared Storage Phase S1/S2 — local implementation

2026-10-27: S1 added the manager/Garage boundary and streaming download; S2 added an additive local folder/file schema, internal `/v3` File Manager routes, paging, duplicate-name enforcement, copy verification, Trash/restore/permanent-delete operations and reconciliation state. Existing v2 auth/scope and response formats remain; v2 permanent DELETE is preserved. Historical checks: `pnpm --dir garage/storage test` 27/27, IssueDesk `pnpm lint` and `git diff --check` passed; not rerun in this documentation audit. Tests use memory SQLite/fake S3; Garage/Cloudflare Access were not checked. The original S2 work did not apply the migration; current deployment/database state was not inspected. Inspect migration state and back up before an authorized run of `pnpm --dir garage/storage migrate` before starting this service version. See [PHASE_S2.md](garage/storage/PHASE_S2.md) for API, migration and rollback details. S2 is complete locally. No deployment was performed in this audit. This checkout does not establish the current status of Nexora.


สรุปสถานะจาก source code ใน repository ณ วันที่ 28 ตุลาคม 2026 เพื่อให้กลับมาพัฒนาต่อได้โดยไม่ต้องไล่อ่านทั้งโปรเจกต์ เอกสารนี้อธิบายสิ่งที่โค้ดทำและค่าที่ต้องตั้งก่อนเปิดใช้ ส่วนการตั้งค่า production และสถานะ migration บน Cloudflare ต้องตรวจจาก Cloudflare ก่อนเปลี่ยนแปลงเสมอ

## Network Monitor UI follow-up — 30 ตุลาคม 2026

- นำการ์ดอุณหภูมิ Router และ RouterOS Version ออกจากหน้า Network Monitor ตามคำขอ; API และ Agent ยังคงรูปแบบเดิม
- ซ่อนส่วน Interfaces และ Connected Devices ระหว่างที่ API ยังไม่มีข้อมูล และจัด Traffic แยกตาม WAN ไว้ข้างสถานะ WAN; ขยาย WAN RX/TX History เต็มความกว้าง

- ปรับหน้า `/network-monitor` เฉพาะ UI: เพิ่ม Router Health, WAN RX/TX counters/IP slots, แยก Interfaces และ Connected Devices พร้อม unavailable states, ทำให้ history/events บอกขอบเขต API ชัด และย้าย Ping Monitor ไว้ล่างสุด โดยคง viewer lease และ ping queue/polling เดิม
- Source API/Agent ปัจจุบันส่ง Router identity/uptime/CPU/RAM/optional temperature และ WAN AIS/True interface running/IP (ปัจจุบัน Agent ใส่ null)/RX/TX; events มี WAN transitions และ Agent heartbeat/offline เท่านั้น. ยังไม่มี RouterOS version, interface errors/list, DHCP/ARP devices, PPPoE uptime หรือ historical CPU/RAM/latency/packet loss
- เปลี่ยนแปลงถูกนำเข้า checkout หลัก `/Users/ghuninew/GitHub/issuedesk` (branch `main`) เป็นการแก้ไขที่ยังไม่ commit; ตรวจใน worktree แยก `/Users/ghuninew/Documents/Codex/issuedesk-network-monitor-ui`. `pnpm --config.verifyDepsBeforeRun=false lint` ผ่าน; `git diff --check` ผ่าน. `pnpm lint` แบบปกติถูก pnpm พยายาม sync dependencies แต่ติด DNS registry; lint ที่ผ่านใช้ dependencies ที่ติดตั้งอยู่แล้ว. ไม่ได้ build, browser QA, deploy หรือเปลี่ยน production

## กฎส่งต่องานและผลตรวจรอบนี้ — 28 ตุลาคม 2026

- Checkout: `/Users/ghuninew/GitHub/issuedesk`; branch `main`, HEAD `2b4f2f1` (`feat: update SKILL.md to recommend using GlassButton for UI actions`); working tree สะอาดก่อนเริ่ม
- ตรวจ `package.json`, `src/App.jsx`, API exports, D1 migrations และ Storage service source เทียบเอกสาร: version 1.3.4, Sheet ใช้ session, Network Monitor เป็น Admin, Image Converter/QR ใช้ session และมี D1 migrations `0001`–`0011`
- API inventory: 38 endpoint files / 55 method-route pairs ใต้ `functions/api/` รวม POST/OPTIONS ของ Resend; helper 7 ไฟล์; public `/q/:slug` แยกออก ดูตารางครบใน README
- เปลี่ยนเฉพาะ `AGENTS.md`, `README.md`, `PROJECT_HANDOFF.md`; ไม่มีการเปลี่ยน application behavior หรือ runtime data
- พยายาม `pnpm lint` แต่ขั้นเตรียม dependencies ติด DNS ไป registry.npmjs.org จึงหยุดก่อนรัน ESLint; ยังยืนยัน lint ไม่ได้ ไม่รัน build/tests/browser QA สำหรับงานเอกสาร ผล local และคำยืนยัน production ในบันทึกก่อนหน้าเป็นประวัติเดิม ไม่ใช่ผลรอบนี้
- ตรวจเนื้อหาและ `git diff --check` สำหรับเอกสารรอบนี้ผ่าน
- ไม่ได้ deploy, apply migrations, ตรวจ secrets หรือเรียกบริการ production รอบนี้; ผลตรวจ source ไม่ยืนยันสถานะภายนอก

หลังจบ feature, fix, migration, API, infrastructure หรือการเปลี่ยนแปลงสำคัญ ต้อง review/sync **AGENTS.md + README.md + PROJECT_HANDOFF.md** ในงานเดียวกันทุกครั้ง หากเนื้อหาบางไฟล์ยังตรงให้ระบุว่าตรวจแล้ว ดูกฎถาวรใน AGENTS.md รักษา React/Tailwind v4/Vite/pnpm, `cx()` และ mobile-first; ใช้ `pnpm lint` เป็น primary code check ไม่ build ซ้ำหลังแก้เล็กน้อย

จุดเริ่มงานถัดไป: ตรวจ Git status และกฎ AGENTS.md ใหม่ก่อนแก้โค้ด; หากต้องตรวจ lint ให้เตรียม dependencies เมื่อ network พร้อม แล้วเลือก validation ตามส่วนที่เปลี่ยน โดยไม่ถือว่าประวัติ tests เดิมเป็นผลปัจจุบัน

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

Version ใน `package.json` ปัจจุบันคือ `1.3.4`.

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
| `/sheet` | Login required | `src/pages/Sheet.jsx` |
| `/attendance` | Login required | `src/pages/Attendance.jsx`; User เห็นข้อมูลตนเอง ส่วน Admin เห็นภาพรวม/รายการทีมแบบอ่านอย่างเดียว |
| `/network-monitor` | Admin | `src/pages/NetworkMonitor.jsx`; ดูข้อมูล RouterOS และเรียก ping ผ่าน queue/agent |
| `/qr-studio`, `/qr-studio/links`, `/qr-studio/saved` | Login required | `src/pages/qr/QRCodeStudio.jsx` และหน้าภายใต้ QR Studio |
| `/image-converter` | Login required | `src/pages/ImageConverter.jsx`; แปลงและ resize รูปใน browser |

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

### Attendance

| Method / route | สิทธิ์ / พฤติกรรม |
| --- | --- |
| `GET /api/attendance/today` | Session ปัจจุบัน; คืน work date ตาม `Asia/Bangkok` และ record ของวันนี้หรือ `null` |
| `POST /api/attendance/check-in` | Session ปัจจุบัน; ตรวจ same-origin, ใช้ user ID จาก Session และเวลา UTC จาก server; unique `(user_id, work_date)` กันการลงเวลาซ้ำ |
| `POST /api/attendance/check-out` | Session ปัจจุบัน; ตรวจ same-origin และ conditional update เฉพาะ record `working` ที่ยังไม่มีเวลาออก |
| `GET /api/attendance/history?page=1&limit=20` | Session ปัจจุบัน; ประวัติของ user ปัจจุบันเท่านั้น, `limit` สูงสุด 50; คืน `totalDurationSeconds` สะสมทั้งหมดและ `durationAsOf` |
| `GET /api/admin/attendance/summary` | Admin; สรุปจำนวน record ทั้งหมด, กำลังทำงาน/เช็คเอาต์วันนี้, record ค้างจากวันก่อน และ `totalDurationSeconds` สะสม |
| `GET /api/admin/attendance/records?date=YYYY-MM-DD&q=name&page=1&limit=30` | Admin; ค้นหาชื่อ/อีเมล กรองวันที่ แบ่งหน้า (limit สูงสุด 100) และคืน `work_duration_seconds` ต่อรายการพร้อม `durationAsOf` |

`functions/api/attendance/_utils.js` มี helper สำหรับ `work_date` ไทยและ error response; ใช้ `getSessionUser`, `requireRole`, `isSameOrigin` จาก auth helper เดิม ไม่รับ `user_id`, `role` หรือ timestamp จาก request body. API ตอบ 401 เมื่อไม่มี Session, 403 เมื่อไม่ใช่ Admin/Origin ไม่ผ่าน, 409 เมื่อ check-in ซ้ำหรือไม่มี record ที่เช็คเอาต์ได้

Schema รองรับหนึ่ง record ต่อ user ต่อวัน ไม่มีหลายกะหรือกะข้ามวัน; ยังไม่มี grace period, นโยบายพัก, วันหยุด, OT, การอนุมัติ หรือแก้ไขเวลาย้อนหลัง เวลารวมสะสมคิดจากช่วงเช็คอินถึงเช็คเอาต์ และเพิ่มเวลาปัจจุบันให้รายการ `working` ของวันนี้เท่านั้น; record ค้างวันก่อนแสดงเป็น abnormal/ผิดปกติ โดยไม่เติมเวลาเช็คเอาต์เอง

### Issues และการติดตาม

| Method / route | สิทธิ์ / พฤติกรรม |
| --- | --- |
| `POST /api/issues` | สาธารณะ; ตรวจข้อมูล, ออก Ticket `IT-YYYYMM-NNNN` ตามเวลา Bangkok, บันทึก D1 และพยายามส่งอีเมล Resend |
| `POST /api/resend` | contact form จาก Origin ที่อนุญาต; ส่งอีเมลถึงผู้รับที่กำหนดใน server environment เท่านั้น ดู `RESEND_API.md` |
| `GET /api/issues` | Admin; รายการล่าสุด, `limit` default 20/max 100; ไม่มี server-side search/status filter |
| `GET /api/issues/stats` | Admin; สถิติ Dashboard |
| `GET /api/issues/:ticketNumber` | Admin; รายละเอียด Ticket |
| `PATCH /api/issues/:ticketNumber` | Admin; เปลี่ยน `Open`, `In Progress`, `Resolved` |
| `DELETE /api/issues/:ticketNumber` | Admin; ลบไฟล์แนบจาก Storage ก่อน แล้วลบ metadata และ Ticket |
| `GET /api/issues/:ticketNumber/attachments` | Admin; แสดง metadata ไฟล์แนบ |
| `POST /api/issues/:ticketNumber/attachments` | สาธารณะ; อัปโหลดไฟล์ไป Storage และบันทึก metadata ใน D1 |
| `GET /api/issues/:ticketNumber/attachments/:attachmentId` | Admin; preview หรือดาวน์โหลดผ่าน proxy |
| `DELETE /api/issues/:ticketNumber/attachments/:attachmentId` | Admin; ลบไฟล์และ metadata |
| `GET /api/track/:ticketNumber` | สาธารณะ; คืนเฉพาะ Ticket number, status และ timestamps ที่ใช้ติดตาม |

การส่งอีเมลเป็น best effort: ถ้า Resend ล้มเหลว ระบบยังสร้าง Ticket สำเร็จและบันทึก error ใน Worker log

### Storage image management

| Method / route | สิทธิ์ / พฤติกรรม |
| --- | --- |
| `GET /api/storage/files` | Admin; list ไฟล์ทั้งหมดจาก Storage เรียงใหม่ไปเก่า |
| `POST /api/storage/files` | Admin; multipart field `file`, รองรับรูป/เอกสาร/ไฟล์สื่อหลายชนิด สูงสุด 10 MiB ต่อไฟล์ |
| `GET /api/storage/files/:fileId` | ผู้ใช้ที่ล็อกอินดูรูปที่รองรับแบบ inline และดาวน์โหลดรูปได้; ดาวน์โหลดไฟล์ชนิดอื่นต้องเป็น Admin |
| `DELETE /api/storage/files/:fileId` | Admin; ลบจาก Storage และล้างแถวที่อ้างใน `issue_attachments` |

ลิงก์ที่คัดลอกจากหน้า Storage เป็น URL proxy ที่ต้องใช้ session; ภาพ raster ที่รองรับอ่าน/ดาวน์โหลดได้โดยสมาชิก ส่วนไฟล์อื่นต้องเป็น Admin และดาวน์โหลด ไม่ใช่ public URL บริการ Storage project ID ถูกกำหนดใน Pages Functions (`functions/api/storage/_utils.js` และ routes ไฟล์แนบ); หากเปลี่ยน project ให้ตรวจทุกจุดที่อ้างถึง

## Google Sheets: ทะเบียนอุปกรณ์

`src/hooks/useGoogleSheet.js` เรียก Google Sheets API โดยตรงจาก browser อ่าน tab `issuedesk` ช่วง `A1:L`; แถวแรกต้องเป็น header และแถวถัดไปถูก map เป็น object ตามชื่อ column เช่น `assetId`, `employeeName`, `details`, `computerName`, `computerImage`, `monitor1Image`, `monitor2Image`, `mouseImage`, `keyboardImage`, `wacomImage`, `status`, `notes`.

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
| `0006_create_attendance_records.sql` | `attendance_records`, foreign key ไป `users`, unique `(user_id, work_date)` และ index ตามวัน/user |
| `0007_create_network_monitoring.sql` | ข้อมูล snapshot/heartbeat สำหรับ Network Monitor |
| `0008_create_network_monitor_viewers.sql` | viewer leases สำหรับเปิดเก็บข้อมูลตามการใช้งานหน้า Admin |
| `0009_create_network_ping_checks.sql` | คิวและผลการตรวจ ping ที่ร้องขอโดย Admin |
| `0010_create_qr_studio_tables.sql` | QR codes และ short links |
| `0011_create_qr_logo_ownership.sql` | เจ้าของและ MIME type ของโลโก้ QR |

D1 migrations ใน source มี `0001`–`0011`. เอกสารเดิมบันทึกทั้งการตรวจ remote ที่ล้มเหลวเมื่อ 24 ต.ค. 2026 และคำยืนยันภายหลังว่า apply ทั้งหมดแล้ว; เก็บคำยืนยันนี้เป็นข้อมูลที่ผู้ใช้รายงาน ไม่ใช่ผลตรวจสด รอบ 28 ต.ค. ไม่ได้เรียก Cloudflare หรือ apply migration ใด ๆ ก่อนเปลี่ยนฐานข้อมูลครั้งถัดไปให้ตรวจ target/environment และสถานะจริงด้วย `pnpm migrate` ส่วน `pnpm migrate-apply` ต้องได้รับอนุญาต แยกจาก SQLite migration ของ `garage/storage` เสมอ

## Environment และ secrets

ตั้งค่าตาม environment จริง (local `.dev.vars`, Cloudflare Pages preview, production) อย่า commit ค่า secret:

| ชื่อ | ใช้กับ |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ISSUE_NOTIFICATION_EMAIL` | อีเมล Ticket ใหม่ |
| `RESEND_ALLOWED_ORIGINS`, `RESEND_TO_EMAIL` | external contact form `/api/resend`; recipient fallback ไป `ISSUE_NOTIFICATION_EMAIL`; ดู `RESEND_API.md` |
| `NETWORK_AGENT_TOKEN` | bearer token ของ Network Monitor agent; แยกจาก session/Access credentials |
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

ฟีเจอร์ที่มีใน source ปัจจุบัน: แจ้ง/ติดตาม Ticket, Admin dashboard/list/detail/status/delete, attachments, Storage image manager, email notification, email/password authentication, Google/Facebook OAuth flow, asset inventory จาก Sheets, Time Attendance, Network Monitor และ QR Studio/short links

ตามสถานะที่ผู้ใช้แจ้ง งานแก้ไขที่เคยระบุให้ทำต่อเสร็จแล้ว รายการต่อไปนี้เป็นการตรวจสอบภายนอกหรือข้อจำกัดที่ต้องสื่อสาร ไม่ใช่งานแก้โค้ดที่ค้างอยู่:

- ผู้ใช้เคยรายงานว่า apply D1 migrations แล้ว แต่รอบนี้ไม่ได้ตรวจ remote ซ้ำ; ก่อน migration ครั้งถัดไปต้องตรวจ target/environment และสถานะจริง
- ตรวจ Cloudflare Pages variables/secrets ของ production และ preview แยกกัน รวม OAuth redirect URLs, Resend verified sender และ Storage Access ก่อนถือว่า production พร้อม
- Facebook ใช้ `FACEBOOK_GRAPH_API_VERSION` รูปแบบเลข version เช่น `v26.0`; ค่าและการทำงานจริงต้องยืนยันกับ environment ที่ใช้งาน
- หน้า Sheet เรียก Google Sheets จาก browser ด้วย `VITE_*`; จำกัด API key ด้วย referrer/API restrictions และตรวจการเปิดเผยข้อมูลใน Sheet
- การทดสอบ production/preview ของ auth, OAuth, Ticket/email, attachments, Storage, Sheet และ Attendance ยังต้องทำใน environment จริงหลังตรวจการตั้งค่าและ migration

ข้อจำกัดผลิตภัณฑ์ที่ source ปัจจุบันยังแสดงอยู่: ปุ่ม “Forgot Password?” ใน `src/pages/LoginRegister.jsx` แสดง toast เท่านั้นและยังไม่มี password reset API; Google Sheets API key อยู่ใน frontend ตามธรรมชาติของ `VITE_*` และต้องจำกัดสิทธิ์ตามข้างต้น

การตรวจ local ที่บันทึกไว้: Attendance เคยผ่าน `pnpm lint` และ `pnpm build` (มีคำเตือน bundle ขนาดใหญ่); QR Studio และ sandbox ผ่าน regression/local browser checks ตามรายละเอียดด้านล่าง ทั้งหมดนี้ไม่ใช่หลักฐานว่า migrations ถูก apply, Storage เขียนได้ หรือ deploy production แล้ว

## แผนผังไฟล์ตามส่วนงาน

| ส่วนงาน | จุดเริ่มต้น |
| --- | --- |
| route/guard | `src/App.jsx`, `src/auth/ProtectedRoute.jsx` |
| session/password/OAuth | `functions/api/auth/`, `src/auth/`, `src/pages/LoginRegister.jsx`, `migrations/0005_create_oauth_accounts.sql` |
| Ticket form/API/email | `src/pages/ReportIssue.jsx`, `src/services/issues.js`, `functions/api/issues.js` |
| Ticket list/detail/delete/attachments | `src/pages/Issues.jsx`, `src/pages/IssueDetail.jsx`, `functions/api/issues/[ticketNumber].js`, `functions/api/issues/[ticketNumber]/attachments/` |
| public tracking timeline | `src/pages/TrackTicket.jsx`, `functions/api/track/[ticketNumber].js`, `migrations/0004_add_issue_in_progress_at.sql` |
| Time Attendance UI/API | `src/pages/Attendance.jsx`, `src/App.jsx`, `src/components/layout/Sidebar.jsx`, `functions/api/attendance/`, `functions/api/admin/attendance/`, `migrations/0006_create_attendance_records.sql` |
| Network Monitor UI/API/agent | `src/pages/NetworkMonitor.jsx`, `functions/api/network/`, `garage/network-monitor/`, `migrations/0007_create_network_monitoring.sql`–`0009_create_network_ping_checks.sql` |
| QR Studio, short links, logo upload | `src/pages/qr/`, `src/components/qr/`, `functions/api/qr-codes/`, `functions/api/short-links/`, `functions/api/qr-logos/`, `shared/qr.js`, `migrations/0010_create_qr_studio_tables.sql`, `migrations/0011_create_qr_logo_ownership.sql` |
| Image Converter | `src/pages/ImageConverter.jsx`, `src/components/tools/`, `src/utils/imageConverter.js`, `src/utils/createZip.js`, `src/utils/imageDimensions.js`, `src/workers/image.worker.js` |
| Storage UI/API | `src/pages/StorageImages.jsx`, `src/services/storage.js`, `functions/api/storage/`, `STORAGE_DOCS_API_REFERENCE.md` |
| Google Sheet inventory | `src/pages/Sheet.jsx`, `src/hooks/useGoogleSheet.js` |
| D1 setup/Admin bootstrap | `migrations/`, `wrangler.jsonc`, `scripts/bootstrap-admin.py` |

ดู [README.md](README.md) สำหรับเอกสารติดตั้งและรายละเอียดผู้ใช้ และดู `STORAGE_DOCS_*.md` สำหรับเอกสารระบบ Storage API

## QR Code Studio V1 (2026-10-26)

- เพิ่ม protected routes `/qr-studio`, `/qr-studio/links`, `/qr-studio/saved` ภายใต้ AppShell เดิม และ QR Studio ใน Sidebar
- Orchestrator: `src/pages/qr/QRCodeStudio.jsx`; components ใน `src/components/qr/`; renderer instance ใช้ ref/update ใน `src/hooks/qr/useQRCode.js` และ encode UTF-8 สำหรับข้อความภาษาไทย
- Validation ร่วม: `shared/qr.js`; session/origin/QR validation/error envelope: `functions/api/qr-codes/_utils.js`; browser ใช้ `src/services/qr.js` ผ่าน `api()` เดิม ซึ่งรองรับ error envelope ใหม่ด้วย
- CRUD: `functions/api/qr-codes/`, `functions/api/short-links/`; resource อ่าน/แก้ไข/ลบ scope ด้วย ID + session user; slug immutable และมี atomic DELETE guard ป้องกันลบลิงก์ที่ QR อ้างอิง
- Public redirect: `functions/q/[slug].js` ตรวจ active แล้วส่ง 302/no-store ไม่มี session; Vite อย่างเดียวไม่รัน Function นี้
- ใช้ migration `0010_create_qr_studio_tables.sql` ที่มีใน working tree โดยไม่แก้ทับ เพิ่ม `0011_create_qr_logo_ownership.sql` สำหรับเจ้าของและ MIME ของโลโก้
- โลโก้ local preview มี object URL cleanup; upload เฉพาะ Save ผ่าน `functions/api/qr-logos/` ใช้ config/headers/project และ `/v2/projects/:projectId/files` ของ Garage เดิม จำกัด session owner, PNG/JPEG/WebP, signature และ 2 MB โดยไม่เปลี่ยนสิทธิ์ Storage management เดิม
- `qr_codes.logo_url` เป็น same-origin `/api/qr-logos/:id` ไม่รับ remote URL หรือ Base64 โลโก้; rendered PNG/SVG สร้างใน browser ไม่เก็บ D1
- การบันทึก Storage/Short Link/QR ไม่ใช่ transaction ข้าม service: retry ในหน้าเดิม reuse uploaded logo และลิงก์ที่สร้างสำเร็จแล้ว ไม่มี automatic orphan-logo cleanup ใน V1; ห้ามสรุปว่า remote Storage พร้อมจากโค้ดเท่านั้น
- Regression suite: `node --test scripts/qr-studio-checks.mjs` ใช้ `scripts/qr-fixture.mjs` เป็น in-memory SQLite D1 adapter; Storage ถูก mock ไม่อ่าน secrets หรือ DB จริง
- ผลใช้งานจริงล่าสุด: ผู้ใช้ยืนยันว่าอัปโหลดได้ทั้ง Storage Images และ QR Studio หลังแก้ ownership ของ Storage metadata directory/DB; การตรวจ local ด้านล่างเป็นผลจากรอบพัฒนาเดิม
- ผลตรวจ local: `pnpm lint`, `pnpm build`, regression suite 5 กลุ่ม และ `wrangler pages functions build` ผ่าน (build มีคำเตือน chunk ของ `heic2any` เดิม) Playwright บน Chrome ที่ `127.0.0.1:5173` ตรวจ desktop 1440px/mobile 390px, light/dark, preview/export/save/edit/search, slug availability, link toggle/in-use deletion และ object URL cleanup ผ่าน โดยใช้ Pages handlers + in-memory SQLite และ mock Storage มี HTTP 409 ที่ตั้งใจทดสอบหนึ่งครั้ง ไม่มี app runtime error อื่น
- PNG ที่ export ถูก decode กลับด้วย macOS Vision ตรงทั้ง URL และข้อความ `สวัสดี IssueDesk`; ไม่ใช่การรับรองการสแกนทุกสี/ขนาดโลโก้หรืออุปกรณ์จริง

### Local QR sandbox

`pnpm dev:qr` รัน `scripts/qr-studio-dev.mjs` ที่ `127.0.0.1:5174/qr-studio` โดยคง ProtectedRoute และ production auth เดิม ใช้ fixture session ของสมาชิกธรรมดา, Pages handlers เดิม, SQLite และไฟล์โลโก้ในหน่วยความจำ ปิดการอ่าน Vite env files (`envDir: false`) และไม่ใช้ remote D1/Garage ข้อมูลหายเมื่อหยุด script หลัง Sign out ต้อง restart เพื่อเริ่ม session จำลองใหม่ API นอก QR Studio ไม่รองรับใน sandbox

`pnpm test:qr` รัน regression suite เดิม ทดสอบ script sandbox ผ่าน Chrome/Playwright แล้ว: auto session, Save QR/โลโก้, saved list, redirect 302, same-origin rejection และ Sign out → ProtectedRoute redirect ไป login/API 401 ผ่าน; ตรวจ syntax, lint และ diff whitespace ผ่าน ไม่ได้เปลี่ยน client bundle จึงไม่รัน build ซ้ำในงาน script นี้

### QR logo upload diagnostics

ข้อความเดิม `Unable to upload logo`/HTTP 500 หมายถึง Storage ตอบ non-2xx หลัง session/file validation ผ่าน แต่ก่อน INSERT `qr_logos`; ยังไม่บอก upstream status และไม่ได้พิสูจน์ว่าเป็นสิทธิ์ user หรือ D1 migration เพิ่ม `functions/api/qr-logos/_storage.js` เพื่อแยก upstream redirect, 401/403, 404, 413, service error, connection/timeout และ invalid JSON/contract เป็น error code พร้อม HTTP 502 ตามแนวทาง Storage proxy เดิม Log เฉพาะ status, response type และ CF Ray ที่ผ่าน validation ไม่ส่งต่อ body/URL/headers/credentials ของ upstream จำกัด fetch 15 วินาทีและไม่ follow redirect

Regression suite ครอบคลุมกรณี failure และตรวจว่าไม่เขียน ownership metadata หรือเปิดเผยข้อความลับจาก upstream ผ่าน response/logs ส่วนสาเหตุ Storage ที่พบได้รับการแก้ไขแล้วตามผลที่ผู้ใช้ยืนยันด้านล่าง

ดูรายละเอียด integration และสิทธิ์ของ `StorageImages.jsx` กับ QR Studio, error codes, คำสั่งตรวจสิทธิ์ และแนวทางดูแลระบบใน [QR Studio Storage documentation](QR_STUDIO_STORAGE_DOCS.md)

### ปัญหา upload 502 ที่แก้ไขแล้ว

Storage API เคยคืน `SQLITE_READONLY: attempt to write a readonly database` ขณะ INSERT metadata ใน SQLite ของ Storage เพราะ `storage-api` รันด้วย UID/GID `1000:1000` แต่ bind mount `/app/data` และ `storage.db` เป็นของ `0:0` mode `755`/`644` เมื่อแก้ ownership ให้ตรงกับ runtime user แล้ว ผู้ใช้ยืนยันว่าอัปโหลดได้ทั้ง Storage Images และ QR Studio ปัญหานี้ปิดแล้ว; เก็บสาเหตุและวิธีแก้ไว้ในเอกสาร Storage ข้างต้นสำหรับดูแลการติดตั้งครั้งต่อไป


## Documentation organization — 30 ตุลาคม 2026

- ปรับ README ให้เป็นภาพรวมโปรเจกต์ ความสามารถ การเริ่มพัฒนา และเอกสารอ้างอิง; บันทึกการแก้ไข ผลตรวจ และงานค้างอยู่ใน PROJECT_HANDOFF.md
- งานเอกสารเท่านั้น; ตรวจ diff สำหรับ whitespace หลังแก้ไข ไม่ได้รัน lint/build/tests หรือเปลี่ยน production


## Release notes v1.3.4 — 30 ตุลาคม 2026

- เพิ่ม V1.3.4_RELEASE.md เป็น release notes ฉบับแรก สรุป source baseline และข้อจำกัดโดยไม่อ้างว่าเป็น diff จาก release ก่อนหน้า
- ตรวจ source, routes, package version และ migrations สำหรับเอกสาร; ตรวจ whitespace ด้วย git diff --check ไม่ได้รัน lint/build/tests/browser QA หรือเปลี่ยน production
