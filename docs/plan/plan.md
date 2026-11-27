# handsup: แผนงาน v1

- ผู้เขียน: engineer-director, 2026-11-27 (ฉบับแก้ครั้งที่ 5 หลัง Mild เพิ่ม polling สำรองเมื่อ WebSocket ใช้ไม่ได้)
- อ่านคู่กับ: `docs/spec/spec-proposal.md` (spec) และ `docs/plan/review.md` (review รอบ 6)
- สถานะ: **spec ผ่าน review รอบ 6** (รวม polling สำรอง) เผยแพร่ได้หลังแก้บรรทัดสถานะของ spec สองบรรทัด (review R27) **G0 ได้รับแล้วแบบมีเงื่อนไข ขอบเขต M0 ถึง M5 จนถึง G1** ยังไม่มีการอนุมัติ push, deploy หรือ action ใดบน Cloudflare account ไม่มี decision ค้าง
- ป้าย DEC-n คือ decision ของ Mild ส่วนคำว่า D1 ในไฟล์นี้หมายถึงฐานข้อมูล Cloudflare D1 เท่านั้น

## 0. Engagement

asked-for (Mild, 2026-11-27): "ฝากวางแผน กับ sub agent โดย clara มีหน้าที่ประสานงานระหว่าง ผมกับ subagent ... ให้ builder เสนอ spec engineer director ทำหน้าที่ review และส่งแผนมา ส่วนใช้ platform engineer เป็น sonnet สำหรับ deploy ขึ้น cloudflare สำหรับ e2e test เดี๋ยวรอผม sign off ใน local ก่อน"

| บทบาท | ใคร | ทำอะไร |
| --- | --- | --- |
| Requester | Mild | ให้ G0 (เริ่ม implement), รัน local acceptance แล้ว sign off (G1), อนุมัติ action บน Cloudflare account รวมการเปิด Workers Paid (G2), รับผล e2e (G3) |
| Orchestrator | Clara | ส่งต่อระหว่าง Mild กับ subagent, quote คำของ Mild ลง record ทุก gate, เผยแพร่ spec ผ่าน ship pages |
| Director | engineer-director | review, ตั้ง gate, ตรวจผลทุก milestone ด้วยการรัน check เอง ไม่เขียนโค้ด ไม่ deploy |
| Builder | builder (sonnet) | code, test, README, runbook ของ M0 ถึง M5 |
| Platform operator | platform-operator (sonnet) | M6 deploy + e2e บน Cloudflare หลัง G1 และ G2 เท่านั้น |

Done when: Mild ใช้งานบน local เองแล้วพิมพ์ sign off (G1) และ e2e บน Cloudflare ผ่าน post-check แล้ว Mild รับผล (G3) green test หรือคำว่า "เสร็จ" จาก agent ไม่นับเป็นการรับงาน

## 1. Decisions

### 1.1 ตัดสินแล้ว (Mild, 2026-11-27)
| ID | ผล | คำของ Mild |
| --- | --- | --- |
| DEC-1 | ผู้สอนเห็นชื่อผู้ถาม ผู้เรียนคนอื่นในห้องไม่เห็นคำถามนั้น ชื่อฟีเจอร์ **"คำถามส่วนตัว"** | "ผมน่าจะตั้งชื่อผิด ผมเห็นชื่อได้ แต่นักเรียนคนอื่น ในห้อง ไม่เห็นข้อความนี้ เรียกว่าอะไร" และ "รับ 1, 2" |
| DEC-2 | ไม่ lock ผู้สอนไว้ที่ Google ผู้สอนใช้ password หรือ Google ก็ได้ role มาจาก email ใน env อย่างเดียว | "ไม่ต้อง lock เพราะ ยังไง email ซ้ำไม่ได้อยู่แล้ว จะได้ทำ test ง่ายๆ ด้วย แล้วมี env ที่ lock email ผู้สอนไว้แล้ว" |
| DEC-3 | **Workers Paid** (เปลี่ยนจากคำตัดสินแรกที่ให้ใช้ Free ก่อน) | ล่าสุด: "ได้ครับ ไปตัว paid ได้คับ" (เดิม: "ไปแบบฟรีก่อน ถ้าไม่พอ ค่อยว่ากัน") |
| DEC-4 | ปิด: ใช้ Paid จึงไม่ต้อง probe บน Free | "ได้ครับ ไปตัว paid ได้คับ" |
| Polling สำรอง | เมื่อ WebSocket ใช้ไม่ได้ client ดึงข้อมูลผ่าน HTTP เองประมาณทุก 30 วินาที อยากเห็นเร็วก็ refresh เอง ฟีเจอร์อื่นใช้ได้ตามปกติ | "ถ้า websocket สามารถ ใช้งานได่มั้ย ถ้าไม่ได้ น่าจะมี fallback ให้ใช้งานได้ตามปกตินะ" และ "คับ polling ประมาณ 30 sec ได้มั้ย ไม่ต้องถี่มาก ถ้าใครอยากเห็นเร็ว ก็ refresh เองได้" |
| N7 | สร้างบัญชีผู้สอนก่อนแชร์ URL ผู้สอนใหม่สมัครก่อนแล้วจึงใส่ email ใน env มี post-check (AC24) | "รับ 1, 2" |

