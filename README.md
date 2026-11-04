# IssueDesk

IssueDesk เป็นเว็บแอป IT Help Desk สำหรับรับแจ้งปัญหา ติดตาม Ticket และจัดการงานสนับสนุนภายในองค์กร ผู้แจ้งส่งเรื่องและติดตามสถานะได้โดยไม่ต้องเข้าสู่ระบบ ส่วนผู้ดูแลจัดการ Ticket และบริการสนับสนุนผ่าน workspace เดียว

## ความสามารถ

- **แจ้งและติดตามปัญหา:** สร้าง Ticket พร้อมแนบภาพ รับหมายเลขสำหรับติดตาม และดูสถานะผ่านหน้าสาธารณะที่แสดงข้อมูลเท่าที่จำเป็น
- **จัดการ Ticket:** Admin ดู Dashboard ค้นหาและกรองรายการ ดูไฟล์แนบ และเปลี่ยนสถานะเป็น Open, In Progress หรือ Resolved
- **Attendance:** สมาชิกเช็คอิน เช็คเอาต์ และดูประวัติของตนเอง; Admin ดูภาพรวมและรายการของทีม
- **QR Studio:** สร้างและบันทึก QR จาก URL, ข้อความ หรือ Short Link ปรับสีและโลโก้ แล้ว export เป็น PNG หรือ SVG
- **Video Converter:** แปลง MP4, MOV, WebM และ MKV เป็น MP4 (H.264/AAC; เลือก Automatic หรือ H.264 ได้ ส่วน H.265 ยังไม่พร้อมใช้งาน) แบบทีละไฟล์ใน browser ด้วย FFmpeg WebAssembly รองรับ preset ถึง 4K โดยเปิดตัวเลือก 1440p/4K เมื่อทุกไฟล์มีความละเอียดถึงและอ่านขนาดได้ และไม่ขยายภาพต้นฉบับ; ไฟล์วิดีโอไม่ถูกอัปโหลด และไฟล์ขนาดใหญ่หรือ codec บางชนิดอาจเกินทรัพยากรของอุปกรณ์
- **Image Converter:** แปลงและปรับขนาดภาพหลายไฟล์ใน browser พร้อม quality presets, สรุปขนาด และดาวน์โหลดผลเป็น ZIP
- **PDF Studio:** รวม PDF หลายไฟล์ จัดเรียง เลือก หมุน ลบ แยกหน้า undo/redo และ export โดยประมวลผลใน browser เท่านั้น ไม่อัปโหลดเอกสารไปยัง server ต้องลงชื่อเข้าใช้ก่อนใช้งาน
- **PDF visual editor:** เพิ่มข้อความภาษา Latin, ภาพ PNG/JPEG และ whiteout ที่ปรับสีพื้น สีขอบ และความหนาขอบได้ พร้อมย้าย ปรับขนาด ลบ และ undo/redo แล้ว export ลง PDF โดยคงหน้าต้นฉบับไว้ Whiteout เป็นการปิดทับภาพเท่านั้น ไม่ใช่การลบข้อมูลลับอย่างปลอดภัย ฟอนต์สำหรับข้อความที่เพิ่มยังไม่รองรับภาษาไทย
- **PDF compression:** เลือก Lossless เพื่อจัดเก็บ object streams ใหม่โดยไม่แปลงหน้าเป็นภาพ เหมาะกับ PDF ต้นฉบับไฟล์เดียวที่ยังไม่จัดเรียง หมุน หรือแก้ไข และอาจลดขนาดไม่ได้ โดยไม่เขียนใหม่เมื่อพบลายเซ็นหรือช่องลายเซ็น ส่วนระดับคุณภาพอื่นแปลงหน้าเป็นภาพและรองรับเป้าหมายขนาดแบบ best effort ซึ่งอาจสูญเสียข้อความที่เลือกได้ ลิงก์ ฟอร์ม และข้อมูลแบบโต้ตอบ ไฟล์ต้นฉบับไม่ถูกแก้ไข
- **Storage และ Sheet:** Admin จัดการภาพใน Storage; สมาชิกที่เข้าสู่ระบบดูทะเบียนอุปกรณ์จาก Google Sheets
- **Network Monitor:** Admin ดู Router health, สถานะและ traffic ของ WAN, PPPoE IP/uptime, DHCP leases ล่าสุด (สูงสุด 100 รายการ), events และเรียกตรวจ ping ผ่าน agent ได้ตามข้อมูลที่ระบบรองรับ

