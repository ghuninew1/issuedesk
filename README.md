# IssueDesk

> ดูสรุปโครงสร้างระบบ, API, migrations และจุดเริ่มต้นสำหรับงานต่อใน [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)

IssueDesk เป็นเว็บแอป IT Help Desk สำหรับแจ้งปัญหาภายในองค์กร ติดตามสถานะ Ticket และให้ผู้ดูแลระบบจัดการงานได้ในที่เดียว

ผู้แจ้งส่งรายละเอียดปัญหาพร้อมไฟล์แนบได้โดยไม่ต้องเข้าสู่ระบบ ระบบออกหมายเลข Ticket อัตโนมัติ แจ้งอีเมลไปยังทีม IT เมื่อมีเรื่องใหม่ และเปิดหน้าติดตามสาธารณะที่แสดงเฉพาะสถานะกับเวลา

ผู้ดูแลระบบเข้าสู่ระบบแล้วดู Dashboard เปลี่ยนสถานะ ดูไฟล์แนบ หรือลบ Ticket ได้จากหน้าจัดการ

เวอร์ชันปัจจุบัน: `1.2.2` (อ้างอิงจาก `package.json`)

## ความสามารถ

### สำหรับผู้แจ้งปัญหา

- หน้า Portal สำหรับแจ้งปัญหาและค้นหา Ticket จากหมายเลข
- ฟอร์มแจ้งปัญหา: ชื่อผู้แจ้ง หัวข้อ หมวดหมู่ ความสำคัญ และรายละเอียด
- หมวดหมู่: Hardware, Software, Network, Printer, Other
- ความสำคัญ: Low, Medium, High (ค่าเริ่มต้น Medium)
- แนบภาพได้สูงสุด 5 ไฟล์ ไฟล์ละไม่เกิน 5 MB (JPEG, PNG, WebP, HEIC/HEIF) พร้อมตัวอย่างภาพ รวมถึงแปลง HEIC ในเบราว์เซอร์เพื่อแสดง preview
- หลังส่งสำเร็จ แสดงหมายเลข Ticket และคัดลอกไปคลิปบอร์ดได้
- ติดตาม Ticket จากหน้าสาธารณะด้วยหมายเลขรูปแบบ `IT-YYYYMM-NNNN`
- หน้าติดตามแสดงเฉพาะหมายเลข สถานะ และเวลา ไม่เปิดเผยรายละเอียดปัญหาหรือข้อมูลผู้แจ้ง
- สมัครสมาชิกและเข้าสู่ระบบด้วยอีเมลได้ แต่การแจ้งปัญหาไม่บังคับให้ล็อกอิน

### สำหรับผู้ดูแลระบบ

- Dashboard สรุปจำนวน Ticket ทั้งหมด, Open, In Progress และ Resolved พร้อมรายการล่าสุด
- รายการ Ticket ค้นหาและกรองตามสถานะหรือความสำคัญ
- ดูรายละเอียด Ticket เปลี่ยนสถานะ ดูตัวอย่างไฟล์แนบ ดาวน์โหลด และลบ Ticket พร้อมไฟล์ใน Storage
- เส้นทาง `/dashboard`, `/issues` และ `/issues/:ticketNumber` รวมถึง API จัดการ Ticket จำกัดเฉพาะ role `admin`
- หน้า `/storage/images` จัดการภาพใน Storage และหน้า `/sheet` ดูทะเบียนอุปกรณ์จาก Google Sheets (Admin เท่านั้น)
- หน้า `/attendance` แสดงภาพรวมการลงเวลาของทีม ค้นหาด้วยชื่อ/อีเมล และกรองวันที่ (Admin ดูข้อมูลอย่างเดียว)

### ระบบลงเวลาทำงาน