หมายเหตุ DEC-2: ตรวจ source แล้ว Better Auth แปลง email เป็นตัวเล็ก ตรวจรูปแบบ และ column `email` เป็น UNIQUE จึงสมัคร email ซ้ำไม่ได้จริงตามที่ Mild ว่า ช่องที่เหลือคือ "ใครสมัครก่อนได้ก่อน" ซึ่ง N7 รับมือ

### 1.2 G0 และสิ่งที่ยังไม่อนุมัติ

- **G0 ได้รับแล้ว (Mild, 2026-11-27):** "ได้คับ ผมโอเค เริ่มทำหลังจาก spec พร้อมได้เลย" เงื่อนไข "spec พร้อม" = director ให้ PASS (review รอบ 6) และ spec แก้ R27 กับ stack ของ frontend (ด้านล่าง) แล้ว ขอบเขต: M0 ถึง M5 จนถึง G1 เท่านั้น
- Stack ของ frontend ที่ Mild รับในข้อความเดียวกัน: Tailwind CSS + shadcn/ui, React Router, state ด้วย React เท่านั้น (ไม่มี store library) builder กำลังเพิ่มลง spec director ต้องเห็นข้อความนั้นก่อน M1 (review R28)
- **ยังไม่อนุมัติ:** push, merge, เปิด PR, deploy และ action ใดบน Cloudflare account รวมการเปิด Workers Paid ซึ่งอยู่ใน G2 (ส่วน 4.1)
- คำว่า "ไปตัว paid" เป็นคำตัดสินเรื่อง plan ไม่ใช่การอนุมัติ billing

### 1.2.1 กติกา branch และ commit (M0 ถึง M5)

- builder ทำงานใน `/home/thw-home/gits/handsup` เท่านั้น บน branch `feat/v1` ที่แตกจาก `main` (`main` ตอนนี้มีแค่ README) ห้าม commit ลง `main`
- commit แบบ local เท่านั้น หนึ่ง commit ต่อหนึ่ง increment ที่ test ผ่านแล้ว ข้อความ commit บอกว่าผ่าน AC ไหน และลงท้ายด้วยบรรทัด attribution ตามที่ระบบกำหนด
- commit แรกของ branch: `docs/spec/` (draft ต้นฉบับและ spec ฉบับที่ผ่าน review) และ `docs/plan/` ตามที่เป็นอยู่ เพื่อให้มี baseline ที่อ้างอิงได้
- builder ห้ามแก้ `docs/plan/` (เป็นของ director) และห้ามแก้ `docs/spec/realtime-forum-spec.original.md` การเปลี่ยน spec ระหว่าง build ทำเป็นข้อเสนอส่งผ่าน Clara แล้ว director ตรวจก่อน
- ห้าม push, ห้าม merge, ห้ามเปิด PR, ห้าม `git push --force` หรือแก้ history ของ commit ที่ director ตรวจไปแล้ว ห้ามใส่ secret หรือ `.dev.vars` ลง commit (`.dev.vars.example` ได้)
- director ตรวจแต่ละ milestone จาก commit จริง (`git log`, `git show --stat`) และรัน test เองบน commit นั้น

