# ตรวจปัญหา Save QR Code: Unable to upload logo

วันที่ตรวจ: 26 ตุลาคม 2026

## ข้อสรุปที่ยืนยันได้

ตรวจ source ตั้งแต่ `src/pages/StorageImages.jsx` ถึง Storage API/Garage แล้ว **QR Studio ใช้รูปแบบอัปโหลดเดียวกับหน้า Storage Images** ไม่พบความต่างของ endpoint ปลายทาง, project ID, ชื่อ field, MIME/bytes ของไฟล์ หรือชุด headers สำหรับ Storage authentication

สิ่งที่ทำให้ผู้ใช้เห็น **HTTP 500 + `Unable to upload logo`** ใน implementation เดิม คือ Pages Function ของ QR ตรวจพบว่า Storage ตอบ non-2xx แล้วคืนข้อความนี้โดยไม่เก็บ upstream status จึงซ่อนสาเหตุจริงไว้

**อัปเดต: ยืนยันจาก log ที่ผู้ใช้ส่งแล้วว่า Storage API เขียน metadata ลง SQLite ไม่ได้ (`SQLITE_READONLY: attempt to write a readonly database`) ขณะ INSERT ตาราง `files`** ไม่ใช่ความต่างของ QR upload หรือ D1 `qr_logos` ส่วนสาเหตุระดับ filesystem ว่าเกิดจาก สิทธิ์บน path ที่แสดงใน container ไม่อนุญาตให้ UID 1000 เขียน จาก output ที่ส่งมา owner/mode เป็นสาเหตุที่ยืนยันได้ ส่วน source path/host ACL/mount write mode ยังให้ตรวจเพิ่มที่ host และยังไม่มีผลทดสอบหลังแก้สิทธิ์

## สาเหตุจริงจาก Docker storage-api

ผู้ใช้ยืนยันว่าอัปโหลด `logo.webp` ผ่าน Storage Images ก็ล้มเหลวเหมือน QR Studio และส่ง log:

```text
Upload project file failed: SqliteError: attempt to write a readonly database
at file:///app/src/index.js:510:10
code: SQLITE_READONLY
```

ตรงกับ `garage/storage/src/index.js` ช่วง `INSERT INTO files ... .run(...)` โดยลำดับเป็น:

```text
รับ multipart + ผ่าน app/project authorization
→ S3 PutObjectCommand ทำงานผ่าน
→ INSERT metadata ลง SQLite ของ storage-api ล้มเหลว (SQLITE_READONLY)
→ พยายาม DeleteObject เพื่อชดเชย และ throw ต่อ
→ Storage API คืน 502
→ QR ไม่ได้รับ upload success จึงยังไม่ INSERT D1 qr_logos
```

การ cleanup object เป็นการพยายามชดเชยเท่านั้น หาก DeleteObject ล้มเหลวจะมี log `Failed to clean up uploaded object:` อีกบรรทัด อย่าสรุปว่าไม่มี object ค้างจาก log INSERT เพียงอย่างเดียว

### จุดเกี่ยวข้องใน repository

- `garage/storage/Dockerfile` ใช้ `USER node` และ chown `/app/data` ตอน build image
- `garage/docker-compose.yml` กำหนด `DATABASE_PATH: /app/data/storage.db` และ bind mount `./storage/data:/app/data` โดยไม่ได้ระบุ `:ro` ใน source นี้
- bind mount ทับ directory ใน image จึงใช้ ownership/permissions ของ host path; การ chown ตอน build image ไม่ได้แก้ permissions ของ host directory ที่ mount เข้ามา
- `garage/storage/src/db.js` เปิด `better-sqlite3` โดยไม่ได้ขอ readonly และตั้ง `journal_mode = WAL`
- ต้องตรวจสิทธิ์ directory, `storage.db` และไฟล์ `storage.db-wal`/`storage.db-shm` ที่มีอยู่ รวมถึง effective UID/GID และ host ACL/mount mode ไม่ใช่ตรวจไฟล์ `.db` อย่างเดียว

### ตรวจบนเครื่องที่รัน Docker จริง — ไม่อ่าน secret และไม่เขียน database

```sh
docker exec storage-api id
```

ดูเฉพาะ mount metadata ไม่ใช้ `docker inspect` แบบ dump ทั้งหมดซึ่งอาจมี secrets:

```sh
docker inspect storage-api --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}source={{.Source}} destination={{.Destination}} rw={{.RW}}{{end}}{{end}}'
```

ตรวจ ownership/mode เป็นตัวเลขของ path ตาม Compose ใน repo:

```sh
docker exec storage-api sh -c 'ls -ldn /app/data; ls -ln /app/data/storage.db /app/data/storage.db-wal /app/data/storage.db-shm'
```

