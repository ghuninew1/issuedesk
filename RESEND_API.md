# Resend API สำหรับเว็บไซต์ภายนอก

`POST /api/resend` รับข้อมูลจาก contact form ของเว็บไซต์ เช่น Portfolio และส่งอีเมลผ่าน Resend ไปยังผู้รับที่ตั้งค่าไว้บน Cloudflare Pages

## ตั้งค่าบน Cloudflare Pages

ตั้งค่า Variables/Secrets ให้ครบทั้ง production และ preview ตามที่ใช้งาน:

| ชื่อ | ประเภท | ความหมาย |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret | API key ของ Resend |
| `RESEND_FROM_EMAIL` | Variable | อีเมลผู้ส่งที่ verified แล้ว เช่น `Portfolio <noreply@example.com>` |
| `RESEND_TO_EMAIL` | Variable | กล่องจดหมายที่รับข้อความจากฟอร์ม |
| `RESEND_ALLOWED_ORIGINS` | Variable | Origin ของเว็บไซต์ที่อนุญาต คั่นด้วย comma |

ค่า Origin ต้องมีเฉพาะ scheme, host และ port (ถ้ามี) ไม่ใส่ path หรือ slash ท้าย เช่น:

```text
https://example.com,https://www.example.com
```

ระหว่างพัฒนาอาจเพิ่ม `http://localhost:5173` ใน environment สำหรับ local development เท่านั้น อย่าใส่ `*` เพราะ endpoint ใช้ allowlist แบบตรงตัว

`RESEND_TO_EMAIL` แยกผู้รับของ contact form ออกจาก `ISSUE_NOTIFICATION_EMAIL` หากยังไม่ได้ตั้ง `RESEND_TO_EMAIL` ระบบจะใช้ `ISSUE_NOTIFICATION_EMAIL` เป็นค่า fallback

## Request

```http
POST https://issuedesk.bigbrain-studio.com/api/resend
Content-Type: application/json
```

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "subject": "Portfolio inquiry",
  "message": "Hello, I would like to get in touch."
}
```

ฟิลด์ทั้งหมดจำเป็น: `name` ไม่เกิน 100 ตัวอักษร, `email` ต้องเป็นรูปแบบอีเมลและไม่เกิน 254 ตัวอักษร, `subject` ไม่เกิน 150 ตัวอักษร และ `message` ไม่เกิน 5,000 ตัวอักษร ผู้รับและ API key ไม่รับจาก browser; `reply_to` จะตั้งเป็นอีเมลผู้ส่งฟอร์มโดยอัตโนมัติ

## เรียกจากเว็บไซต์

```js
async function sendContactForm(form) {
  const response = await fetch("https://issuedesk.bigbrain-studio.com/api/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.name,
      email: form.email,
      subject: form.subject,
      message: form.message,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "ส่งข้อความไม่สำเร็จ");
  }

  return result;
}
```

ตัวอย่าง response เมื่อส่งสำเร็จ:

```json
{ "success": true, "id": "<resend-email-id>" }
```

API รองรับ CORS preflight (`OPTIONS`) สำหรับ Origin ที่ตั้งค่าไว้เท่านั้น และปฏิเสธ request ที่ไม่มี `Origin` หรือมาจาก Origin อื่น หากตั้ง allowlist ไม่ถูกต้อง browser จะแสดง CORS error

## ข้อควรทราบ

- Endpoint ส่งได้เฉพาะไปยัง `RESEND_TO_EMAIL` ที่ตั้งบนเซิร์ฟเวอร์ ไม่มีช่องให้ client ระบุผู้รับหรือ API key
- การตรวจ Origin ช่วยจำกัดการเรียกจาก browser แต่ไม่ใช่การยืนยันตัวตน เพราะ client ที่ไม่ใช่ browser ปลอม `Origin` ได้ ควรตั้ง rate limit/WAF บน Cloudflare และเพิ่ม CAPTCHA หรือ honeypot ที่ backend หากฟอร์มถูกสแปม
- API key ต้องอยู่ใน Cloudflare Pages Secrets หรือ `.dev.vars` เท่านั้น ห้ามใส่ใน `VITE_*` หรือ frontend bundle
- `POST /api/issues` ยังส่งอีเมลแจ้งทีม IT แยกจาก endpoint contact form นี้ และยังคงเป็น best effort
- `400` หมายถึง JSON/ข้อมูลไม่ถูกต้อง, `403` หมายถึง Origin ไม่ได้รับอนุญาต, `413` หมายถึง body ใหญ่เกินกำหนด, `502` หมายถึง Resend ส่งไม่สำเร็จ และ `503` หมายถึงยังตั้งค่าผู้รับไม่ครบ