### 1.3 Defaults (ใช้ตามนี้ถ้า Mild ไม่แก้)
- ชื่อ project `handsup`, ข้อความบนปุ่ม "ถามส่วนตัว (ผู้สอนเห็นชื่อคุณ)"
- U1 1 Room = 1 DO + Hibernation, U2 User/Session ใน D1 และ Q/A ใน DO SQLite, U3 Room ใน D1 ให้ instructor สร้างเท่านั้น, U5 Hono
- Q2 ไม่มี FAQ publish, Q3 join ด้วย invite code แล้วเป็นสมาชิกถาวร มี rotate code แต่ไม่มี remove member, Q4 ผู้เรียนตอบกันเองไม่ได้, Q5 ไม่มี search ข้ามห้อง
- N1 ไม่ auto-link password กับ Google (หนึ่ง email ใช้ได้วิธีเดียว คือวิธีที่สมัครครั้งแรก ผู้สอนด้วย), N2 ยอมรับว่าผู้สอนสวมรอยผ่าน reset link ได้ (มี audit และ revoke session), N4 React + Vite SPA บน origin เดียว, N5 ค่าตามตารางของ builder
- N6 Presenter mode: ปุ่มเดียวซ่อนคำถามส่วนตัวทั้งหมดพร้อมชื่อผู้ถามตอนฉายจอ จำสถานะไว้แม้ reload (ค่าเริ่มต้นปิด)
- ผู้สอนสร้าง reset link ให้ผู้สอนด้วยกันไม่ได้ ผู้สอนที่ลืมรหัสให้ operator กู้ตาม runbook (ต้องพิสูจน์ใน M5 ตาม review R18)
- รายการที่เพิ่มเกิน draft ตาม spec 2.4
- Logout ปิด socket ฝั่ง client ส่วน socket ที่ไม่ได้ปิดหมดอายุภายใน 15 นาที และ reset password ตัด socket ฝั่ง server ทันที
- Polling สำรอง (spec 8.6): เข้าโหมดเมื่อต่อ WS ไม่ได้, ไม่ได้ snapshot ทาง WS ใน 3 วินาที หรือ `pong` หาย (client ส่ง ping ทุก 30 วินาที) ดึงทันทีหนึ่งครั้งแล้วทุก 30 วินาที + สุ่ม 0 ถึง 5 วินาที หยุดเมื่อ tab ซ่อน ลองกลับไปใช้ WS เรื่อย ๆ มีตัวบอกบนจอว่าอยู่โหมดสำรอง
- Snapshot API: ไม่จำกัดต่อ IP (ทั้งห้องอาจมาจาก IP เดียว) ห้องที่ไม่มีจริงกับห้องที่ไม่ได้เป็นสมาชิกตอบ `404` เหมือนกัน ไม่ตรวจ `Origin` ใน GET แต่ไม่ส่ง CORS header และส่ง `X-Content-Type-Options: nosniff` (review R25) ไม่มีเพดานต่อ user (review R24 แนะนำให้ตัดออก ถ้า builder ยืนยันจะเก็บต้องให้เหตุผลใน spec)
- Password hash: native scrypt ตาม default ของ library บน Workers Paid (CPU ต่อ request default 30 วินาที พอสำหรับ hash ราว 105 ms) **ทางสำรองใช้เฉพาะกรณีปัญหา memory และต้องแจ้ง Mild ก่อนใช้** (scrypt N=16384 r=8 p=5 แล้ว N=8192 r=8 p=10) ถ้า native scrypt ใช้ไม่ได้หรือเกิน CPU ให้หยุดแล้วกลับไปถาม Mild ไม่ลดความแข็งของ hash เอง ไม่ใช้ PBKDF2 (workerd จำกัดไว้ที่ 100,000 iterations)
- `INSTRUCTOR_EMAILS` เป็น plain var ไม่ใช่ secret และไม่ commit ลง config: local อยู่ใน `.dev.vars` บน Cloudflare ส่งด้วย `--var` ทุกครั้งที่ deploy (ค่าว่างคือ `--var "INSTRUCTOR_EMAILS:"`) ไม่เปิด `keep_vars` การเพิ่มหรือลดผู้สอนจึงเท่ากับ deploy ใหม่หนึ่งครั้ง
- Deploy e2e ขึ้น `workers.dev` บน **Workers Paid** เป็น environment แยกชื่อ `handsup-e2e` ไม่ใช่ production