ไฟล์ WAL/SHM อาจไม่มีในบางช่วง ถ้าหายจะแสดง `No such file` และไม่ใช่หลักฐานว่าฐานข้อมูลเสีย หาก deployment ใช้ `DATABASE_PATH` หรือ mount target อื่น ให้ตรวจ path จริงนั้นแทนตาม configuration ของผู้ดูแล โดยไม่ส่งค่า secrets มา

ตรวจ access ตาม effective user โดยไม่สร้างไฟล์:

```sh
docker exec storage-api node --input-type=module -e 'import { accessSync, existsSync, constants } from "node:fs"; for (const p of ["/app/data", "/app/data/storage.db", "/app/data/storage.db-wal", "/app/data/storage.db-shm"]) { if (!existsSync(p)) { console.log(p, "not present"); continue; } try { accessSync(p, constants.W_OK | (p === "/app/data" ? constants.X_OK : 0)); console.log(p, "access check passed"); } catch (e) { console.log(p, e.code); } }'
```

access check เป็นหลักฐานประกอบ ไม่ใช่การทดสอบ SQLite write สำเร็จ ถ้า access ผ่านแต่ยัง SQLITE_READONLY ให้ตรวจ mount/host filesystem และ ACL ต่อ

### ผลตรวจจาก Docker host ที่ผู้ใช้ส่งมา

```text
id: uid=1000(node) gid=1000(node)
/app/data: drwxr-xr-x  0:0
/app/data/storage.db: -rw-r--r--  0:0
```

ผลนี้ยืนยัน permission mismatch บน path ที่แอปเปิดใช้งานจริง: UID 1000 ไม่มี write permission ของ owner บน directory `/app/data` หรือ `storage.db` ซึ่งทั้งคู่เป็น UID/GID 0 และ directory mode `755` / file mode `644` ให้สิทธิ์เขียนเฉพาะ root จึงสอดคล้องตรงกับ `SQLITE_READONLY` แน่นอน Dockerfile chown directory ใน image แต่ host bind mount ทับ path นั้นและนำ owner `0:0` ของ host มาใช้

จาก prompt `root@sky:~/garage` Compose source น่าจะเป็น `./storage/data` ใต้ project directory แต่ควรยืนยัน source จาก Docker mount metadata ก่อนแก้:

```sh
docker inspect storage-api --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}} rw={{.RW}}{{end}}{{end}}'
```

ถ้าผล `rw=true` และ source คือ data directory ของ Storage ภายใต้ `~/garage` ขั้นตอนแก้ owner ที่ตรงกับ runtime UID/GID คือ:

```sh
cd ~/garage
docker compose stop storage-api
chown 1000:1000 ./storage/data ./storage/data/storage.db
for file in ./storage/data/storage.db-wal ./storage/data/storage.db-shm; do if [ -e "$file" ]; then chown 1000:1000 "$file"; fi; done
docker compose up -d storage-api
docker exec storage-api ls -ldn /app/data
docker exec storage-api ls -ln /app/data/storage.db
```

หลังแก้ควรเห็น owner `1000:1000` ที่ directory และ DB; directory ต้องเขียน/เข้าได้ และ DB เขียนได้สำหรับ owner หาก mount `rw=false`, path จริงต่างออกไป, มี host ACL, NAS permission mapping หรือ SELinux policy ต้องแก้ที่สาเหตุนั้นแทน `chown` ตัวอย่างนี้ การหยุด service ก่อนช่วยไม่ให้แก้ ownership ระหว่างที่ SQLite ยังเปิดใช้งานอยู่ ไม่ลบหรือสร้างฐานข้อมูลใหม่ หลัง service กลับมาทำงานให้ตรวจ `docker compose logs --tail=100 storage-api` แล้วค่อยลอง upload ไฟล์ใหม่

### แนวทางแก้โดยผู้ดูแลหลังตรวจผล