- พนักงานที่เข้าสู่ระบบเช็คอินและเช็คเอาต์ของตนเองได้ พร้อมดูประวัติย้อนหลัง
- หน้าพนักงานแสดงวันและเวลาในเขตเวลา `Asia/Bangkok`; Timestamp บันทึกโดย server เป็น UTC ISO 8601
- Admin ดูจำนวนที่กำลังทำงาน เช็คเอาต์แล้ว และรายการค้างจากวันก่อน พร้อมค้นหา/กรอง/แบ่งหน้า
- หน้า User และ Admin แสดงเวลาทำงานสะสม; ประวัติและตาราง Admin แสดงระยะเวลารายการ โดยเวลาของรายการที่กำลังทำงานวันนี้อัปเดตทุกนาที
- หนึ่งรายการต่อผู้ใช้ต่อวัน; ยังไม่รองรับหลายกะ กะข้ามวัน การแก้เวลา ยืนยันรายการ OT วันหยุด หรือ Grace Period
- รายการที่ยังทำงานจากวันก่อนแสดงเป็นรายการผิดปกติ โดยระบบไม่สร้างเวลาเช็คเอาต์ให้เอง

### ระบบสนับสนุน

- ออกหมายเลข Ticket ตามเดือนในโซนเวลา `Asia/Bangkok` เช่น `IT-202610-0001`
- ส่งอีเมลแจ้งเตือนทีม IT ผ่าน Resend ทันทีที่มี Ticket ใหม่
- เก็บไฟล์แนบผ่าน Storage API ภายนอก (Garage ผ่าน S3-compatible API) และเก็บเฉพาะ metadata ใน D1
- Session ใน HttpOnly Cookie อายุ 7 วัน ตรวจสิทธิ์ที่ Cloudflare Pages Functions
- ธีมสว่าง / มืด / ตามระบบ และ Web App Manifest สำหรับเปิดแบบ standalone

## เส้นทางการใช้งาน

```mermaid
flowchart LR
    reporter[ผู้แจ้งปัญหา] --> portal[Portal / ฟอร์มแจ้ง]
    portal --> createApi["POST /api/issues"]
    createApi --> d1[(Cloudflare D1)]
    createApi --> email[Resend อีเมลถึงทีม IT]
    portal --> attachApi["POST .../attachments"]
    attachApi --> storage[Storage API / Garage]
    attachApi --> d1
    reporter --> track[หน้าติดตามสาธารณะ]
    track --> trackApi["GET /api/track/:ticketNumber"]
    trackApi --> d1
    admin[Admin] --> dashboard[Dashboard และรายการ Ticket]
    dashboard --> adminApi[API จัดการ Ticket]
    adminApi --> d1
    adminApi --> storage
    employee[พนักงานที่เข้าสู่ระบบ] --> attendance[หน้า Attendance]
    attendance --> attendanceApi[Attendance API]
    attendanceApi --> d1
    admin --> attendance
```

1. ผู้แจ้งกรอกฟอร์มที่ `/report` ระบบสร้าง Ticket สถานะ `Open` แล้วส่งอีเมลแจ้งทีม IT
2. หากมีไฟล์แนบ เบราว์เซอร์อัปโหลดทีละไฟล์หลังสร้าง Ticket สำเร็จ
3. ผู้แจ้งเก็บหมายเลข Ticket แล้วเปิด `/track/:ticketNumber` เพื่อดูความคืบหน้า
4. Admin เข้าสู่ระบบที่ `/login` ดู Dashboard เปลี่ยนสถานะเป็น `In Progress` หรือ `Resolved`
5. เมื่อสถานะเป็น `In Progress` ครั้งแรก ระบบบันทึก `in_progress_at` เพื่อแสดงบนหน้าติดตาม