## 2. Gates และ milestones

ทุก milestone: builder ส่ง report แล้ว director ตรวจเองโดยรัน `pnpm test` และ check ที่ milestone นั้นพึ่ง อ่าน diff จริง แล้วจึงผ่าน gate ทุก check แบบ "ไม่ได้รับ/ถูกปฏิเสธ" ต้องมี positive control ใน test เดียวกัน และต้องเคยเห็นแดงเมื่อทำกฎให้เสีย (spec ส่วน 9 กฎข้อ 1 ถึง 3)

| # | งาน | Owner | Acceptance check | ต้องมีก่อน |
| --- | --- | --- | --- | --- |
| G0 | **ได้รับแล้ว** "ได้คับ ผมโอเค เริ่มทำหลังจาก spec พร้อมได้เลย" (2026-11-27) ขอบเขต M0 ถึง M5 | Mild | quote บันทึกแล้ว | spec PASS รอบ 6 + R27 แก้แล้ว, stack frontend อยู่ใน spec ก่อน M1 |
| M0 | Spike: Better Auth + D1 บน workerd local, migration, WS + `evictDurableObject`, mock OAuth (ไม่เกินครึ่งวัน), การวัดตาม spec ส่วน 14 | builder | (1) bundle จริง import `node:crypto` scrypt และทำ sign-up/sign-in ใน workerd ได้ พร้อม wall time ต่อ hash (2) test สร้างผู้สอนและผู้เรียนผ่าน sign-up API จริง ไม่ seed session (3) test WS ที่ evict DO แล้ว socket เดิมยังได้ event และพิสูจน์ได้ว่า evict เกิดจริง (4) mock OAuth ของ AC5 หรือใช้ fallback (5) วิธีให้ test ตั้ง `RESET_LINK_TTL_SECONDS` / `SOCKET_MAX_LIFETIME_SECONDS` เป็นไม่กี่วินาทีโดย test อื่นใช้ค่า default (6) ตัวเลขตามส่วน 14: เวลาต่อ hash ใน workerd, จำนวน D1 query ต่อ request, แถวที่อ่าน/เขียนต่อ operation (7) Playwright บล็อก WS ได้จริงทั้งแบบต่อไม่ได้และแบบเปิดได้แต่เงียบ (`routeWebSocket`) โดยมี control ว่า page ไม่ได้ frame WS เลย | G0 |
| M1 | Auth + role จาก env + `createAuth(env)` ตามตาราง 7.0 + password hash แบบมี prefix | builder | AC1 ถึง AC5 ตามความหมายใหม่ (role มาจาก env อย่างเดียว ผู้สอนใช้ password ได้, เปลี่ยน email ไม่ได้, list ว่าง = ไม่มีผู้สอน), AC22 (รวม `INSTRUCTOR_EMAILS` ขาดแล้ว fail ส่วนค่าว่างผ่าน และ list ที่มีรายการผิดรูปแม้รายการเดียว fail ทั้ง list โดยมี control เป็น list ที่ถูกต้องรวมตัวพิมพ์ใหญ่และช่องว่างรอบ comma), allowlist test ที่ไล่ทุก endpoint ของ `auth.api` | M0, hash scheme จาก M0 |
| M2 | Room + invite code + direct link + join | builder | AC6, AC7 | M1 |
| M3 | RoomDO, protocol, `canSee`/`project` (ทุกแถวเก็บ `author_name` สิทธิ์เห็นชื่อตัดสินที่ `project()` จุดเดียว), presenter mode, leak canary ตั้งแต่ increment แรก | builder | AC8 ถึง AC14 (AC10: ผู้สอนได้ชื่อผู้ถามถูกคน ไม่มี `authorId`, เจ้าของได้ `isMine`, B ไม่ได้อะไรเลยขณะได้ public marker), AC21 (presenter mode ซ่อนทั้งคำถามและชื่อ), `GET /api/rooms/:id/snapshot` และโหมดสำรองของ client: AC27 ถึง AC30 และส่วนที่ขยายของ AC9, AC10, AC13, AC16, AC17 (snapshot ผ่าน `snapshotFor(viewer)` ตัวเดียวกับ WS) | M2 |
| M4 | Reset link + hardening | builder | AC15 ถึง AC19 | M3 |
| M5 | README, runbook (ลำดับบัญชีผู้สอน N7, check AC24, ลบ user ที่ squat, กู้รหัสผู้สอน, query `reset_audit`), `/api/version`, Playwright e2e suite ที่รับ `BASE_URL` กับ email และรหัสผ่านของผู้สอนผ่าน environment variable | builder | AC20, AC23, AC24 เคยแดงใน local ทั้งสองกรณี (email ใน list ที่ไม่มีบัญชี และบัญชีที่คนอื่นสมัครไว้ก่อน), **AC26** กู้รหัสผู้สอนตาม runbook กับ local D1, พิสูจน์ใน local ว่า `INSTRUCTOR_EMAILS` ค่าว่างจาก `.dev.vars` และจาก `--var` ได้ string ว่าง ไม่ใช่ binding ที่หายไป และ `wrangler deploy --dry-run --var "INSTRUCTOR_EMAILS:"` กับ output ที่ Vite plugin build แสดง binding นี้ (review R22), e2e suite ผ่านกับ local, script แบบ headed ที่เปิด browser โดยบล็อก WS ให้ Mild ใช้ในข้อ 12 ของส่วน 3 | M4 |
| G1 | **Local sign-off** (ส่วน 3) | Mild | Mild พิมพ์ข้อความ sign off แล้ว Clara quote ลง record | M5 + director ตรวจ M5 แล้ว |
| M6 | Deploy e2e บน Cloudflare (Workers Paid) + post-check (ส่วน 4) | platform-operator | ตาม 4.3 | G1, G2 |
| G3 | Mild รับผล e2e | Mild | quote คำรับ | M6 |