แอปรองรับธีม Light, Dark และ System รวมถึงหน้าจอมือถือ การส่งอีเมลแจ้ง Ticket ใช้ Resend แบบ best effort และขึ้นอยู่กับการตั้งค่าบริการ

External contact form ใช้ `POST /api/resend` พร้อม Origin allowlist; เว็บไซต์ Big Brain Studio มี sender/recipient แยกและ metadata ของคำขอ ดูการตั้งค่าและข้อจำกัด anti-spam ใน [Resend API](RESEND_API.md)

## หน้าใช้งาน

| เส้นทาง | สิทธิ์ | การใช้งาน |
| --- | --- | --- |
| `/`, `/report`, `/track/:ticketNumber` | สาธารณะ | แจ้งปัญหาและติดตามสถานะ Ticket |
| `/login` | สาธารณะ | สมัครสมาชิกหรือเข้าสู่ระบบ |
| `/dashboard`, `/issues`, `/issues/:ticketNumber` | Admin | Dashboard และจัดการ Ticket |
| `/storage/images`, `/network-monitor` | Admin | จัดการภาพและตรวจสอบเครือข่าย |
| `/attendance`, `/sheet`, `/image-converter`, `/video-converter` | สมาชิก | ลงเวลา ดูทะเบียนอุปกรณ์ และแปลงภาพ |
| `/pdf-studio` | สมาชิก | จัดการ แก้ไข และบีบอัด PDF ใน browser |
| `/qr-studio`, `/qr-studio/links`, `/qr-studio/saved` | สมาชิก | สร้าง QR และจัดการ QR กับ Short Links ของตนเอง |
| `/q/:slug` | สาธารณะ | เปิดปลายทางของ Short Link ที่ใช้งานอยู่ |

เมื่อเปิดหน้าที่ต้องเข้าสู่ระบบ ระบบจะพากลับไปยังหน้านั้นหลังเข้าสู่ระบบสำเร็จ โดยยังตรวจสิทธิ์ของแต่ละหน้าตามปกติ

## เริ่มต้นพัฒนา

ต้องมี Node.js และ pnpm ติดตั้ง dependencies และเปิด frontend development server:

```bash
pnpm install
pnpm dev
```

`pnpm dev` เปิด Vite สำหรับ frontend หากต้องการใช้ Pages Functions และ D1 ในเครื่อง ให้เตรียม local D1 แล้วเปิด Pages runtime:

```bash
pnpm exec wrangler d1 migrations apply issuedesk-db --local
pnpm preview
```

`pnpm preview` จะ build ก่อนเปิด Wrangler Pages การใช้ไฟล์แนบ อีเมล OAuth และ Network Monitor ต้องตั้งค่าบริการที่เกี่ยวข้องเพิ่มเติม; การรัน frontend หรือ local D1 เพียงอย่างเดียวไม่ได้เชื่อมบริการเหล่านั้น

สำหรับ local Pages Functions ให้สร้าง `.dev.vars` และกำหนดเฉพาะค่าที่จำเป็นกับฟีเจอร์ที่ใช้ เช่น `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ISSUE_NOTIFICATION_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID` และ `FACEBOOK_CLIENT_SECRET` เก็บ secrets ฝั่ง server และอย่า commit `.dev.vars` หรือใส่ secret ในตัวแปร `VITE_*` ซึ่ง browser อ่านได้ ดูรายละเอียดใน [Project handoff](PROJECT_HANDOFF.md)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | การทำงาน |
| --- | --- |
| `pnpm dev` | เปิด Vite development server |
| `pnpm lint` | ตรวจโค้ดด้วย ESLint |
| `pnpm build` | สร้าง frontend bundle ใน `dist/` |
| `pnpm preview` | Build และเปิด Pages Functions ในเครื่อง |
| `pnpm test:qr` | ทดสอบ QR APIs ด้วย SQLite ในหน่วยความจำและ mock Storage |
| `pnpm dev:qr` | เปิด QR Studio sandbox ที่ `127.0.0.1:5174` |
| `pnpm --dir garage/storage test` | ทดสอบ Storage service แยกต่างหาก |