## เทคโนโลยี

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8 |
| UI | Tailwind CSS v4, Base UI, Lucide, Geist |
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| File storage | Storage API ภายนอก; เอกสารระบบจัดเก็บระบุ Garage ผ่าน S3-compatible API |
| Email | [Resend](https://resend.com) HTTP API |
| Auth | Session cookie + PBKDF2-SHA-256 (Web Crypto) |
| Package manager | pnpm |
| Code quality | ESLint |

> `wrangler.jsonc` ไม่มี R2 bucket binding โดยตรง Pages Functions ติดต่อ Storage API และ Resend ผ่าน URL กับ secrets ที่ตั้งค่าไว้ด้านล่าง

## โครงสร้างโปรเจกต์

```text
issuedesk/
├── functions/api/          # Cloudflare Pages Functions
│   ├── auth/               # register, login, logout, me, session helpers
│   ├── attendance/         # today, check-in, check-out, history
│   ├── admin/attendance/   # summary และ records สำหรับ Admin
│   ├── issues.js           # สร้าง Ticket + ส่งอีเมล และรายการ Ticket
│   ├── issues/             # รายละเอียด, สถานะ, ลบ, ไฟล์แนบ
│   ├── track/              # ติดตามสาธารณะ
│   ├── health.js
│   └── storage-health.js
├── migrations/             # D1 schema
├── scripts/bootstrap-admin.py
├── src/
│   ├── auth/               # AuthProvider, ProtectedRoute
│   ├── components/         # layout, dashboard, report form, theme
│   ├── pages/              # Portal, Report, Track, Login, Issues
│   └── services/issues.js
├── public/                 # manifest, ไอคอน, เอกสาร Storage API
├── wrangler.jsonc
└── package.json
```

## หน้าเว็บ

| เส้นทาง | ผู้ใช้ | หน้าที่ |
| --- | --- | --- |
| `/` | สาธารณะ | Portal แจ้งปัญหาและค้นหา Ticket |
| `/report` | สาธารณะ | ฟอร์มสร้าง Ticket และแนบภาพ |
| `/track/:ticketNumber` | สาธารณะ | ความคืบหน้าแบบจำกัดข้อมูล |
| `/login` | สาธารณะ | สมัครสมาชิกและเข้าสู่ระบบ |
| `/dashboard` | Admin | สถิติและ Ticket ล่าสุด |
| `/issues` | Admin | รายการ ค้นหา กรองสถานะ/ความสำคัญ |
| `/issues/:ticketNumber` | Admin | รายละเอียด เปลี่ยนสถานะ ไฟล์แนบ ลบ Ticket |
| `/storage/images` | Admin | จัดการภาพใน Storage: ดูตัวอย่าง อัปโหลด ดาวน์โหลด ลบ และคัดลอกลิงก์ |
| `/sheet` | Admin | ทะเบียนอุปกรณ์จาก Google Sheets; ค้นหา กรองสถานะ และดูรูปอุปกรณ์ |
| `/attendance` | ผู้ใช้ที่เข้าสู่ระบบ | พนักงานเช็คอิน/เช็คเอาต์และดูประวัติ; Admin ดูภาพรวมและรายการของทีม |

## Image Storage API

API กลุ่มนี้เป็น proxy ของ IssueDesk ไปยัง Storage API ใช้ Cookie session ของ IssueDesk และอนุญาตเฉพาะ Admin ทุกคำขอจากหน้าเว็บควรเรียก API ผ่าน `src/services/storage.js` เพื่อให้แนบ session cookie แบบ same-origin โดยอัตโนมัติ ค่า credential ของ Storage และ Cloudflare Access อยู่ฝั่ง Pages Functions เท่านั้น

| Method | Endpoint | การทำงาน |
| --- | --- | --- |
| `GET` | `/api/storage/files` | แสดงรายการไฟล์ทั้งหมดจาก Storage เรียงใหม่ไปเก่า |
| `POST` | `/api/storage/files` | อัปโหลดไฟล์ด้วย `multipart/form-data` field ชื่อ `file` |
| `GET` | `/api/storage/files/:fileId` | ผู้ใช้ที่ล็อกอินดูรูปที่รองรับแบบ inline ได้ |
| `GET` | `/api/storage/files/:fileId?download=1&name=:fileName` | ผู้ใช้ที่ล็อกอินดาวน์โหลดรูปได้; ดาวน์โหลดไฟล์ชนิดอื่นและจัดการไฟล์ต้องเป็น Admin |
| `DELETE` | `/api/storage/files/:fileId` | ลบไฟล์จาก Storage และล้างแถว `issue_attachments` ที่อ้างถึงไฟล์นั้นใน D1 |

### ตัวอย่างเรียก API

แสดงรายการ (ผู้ใช้ต้องมี session Admin ที่ยังใช้งานได้):

```http
GET /api/storage/files
```

ตัวอย่าง response:

```json
{
  "success": true,
  "files": [
    {
      "id": "<file-id>",
      "file_name": "screen.png",
      "mime_type": "image/png",
      "file_size": 24576,
      "uploaded_at": "2026-10-21T09:30:00.000Z"
    }
  ]
}
```

อัปโหลดจากเบราว์เซอร์:

```js
const form = new FormData();
form.append("file", imageFile);
const response = await fetch("/api/storage/files", { method: "POST", body: form });
const result = await response.json();
```

รองรับรูปภาพ เอกสาร Office/iWork, PDF, ไฟล์บีบอัด, ข้อความ, เสียง และวิดีโอตาม MIME type ที่กำหนด ขนาดมากกว่า 0 และไม่เกิน 10 MiB; server เป็นผู้ตรวจชนิดและขนาดไฟล์อีกครั้ง ตัวอย่าง response (HTTP `201`):

```json
{
  "success": true,
  "file": {
    "id": "<file-id>",
    "file_name": "screen.png",
    "mime_type": "image/png",
    "file_size": 24576,
    "uploaded_at": "2026-10-21T09:30:00.000Z"
  }
}
```

หน้า `/storage/images` รองรับอัปโหลดหลายไฟล์ โดยส่งทีละไฟล์ไม่เกิน 10 MiB พร้อมกันสูงสุด 3 รายการ ชนิดไฟล์รวมถึงรูปภาพ PDF, Office/iWork, ZIP/RAR/7z/GZIP, TXT/CSV/Markdown/JSON/XML/HTML/CSS/JavaScript และเสียง/วิดีโอ รูป raster ที่อนุญาตเปิด preview ผ่าน URL `/api/storage/files/:fileId`; ไฟล์อื่นดาวน์โหลดด้วย query `download=1` ชื่อไฟล์ส่งผ่าน `name` ได้ โดย server กรองอักขระเส้นทางและขึ้นบรรทัดใหม่ก่อนใช้เป็นชื่อดาวน์โหลด ลิงก์จากหน้า Storage ต้องใช้ Admin session ไม่ใช่ public link

ลบไฟล์:

```http
DELETE /api/storage/files/:fileId
```

```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

เมื่อ Storage แจ้งว่าไม่พบไฟล์ (404) ระบบถือว่าไฟล์ถูกลบแล้วและยังดำเนินการล้างข้อมูลแนบใน D1 ต่อ หากลบไฟล์สำเร็จแต่ล้าง D1 ไม่สำเร็จ API ตอบ `500` พร้อมข้อความแจ้งว่าลบจาก Storage แล้วแต่ล้างข้อมูลที่เชื่อมโยงไม่สำเร็จ

### รหัสตอบกลับที่พบบ่อย

| HTTP | ความหมาย |
| --- | --- |
| `400` | ขาดไฟล์หรือ request ไม่ถูกต้อง |
| `401` | ไม่มี session หรือ session หมดอายุ |
| `403` | ผู้ใช้ไม่มี role Admin |
| `404` | ไม่พบรูป |
| `413` | รูปใหญ่กว่า 10 MiB |
| `415` | ชนิดไฟล์ไม่รองรับ หรือ preview ไม่ใช่รูป raster ที่อนุญาต |
| `500` | ตั้งค่า Storage ไม่ครบ หรือเกิดปัญหาล้างข้อมูลอ้างอิงใน D1 |
| `502` | Storage API ติดต่อไม่ได้หรือตอบกลับผิดพลาด |

## สถานะ Ticket

| สถานะ | ความหมายบนหน้าติดตาม |
| --- | --- |
| `Open` | รับเรื่องแล้ว |
| `In Progress` | กำลังดำเนินการ |
| `Resolved` | แก้ไขเรียบร้อย |

หมายเลข Ticket สร้างจากคำนำหน้า `IT-YYYYMM-` ตามปฏิทินไทย (`Asia/Bangkok`) แล้วต่อด้วยเลขลำดับ 4 หลักของเดือนนั้น หน้าติดตามรับเฉพาะรูปแบบ `IT-` ตามด้วยตัวเลข 6 หลัก ปี-เดือน แล้วตามด้วยอย่างน้อย 4 หลัก

ขีดจำกัดข้อมูลตอนสร้าง Ticket:

- ชื่อผู้แจ้ง ไม่เกิน 100 ตัวอักษร
- หัวข้อ ไม่เกิน 200 ตัวอักษร
- รายละเอียด ไม่เกิน 5,000 ตัวอักษร

## การยืนยันตัวตนและความปลอดภัย

- บัญชีใหม่ได้ role `user` เสมอ Admin คนแรกสร้างด้วย `scripts/bootstrap-admin.py`
- รหัสผ่านยาว 12–128 ตัวอักษร แฮชด้วย PBKDF2-SHA-256 ที่ 100,000 iterations ตามเพดานที่ Cloudflare Workers รองรับ
- Login และ Register ตรวจ Origin ให้ตรงกับโดเมนของแอป
- Login จำกัด 10 ครั้งต่ออีเมลใน 1 ชั่วโมง Register จำกัด 5 ครั้งต่ออีเมลใน 1 ชั่วโมง
- โทเคน Session ส่งผ่าน Cookie `issuedesk_session` ที่เป็น HttpOnly, Secure, SameSite=Lax D1 เก็บเฉพาะ SHA-256 hash ของโทเคน
- Session มีอายุ 7 วัน ผู้ใช้ที่ `is_active = 0` เข้าไม่ได้แม้ยังมี Cookie
- API ติดตามสาธารณะคืนเฉพาะ `ticket_number`, `status`, `created_at`, `updated_at`, `in_progress_at`

## การแจ้งเตือนอีเมล

เมื่อ `POST /api/issues` สร้าง Ticket สำเร็จ Pages Function เรียก Resend เพื่อส่งอีเมลไปยังกล่องจดหมายของทีม IT

จดหมายมีทั้ง HTML และข้อความล้วน หัวข้อรูปแบบ `[IssueDesk] New Issue IT-YYYYMM-NNNN` และมีหมายเลข Ticket ชื่อผู้แจ้ง หัวข้อ หมวดหมู่ ความสำคัญ สถานะ เวลาที่ส่ง และรายละเอียด โดย escape HTML ก่อนใส่ในแม่แบบ

ค่าที่ต้องตั้งใน Cloudflare Pages (production/preview) หรือ `.dev.vars` (เครื่องพัฒนา):

| Secret | ความหมาย |
| --- | --- |
| `RESEND_API_KEY` | API key ของ Resend |
| `RESEND_FROM_EMAIL` | ผู้ส่งที่ verified กับ Resend เช่น `IssueDesk <noreply@example.com>` |
| `ISSUE_NOTIFICATION_EMAIL` | อีเมลผู้รับของทีม IT |

หากการส่งอีเมลล้มเหลว ระบบยังคงสร้าง Ticket สำเร็จ และบันทึกข้อผิดพลาดไว้ใน log ของ Worker การแจ้งปัญหาจึงไม่ถูกบล็อกเพราะอีเมล แต่ควรตรวจ secrets และโดเมนผู้ส่งใน Resend หากทีมไม่ได้รับจดหมาย

## ไฟล์แนบและ Storage API

ไฟล์จริงไม่อยู่ใน D1 ตาราง `issue_attachments` เก็บ `storage_file_id`, ชื่อไฟล์, MIME type, ขนาด และเวลาอัปโหลด

ฝั่งฟอร์มแจ้งปัญหาจำกัดภาพ 5 ไฟล์ ไฟล์ละ 5 MB ส่วน API อัปโหลดรับได้สูงสุด 10 MiB และชนิดไฟล์:

- ภาพ: JPEG, PNG, WebP, GIF, HEIC, HEIF
- เอกสาร: PDF, TXT, CSV, ZIP, DOCX, XLSX

การอัปโหลด ดาวน์โหลด และลบไฟล์ใช้ `STORAGE_API_URL` พร้อม Cloudflare Access service token (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) และ `STORAGE_APP_SECRET` เมื่อ Admin ลบ Ticket ระบบลบไฟล์ใน Storage ก่อน แล้วลบแถวใน D1

Pages Functions เข้าถึง private network ของ Storage API ไม่ได้อัตโนมัติ เอกสารใน `public/storage-docs-operations.md` แนะนำให้ใช้ HTTPS tunnel หรือ Cloudflare Access ห้ามเปิด Garage ตรงสู่สาธารณะเพื่อแก้ปัญหาการเชื่อมต่อ

รายละเอียดเพิ่มเติมของระบบจัดเก็บอยู่ที่:

- `STORAGE_README.md`
- `STORAGE_DOCS_ARCHITECTURE.md`
- `STORAGE_DOCS_API_REFERENCE.md`
- `STORAGE_DOCS_SECURITY.md`
- `STORAGE_DOCS_OPERATIOINS.md`
- `GARAGE_README.md`

## สิ่งที่ต้องเตรียม

- Node.js และ pnpm
- บัญชี Cloudflare ที่มีสิทธิ์ Pages และ D1 สำหรับ preview, deploy และ migration บน remote
- บัญชี Resend และโดเมนผู้ส่งที่ verified หากต้องการอีเมลแจ้งเตือน
- Storage API ที่ Pages Functions ติดต่อถึงได้ผ่าน HTTPS/Access หากต้องทดสอบไฟล์แนบ

## ติดตั้งและเริ่มพัฒนา

```sh
pnpm install
pnpm dev
```

`pnpm dev` เปิดเฉพาะ Vite สำหรับ frontend หากต้องการเรียก Pages Functions และ D1 ในเครื่อง ให้ใช้ local D1 แล้ว preview:

```sh
pnpm exec wrangler d1 migrations apply issuedesk-db --local
pnpm preview
```

`pnpm preview` จะ build frontend แล้วเปิด `wrangler pages dev` ตาม script ใน `package.json`

สร้างไฟล์ `.dev.vars` ในโฟลเดอร์โปรเจกต์สำหรับ secrets ในเครื่อง:

```dotenv
STORAGE_API_URL=
STORAGE_APP_SECRET=
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ISSUE_NOTIFICATION_EMAIL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
# Optional; Facebook Graph API version, defaults to v26.0
FACEBOOK_GRAPH_API_VERSION=
```

อย่า commit `.dev.vars` หรือส่ง secrets ผ่าน source code, browser หรือ log ใน production ให้ตั้งค่าเดียวกันเป็น Cloudflare Pages secrets / environment variables ของโปรเจกต์ `issuedesk`

### Social sign-in (Google และ Facebook)

ตั้ง `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID` และ `FACEBOOK_CLIENT_SECRET` ใน `.dev.vars` และ Cloudflare Pages environments ที่ต้องการใช้ (production/preview แยกกัน) จากนั้นเพิ่ม Authorized redirect URI ในหน้า OAuth ของแต่ละ provider ให้ตรงกับ origin ของแอป:

```text
https://<your-issuedesk-domain>/api/auth/oauth/callback/google
https://<your-issuedesk-domain>/api/auth/oauth/callback/facebook
```

สำหรับ local Pages preview ให้เพิ่ม callback URI ที่ใช้จริง เช่น `http://localhost:8788/api/auth/oauth/callback/google` และ Facebook callback ตามลำดับ Google ขอ scope `openid email profile`; Facebook ขอ `email,public_profile` บัญชีใหม่จะได้ role `user` และ identity ของ provider ถูกเก็บในตาราง `oauth_accounts` โดยไม่ผูกบัญชีเดิมอัตโนมัติด้วยอีเมล หากอีเมลมีบัญชีอยู่แล้ว ให้เข้าสู่ระบบด้วยรหัสผ่านก่อน (การเชื่อมบัญชียังไม่รองรับ)

ใช้ Facebook Login app ที่เปิดใช้งานและอนุญาตสิทธิ์ email แล้ว หากตั้งค่า `FACEBOOK_GRAPH_API_VERSION` ให้เป็น Graph API version ที่แอป Meta ของคุณรองรับ; ถ้าไม่ตั้ง ระบบใช้ `v26.0` เป็นค่าเริ่มต้น ([Meta Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)).

Migration `0005_create_oauth_accounts.sql` ต้องถูกนำไปใช้กับ D1 ก่อนเปิด Social sign-in ใน environment นั้น

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

`wrangler.jsonc` กำหนด Pages output directory เป็น `dist` และ D1 binding ชื่อ `DB` ซึ่งชี้ไปยังฐานข้อมูล `issuedesk-db`

Migrations ใน repository:

| Migration | ตาราง/ข้อมูลที่สร้าง |
| --- | --- |
| `0001_create_issues.sql` | `issues` |
| `0002_create_issue_attachments.sql` | `issue_attachments` และ index ตาม Ticket |
| `0003_create_auth_tables.sql` | `users`, `sessions`, `login_attempts` และ index ที่เกี่ยวข้อง |
| `0004_add_issue_in_progress_at.sql` | คอลัมน์ `in_progress_at` เพื่อแสดงประวัติบนหน้าติดตาม |
| `0005_create_oauth_accounts.sql` | ตาราง `oauth_accounts` สำหรับเชื่อม provider identity กับบัญชีผู้ใช้ |
| `0006_create_attendance_records.sql` | ตาราง `attendance_records` และ index สำหรับระบบลงเวลา |

ตารางหลัก:

| ตาราง | ใช้เก็บ |
| --- | --- |
| `issues` | Ticket, สถานะ, เวลาสร้าง/อัปเดต, เวลาเริ่มดำเนินการ |
| `issue_attachments` | metadata ของไฟล์แนบ และ `storage_file_id` |
| `users` | บัญชี อีเมล รหัสผ่านที่แฮชแล้ว และ role |
| `sessions` | hash ของโทเคน Session และวันหมดอายุ |
| `login_attempts` | ประวัติพยายามเข้าสู่ระบบ/สมัคร เพื่อจำกัดอัตรา |
| `attendance_records` | วันทำงาน เวลาเช็คอิน/เช็คเอาต์ สถานะ และเจ้าของรายการ |

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
| `GET` | `/api/auth/oauth?provider=google\|facebook` | เริ่ม OAuth sign-in และตรวจ CSRF ด้วย state cookie |
| `GET` | `/api/auth/oauth/callback/:provider` | ตรวจ callback, สร้าง/ค้นหาบัญชี OAuth และออก Session Cookie |
| `GET` | `/api/attendance/today` | สถานะลงเวลาวันนี้ของ Session ปัจจุบัน |
| `POST` | `/api/attendance/check-in` | เช็คอินผู้ใช้ปัจจุบัน; เวลาและ `user_id` มาจาก server/session |
| `POST` | `/api/attendance/check-out` | เช็คเอาต์รายการที่กำลังทำงานของผู้ใช้ปัจจุบัน |
| `GET` | `/api/attendance/history` | ประวัติของผู้ใช้ปัจจุบัน; รองรับ `page` และ `limit` |
| `GET` | `/api/admin/attendance/summary` | สรุปการลงเวลาทั้งหมดและของวันนี้; ต้องเป็น Admin |
| `GET` | `/api/admin/attendance/records` | รายการลงเวลาทั้งทีม; รองรับ `date`, `q`, `page`, `limit`; ต้องเป็น Admin |
| `POST` | `/api/issues` | สร้าง Ticket แล้วพยายามส่งอีเมลแจ้งทีม IT |
| `GET` | `/api/issues` | รายการ Ticket; ต้องเป็น Admin |
| `GET` | `/api/issues/stats` | สถิติ Ticket; ต้องเป็น Admin |
| `GET` | `/api/issues/:ticketNumber` | รายละเอียด Ticket; ต้องเป็น Admin |
| `PATCH` | `/api/issues/:ticketNumber` | เปลี่ยนสถานะ Ticket; ต้องเป็น Admin |
| `DELETE` | `/api/issues/:ticketNumber` | ลบ Ticket และไฟล์แนบใน Storage; ต้องเป็น Admin |
| `GET` | `/api/issues/:ticketNumber/attachments` | รายการไฟล์แนบ; ต้องเป็น Admin |
| `POST` | `/api/issues/:ticketNumber/attachments` | อัปโหลดไฟล์แนบของ Ticket |
| `GET` | `/api/issues/:ticketNumber/attachments/:attachmentId` | ดาวน์โหลดหรือแสดงไฟล์; ต้องเป็น Admin |
| `DELETE` | `/api/issues/:ticketNumber/attachments/:attachmentId` | ลบไฟล์แนบ; ต้องเป็น Admin |
| `GET` / `POST` | `/api/storage/files` | แสดงรายการไฟล์ทั้งหมดและอัปโหลดไฟล์ไปยัง Storage API; ต้องเป็น Admin |
| `GET` / `DELETE` | `/api/storage/files/:fileId` | แสดงตัวอย่าง/ดาวน์โหลด หรือลบรูปจาก Storage API; ต้องเป็น Admin |
| `GET` | `/api/track/:ticketNumber` | ติดตามสาธารณะ; คืนเฉพาะหมายเลข สถานะ และเวลา |

## สร้าง Admin คนแรก

```sh
python3 scripts/bootstrap-admin.py
```

สคริปต์ถามชื่อ อีเมล และรหัสผ่านใน terminal จากนั้นต้องพิมพ์ `create` เพื่อยืนยันการเขียนไปยัง D1 remote จะสร้าง Admin ได้เฉพาะเมื่อยังไม่มีบัญชี role `admin` ห้ามส่งรหัสผ่านให้ผู้อื่นหรือวางไว้ใน command line

## สถานะโปรเจกต์

ระบบหลักมีหน้าและ API ครบตาม flow ปัจจุบัน; สถานะค่าตั้งค่า production และ migration remote ต้องตรวจใน Cloudflare:

- Portal, แจ้งปัญหา, ติดตาม Ticket, Dashboard และจัดการ Ticket อยู่ใน `src/`
- ทะเบียนอุปกรณ์อ่าน Google Sheets ผ่าน `src/hooks/useGoogleSheet.js` และหน้า `src/pages/Sheet.jsx`
- Pages Functions สำหรับ Issue, Authentication, Ticket tracking, Storage และอีเมลอยู่ใน `functions/api/`
- Authentication และการคุมสิทธิ์ Admin เชื่อมกับ routes และ API แล้ว
- Google/Facebook OAuth มี authorization/callback flow และ migration `0005`; ต้องตั้ง provider credentials และตรวจ migration/environment ก่อนเปิดใช้
- หน้า `/storage/images` จัดการรูปผ่าน Storage API proxy โดย URL ที่คัดลอกยังต้องใช้ Admin session
- หน้า `/attendance` ใช้ Attendance API; API ตรวจ Session ทุกคำขอ และ Admin endpoints ตรวจ role `admin`
- เช็คอินซ้ำป้องกันด้วย unique constraint `(user_id, work_date)`; เช็คเอาต์ใช้ conditional update เพื่อกันคำขอซ้ำหรือพร้อมกัน
- เวลา `work_date` คำนวณตาม `Asia/Bangkok`; ต้องตรวจว่า migration `0006_create_attendance_records.sql` ถูก apply ใน D1 environment ที่จะใช้งานแล้ว
- การสร้าง Ticket ส่งอีเมลแจ้งทีมผ่าน Resend เมื่อตั้ง secrets ครบ
- `scripts/bootstrap-admin.py` ใช้สร้าง Admin คนแรกแบบ interactive บน D1 remote

หลัง deploy ควรตรวจอย่างน้อย:

1. สมัคร/เข้าสู่ระบบ และการเข้าถึงหน้า Admin ด้วยบัญชีที่ไม่ใช่ Admin
2. แจ้ง Ticket ได้รับหมายเลข และอีเมลถึง `ISSUE_NOTIFICATION_EMAIL`
3. แนบภาพแล้ว Admin เปิดดู/ดาวน์โหลดได้
4. เปลี่ยนสถานะแล้วหน้าติดตามสาธารณะอัปเดตตามเวลา `created_at` / `in_progress_at` / `updated_at`
5. ลบ Ticket แล้วไฟล์ใน Storage หายตาม
6. ตรวจว่า Migration `0006_create_attendance_records.sql` ถูก apply ใน environment เป้าหมาย แล้วทดสอบ check-in/check-out และ Admin attendance ด้วยบัญชีทดสอบ

## หมายเหตุการดูแลระบบ

- Build อาจเตือนว่า JavaScript bundle ใหญ่กว่า 500 kB ซึ่งเป็นงานปรับประสิทธิภาพ ไม่ได้บล็อกการใช้งาน
- Rate limiting ของ Login/Register นับตามอีเมล ไม่ได้จำกัดตาม IP
- หากอีเมลไม่ถึงผู้รับ ให้ตรวจ Resend dashboard, โดเมนผู้ส่ง และค่า `RESEND_FROM_EMAIL`
- หากอัปโหลดไฟล์ล้มเหลวหลังสร้าง Ticket สำเร็จ ผู้แจ้งยังมีหมายเลข Ticket แต่ต้องแนบไฟล์ใหม่หรือให้ Admin จัดการภายหลัง