Decision ใหม่ที่เกิดระหว่าง build ต้องกลับมาที่ director แล้วส่งต่อ Mild ผ่าน Clara ห้ามตัดสินกันเองระหว่างเขียนโค้ด

## 3. Local acceptance test สำหรับ Mild (G1)

### Mild ต้องเตรียม
1. **Email ผู้สอน** หนึ่งอันที่ Mild ใช้ได้ ใส่ใน `INSTRUCTOR_EMAILS` ใน `.dev.vars` (สมัครด้วย password ได้ ถ้าจะลอง Google ในฐานะผู้สอน ต้องเป็น Google account ที่ login ได้จริง และต้องเลือกวิธีเดียวตั้งแต่สมัครครั้งแรก)
2. Google Cloud: OAuth client แบบ **Web application**, redirect URI `http://localhost:5173/api/auth/callback/google` (scope แค่ openid/email/profile จึงไม่ต้องใส่ test user ตรวจกับเอกสาร Google แล้ว)
3. ใส่ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ใน `.dev.vars` บนเครื่องเอง (ไม่ส่งในแชต ไม่ commit)
4. Browser 3 profile: I (ผู้สอน), A และ B (ผู้เรียน สมัครด้วย password)
5. (ถ้ามี) Google account อีกอัน สำหรับข้อ 10