1. ยืนยัน source directory จาก mount metadata และ UID/GID จาก `docker exec storage-api id` ก่อน ไม่เดาว่า `node` ต้องเป็น UID 1000 เสมอ โดยเฉพาะ NAS, rootless Docker หรือ user namespace
2. หยุดเฉพาะ `storage-api` ตามขั้นตอนของผู้ดูแล แล้วสำรอง directory ฐานข้อมูลทั้งชุดอย่างสอดคล้องกัน รวม WAL/SHM ที่ยังมีอยู่ ไม่คัดลอกเฉพาะ `.db` ขณะมี writer ทำงาน
3. ถ้า ownership/mode ไม่ตรง ให้แก้เฉพาะ directory metadata ของ Storage และไฟล์ฐานข้อมูลที่ยืนยันแล้ว ให้ runtime UID/GID มีสิทธิ์เขียน directory/DB/WAL/SHM ถ้าใช้ QNAP/NAS ให้ตรวจ ACL ของ share ประกอบ ไม่ chown ทั้ง Garage object-data directory หรือใช้ `chmod -R 777`
4. ถ้า mount `.RW` เป็น false หรือ host filesystem เป็น read-only ต้องแก้ mount/สาเหตุ filesystem ตามผลตรวจ การ chmod อย่างเดียวไม่แก้กรณีนี้
5. เริ่ม `storage-api` แล้วให้ผู้ใช้ทดสอบ upload PNG/WebP ผ่าน Storage Images และ Save QR พร้อม logo อีกครั้ง ตรวจว่า SQLite `files` และ D1 `qr_logos` ถูกบันทึกตามลำดับ และไม่มี SQLITE_READONLY ใหม่

ยังไม่ได้รันคำสั่งเหล่านี้บน Docker host หรือเปลี่ยน ownership, ACL, mount, service และข้อมูล production จึงยังไม่ยืนยันว่าแก้ปัญหาแล้ว ไม่จำเป็นต้องแก้ React หรือสร้าง D1 migration เพื่อแก้ SQLITE_READONLY ของฐาน Storage นี้

อ้างอิง: [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/), [SQLite WAL](https://www.sqlite.org/wal.html)

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

## หลักฐานก่อนพบ Storage log: Cloudflare origin_bad_gateway

ผู้ใช้รายงาน response ต่อไปนี้จากระบบที่ deploy แล้ว:

- `error_code/status: 502`, `error_name: origin_bad_gateway`
- `zone: issuedesk.bigbrain-studio.com`
- `ray_id/instance: a509c7dd3c3b4296`
- `timestamp: 2026-10-26T13:24:21Z` = **26 ตุลาคม 2026 เวลา 20:24:21 น. Asia/Bangkok**
- `retry_after: 60`, `retryable: true`, `owner_action_required: true`
- ข้อความระบุว่า Cloudflare สร้าง error response แทนเจ้าของเว็บไซต์

นี่เป็น Cloudflare error envelope ไม่ใช่ `{ success: false, error: { code, message } }` ที่ QR Function สร้าง ต้องแยกให้ได้ว่า gateway/origin ล้มเหลวโดยตรง หรือ Function คืน 502 จาก upstream แล้ว Cloudflare ปรับ error response ระหว่างทาง จึงยังใช้ข้อมูลนี้สรุปว่า Function ไม่ทำงาน หรือ Garage ล่มแน่นอนไม่ได้ `zone` ระบุโดเมนที่ส่ง error ไม่ได้ยืนยัน hostname ของ Storage service

โค้ด diagnostics ปัจจุบันคืน 502 เมื่อ Storage ล้มเหลวอยู่แล้ว จึงต้องเทียบ Pages Function logs โดยค้น `QR logo Storage request failed` พร้อมเวลาและ Ray ID นี้ ถ้าพบ `upstreamStatus` ให้ใช้สถานะนั้นไล่ต่อ; ถ้าไม่พบ log ต้องยืนยัน deployment ที่ใช้งานและตรวจ routing/custom errors/proxy ของโดเมนก่อน อย่าใช้การไม่มี log เพียงอย่างเดียวสรุปว่า request ไม่เข้า Function

ควรรออย่างน้อย 60 วินาทีตาม response ก่อน retry และหลีกเลี่ยงการกด Save ซ้ำถี่ ๆ หากปัญหาคงอยู่ให้ผู้ดูแลตรวจ Pages logs กับ Storage/Garage logs ในช่วงเวลาเดียวกัน หากมี Tunnel/reverse proxy อยู่ใน deployment จริงจึงค่อยตรวจ logs ของบริการนั้น ไม่สมมติว่ามี Tunnel จากเลข 502 อย่างเดียว

การตรวจ GET `/api/auth/me` แบบไม่ส่ง cookie จากสภาพแวดล้อมผู้ช่วยบน custom domain และ `issuedesk.pages.dev` ได้ HTTP 403 / Cloudflare error 1010 ทั้งสองโดเมน การตรวจนี้ถูกปฏิเสธและไม่ยืนยันอาการ 502 ที่ผู้ใช้พบ ไม่พยายามหลบ security rule หรือเปลี่ยนการตั้งค่า production

แหล่งอ้างอิง: [Cloudflare error responses](https://developers.cloudflare.com/fundamentals/reference/error-responses/), [Error 502/504](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-502-504/), [Custom Errors](https://developers.cloudflare.com/rules/custom-errors/)
