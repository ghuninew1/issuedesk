# ตรวจปัญหา Save QR Code: Unable to upload logo

วันที่ตรวจ: 26 ตุลาคม 2026

## ข้อสรุปที่ยืนยันได้

ตรวจ source ตั้งแต่ `src/pages/StorageImages.jsx` ถึง Storage API/Garage แล้ว **QR Studio ใช้รูปแบบอัปโหลดเดียวกับหน้า Storage Images** ไม่พบความต่างของ endpoint ปลายทาง, project ID, ชื่อ field, MIME/bytes ของไฟล์ หรือชุด headers สำหรับ Storage authentication

สิ่งที่ทำให้ผู้ใช้เห็น **HTTP 500 + `Unable to upload logo`** ใน implementation เดิม คือ Pages Function ของ QR ตรวจพบว่า Storage ตอบ non-2xx แล้วคืนข้อความนี้โดยไม่เก็บ upstream status จึงซ่อนสาเหตุจริงไว้

ยังไม่ยืนยัน root cause ของบริการ production ว่าเป็น app credential, Cloudflare Access, project, proxy หรือ Garage/S3 เพราะยังไม่มี upstream status/log ของคำขอที่ล้มเหลว การปรับ diagnostics และทดสอบด้วย mock ไม่ได้พิสูจน์ว่า Storage production อัปโหลดได้แล้ว

## วิธีอัปโหลดที่หน้า Storage Images ใช้

1. `src/pages/StorageImages.jsx` → `handleUpload()` อ่านไฟล์จาก input แล้วเรียก `uploadStorageFiles()` ทีละ batch สูงสุด 3 ไฟล์
2. `src/services/storage.js` → `uploadStorageFiles()` เรียก `uploadStorageImage()` ต่อไฟล์ และรวบรวมผลด้วย `Promise.allSettled()`
3. `uploadStorageImage()` สร้าง `FormData` ใส่ไฟล์ด้วย `append("file", file)` แล้วเรียก `api("/api/storage/files", { method: "POST", body: formData })`
4. `src/utils/api.js` เพิ่ม `Accept: application/json` แต่ไม่ตั้ง `Content-Type` ของ multipart เอง เบราว์เซอร์เป็นผู้สร้าง boundary
5. `functions/api/storage/files.js` ตรวจ session admin, MIME และขนาดไม่เกิน 10 MiB ก่อนสร้าง FormData ใหม่ แล้วส่งไฟล์ไป Storage API
6. `garage/storage/src/index.js` รับ POST `/v2/projects/:projectId/files` ตรวจ app credential และ active project ที่เป็นของ app นั้น จากนั้นเขียน object ผ่าน S3 `PutObjectCommand` และ metadata ลง SQLite ของ Storage service

Storage SQLite เป็นคนละฐานกับ Cloudflare D1 ของ IssueDesk

## เปรียบเทียบกับ QR Studio

| ประเด็น | Storage Images | QR Studio |
| --- | --- | --- |
| Browser helper | `uploadStorageImage()` ผ่าน `api()` | `uploadQRLogo()` ผ่าน `api()` |
| Same-origin endpoint | `/api/storage/files` | `/api/qr-logos` |
| Multipart field | `file` | `file` |
| ตั้ง multipart Content-Type เอง | ไม่ตั้ง | ไม่ตั้ง |
| Storage upstream | POST `/v2/projects/${STORAGE_PROJECT_ID}/files` | เหมือนกัน |
| Project ID | จาก `functions/api/storage/_utils.js` | จาก helper เดียวกัน |
| Storage headers | `storageHeaders(env)` | helper เดียวกัน |
| สิทธิ์ใน IssueDesk | Admin เท่านั้น | สมาชิกที่มี session; โลโก้ผูกกับเจ้าของ |
| Validation ไฟล์ | หลายประเภท สูงสุด 10 MiB | PNG/JPEG/WebP สูงสุด 2 MiB พร้อมตรวจ signature |
| เวลาอัปโหลด | เมื่อเลือกไฟล์ในหน้าจัดการ | เมื่อกด Save QR Code |
| หลังอัปโหลด | แสดงไฟล์ในหน้าจัดการ | INSERT เจ้าของลง `qr_logos` แล้วนำ `logo_url` ไปบันทึก QR |

ไม่เปลี่ยน QR ให้เรียก `/api/storage/files` โดยตรง เพราะจะทำให้สมาชิกทั่วไปเจอ 403 จากเงื่อนไข admin และไม่ควรลดสิทธิ์ endpoint จัดการ Storage เพื่อแก้ปัญหานี้

Headers ไป Storage ประกอบด้วย `Authorization: Bearer <STORAGE_APP_SECRET>`, `CF-Access-Client-Id` และ `CF-Access-Client-Secret` ชื่อเหล่านี้เป็นชื่อ configuration เท่านั้น ห้ามนำค่าจริงใส่ browser, log หรือเอกสาร

## อะไรทำให้เกิด error แต่ละช่วง

### ข้อความเดิม: Unable to upload logo

ลำดับโค้ดเดิมคือ:

```text
session/origin + file validation ผ่าน
→ POST ไฟล์ไป Storage
→ response.ok เป็น false
→ คืน 500 / STORAGE_UNAVAILABLE / Unable to upload logo
→ ยังไม่ INSERT qr_logos และยังไม่บันทึก QR
```