### ขั้นตอน (ประมาณ 25 นาที)
| # | ทำ | ต้องเห็น |
| --- | --- | --- |
| 0 | ทำตาม README: install, migrate local, `pnpm test`, `pnpm dev` | test ผ่านทั้งหมด พร้อมจำนวน test |
| 1 | I: สมัครด้วย email ผู้สอน (password หรือ Google) แล้วรัน check AC24 ตาม runbook | เข้าหน้า instructor ได้ และ AC24 ผ่าน |
| 2 | I สร้างห้อง แล้ว A และ B เปิด invite link, สมัคร, กด Join | ได้ code 10 ตัว และ A, B เข้าห้องได้ |
| 3 | A ถาม public "P1" และคำถามส่วนตัว "PRIV1" | (โหมด WS ปกติ) B เห็น P1 พร้อมชื่อ A ทันทีแต่**ไม่เห็น PRIV1**, I เห็นทั้งสองข้อพร้อมชื่อ A |
| 4 | I ตอบทั้งสองข้อแล้ว mark resolved | A เห็นทั้งสองคำตอบ, B เห็นเฉพาะของ P1 โดยไม่ต้อง refresh |
| 5 | I เปิด presenter mode แล้ว reload | PRIV1 และชื่อ A ที่ผูกกับคำถามนั้นไม่อยู่บนจอ I ทั้งก่อนและหลัง reload, ปิดแล้วกลับมาพร้อมรูปแบบที่ต่างจาก public |
| 6 | A ตั้ง DevTools เป็น offline, I ตอบ P1 เพิ่ม แล้ว A กลับ online | A ได้คำตอบใหม่เอง |
| 7 | A ลบ PRIV1 จากนั้น restart dev server | PRIV1 หายจาก I, หลัง restart ข้อมูลอื่นยังอยู่และทุกจอต่อกลับเอง |
| 8 | I สร้าง reset link ให้ B แล้วเปิดใน profile B | B ถูก logout, ตั้งรหัสใหม่ได้, ใช้ลิงก์ซ้ำไม่ได้ |
| 9 | เพิ่ม email ใหม่ที่ยังไม่มีบัญชีลงใน `INSTRUCTOR_EMAILS` แล้วรัน check AC24 จากนั้นสมัครด้วย email นั้นแล้วรันอีกครั้ง | ครั้งแรก**แดง** ครั้งที่สองผ่าน (เห็นว่า check จับกรณีลืมสมัครก่อนได้) |
| 10 | (ถ้ามี) สมัคร password ด้วย Google email อีกอัน แล้วกด Login with Google ด้วย account นั้น | ไม่ถูก link พร้อมข้อความอธิบาย |
| 11 | I rotate code แล้วผู้ใช้ใหม่ใช้ link เดิม | Join ไม่ได้ |
| 12 | เปิดห้องเป็น B ด้วย script บล็อก WS ตาม README แล้วให้ A ถาม public "P2" และคำถามส่วนตัว "PRIV2" จากนั้น B กด refresh | B เห็นตัวบอก "โหมดสำรอง" และข้อมูลเดิมภายในไม่กี่วินาที, P2 ขึ้นเองภายในราว 40 วินาที หรือทันทีเมื่อ refresh, **ไม่เห็น PRIV2**, B โพสต์และเห็นของตัวเองทันที |

Sign off: Mild พิมพ์ข้อความ เช่น "sign off local handsup" ถ้ามีข้อไหนไม่ผ่าน ให้แจ้งเลขข้อ แล้วงานจะกลับไปที่ builder

## 4. Cloudflare deploy + e2e (M6, platform-operator) เริ่มได้หลัง G1 เท่านั้น

### 4.1 Approval gate G2
หลัง G1 Clara ส่งรายการนี้ให้ Mild อนุมัติเป็นข้อความเดียว:
- account ที่ใช้ และ**การเปิด Workers Paid** ($5/เดือนขึ้นไป เป็น action ด้าน billing) ถ้า account ยังไม่ได้เป็น Paid operator ห้ามเปิดหรือเปลี่ยน plan นอกจากที่อยู่ในรายการนี้
- resource ที่จะสร้าง: Worker `handsup-e2e`, D1 `handsup-e2e`, DO class `RoomDO`
- secrets: `BETTER_AUTH_SECRET` (ค่าใหม่ ไม่ใช้ของ local), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- vars: `BETTER_AUTH_URL = https://handsup-e2e.<subdomain>.workers.dev` และ `INSTRUCTOR_EMAILS` ส่งด้วย `--var` ทุก deploy (**deploy แรกเป็นค่าว่าง** ตาม N7)
- deploy ซ้ำหนึ่งครั้งด้วย commit เดิมเพื่อใส่ email ผู้สอนลง `INSTRUCTOR_EMAILS` หลังผ่านลำดับ N7 การเพิ่มผู้สอนหลังจากนี้เป็น deploy ใหม่และต้องขออนุมัติใหม่
- email ผู้สอนที่จะใส่ใน list ภายหลัง: email สำหรับ e2e โดยเฉพาะ (operator สร้างรหัสผ่านเอง เก็บบนเครื่องเท่านั้น) และ email ของ Mild ถ้าจะลอง login ผู้สอนบนระบบจริง
- commit SHA ที่ Mild sign off

ห้ามทำ action ใดบน account ก่อนได้คำอนุมัตินี้ ถ้าจะทำอะไรนอกรายการต้องขออนุมัติใหม่