QR sandbox และ QR tests ต้องใช้ Node ที่รองรับ `node:sqlite` คำสั่ง `pnpm migrate` ตรวจ migration บน remote; `pnpm migrate-apply` และ `pnpm deploy` เปลี่ยน production และต้องได้รับอนุญาตก่อนใช้งาน

## สถาปัตยกรรม

IssueDesk ใช้ React, React Router, Vite และ Tailwind CSS สำหรับ frontend และ Cloudflare Pages Functions สำหรับ API โดยใช้ Cloudflare D1 เก็บข้อมูลแอป ไฟล์แนบและภาพส่งผ่าน Storage API; Storage service มี SQLite metadata ของตนเองและใช้ Garage สำหรับ object storage ส่วน Network Monitor ใช้ agent แยกเพื่ออ่านข้อมูล RouterOS

```text
src/                     React app, pages, components และ services
functions/api/           Cloudflare Pages Functions
migrations/              D1 migrations ของ IssueDesk
garage/storage/          Storage service และ SQLite migrations ของ service
garage/network-monitor/  Network Monitor agent
scripts/                 เครื่องมือและ QR sandbox
```

Secrets ของ Storage, OAuth และ Resend อยู่ฝั่ง server; Google Sheets ใช้ browser-side configuration และต้องถือว่าตัวแปร `VITE_*` เป็นข้อมูลสาธารณะ

## เอกสาร

- [Release notes v1.4.0](V1.4.0_RELEASE.md) และ [v1.3.4](V1.3.4_RELEASE.md) — ความสามารถและขอบเขตของแต่ละเวอร์ชัน
- [Project handoff](PROJECT_HANDOFF.md) — ประวัติการเปลี่ยนแปลง ผลตรวจ และงานที่ยังค้าง
- [Storage guide](STORAGE_README.md) และ [Storage API documentation](STORAGE_DOCS_API_REFERENCE.md)
- [Network Monitoring API](NETWORK_MONITORING_API.md) และ [agent guide](garage/network-monitor/README_NETWORK_MONITOR.md)
- [QR Studio Storage documentation](QR_STUDIO_STORAGE_DOCS.md)
- [AGENTS.md](AGENTS.md) — แนวทางทำงานใน repository

การมี source หรือ configuration ใน repository ไม่ได้ยืนยันสถานะ deployment, credentials หรือ migrations บน production
# Route loading

Page routes are loaded on demand. The application shell and route guard load with the app; a shared loading state appears inside the shell while a page loads. The standalone login route has its own loading boundary.

### Private IT documentation API

Administrators can access the read-only Pages Functions `GET /api/docs/tree`, `GET /api/docs/content?path=...` and `GET /api/docs/asset?path=...`. They read the fixed `main` branch of `ghuninew1/IT-System-Documentation`; the admin-only `/documentation` viewer provides a navigation library, Markdown and Mermaid diagrams. The allowlist covers the root README and Markdown files under `00-Overview` through `05-Operations`, plus PNG and SVG assets under those directories. PNG images load through the authenticated proxy; SVG is offered as a sandboxed download. Relative Markdown and supported asset links resolve against the current document. Heading fragments are not currently navigable; unsupported asset formats and remote images are not embedded. Responses include the source commit and are not cached. Files above 5 MiB and symlinks are excluded.

Configure `GITHUB_DOCS_TOKEN` as a Cloudflare Pages server-side secret for the applicable environment. Use a fine-grained GitHub token restricted to this repository with Contents read-only permission and an expiration; never use a `VITE_` variable. The token and live integration must be configured and verified separately. Run `node --test scripts/docs-api-checks.mjs` for local mocked security tests.

The Docs API returns sanitized JSON for handled failures. Server diagnostics record a fixed failure category and, for a GitHub HTTP error, its status only. A missing secret reports 503; upstream and other handled failures report 502. GitHub redirects are rejected rather than followed. An HTML error response may originate outside this handler and requires investigation of the deployed routing and response headers. Do not copy tokens, cookies, authorization headers, or private document contents into logs or support reports.