ข้อความนี้จึงไม่ใช่หลักฐานว่า `ProtectedRoute` บล็อก, สมาชิกไม่มีสิทธิ์ใน IssueDesk หรือ D1 migration หาย หาก error เกิดจากขั้นตอนเหล่านั้นจะเป็นคนละ branch/ข้อความ

### Diagnostics ที่เพิ่มใน source

`functions/api/qr-logos/_storage.js` จำแนก failure ดังนี้ ข้อผิดพลาดจาก upstream คืน HTTP 502 ตามแนวทาง Storage proxy เดิม แยกจาก HTTP 401 ของ session ผู้ใช้

| Upstream / เหตุการณ์ | Error code | สิ่งที่ต้องตรวจต่อ ไม่ใช่ root cause ที่ยืนยันแล้ว |
| --- | --- | --- |
| 301/302/303/307/308 | `STORAGE_ACCESS_REDIRECT` | URL ชี้ถูก endpoint หรือมี Access login/redirect คั่น |
| 401/403 | `STORAGE_AUTH_FAILED` | App credential active/หมดอายุ, app status, Access service token/policy หรือกฎปฏิเสธคำขอ |
| 404 | `STORAGE_PROJECT_NOT_FOUND` | Base URL/route, project active และ project อยู่ใต้ app ของ credential นั้น |
| 413 | `STORAGE_UPLOAD_LIMIT` | Limits ของ Storage และ reverse proxy |
| non-2xx อื่น เช่น 500/502/503 | `STORAGE_UPSTREAM_FAILED` | Storage service logs; สำหรับ Garage implementation ใน repo อาจล้มเหลวตอน S3 PutObject หรือ SQLite INSERT/ขั้นตอนอื่นใน upload handler |
| Network failure/หมดเวลา | `STORAGE_CONNECTION_FAILED` | DNS, connectivity และบริการ; จำกัดเวลา fetch ที่ 15 วินาที |
| HTTP success แต่ body ไม่ใช่ JSON/contract ไม่ถูกต้อง | `STORAGE_INVALID_RESPONSE` | Base URL, Access response หรือ Storage API version |

ไม่ follow redirect อัตโนมัติ และ log เฉพาะ code, upstream status, response type กับ CF Ray ที่ผ่าน validation ไม่ส่งต่อ response body/credentials ของ Storage

หากอัปโหลดสำเร็จแต่ INSERT `qr_logos` ล้มเหลว จะเป็น D1/ownership error อีกช่วงหนึ่ง โค้ดพยายามลบไฟล์ที่เพิ่งอัปโหลดเพื่อชดเชย ไม่ใช่ branch ของข้อความ `Unable to upload logo` เดิม

## วิธีแยกปัญหาบนระบบจริง

1. หลัง deploy source ที่มี diagnostics แล้ว ดู Response ของ POST `/api/qr-logos` และ log `QR logo Storage request failed` เพื่ออ่าน error code/upstream status ห้ามส่ง cookie หรือ secret มาประกอบรายงาน
2. เปรียบเทียบการอัปโหลด PNG เดียวกันจาก Storage Images ด้วยบัญชี admin และ QR Studio ใน deployment/environment เดียวกัน การอัปโหลดทั้งสอง flow เป็นการสร้างข้อมูลจริง ควรทำโดยผู้ใช้ที่ต้องการบันทึกไฟล์นั้น
3. ถ้าทั้งคู่ล้มเหลว ให้ตรวจ service/configuration ที่ใช้ร่วมกันก่อน ถ้าเฉพาะ QR ล้มเหลว ให้เทียบ upstream status, เงื่อนไขไฟล์, deployment และช่วงเวลา อย่าสรุปว่าเป็น multipart ต่างกันจาก browser endpoint ที่ชื่อไม่เหมือนกัน
4. กรณี upstream 502 ตรวจ log `Upload project file failed:` ใน Storage service และรายละเอียด exception ของ Garage/S3/SQLite ฝั่งผู้ดูแล ไม่แก้ bucket, keys หรือ production data โดยเดา
5. ทดสอบอีกครั้งหลังแก้สาเหตุ พร้อมตรวจทั้งบันทึก QR, เปิดโลโก้ และ export

การตรวจชื่อ secrets บน Pages ยืนยันได้เพียงว่ามี configuration ชื่อนั้น ไม่ยืนยันค่าถูกต้อง/ยังไม่หมดอายุ หรือ credential มีสิทธิ์ project และ bucket จริง

## หลักฐานการทดสอบและข้อจำกัด

รัน `pnpm test:qr` มี regression test ชื่อ `QR logo upload matches StorageImages upstream multipart contract and retains role boundaries` ซึ่งเรียก Pages handlers จริงของสอง flow ด้วย session admin/user จาก SQLite ในหน่วยความจำ แล้วตรวจว่า upstream request มี URL, method, headers, filename, MIME และ bytes ตรงกัน รวมถึง multipart boundary ถูกสร้าง และสมาชิกธรรมดายังถูกปฏิเสธจาก Storage management ด้วย 403

ทดสอบ failure จำลองครอบคลุม redirect, 401/403, 404, 413, 502, network และ invalid response พร้อมตรวจว่าไม่เขียน metadata หรือเปิดเผย upstream body ที่มีข้อความลับ

ทั้งหมดเป็น local tests ด้วย mock Storage ไม่ได้อัปโหลดไฟล์จริงไป production และยังไม่ได้ deploy การเปลี่ยนแปลงชุด diagnostics ในงานตรวจนี้