Mild ต้องทำเอง: เพิ่ม redirect URI `https://handsup-e2e.<subdomain>.workers.dev/api/auth/callback/google` ใน Google OAuth client และตั้ง secret ที่เป็นของ Google เอง หรืออนุญาตให้ operator ตั้งจากไฟล์บนเครื่อง (ค่าไม่ผ่านแชต)

### 4.2 Pre-flight (ต้องผ่านทุกข้อก่อน deploy)
1. `git rev-parse HEAD` ตรงกับ SHA ที่ Mild sign off และ working tree สะอาด
2. `wrangler whoami` เป็น account ที่อนุมัติ และ account เป็น Workers Paid แล้ว (หรือการเปิด Paid อยู่ในรายการที่ Mild อนุมัติ)
3. `wrangler deploy --dry-run` build ผ่าน และ bundle ใช้ native scrypt ตามที่ M0 พิสูจน์
4. `wrangler.jsonc` มี `nodejs_compat`, DO migration แบบ `new_sqlite_classes`, binding D1 ชี้ไปที่ DB ของ e2e, `BETTER_AUTH_URL` เป็น URL ของ e2e, **ไม่มี** `INSTRUCTOR_EMAILS` และ `keep_vars` และไม่ได้ตั้ง `RESET_LINK_TTL_SECONDS` หรือ `SOCKET_MAX_LIFETIME_SECONDS`
5. คำสั่ง deploy ที่จะใช้มี `--var "INSTRUCTOR_EMAILS:..."` และผลพิสูจน์ใน M5 เรื่องค่าว่างกับ config ที่ Vite plugin สร้างแนบอยู่ในรายงาน
6. Mild ยืนยันว่าเพิ่ม redirect URI แล้ว
7. เขียนคำสั่ง rollback (4.4) ไว้และตรวจว่าถูกต้องก่อนเริ่ม

### 4.3 Deploy และ post-check (ทำตามลำดับ)
1. Deploy: สร้าง D1, `wrangler d1 migrations apply --remote`, ตั้ง secrets, `wrangler deploy --var "INSTRUCTOR_EMAILS:"` แล้วยืนยันว่า app ทำงาน (ไม่ fail ตอนเริ่ม) และผู้ใช้ที่ login ได้ role learner
2. `GET /api/version` คืน SHA ที่อนุมัติ และ `wrangler deployments list` แสดง version ล่าสุดตรงกัน
3. ลำดับบัญชีผู้สอน (N7): บัญชี e2e สมัครด้วย password (และ Mild สมัครเองถ้าจะใช้ email ของเขา) แล้ว login สำเร็จ, operator ตรวจใน D1 ว่ามี user เดียวต่อ email และเวลาสร้างตรงกัน แล้วจึง deploy ซ้ำด้วย commit เดิมและ `--var "INSTRUCTOR_EMAILS:<email ที่อนุมัติ>"` ตรวจ `/api/version` ยังเป็น SHA เดิม จากนั้นรัน **AC24** ต้องผ่านก่อนไปข้อถัดไป ถ้าได้ "มีผู้ใช้อยู่แล้ว" ให้หยุดและรายงาน ห้ามลบ user เองโดยไม่มีคำสั่ง
4. รัน Playwright e2e suite กับ URL จริง: AC8, AC9 (รวมทาง HTTP snapshot), AC10, AC11, AC15, AC17 และ AC27 (บล็อก WS ด้วย Playwright กับ URL จริง) ต้องผ่าน โดยบนระบบจริง
   - AC9 ไม่มี phase `evictDurableObject` ใช้การปล่อย idle เกินช่วง hibernate แทน และ report ต้องเขียนว่า**พิสูจน์ eviction บนระบบจริงไม่ได้** (พิสูจน์แล้วใน local ด้วย AC14)
   - AC15 ไม่ตรวจการหมดอายุ (พิสูจน์ใน local) ส่วนที่เหลือตรวจบนระบบจริง
