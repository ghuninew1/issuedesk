# IssueDesk

IssueDesk เป็นเว็บแอป IT Help Desk สำหรับรับแจ้งปัญหา ติดตาม Ticket และจัดการงานสนับสนุนภายในองค์กร ผู้แจ้งส่งเรื่องและติดตามสถานะได้โดยไม่ต้องเข้าสู่ระบบ ส่วนผู้ดูแลจัดการ Ticket และบริการสนับสนุนผ่าน workspace เดียว

## ความสามารถ

- **แจ้งและติดตามปัญหา:** สร้าง Ticket พร้อมแนบภาพ รับหมายเลขสำหรับติดตาม และดูสถานะผ่านหน้าสาธารณะที่แสดงข้อมูลเท่าที่จำเป็น
- **จัดการ Ticket:** Admin ดู Dashboard ค้นหาและกรองรายการ ดูไฟล์แนบ และเปลี่ยนสถานะเป็น Open, In Progress หรือ Resolved
- **Attendance:** สมาชิกเช็คอิน เช็คเอาต์ และดูประวัติของตนเอง; Admin ดูภาพรวมและรายการของทีม
- **QR Studio:** สร้างและบันทึก QR จาก URL, ข้อความ หรือ Short Link ปรับสีและโลโก้ แล้ว export เป็น PNG หรือ SVG
- **Image Converter:** แปลงและปรับขนาดภาพหลายไฟล์ใน browser พร้อมดาวน์โหลดผลเป็น ZIP
- **Storage และ Sheet:** Admin จัดการภาพใน Storage; สมาชิกที่เข้าสู่ระบบดูทะเบียนอุปกรณ์จาก Google Sheets
- **Network Monitor:** Admin ดู Router health, สถานะและ traffic ของ WAN, PPPoE IP/uptime, DHCP leases และพอร์ต LAN bridge ที่กำลังทำงานล่าสุด (อย่างละสูงสุด 100 รายการ), events และเรียกตรวจ ping ผ่าน agent ได้ตามข้อมูลที่ระบบรองรับ

แอปรองรับธีม Light, Dark และ System รวมถึงหน้าจอมือถือ การส่งอีเมลแจ้ง Ticket ใช้ Resend แบบ best effort และขึ้นอยู่กับการตั้งค่าบริการ

## หน้าใช้งาน

| เส้นทาง | สิทธิ์ | การใช้งาน |
| --- | --- | --- |
| `/`, `/report`, `/track/:ticketNumber` | สาธารณะ | แจ้งปัญหาและติดตามสถานะ Ticket |
| `/login` | สาธารณะ | สมัครสมาชิกหรือเข้าสู่ระบบ |
| `/dashboard`, `/issues`, `/issues/:ticketNumber` | Admin | Dashboard และจัดการ Ticket |
| `/storage/images`, `/network-monitor` | Admin | จัดการภาพและตรวจสอบเครือข่าย |
| `/attendance`, `/sheet`, `/image-converter` | สมาชิก | ลงเวลา ดูทะเบียนอุปกรณ์ และแปลงภาพ |
| `/qr-studio`, `/qr-studio/links`, `/qr-studio/saved` | สมาชิก | สร้าง QR และจัดการ QR กับ Short Links ของตนเอง |
| `/q/:slug` | สาธารณะ | เปิดปลายทางของ Short Link ที่ใช้งานอยู่ |

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

- [Release notes v1.3.4](V1.3.4_RELEASE.md) — สรุปความสามารถและขอบเขตของเวอร์ชัน
- [Project handoff](PROJECT_HANDOFF.md) — ประวัติการเปลี่ยนแปลง ผลตรวจ และงานที่ยังค้าง
- [Storage guide](STORAGE_README.md) และ [Storage API documentation](STORAGE_DOCS_API_REFERENCE.md)
- [Network Monitoring API](NETWORK_MONITORING_API.md) และ [agent guide](garage/network-monitor/README_NETWORK_MONITOR.md)
- [QR Studio Storage documentation](QR_STUDIO_STORAGE_DOCS.md)
- [AGENTS.md](AGENTS.md) — แนวทางทำงานใน repository

การมี source หรือ configuration ใน repository ไม่ได้ยืนยันสถานะ deployment, credentials หรือ migrations บน production