5. Cookie มี `Secure` และ prefix `__Secure-`
6. Rate limit: key ในตาราง `rateLimit` เป็น IP จริงของเครื่องที่ยิง ไม่ใช่ bucket รวม ส่วนการแยก bucket ตาม IP ใช้ผล AC18 ใน local และ snapshot จาก 50 user บน IP เดียวกัน (เครื่อง operator) ได้ `200` ทั้งหมด ซึ่งเป็นกรณีจริงของห้องเรียนที่ใช้ NAT เดียว (ครึ่งแรกของ AC30)
7. Google login บน URL จริงหนึ่งครั้งด้วยมือ (Mild)
8. **AC25 load check** (spec ส่วน 14): รอ ≥61 วินาทีหลัง suite แล้วยิง sign-up พร้อมกัน 30 ครั้ง รออีก ≥61 วินาที แล้วยิง sign-in พร้อมกัน 30 ครั้ง ผ่านเมื่อทุก request สำเร็จ ไม่มี `429`, `exceededCpu`, `1102` หรือ exceeded memory และ hash ที่เก็บยังมี prefix ตาม 7.1 บันทึก p99 CPU ms และ p99 wall time ถ้า p99 wall time เกิน 5 วินาที ให้รายงาน Mild เป็นข้อสังเกต (review R21) ถ้าไม่ผ่าน: หยุด เก็บหลักฐาน แล้วกลับไปถาม Mild **ห้ามเปลี่ยน hash หรือสถาปัตยกรรมเอง**
9. Report แยกให้ชัดว่าข้อไหน verified (พร้อม output) ข้อไหน inferred และข้อไหนพิสูจน์ได้แค่ใน local

### 4.4 Rollback
- Deploy ครั้งแรกไม่มี version ก่อนหน้า rollback จึงหมายถึงเอาลง: `wrangler delete handsup-e2e` (หรือปิด `workers.dev` route) โดยใช้ CLI หรือ dashboard ไม่ต้องพึ่งตัว app
- `wrangler rollback` ไม่ย้อน D1 schema และ DO migration ถ้า deploy ครั้งถัดไปมี migration ใหม่ ต้อง `wrangler d1 export` ก่อน
- ถ้า post-check ไม่ผ่าน operator ห้ามแก้โค้ดบนระบบจริง ให้หยุด เก็บ log แล้วรายงาน ถ้าเป็นเรื่อง security (canary ไม่ผ่าน หรือ AC24 พบบัญชีผู้สอนที่ไม่ใช่ของเรา) ให้ deploy ซ้ำด้วย `--var "INSTRUCTOR_EMAILS:"` (การทำ list ให้ว่างต้อง deploy ใหม่) หรือเอา Worker ลง ภายใน 15 นาทีแล้วค่อยรายงาน ส่วน AC25 ไม่ผ่านไม่ต้องเอาลง ปล่อยไว้ได้จนกว่า Mild จะตัดสิน
- Paid ไม่มี daily quota แบบ Free แต่ใช้เกินโควตารายเดือนที่รวมใน plan จะคิดเงินเพิ่ม (spec ส่วน 14) งาน e2e ใช้น้อยกว่าโควตามาก operator รายงานตัวเลข usage ตอนจบ
- ข้อมูลทดสอบอยู่ใน D1 ของ e2e เท่านั้น ตอนจบ Mild เลือกว่าจะเก็บหรือลบ (default: เก็บไว้จนกว่า Mild จะสั่ง) ห้ามลบบัญชีผู้สอนขณะที่ email ยังอยู่ใน `INSTRUCTOR_EMAILS` ให้ deploy ด้วย list ที่เอา email นั้นออกก่อน รหัสผ่านของบัญชี e2e อยู่บนเครื่อง operator เท่านั้น

## 5. Deferrals

| เรื่อง | Owner | Trigger |
| --- | --- | --- |
| FAQ publish ของคำถามส่วนตัว (Q2) | Mild | Mild ขอ |
| Remove member | Mild | code หลุด หรือมีคนป่วนที่ลบได้แค่ผ่าน DB |
| Search ข้ามห้อง (Q5) | Mild | ห้องเกิน 1,000 คำถาม หรือผู้ใช้ขอ |
| ปุ่ม link Google สำหรับคนที่สมัครด้วย password (N1 ก) | builder เสนอ | มีผู้ใช้ติด `account not linked` |
| Production launch (custom domain, env แยก, backup) | platform-operator เสนอ | หลัง G3 และ Mild สั่ง |
| CI | builder | ก่อนมีคนที่สองเขียนโค้ด หรือก่อน production |
| PBKDF2 limit ของ production Workers (issue workerd #1346) | director | ถ้าต้องกลับมาพิจารณาทางเลือกของ hash |
