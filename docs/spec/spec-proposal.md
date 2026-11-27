# handsup: Realtime Learner Forum, Spec v1

> สถานะ (2026-11-27): **Mild ตัดสินแล้ว: DEC-1, DEC-2, DEC-3 (Workers Paid), ชื่อ "คำถามส่วนตัว", ลำดับสร้างบัญชีผู้สอน และ polling สำรองเมื่อ WebSocket ใช้ไม่ได้ (ส่วน 1.1)** DEC-4 ปิดแล้ว ข้ออื่นที่ระบุว่า "ข้อเสนอ" หรือ "default" ยังรอเขา
> **G0 ได้รับแล้ว (2026-11-27) ขอบเขต M0 ถึง M5 จนถึง G1 เท่านั้น ยังไม่มีการอนุมัติ push, deploy หรือ action ใดบน Cloudflare account**
> Review: `docs/plan/review.md` **รอบ 6 ให้ PASS** รวม polling สำรอง (ส่วน 8.6, AC27 ถึง AC30) และ R21 ถึง R23 ข้อแนะนำ R24 ถึง R26 ไม่ขวางการเผยแพร่
> ที่มา: `realtime-forum-spec.original.md` (ไม่ได้แก้ไข)
> วันที่ตรวจเอกสารและ source ของ library: 2026-11-27
> รหัส **DEC-n** ใน `plan.md`: DEC-1 = Q1, DEC-2 = U4, DEC-3 = N3, DEC-4 = จะรู้ผลเรื่อง Free เมื่อไร (ปิดแล้ว) (D1 ในไฟล์นี้หมายถึงฐานข้อมูล Cloudflare D1)

## 0. สิ่งที่ต้องดูก่อน (flags)

| # | เรื่อง | รายละเอียด |
| --- | --- | --- |
| F1 | ชื่อ project | Title ของ draft เขียน **headsup** แต่ repo และ README เป็น **handsup** ข้อเสนอ: ใช้ `handsup` (รอ Mild ยืนยัน) |
| F2 | "ใช้ Google SSO ทั้งผู้เรียนและผู้สอน" + password ปกติ (Decided) | ปิดแล้วด้วย DEC-2: ทุก role ใช้ได้ทั้งสองวิธี ข้อความใน draft ที่ว่า "ให้ instructor login ผ่าน Google" และข้อ "ยังไม่แน่ใจ" เรื่อง Google-only ไม่ใช้แล้ว |
| F3 | Google SSO ของผู้เรียนมีข้อจำกัดเมื่อไม่มี email verification | ผู้เรียนที่สมัครด้วย password แล้ว จะกด "Login with Google" ด้วย email เดียวกัน **ไม่ได้** (Better Auth 1.7.28 ตอบ `account not linked` ตาม default) เป็นการกัน account pre-hijacking ดู N1 |
| F4 | Reset link ทำให้ผู้สอนสวมรอยผู้เรียนได้ | ผู้สอนสร้างลิงก์แล้วเปิดเอง ตั้งรหัสใหม่ แล้วโพสต์หรือลบในชื่อผู้เรียนได้ เป็นผลของ design ใน Decided ดู N2 |
| F5 | "เห็นเฉพาะผู้สอน" (Decided) | เรื่องชื่อปิดแล้วด้วย DEC-1: ผู้สอนเห็นชื่อ ส่วนผู้ถามเห็นคำถามของตัวเองตามเนื้อหา draft ข้อเสนอตีความว่า "ผู้ถาม + ผู้สอน" |
| F6 | "ผู้สอน login ด้วย Better Auth" (Decided) | ตีความว่า Better Auth เป็น auth library ของ**ทั้งระบบ** (ผู้เรียนด้วย) ถ้าหมายถึงอย่างอื่นโปรดแจ้ง |
| F7 | Open question 3 | Decided เรื่อง invite code ตอบไปแล้วเป็นส่วนใหญ่: ต้อง join ด้วย code ก่อน |
| F8 | Open question 4 | "ผู้เรียนตอบกันเอง" อยู่ทั้งใน Open questions และ Out of scope (v1) |
| F9 | Room | ตาราง Roles เขียนแล้วว่า instructor สร้าง Room และ Platform ระบุ Durable Objects, D1 แล้ว แต่ท้ายไฟล์ยังจัดเป็น "ยังไม่แน่ใจ" |
| F10 | "invite code ใช้ 10 ตัว" | ตีความว่ายาว 10 ตัวอักษร ชุดตัวอักษรยังไม่ระบุ ดู 7.5 |
| F11 | ชื่อ "anonymous" | ปิดแล้ว: ใช้ชื่อ **คำถามส่วนตัว (private question)** ค่าใน DB คือ `private` ข้อความ Decided ที่ยกมายังใช้คำเดิม |
| F12 | ผู้สอนที่ใช้ password โดยไม่มี email verification | ใครสมัครด้วย email ใน list ได้ก่อน ได้สิทธิ์ผู้สอนทันที Mild รับวิธีรับมือแล้ว (ลำดับสร้างบัญชี N7) ไม่มีการกันในโค้ด |

## 1. Decided (ถือเป็นข้อกำหนดตายตัว)

| ID | ข้อกำหนด | รองรับที่ | Flag |
| --- | --- | --- | --- |
| DC1 | ใช้ Cloudflare ทำ realtime forum | ส่วน 4 | |
| DC2 | Auth: name + email + password และ Google SSO ใช้ทั้งผู้เรียนและผู้สอน | ส่วน 7 | F2, F3 |
| DC3 | ทุกคนเป็น learner ยกเว้นผู้สอนซึ่งล็อกด้วย email ใน env | 7.3 | |
| DC4 | ผู้สอน login ด้วย Better Auth | ส่วน 7 | F6 |
| DC5 | ไม่มี email OTP / forgot password: หน้า admin สร้างลิงก์ reset แล้วผู้สอนส่งเอง | 7.4 | F4 |
| DC6 | "ผู้เรียนถามแบบ anonymous ได้ โดยคนอื่นไม่เห็น เห็นเฉพาะผู้สอน" (ชื่อเรียกดู F11) | ส่วน 6 | F5, F11 |
| DC7 | Join room ด้วย invite code 10 ตัว share ผ่าน direct link ได้ | 7.5 | F10 |

### 1.1 ตัดสินแล้วโดย Mild (2026-11-27)

| ID | ผลตัดสิน | คำของ Mild |
| --- | --- | --- |
| DEC-1 (Q1) | ผู้สอนเห็นชื่อผู้ถาม ผู้เรียนคนอื่นในห้องไม่เห็นคำถามนั้น | "ผมน่าจะตั้งชื่อผิด ผมเห็นชื่อได้ แต่นักเรียนคนอื่น ในห้อง ไม่เห็นข้อความนี้ เรียกว่าอะไร" |
| DEC-2 (U4) | ไม่ lock ผู้สอนไว้ที่ Google: email ผู้สอนมาจาก env และสมัคร/login ด้วย password ได้ | "ไม่ต้อง lock เพราะ ยังไง email ซ้ำไม่ได้อยู่แล้ว จะได้ทำ test ง่ายๆ ด้วย แล้วมี env ที่ lock email ผู้สอนไว้แล้ว" |
| DEC-3 (N3) | ใช้ **Workers Paid** (แทนคำตัดสินเดิมที่ให้ใช้ Free ก่อน) | ล่าสุด: "ได้ครับ ไปตัว paid ได้คับ" (เดิม: "ไปแบบฟรีก่อน ถ้าไม่พอ ค่อยว่ากัน") |
| DEC-4 | ปิดแล้ว: ใช้ Paid จึงไม่ต้อง probe บน Free | "ได้ครับ ไปตัว paid ได้คับ" |
| Polling สำรอง | เมื่อ WebSocket ใช้ไม่ได้ client ดึงข้อมูลผ่าน HTTP เองประมาณทุก 30 วินาที refresh เองเพื่อดูทันทีได้ | "ถ้า websocket สามารถ ใช้งานได่มั้ย ถ้าไม่ได้ น่าจะมี fallback ให้ใช้งานได้ตามปกตินะ" และ "คับ polling ประมาณ 30 sec ได้มั้ย ไม่ต้องถี่มาก ถ้าใครอยากเห็นเร็ว ก็ refresh เองได้" |
| ชื่อ (F11) | ใช้ชื่อ "คำถามส่วนตัว" (Private question) | "รับ 1, 2" (ข้อ 1) |
| บัญชีผู้สอน (N7) | สร้างบัญชีผู้สอนก่อนแชร์ URL มี post-check หลัง deploy ผู้สอนคนใหม่สมัครก่อนแล้วจึงใส่ email ใน env | "รับ 1, 2" (ข้อ 2) |
| Frontend (N4) | React + Vite SPA กับ Tailwind CSS + shadcn/ui, React Router, state ใช้ของ React เอง (ไม่มี state library) | "ได้คับ ผมโอเค เริ่มทำหลังจาก spec พร้อมได้เลย" |
| G0 | อนุญาตให้เริ่ม implement **เมื่อ spec พร้อม** (director PASS) | "ได้คับ ผมโอเค เริ่มทำหลังจาก spec พร้อมได้เลย" |

ยังไม่ได้อนุญาต: deploy และ action ใด ๆ บน Cloudflare account (รวมการเปิด plan Paid)

## 2. ข้อเสนอและ default (ข้อที่ระบุว่า "ตัดสินแล้ว" ปิดแล้ว ที่เหลือรอ Mild)

### 2.1 หัวข้อ "ยังไม่แน่ใจ"

**U1: 1 Room = 1 Durable Object + WebSocket Hibernation API** (ข้อเสนอ: ใช้)
- เหตุผล: DO เป็นจุดเดียวต่อห้อง ลำดับ write กับ broadcast ชัดเจน และ connection ที่ idle ไม่คิด duration
- ทางเลือก: (ก) DO ตัวเดียวทุกห้อง (ข) polling / SSE จาก Worker + D1
- ค่าใช้จ่าย: ต้องออกแบบให้ state อยู่ใน storage หรือ socket attachment เพราะ memory หายตอน hibernate และต้องทำ reconnect เพราะ socket หลุดได้ตอน deploy ทางเลือก (ก) เป็นคอขวดและต้องกรองห้องเอง (ข) ง่ายกว่าแต่ไม่ realtime จริงและเปลือง request

**U2: User/Session ใน D1, Question/Answer ใน SQLite ของ DO แต่ละห้อง** (ข้อเสนอ: ใช้)
- เหตุผล: query และ insert ใน DO เป็น synchronous จึงทำ snapshot แล้ว subscribe ได้โดยไม่มีช่องให้ event หลุด และข้อมูลแต่ละห้องแยกกันเอง
- ทางเลือก: เก็บทุกอย่างใน D1 ใช้ DO แค่ fan-out
- ค่าใช้จ่าย: query ข้ามห้อง (search, รายงาน, export, ลบข้อมูลของ user คนหนึ่ง) ต้องวนทุก DO และ debug ข้อมูลยากกว่า ทางเลือก D1 ดู/แก้ข้อมูลง่ายกว่า แต่ต้องจัดการ race ระหว่าง snapshot กับ broadcast เอง

**U3: Room อยู่ใน D1 และ instructor สร้างเท่านั้น** (ข้อเสนอ: ใช้)
- เหตุผล: ต้อง list ห้องและค้น invite code ข้ามห้อง และตรงกับตาราง Roles ใน draft
- ทางเลือก: ให้ learner สร้างห้องได้ หรือเก็บ metadata ใน DO + registry
- ค่าใช้จ่าย: ทุก request ของห้องต้องอ่าน D1 เพื่อเช็ก membership ถ้าให้ learner สร้างได้ ต้องเพิ่ม role เจ้าของห้องและ moderation

**U4 (DEC-2, ตัดสินแล้ว): ไม่ lock ผู้สอนไว้ที่ Google**
- ผู้สอนสมัครและ login ได้ทั้ง password และ Google, role มาจาก email ใน env อย่างเดียว (7.3)
- ผลที่ตามมา: F12 รับมือด้วย N7

**U5: Hono บน Workers** (ข้อเสนอ: ใช้)
- เหตุผล: router เบา มี middleware สำหรับ auth / origin check และ mount handler ของ Better Auth ได้
- ทางเลือก: fetch handler เปล่า, Elysia, หรือ full-stack framework (React Router)
- ค่าใช้จ่าย: dependency เพิ่มหนึ่งตัว fetch เปล่าต้องเขียน routing/validation เอง full-stack framework ผูก frontend กับ backend แน่นกว่า

### 2.2 Open questions

**Q1 (DEC-1, ตัดสินแล้ว): ผู้สอนเห็นชื่อผู้ถาม**
- คำถามแบบ private เห็นเฉพาะผู้ถามและผู้สอน ผู้สอนเห็นชื่อผู้ถาม
- ชื่อ: **คำถามส่วนตัว** (ตัดสินแล้ว) ข้อความบนปุ่มตอนเลือก: "ถามส่วนตัว (ผู้สอนเห็นชื่อคุณ)" (default: ใช้ตามนี้ถ้า Mild ไม่แก้)
- การป้องกันไม่ให้ผู้เรียนคนอื่นเห็นเหมือนเดิมทั้งหมด (ส่วน 6)

**Q2: เผยแพร่ private Question พร้อมคำตอบเป็น FAQ ได้ไหม** (ข้อเสนอ: **ไม่อยู่ใน v1**)
- เหตุผล: ผู้ถามได้รับสัญญาว่าคนอื่นไม่เห็น (DC6) การเผยแพร่ต้องมี consent และเนื้อคำถามอาจระบุตัวเองได้
- ทางเลือก: ตอนถามมี checkbox "อนุญาตให้ผู้สอนเผยแพร่โดยไม่ระบุชื่อ" แล้วผู้สอนกดเผยแพร่ได้เฉพาะข้อนั้น
- ค่าใช้จ่าย: v1 ผู้สอนต้องพิมพ์คำถามใหม่เองถ้าจะแชร์ ทางเลือกเพิ่ม visibility state หนึ่งแบบ, event ตอนเปลี่ยนสิทธิ์, test เพิ่ม และ unpublish เรียกสิ่งที่คนเห็นไปแล้วคืนไม่ได้ (เพิ่มภายหลังได้โดย migration แบบเพิ่ม column)

**Q3: ผู้เรียนเข้าได้ทุก Room หรือต้องถูกเพิ่มก่อน** (ข้อเสนอ: ต้อง join ด้วย invite code ตาม DC7 แล้วเป็นสมาชิกถาวร ผู้สอน**ไม่มี**การเพิ่มรายคน, v1 มี rotate code แต่ไม่มี remove member)
- เหตุผล: ครอบ DC7 ด้วยของน้อยที่สุด
- ทางเลือก: เพิ่ม remove member ใน v1
- ค่าใช้จ่าย: ถ้า code หลุด คนที่ join ไปแล้วยังอยู่ ลบออกได้ด้วยการแก้ DB เท่านั้น ทางเลือกเพิ่ม UI, API, การตัด WebSocket และต้องนิยามว่าโพสต์เก่าของคนถูกลบทำอย่างไร

**Q4: ผู้เรียนตอบกันเองได้ไหม** (ข้อเสนอ: ไม่ได้ ตาม Out of scope)
- เหตุผล: draft จัดเป็น out of scope แล้ว และตัดคำถามว่าใครเห็นคำตอบของ private Question ออกไป
- ทางเลือก: ให้ตอบได้เฉพาะ public Question
- ค่าใช้จ่าย: v1 ไม่มี peer discussion ทางเลือกต้องเพิ่มสิทธิ์ตอบ/ลบ และ moderation

**Q5: ค้นหาคำถามเก่าข้ามห้องไหม** (ข้อเสนอ: ไม่ทำ มีแค่ filter ข้อความในห้องฝั่ง client จาก snapshot)
- เหตุผล: ข้อมูลแยกอยู่ใน DO ต่อห้อง และ search เป็นทางรั่วของ private อีกทางหนึ่ง
- ทางเลือก: ทำ index ใน D1 (FTS5) ที่ DO เขียนตามหลัง
- ค่าใช้จ่าย: ผู้ใช้ต้องรู้ว่าคำถามอยู่ห้องไหน ทางเลือกต้อง sync สองที่ (ลบแล้วต้องลบตาม) และต้องใช้กฎ visibility ซ้ำใน search

### 2.3 คำถามใหม่ที่ draft ยังไม่ครอบ

**N1: email เดียวกัน สมัครคนละวิธี** (ข้อเสนอ: คง default ของ Better Auth ไม่ auto-link, แสดงข้อความให้ login ด้วยวิธีที่สมัครไว้)
- เหตุผล: ถ้า auto-link คนที่สมัครดักไว้ด้วย email คนอื่นจะยังถือรหัสผ่านของบัญชีนั้น และเห็นข้อมูลของเจ้าของ email ได้
- ผลหลัง DEC-2 (ใช้กับผู้สอนด้วย): สมัคร password ก่อน แล้วกด Google ด้วย email เดียวกันจะได้ `account not linked`, สมัคร Google ก่อน แล้วสมัคร password จะได้ error ว่ามีผู้ใช้ หนึ่ง email จึงใช้ได้วิธีเดียวคือวิธีที่สมัครครั้งแรก
- ทางเลือก: (ก) ปุ่ม "เชื่อม Google" สำหรับคนที่ login ด้วย password อยู่แล้ว (`linkSocial`) (ข) ตั้ง `requireLocalEmailVerified: false`
- ค่าใช้จ่าย: ผู้ใช้บางคนติด (ก) เพิ่ม UI และ test (ข) **ไม่แนะนำ** เปิดช่อง takeover (ผู้สอนด้วย) และ source ระบุว่า option นี้ deprecated

**N2: ความเสี่ยงสวมรอยผ่าน reset link (F4)** (ข้อเสนอ: ยอมรับใน v1 พร้อม mitigation: บันทึก audit log ว่าใครสร้างลิงก์ให้ใครเมื่อไร, reset แล้ว revoke ทุก session, ผู้เรียนจะรู้ตัวเพราะรหัสเดิมใช้ไม่ได้)
- เหตุผล: DC5 กำหนดให้ผู้สอนเป็นคนถือลิงก์
- ทางเลือก: แสดงประวัติ reset ในหน้าบัญชีของผู้เรียน หรือจำกัดคนสร้างลิงก์ไว้ที่ผู้ดูแลระบบคนเดียว
- ค่าใช้จ่าย: ขึ้นกับความไว้ใจผู้สอน (และคนที่ยึดสิทธิ์ผู้สอนได้ตาม F12 จะยึดบัญชีผู้เรียนต่อได้) ทางเลือกแรกเพิ่มงาน UI ทางเลือกหลังเพิ่ม role

**N3 (DEC-3, ตัดสินแล้ว): Workers Paid**
- ขั้นต่ำ $5/เดือน ต่อ account
- CPU ต่อ request พอสำหรับ password hashing ตามเอกสาร ส่วน memory 128 MB เท่า Free จึงยังต้องมี load check (ส่วน 14, AC25)
- ห้ามลดความแข็งของ hash หรือเปลี่ยน parameter โดยไม่แจ้ง Mild การลดความแข็งต้องเป็นคำตัดสินของเขา

**N4: Frontend (ตัดสินแล้ว):** React + Vite SPA เสิร์ฟด้วย Workers static assets บน origin เดียวกับ API ผ่าน `@cloudflare/vite-plugin`
- UI: Tailwind CSS + shadcn/ui
- Routing: React Router ใช้เป็น router ของ SPA ไม่ใช่ full-stack framework
- State: ของ React เอง (state, context, reducer) ไม่มี state library
- เหตุผล: origin เดียว ไม่ต้องทำ CORS, cookie ตรงไปตรงมา, dev server เดียว
- ทางเลือกที่ไม่เลือก: framework แบบ SSR หรือ SPA แยก deploy
- ค่าใช้จ่าย: ไม่มี SSR (ไม่จำเป็นกับหน้าที่ต้อง login) ทางเลือกเพิ่มความซับซ้อน

**N5: ค่า default ปลีกย่อย** (รอ Mild: ใช้ตามนี้ถ้าไม่แก้ อนุมัติรวมหรือแก้รายข้อได้)

| ข้อ | ข้อเสนอ | ทางเลือก / ค่าใช้จ่าย |
| --- | --- | --- |
| อายุ reset link | 24 ชม., ใช้ครั้งเดียว, สร้างใหม่แล้วลิงก์เก่าใช้ไม่ได้ | 1 ชม. (default ของ library) ปลอดภัยกว่าแต่หมดอายุก่อนผู้เรียนเปิด |
| Sign-up | เปิดให้ทุกคน แต่ยังไม่เห็นอะไรจนกว่าจะ join | บังคับมี invite code ตอนสมัคร: กัน spam แต่ flow ยาวขึ้น |
| จำนวน Answer | หลายคำตอบต่อ Question, ผู้สอนเท่านั้น | คำตอบเดียว: ง่ายกว่าแต่ต้องมี edit |
| Resolved | ผู้สอน toggle ได้ทั้งเปิดและปิด, ตอบแล้วไม่ auto-resolve | auto-resolve: กดน้อยลง แต่ผิดเมื่อตอบเพื่อถามกลับ |
| ลบ Question | เจ้าของลบได้แม้มีคำตอบแล้ว (คำตอบหายตาม), hard delete | ห้ามลบหลังตอบ หรือ soft delete: เก็บความรู้ไว้ได้ แต่ขัดกับ "ลบของตัวเอง" |
| แก้ไขโพสต์ | ไม่มีใน v1 | เพิ่ม edit: ต้องมี event และ test เพิ่ม |
| ชื่อผู้ใช้ | แก้ไม่ได้ใน v1 (Google ใช้ชื่อจาก profile) | แก้ได้: ต้อง update ชื่อใน DO ทุกห้อง |
| ผู้สอนหลายคน | `INSTRUCTOR_EMAILS` คั่นด้วย comma, ทุกคนเห็นทุกห้อง | แยกเจ้าของห้อง: เพิ่มสิทธิ์ระดับห้อง |
| ลบ/archive Room, เปลี่ยนชื่อห้อง | ไม่มีใน v1 | |
| ความยาวข้อความ | 1 ถึง 4,000 ตัวอักษร, plain text, ไม่ render HTML/Markdown | Markdown: ต้อง sanitize |
| อัตราการโพสต์ | 10 ครั้ง/นาที/user | ไม่จำกัด: ง่ายกว่า แต่คนเดียว flood ห้องได้ |
| จำนวนต่อห้อง | สูงสุด 1,000 Question (snapshot เดียว) | pagination: ซับซ้อนขึ้นทั้ง protocol |

**N6: Presenter mode ในหน้าผู้สอน** (default รอ Mild, อยู่ในขอบเขต v1)
- ข้อเสนอ: ปุ่มเดียวซ่อน private Question ทั้งหมด (รวมชื่อผู้ถาม และข้อที่เข้ามาใหม่) จากรายการที่ render จำสถานะปุ่มไว้ใน browser เพื่อให้ reload ระหว่างฉายจอแล้วยังซ่อนอยู่ ในมุมมองปกติ private ต้องดูต่างจาก public ชัดเจน
- เหตุผล: การฉายจอผู้สอนให้ห้องดูเป็นการใช้งานหลัก ถ้าไม่มีปุ่มนี้ ผู้เรียนอื่นจะเห็นสิ่งที่ DC6 ห้ามเห็น พร้อมชื่อผู้ถาม
- ทางเลือก: เปิด presenter mode เป็นค่าเริ่มต้น หรือแยกหน้า presenter ต่างหาก
- ค่าใช้จ่าย: filter ฝั่ง client พอเพราะกระทบแค่จอผู้สอน แต่**ถ้าลืมกดก่อนฉาย ยังรั่วได้** ทางเลือกแรกกันการลืมได้ แต่ผู้สอนต้องปิดเองเพื่อเห็น private

**N7 (ตัดสินแล้ว): สร้างบัญชีผู้สอนก่อนเชื่อถือ email (F12)** ไม่ block sign-up ในโค้ด
- ความเสี่ยงที่รับมือ: ไม่มี email verification ใครสมัครด้วย email ที่อยู่ใน `INSTRUCTOR_EMAILS` ได้ก่อน จะเห็นทุกคำถามพร้อมชื่อ ลบได้ทุกโพสต์ และสร้าง reset link ยึดบัญชีผู้เรียนได้ เกิดเช่นกันเมื่อพิมพ์ email ใน env ผิด หรือเพิ่ม email ที่มีคนอื่นสมัครไว้แล้ว
- ที่ Mild รับ: บัญชีผู้สอนสร้างก่อนแชร์ URL, มี post-check หลัง deploy, ผู้สอนคนใหม่สมัครก่อนแล้วจึงใส่ email ใน env
- ขั้นตอนใน runbook (รายละเอียดโดย builder):
  1. ตั้ง `INSTRUCTOR_EMAILS` โดย**ยังไม่ใส่** email ใหม่ (ค่าว่างได้ แปลว่ายังไม่มีผู้สอน วิธีตั้งดู 7.3)
  2. เจ้าของ email สมัครเอง (password หรือ Google) แล้ว login สำเร็จ
  3. ถ้าได้ "มีผู้ใช้อยู่แล้ว" หรือ login ไม่ได้ ให้หยุด operator ลบ user ที่ดักไว้ด้วย script แล้วทำข้อ 2 ใหม่
  4. operator ตรวจใน D1 ว่ามี user เดียวของ email นั้น และเวลาสร้างตรงกับข้อ 2 แล้วจึงเพิ่ม email เข้า env (บนระบบจริงคือ deploy commit เดิมซ้ำด้วยค่าใหม่ ต้องอยู่ในรายการที่ Mild อนุมัติ)
  5. Post-check หลัง deploy (AC24): ทุก email ใน list มีบัญชี และเจ้าของ login แล้ว `/api/me` ตอบว่าเป็นผู้สอน (แค่มีแถวใน DB ไม่พิสูจน์ความเป็นเจ้าของ)
  6. แชร์ URL หลังข้อ 5 ผ่าน
  7. ห้ามลบบัญชีผู้สอนขณะที่ email ยังอยู่ใน env ให้เอาออกจาก env ก่อน
- ค่าใช้จ่ายที่เหลือ: พึ่งคนทำตาม runbook เพิ่มการตั้งค่า env หนึ่งรอบต่อการเพิ่มผู้สอน ระบบไม่กันให้ถ้าข้ามขั้นตอน

### 2.4 สิ่งที่เพิ่มเกินจาก draft (รอ Mild: ใช้ตามนี้ถ้าไม่แก้)

| รายการ | ที่มา |
| --- | --- |
| Rotate invite code | Q3 |
| ค้น user ในหน้า admin | จำเป็นต่อ reset link (DC5) |
| จำกัดการโพสต์ 10 ครั้ง/นาที/user และ join 10 ครั้ง/นาที/user | N5, 7.5 |
| เพดาน 1,000 Question ต่อห้อง | N5 |
| `INSTRUCTOR_EMAILS` หลายคนคั่นด้วย comma | N5 |
| `reset_audit` พร้อม query ใน runbook | N2, 7.4 |
| WebSocket close codes | 8.4 |
| Presenter mode | N6 |
| `GET /api/version` และ Playwright e2e suite | ส่วน 11 |

ไม่อยู่ใน v1: เปลี่ยนรหัสผ่านโดยผู้เรียนเอง (draft ไม่ได้ขอ)

## 3. ขอบเขต v1

ในขอบเขต: sign-up/sign-in, Room, invite code + direct link, Ask (public/private), Answer, Resolved, ลบโพสต์, realtime พร้อม polling สำรอง, หน้า admin สร้าง reset link และรายการใน 2.4

นอกขอบเขต: ตาม draft (ผู้เรียนตอบกันเอง, อีเมลทุกชนิด, notification, แนบไฟล์, reply หลายชั้น) และตามข้อเสนอข้างบน (FAQ publish, search ข้ามห้อง, remove member, edit, ลบห้อง, เปลี่ยนรหัสผ่านเอง) รวมถึง presence, typing indicator, ตัวนับจำนวนคำถาม

## 4. สถาปัตยกรรมบน Cloudflare

```
Browser (React + Vite SPA: Tailwind CSS, shadcn/ui, React Router)
  | HTTPS: /api/*  (ทุก write,          | WSS: /api/rooms/:id/ws (รับอย่างเดียว)
  |  และ GET snapshot ตอนโหมดสำรอง)      |
  v                                     v
Worker (Hono)  ->  static assets
  - Better Auth  -----------------> D1: user, session, account, verification,
  - authn + origin check                 rateLimit, room, room_member, reset_audit
  - authz ระดับ room/role
  - RPC (write, snapshot) / forward (ws upgrade)
  v
RoomDO (1 ต่อ room, SQLite): question, answer
  - ข้อมูลขาออกทุกทางผ่านฟังก์ชันกรองสิทธิ์ตัวเดียว
```

หลักการ:
1. **Write ผ่าน HTTP เท่านั้น** WebSocket เป็น server -> client ทุก write จึงเช็ก session กับ D1 ใหม่ทุกครั้ง ทางเลือก (write ผ่าน WS) ประหยัด request กว่า แต่ session ที่ถูก revoke ยังเขียนได้จนกว่าจะหลุด
2. **ตัวกรองเดียว ทางออกสามทาง** ข้อมูล Question ออกจาก RoomDO ได้เฉพาะ (ก) WebSocket (ข) HTTP snapshot สำหรับโหมดสำรอง (ค) response ของ write ซึ่งคืน view ของผู้เรียกเอง ทั้งสามเรียก `canSee` + `project` ตัวเดียวกัน RPC ของ DO คืนได้แค่ `QuestionView` Worker จึงไม่เคยเห็น row ดิบ ห้ามมีตัวกรองที่สอง และไม่มี endpoint อ่าน Question อื่น
3. DO เข้าถึงได้จาก Worker เท่านั้น `idFromName(roomId)` เรียกหลังยืนยันว่า room มีจริงใน D1 แล้ว
4. Worker ลบ header ภายในที่ client ส่งมาก่อน แล้วใส่ identity ที่ยืนยันแล้วตอน forward WS upgrade
5. สร้าง auth instance จาก named function เดียว (`createAuth(env)`) ใช้ทั้ง production และ test
6. ขาด env ที่จำเป็น (`INSTRUCTOR_EMAILS`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_*`) ให้ fail ทันที ไม่ fallback ส่วน `INSTRUCTOR_EMAILS` ที่เป็นค่าว่างถือว่าถูกต้อง (ยังไม่มีผู้สอน) กฎการตั้งและตรวจค่าอยู่ใน 7.3

## 5. Data model

### D1

| Table | Columns หลัก |
| --- | --- |
| `user`, `session`, `account`, `verification`, `rateLimit` | ตาม schema ที่ Better Auth generate (ไม่มี column role) |
| `room` | `id` (UUID) PK, `name`, `invite_code` UNIQUE, `created_by`, `created_at` |
| `room_member` | `room_id`, `user_id`, `joined_at`, PK(`room_id`,`user_id`), index(`user_id`) |
| `join_attempt` | `user_id` PK, `window_start`, `count` ตัวนับ rate limit ของ `/api/join` ต่อ user แบบ window คงที่ 1 นาที (7.5) |
| `reset_audit` | `id`, `actor_user_id`, `target_user_id`, `created_at` (ไม่เก็บ token) ผู้อ่าน: operator ผ่าน query "ใคร reset ใคร" ใน `docs/runbook` (ส่งมอบใน M5) |

Role **ไม่เก็บใน DB** คำนวณจาก env ทุกครั้ง (7.3) แก้ list แล้วมีผลโดยไม่ต้อง migrate

### RoomDO SQLite

| Table | Columns |
| --- | --- |
| `question` | `id` (random UUID v4) PK, `author_id`, `author_name` NOT NULL, `visibility` CHECK IN (`public`,`private`), `body`, `created_at`, `resolved_at` NULL, `client_request_id`, UNIQUE(`author_id`,`client_request_id`) |
| `answer` | `id` (UUID v4) PK, `question_id`, `author_id`, `author_name`, `body`, `created_at`, `client_request_id`, UNIQUE(`author_id`,`client_request_id`) |
| `schema_version` | สำหรับ migration ใน constructor ภายใต้ `blockConcurrencyWhile` |

- ทุกแถวเก็บ `author_name` สิทธิ์เห็นชื่อตัดสินที่ `project()` จุดเดียว: public ให้ชื่อกับทุกคน, private ให้ชื่อกับผู้สอนเท่านั้น, เจ้าของได้ `isMine`
- ID เป็น random ไม่ใช้เลขลำดับ เพราะช่องว่างของเลขบอกว่ามีโพสต์ที่ซ่อนอยู่
- ลบ Question ต้องลบ answer ใน `transactionSync` เดียวกัน (ไม่พึ่ง foreign key cascade เพราะยังไม่ได้ยืนยันพฤติกรรมใน DO)

## 6. Authorization

### 6.1 Matrix

"เจ้าของ" = learner สมาชิกที่เป็นผู้ถาม, "สมาชิกอื่น" = learner สมาชิกคนอื่น

| Action | Guest | Learner ไม่ใช่สมาชิก | สมาชิกอื่น | เจ้าของ | Instructor |
| --- | --- | --- | --- | --- | --- |
| สมัคร / login | ได้ | - | - | - | ได้ (password หรือ Google) |
| Join ด้วย code ที่ถูก | ไม่ได้ | ได้ | - | - | ไม่ต้อง |
| เห็น room ใน list | ไม่ | ไม่ | ได้ | ได้ | ทุกห้อง |
| เห็น / rotate invite code | ไม่ | ไม่ | ไม่ | ไม่ | ได้ |
| สร้าง Room | ไม่ | ไม่ | ไม่ | ไม่ | ได้ |
| เปิด WebSocket ของห้อง | ไม่ | ไม่ | ได้ | ได้ | ได้ |
| อ่าน HTTP snapshot ของห้อง | ไม่ (`401`) | ไม่ (`404`) | ได้ | ได้ | ได้ |
| ถาม Question | ไม่ | ไม่ | ได้ | ได้ | ไม่ (draft ให้เฉพาะ learner) |
| เห็น public Question + Answer + resolved | ไม่ | ไม่ | ได้ พร้อมชื่อ | ได้ | ได้ พร้อมชื่อ |
| เห็น private Question + Answer + resolved | ไม่ | ไม่ | **ไม่** | ได้ | ได้ **พร้อมชื่อผู้ถาม** (DEC-1) |
| ตอบ / mark resolved | ไม่ | ไม่ | ไม่ | ไม่ | ได้ |
| ลบ Question | ไม่ | ไม่ | ไม่ | ได้ | ได้ |
| ลบ Answer | ไม่ | ไม่ | ไม่ | ไม่ | ได้ |
| ค้น user / สร้าง reset link | ไม่ | ไม่ | ไม่ | ไม่ | ได้ (เป้าหมายต้องไม่ใช่ instructor) |
| `GET /api/version` | ได้ | ได้ | ได้ | ได้ | ได้ |

### 6.2 กันการรั่วของ private Question

กลไก (ให้โครงสร้างกัน ไม่พึ่งความจำของคนเขียนโค้ด):
- `canSee(viewer, question)` และ `project(viewer, question) -> QuestionView` เป็นที่เดียวที่แปลง row เป็นข้อมูลขาออก row ภายในกับ `QuestionView` เป็นคนละ type
- Snapshot สร้างด้วยฟังก์ชันเดียว `snapshotFor(viewer)` ใช้ทั้งตอน WS connect และ HTTP snapshot สิทธิ์ในแถว "เห็น ..." ของ matrix จึงใช้กับทุก transport
- ส่งข้อมูลออก socket ผ่าน `emit()` ที่เดียว gate คือ leak canary (AC9) ส่วน lint ที่เช็กว่าเรียก `ws.send` จุดเดียวใส่ถ้าทำได้ถูก ไม่นับเป็น gate
- Question + Answers + resolved ส่งเป็นก้อนเดียว สิทธิ์จึงตัดสินครั้งเดียว Answer ไม่มีทางหลุดแยก
- `QuestionView` **ไม่มี `authorId`** ใช้ `isMine: boolean`, `authorName`: public ให้ทุกคนที่เห็น, private ให้ผู้สอนเป็นชื่อผู้ถาม ส่วนเจ้าของได้ `null` กับ `isMine` ผู้เรียนอื่นไม่ได้ object นี้เลย

| ทางรั่ว | การป้องกัน |
| --- | --- |
| Snapshot ตอน connect | กรองด้วย `canSee` + `project` |
| Live broadcast (สร้าง, ตอบ, resolve) | `emit()` กรองรายต่อ socket |
| Delete event | ส่ง `question.remove` เฉพาะคนที่เคยเห็นได้ (ตรวจก่อนลบ) |
| Reconnect / resync | ส่ง snapshot ใหม่ทั้งก้อน ไม่มี event log หรือ sequence number ให้เดาจากช่องว่าง |
| HTTP snapshot (โหมดสำรอง) | `snapshotFor(viewer)` ตัวเดียวกับ WS, เช็ก session และสมาชิกทุกครั้ง, `Cache-Control: no-store`, ไม่ส่ง CORS header, ไม่มี ETag หรือเลข version ที่เปลี่ยนตามโพสต์ที่ผู้ชมมองไม่เห็น |
| หลัง DO hibernate / evict | identity มาจาก socket attachment, ข้อมูลจาก SQLite, กฎเดิม |
| เดา id ผ่าน API (delete/answer) | ไม่มีจริง กับ ไม่มีสิทธิ์เห็น ตอบ `404` body เดียวกัน, ส่วน action ที่เป็นของ instructor ตอบ `403` จาก role ก่อน lookup |
| Response ของ write | คืนเฉพาะ view ของผู้เรียกเอง |
| `client_request_id` ซ้ำ | unique ต่อ author จึง probe ของคนอื่นไม่ได้ |
| ตัวนับ / badge / room list / last activity | ไม่มี |
| เพดาน 1,000 Question ต่อห้อง (N5) | คนที่ชนเพดานอนุมานจำนวนโพสต์ที่ซ่อนอยู่ได้ ยอมรับใน v1 error ไม่บอกตัวเลข |
| หน้า admin | ไม่แสดงจำนวนหรือกิจกรรมการถามของ user |
| จอผู้สอนที่ฉายให้ห้องดู | Presenter mode (N6) |
| Log / error | ห้าม log body ข้อความ หรือคู่ author กับ question, error ไม่สะท้อนข้อมูล |
| Cache | `Cache-Control: no-store` ที่ `/api/*`, client ไม่เก็บ Question ลง localStorage, ล้าง state เมื่อ logout/เปลี่ยน user |
| Socket ค้างหลังสิทธิ์เปลี่ยน | ดู 8.4 |

### 6.3 สิ่งที่ระบบ**ไม่**ป้องกัน (ต้องยอมรับอย่างรู้ตัว)

- ผู้ดูแล Cloudflare account อ่านข้อมูลทั้งหมดใน DB ได้
- คนที่สมัครด้วย email ผู้สอนก่อนเจ้าของ ถ้าไม่ทำตาม N7 จะได้สิทธิ์ผู้สอน
- ผู้สอนใช้ reset link สวมรอยผู้เรียนได้ (F4, N2)
- ผู้สอนฉายจอโดยลืมเปิด presenter mode หรือคนมองจอผู้สอนใกล้ ๆ

## 7. Auth flows

Better Auth `1.7.28` (latest ณ วันที่ตรวจ), ส่ง D1 binding เป็น `database` ตรง ๆ (source มี D1 dialect ในตัว)

### 7.0 กฎของ `createAuth(env)`
library มี default ที่ขึ้นกับ `NODE_ENV` ซึ่งบน Workers เป็นค่าที่เราตั้งเองหรืออาจไม่มี จึงต้องตั้งเองทุกตัว

| Option | ค่า |
| --- | --- |
| `rateLimit.enabled` | `true` |
| `advanced.disableOriginCheck` | `false` (ไม่ตั้งจะถูกข้ามเมื่อ `NODE_ENV=test`) |
| `advanced.useSecureCookies` | จาก scheme ของ `BETTER_AUTH_URL` |
| `secret` | ขาดหรือสั้นกว่า 32 ตัว: fail ทันทีด้วย check ของเราเอง (library ตรวจ default secret เฉพาะ production) **ห้ามมี binding `BETTER_AUTH_SECRETS`**: library 1.7.28 อ่าน `options.secrets ?? env.BETTER_AUTH_SECRETS` และถ้ามีจะใช้แทน `secret` ข้ามการตรวจของเรา app ต้อง fail ทันทีถ้ามี binding นี้ (M2) และ runbook ห้ามตั้ง |
| `onAPIError.errorURL` | `<BETTER_AUTH_URL>/auth/error` หน้าของ SPA (หน้า default ของ library ต่างกันตาม production) หน้านั้นต้องอธิบาย `error` ใน query อย่างน้อย `account_not_linked` (7.2) และมีข้อความกลางสำหรับค่าอื่น เช่น `state_mismatch` |
| `advanced.backgroundTasks.handler` | **ห้ามตั้ง** (7.4) |
| `verification.storeIdentifier` | `"plain"` (7.4 ลบ token ด้วย prefix) |
| `revokeSessionsOnPasswordReset` | `true` |
| `resetPasswordTokenExpiresIn` | จาก config `RESET_LINK_TTL_SECONDS` ไม่ตั้ง = `86400` (24 ชม. ตาม N5) |
| `session.cookieCache` | ปิด |
| `advanced.database.validateSchema` | `false` (ค่า default ตรวจ schema ด้วย query เพิ่มราว 7 ครั้งและอ่านราว 60 แถวทุก request เพราะสร้าง auth ต่อ request วัดใน M0) schema ถูกคุมด้วย drift test ใน `pnpm test` แทน: `getMigrations(authOptions(env))` ต้องไม่มีตารางหรือ column ที่ต้องสร้างเพิ่ม |

Test (AC22) assert ค่าที่ resolve แล้ว ในสาม mode ของ `NODE_ENV`: ไม่ตั้ง (สภาพเดียวกับตอน deploy), `test` และ `production` แต่ละ mode เป็น Vitest project แยกซึ่งได้ runtime และ module graph ของตัวเอง (ไม่จำเป็นต้องเป็น OS process แยก) เพราะ library อ่าน `NODE_ENV` เป็นค่าคงที่ตอน import แต่ละ project assert ค่า `isProduction`/`isTest` ที่ library เห็นจริงเพื่อพิสูจน์ว่าแยกกัน ส่วน IP fallback เป็น localhost ใน test/dev ปิดด้วย option ไม่ได้ จึงตรวจด้วย AC18

Config เรื่องเวลา (var ไม่ใช่ secret) `createAuth(env)` และ RoomDO อ่านจาก `env` เพื่อให้ test ตั้งเป็นไม่กี่วินาทีแล้วรอเวลาจริง ไม่พึ่ง fake timer ซึ่งยังไม่พิสูจน์ว่าไปถึง `Date.now()` ใน DO

| Var | ใช้ที่ | ค่าเมื่อไม่ตั้ง (ใช้ใน production) | ค่าที่รับ |
| --- | --- | --- | --- |
| `RESET_LINK_TTL_SECONDS` | `resetPasswordTokenExpiresIn` | `86400` | จำนวนเต็มบวก |
| `SOCKET_MAX_LIFETIME_SECONDS` | เพดาน `validUntil` (8.4) | `900` | จำนวนเต็ม 1 ถึง 900 (ขยายเกิน 15 นาทีไม่ได้) |

ค่าที่ผิดรูปหรืออยู่นอกช่วง: fail ทันที ถ้า M0 พิสูจน์ว่า fake timer ไปถึง DO ได้ จะใช้วิธีใดก็ได้

### 7.1 สมัครและ login ด้วย password
- name + email + password (default 8 ถึง 128 ตัว), ไม่มี email verification, auto sign-in
- Email ใน instructor list สมัครและ login แบบเดียวกับคนอื่น (DEC-2) runbook แนะนำรหัสผ่านยาวจาก password manager เพราะ rate limit นับต่อ IP ไม่ใช่ต่อบัญชี
- สมัครด้วย email ที่มีแล้วจะได้ error ว่ามีผู้ใช้ (บอกได้ว่า email ไหนมีบัญชี: ยอมรับใน v1)
- เปิดเฉพาะ path ที่ใช้ (allowlist แบบ exact match ใน Hono): `POST /sign-up/email`, `POST /sign-in/email`, `POST /sign-in/social`, `GET /callback/google`, `POST /sign-out`, `GET /get-session`, `POST /reset-password`, `GET /error` ที่เหลือ `404` รวมถึง `/request-password-reset`, `GET /reset-password/:token`, `/update-user`, `/link-social` test ไล่ endpoint ทั้งหมดที่ `auth.api` ประกาศ แล้ว assert ว่าตัวที่ไม่อยู่ใน list ได้ `404`

#### Password hashing (เรื่องเทคนิค director review, ล็อกก่อน M1)
- ตั้ง `emailAndPassword.password.{hash,verify}` ของเราเอง**ตั้งแต่ M1** เก็บค่าแบบมี prefix บอก scheme และ parameter เช่น `scrypt-n16384-r16-p1$<salt>:<key>` เพื่อเปลี่ยน scheme ภายหลังได้โดยบัญชีเก่ายัง verify ได้ (Mild รับรูปแบบนี้แล้ว 2026-11-27) prefix เป็นป้ายบอกสิ่งที่ library ทำ ไม่ใช่ setting จึงมี test คำนวณ key ซ้ำด้วย `node:crypto` scrypt ตาม parameter ในป้าย
- ค่าที่เก็บซึ่ง prefix ไม่รู้จัก (รวมไม่มี prefix): verify โยน error และ sign-in ได้ `500` ไม่ใช่ `401` เพราะเป็นความผิดพลาดของข้อมูลฝั่ง server ไม่ใช่รหัสผิด
- ค่าเริ่มต้น: เรียก hash ของ `@better-auth/utils/password` ซึ่ง export condition `workerd` เลือก `node:crypto` scrypt (N=16384, r=16, p=1) ต้องเปิด `nodejs_compat`
- **M0 exit gate:** bundle จริง import `node:crypto` scrypt (ไม่ใช่ pure JS), sign-up และ sign-in ใน `workerd` local สำเร็จ, บันทึก wall time ต่อ hash
- **ทางสำรองสำหรับปัญหา memory เท่านั้น และต้องแจ้ง Mild ก่อนใช้**: native scrypt N=16384, r=8, p=5 (16 MiB, ตรงกับ configuration ขั้นต่ำหนึ่งของ OWASP) memory ลดครึ่ง CPU ราว 2 เท่าของค่าเริ่มต้นที่วัดได้ (ส่วน 14) ถ้ายังเกิน memory: N=8192, r=8, p=10 (8 MiB)
- ถ้า native scrypt ใช้ไม่ได้เลย หรือเกิน CPU: **หยุดและกลับไปถาม Mild** ไม่เปลี่ยน parameter หรือ scheme เอง และไม่ลดความแข็งของ hash โดยไม่มีคำตัดสินของเขา ไม่สลับไป PBKDF2 เพราะ `workerd` จำกัดไว้ที่ 100,000 iterations ตาม default ใน source ต่ำกว่าที่ OWASP แนะนำสำหรับ SHA-256 (600,000) หกเท่า
- Memory: ใน source ของ `workerd` ฟังก์ชัน `scrypt` แบบ callback คำนวณ synchronous บน thread ของ isolate จึงคาดว่า buffer 32 MiB ของหลาย request ใน isolate เดียวไม่ซ้อนกัน ส่วน pure JS fallback (`scryptAsync`) yield ระหว่างคำนวณจึงซ้อนได้ **ทั้งสองข้อเป็นการอนุมานจากการอ่าน source** พฤติกรรม production และการนับ memory ยังไม่ยืนยัน จึงยังต้องมี load check
- Load check หลัง deploy: ส่วน 14 และ AC25
- `verifyPassword` ของ library เทียบ hex ด้วย `===` (ไม่ constant time) เป็นพฤติกรรม upstream ความเสี่ยงต่ำเมื่อมี rate limit บันทึกไว้ ไม่ patch ในค่าเริ่มต้น (ถ้าเขียน verify เองในทางสำรอง ให้ใช้ `timingSafeEqual`)

### 7.2 Google
- Authorization code flow, scope `openid email profile`
- Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`
- ไม่ตั้ง `trustedProviders`, คง `requireLocalEmailVerified` default (N1) หน้า error ต้องอธิบาย `account not linked` ให้ผู้ใช้เข้าใจ

### 7.3 Instructor role
`isInstructor(user)` = email ของ user (trim + lowercase ทั้งสองฝั่ง) อยู่ใน `INSTRUCTOR_EMAILS` ไม่สนวิธีสมัคร และไม่สน `emailVerified` (DC3, DEC-2)

- **การตั้งค่า:** `INSTRUCTOR_EMAILS` เป็น plain var ไม่ใช่ secret และ**ไม่ commit** ลง config ใน repo: local ใช้ `.dev.vars`, บน Cloudflare ส่งตอน deploy ด้วย `--var "INSTRUCTOR_EMAILS:a@x,b@y"` ค่าว่างคือ `--var "INSTRUCTOR_EMAILS:"` (อ่าน source ของ wrangler 4.168.0 แล้วได้ string ว่าง) ทุก deploy ต้องส่ง และไม่เปิด `keep_vars` เพื่อให้การลืมส่งทำให้ binding หายและ app fail (ปิดไว้ก่อน; พฤติกรรมตอน deploy จริงยังเป็นการอนุมาน)
- **พิสูจน์ใน M5 (local):** `--var` และ `.dev.vars` ที่เป็นค่าว่างให้ string ว่าง ไม่ใช่ binding ที่หายไป ส่วนบน Cloudflare จริงตรวจใน post-check (ยังไม่ยืนยัน)
- **การตรวจค่า:** แยกด้วย comma, trim, lowercase แล้วตรวจแต่ละรายการด้วยกฎ email เดียวกับ Better Auth (`z.email()`) รายการใดผิดรูป (รวมรายการว่างจาก comma เกิน) ให้**ปฏิเสธทั้ง list** และ fail ค่าที่ว่างทั้งสตริง (`""` เท่านั้น) คือ list ว่าง ส่วนค่าที่มีแต่ช่องว่างถือว่าผิดรูป ขณะที่ list ผิดรูป ทุก request ของ `/api/auth/*` และ `/api/me` ได้ `500` (fail แบบเห็นชัด ไม่ใช่ทุกคนกลายเป็น learner เงียบ ๆ) Zod เป็น dependency ตรงที่ pin ให้ตรงกับ copy ที่ Better Auth ใช้ เมื่อ bump `better-auth` ต้อง pin ใหม่ให้ตรงกัน การพิมพ์ผิดที่ยังเป็นรูปแบบ email ถูกต้องจับไม่ได้ ต้องอาศัย AC24
- คำนวณจาก env ทุกครั้ง: เอา email ออกจาก list แล้วหมดสิทธิ์ เพิ่มแล้วได้สิทธิ์ทันทีกับบัญชีที่มีอยู่
- เพราะ role ผูกกับ email อย่างเดียว **ห้ามมีทางเปลี่ยน email**: `/update-user`, `/change-email` ต้องเป็น `404` (AC3)
- ความเป็นเจ้าของ email ไม่ถูกพิสูจน์โดยระบบเมื่อใช้ password (F12) การควบคุมอยู่ที่ runbook ใน N7

### 7.4 Reset password link (DC5)
1. ผู้สอนค้น user ในหน้า admin กด "สร้างลิงก์ reset"
2. Server ปฏิเสธถ้าเป้าหมายเป็น email ใน instructor list (default รอ Mild: กันผู้สอนคนหนึ่งยึดบัญชีผู้สอนอีกคน) หรือมีแต่บัญชี Google (library จะ**สร้าง** password ใหม่ให้บัญชีที่ไม่มี จึงต้องกันเอง)
3. Server ลบ token เก่าของ user ก่อน ด้วย statement บน D1: `DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value = ?` (library ไม่มีคำสั่งลบ token ตาม user)
4. Server เรียก `auth.api.requestPasswordReset` โดย `sendResetPassword` แค่จับ token ของ request นั้น (ไม่ส่งอีเมล) แล้วเขียน `reset_audit` การจับ token ถูกต้องเพราะ library `await` callback **เฉพาะเมื่อไม่ได้ตั้ง `advanced.backgroundTasks.handler`** กฎ: ห้ามตั้ง (AC22) และ AC15 ต้องพิสูจน์ว่าลิงก์ที่ admin API คืนมาตั้งรหัสได้จริง
5. แสดง `<APP>/reset#token=...` ครั้งเดียวให้ copy (ใช้ fragment กัน token ติด server log), หน้านั้นตั้ง `Referrer-Policy: no-referrer`
6. ผู้เรียนตั้งรหัสใหม่ผ่าน `/reset-password`: token ใช้ครั้งเดียว, revoke ทุก session, ตัด WebSocket ของ user

ผู้สอนที่ใช้ password แล้วลืมรหัส: operator ทำตาม runbook เขียน token reset ลงตาราง `verification` โดยตรง (`identifier = "reset-password:<token>"`, `value = userId`, เก็บแบบ plain, มีเวลาหมดอายุ token สุ่มด้วยตัวสร้างที่ปลอดภัย) แล้วให้เจ้าของตั้งรหัสผ่าน `/reset-password` **ต้องพิสูจน์ใน M5 ก่อน G1 (AC26) ยังไม่เคยรัน** ไม่ลบบัญชี เพราะจะเปิดช่องให้คนอื่นสมัคร email นั้น ทางเลือก: อนุญาตให้ผู้สอนสร้าง reset link ให้ผู้สอนด้วยกัน ง่ายกว่า แต่คนที่ยึดสิทธิ์ผู้สอนได้จะยึดผู้สอนคนอื่นต่อได้

การตั้ง `sendResetPassword` ทำให้ public `/request-password-reset` ทำงานใน library จึงต้องถูก allowlist ปิดเป็น `404` พร้อม `GET /reset-password/:token` (`auth.api` ฝั่ง server ยังเรียกได้ เพราะการปิดทำที่ HTTP router)

### 7.5 Invite code และ direct link
- 10 ตัว จาก Crockford base32 (`0-9 A-Z` ตัด `I L O U`) สุ่มด้วย `crypto.getRandomValues` ประมาณ 50 bit
- รับ input แบบ case-insensitive ตัดช่องว่าง/ขีด แปลง `O->0`, `I,L->1`
- Direct link: `<APP>/join#code=XXXXXXXXXX`
- Flow: เปิดลิงก์ -> ถ้ายังไม่ login เก็บ code ใน `sessionStorage` -> login/สมัคร (รวมรอบ redirect ของ Google) -> กดยืนยัน Join (`POST` ไม่ auto-join จาก `GET`)
- Code ใช้ได้หลายคน ไม่หมดอายุ, rotate แล้วอันเก่าใช้ไม่ได้ สมาชิกเดิมยังอยู่, join ซ้ำได้ผลสำเร็จเฉย ๆ
- Code ผิดตอบ error เดียวกันเสมอ: `400 {"error":"invalid_code"}` ทั้ง code ผิดรูปและ code ที่ไม่มีจริง ส่วน body ที่ไม่ผ่าน schema (ไม่มี field, ชนิดผิด, field ที่ไม่รู้จัก) ได้ `400 {"error":"invalid_request"}` และไม่นับเป็นครั้ง
- จำกัด 10 ครั้ง/นาที/user นับทุกครั้งที่ user ที่ login แล้วส่ง body ถูกรูป รวม code ที่ถูก เกินแล้วได้ `429` + `Retry-After` เก็บในตาราง `join_attempt` (5)
- ผู้สอนใช้ code ได้ `200` โดยไม่มีแถวใน `room_member` (ผู้สอนเห็นทุกห้องอยู่แล้ว 6.1)
- ชื่อห้อง trim แล้วยาว 1 ถึง 100 ตัว สร้างสำเร็จตอบ `200` พร้อม `{ id, name, inviteCode, createdAt }` list ของผู้เรียนไม่มี `inviteCode` ส่วนของผู้สอนมี
- ออกจากระบบ: client ล้าง code ที่ค้างใน `sessionStorage` ด้วย (6.2 "ล้าง state เมื่อ logout")

### 7.6 Session และการป้องกันทั่วไป
- Session ใน D1 ไม่เปิด cookie cache เพื่อให้ revoke มีผลทันที, cookie `HttpOnly`, `SameSite=Lax`, `Secure` บน HTTPS
- Origin middleware ของ app ครอบ `/api/auth/*`, ทุก write และ WS upgrade: `Origin` ต้องตรงกับ app (กัน CSRF และ cross-site WebSocket hijacking) ไม่พึ่ง check ของ library อย่างเดียว ส่วน `GET` snapshot ไม่บังคับ `Origin` (browser ไม่ส่งใน same-origin GET) อาศัยการไม่ส่ง CORS header และเป็น request ที่ไม่เปลี่ยนข้อมูล
- **Write gate (M2):** middleware ตัวเดียวครอบทุก method ที่ไม่ใช่ `GET`/`HEAD`/`OPTIONS` ใต้ `/api/` ทั้ง route ของ app และของ Better Auth ต้องมี `Content-Type: application/json` ไม่เช่นนั้นได้ `415` (form ข้ามเว็บส่ง JSON ไม่ได้ถ้าไม่ผ่าน CORS preflight) Origin check ของ M4 (AC17) ใส่ใน middleware ตัวนี้ที่เดียว
- Rate limit: `enabled: true` (7.0), `storage: "database"` (memory แยกกันต่อ isolate), `ipAddressHeaders: ["cf-connecting-ip"]`
- **ต้องแก้ limit ของ sign-in/sign-up**: default คือ 3 ครั้ง/10 วินาที/IP ทั้งห้องเรียนที่ออก NAT เดียวกันจะติด ข้อเสนอ 60 ครั้ง/60 วินาที/IP
- HTTP snapshot และ WS upgrade **ไม่จำกัดต่อ IP** (ทั้งห้องอาจใช้ IP เดียว) rate limit ของ Better Auth ทำงานใน router ของ `/api/auth/*` จึงไม่ครอบสอง path นี้ หน้าห้องใช้ `/api/me` ไม่เรียก `/get-session` ซ้ำ
- HTTP snapshot ไม่มีเพดานต่อ user (review R24): loop ของ client ถูกกันด้วยกฎ "request ค้างได้ครั้งละหนึ่ง นับรอบใหม่หลังได้คำตอบ" (8.6) และ AC27 นับจำนวน request ในช่วง 90 วินาที
- ทุก response ของ `/api/*` ส่ง `X-Content-Type-Options: nosniff` ส่วน `Content-Type: application/json` ส่งเฉพาะ response ที่เป็น JSON (ไม่ใส่ใน `101` upgrade, `204` หรือ redirect ของ OAuth) (review R25)

## 8. Realtime protocol

### 8.1 Connect
`GET /api/rooms/:id/ws` -> Worker ตรวจ origin, session, สมาชิก/role -> forward เข้า RoomDO -> `ctx.acceptWebSocket(server, [user tag, session tag])` + `serializeAttachment({userId, sessionId, email, validUntil})` -> query + ส่ง `snapshot`

ลำดับ accept, query, send ต้องอยู่ใน synchronous block เดียว (ไม่มี `await` คั่น) event หลังจากนั้นจึงมาหลัง snapshot เสมอ

Role ไม่เก็บใน attachment คำนวณจาก env ตอนส่งทุกครั้ง กัน role ค้างหลังแก้ list แล้ว deploy

### 8.2 Messages (JSON, `v: 1`)

| ทิศ | type | payload |
| --- | --- | --- |
| S->C | `snapshot` | `room {id,name}`, `questions: QuestionView[]` |
| S->C | `question.upsert` | `question: QuestionView` ทั้งก้อน (รวม answers, resolved) |
| S->C | `question.remove` | `questionId` |
| C->S | `ping` | ส่งทุก 30 วินาที ตอบ `pong` ด้วย `setWebSocketAutoResponse` ไม่ปลุก DO ไม่ได้ `pong` ใน 10 วินาทีให้ถือว่า socket ตาย |

`QuestionView = { id, visibility, body, authorName | null, isMine, createdAt, resolvedAt | null, answers: [{ id, authorName, body, createdAt }] }`

Message อื่นจาก client: ปิด socket

### 8.3 Reconnect
- Client reconnect ด้วย exponential backoff + jitter (สูงสุด 30 วินาที) และเมื่อกลับมา online / tab visible
- ได้ `snapshot` แล้ว**แทนที่** state ทั้งหมด (โพสต์ที่ถูกลบระหว่างหลุดจึงหายเอง) ระหว่างยังต่อไม่ได้ใช้โหมดสำรอง (8.6)
- Write ส่ง `clientRequestId` ทำให้ retry ไม่สร้างซ้ำ, client merge ด้วย `id` เพราะ event อาจมาก่อน HTTP response

### 8.4 ตัด connection
| เหตุ | วิธี |
| --- | --- |
| Logout | Client ปิด socket เองทุก tab (แจ้งกันด้วย `BroadcastChannel`) และล้าง state ฝั่ง server ไม่ fan-out |
| Reset password | Server ปิดตาม user tag ในทุกห้องที่เป็นสมาชิก (กรณีกู้บัญชี ต้องตัดทันที) |
| `validUntil` หมด (ค่าน้อยกว่าระหว่าง session expiry กับเวลาต่อ + `SOCKET_MAX_LIFETIME_SECONDS`, ค่า production **15 นาที**) | ตรวจก่อนส่งทุกครั้ง ไม่ใช้ timer (ไม่ขวาง hibernation) socket ที่หมดอายุไม่ได้ event แล้วถูกปิด ให้ client ต่อใหม่และตรวจสิทธิ์ใหม่ |

ผลที่ยอมรับ: socket ของ session ที่ logout แล้วแต่ client ไม่ปิด (เช่น cookie ถูกขโมย) ยังได้ event ได้ไม่เกิน 15 นาที และต่อใหม่ไม่ได้ ทางเลือก (server ปิดทุกห้องตอน logout) ทันทีกว่า แต่ผู้สอนต้องเรียก DO ทีละห้อง จำนวน call จึงโตตามจำนวนห้อง (ข้อความเรื่อง subrequest limit อยู่ในส่วน 14)

Close codes: `4001` ต้อง login ใหม่หรือต่อใหม่, `4003` ไม่มีสิทธิ์ (ไม่ retry), `4400` protocol error

### 8.5 HTTP API

| Method | Path | ใคร |
| --- | --- | --- |
| GET | `/api/version` | ทุกคน: คืน commit SHA ที่ใส่ตอน build |
| GET | `/api/me` | login |
| GET, POST | `/api/rooms` | list: ตามสิทธิ์ / สร้าง: instructor |
| POST | `/api/rooms/:id/invite-code/rotate` | instructor |
| POST | `/api/join` | login |
| GET (upgrade) | `/api/rooms/:id/ws` | สมาชิก, instructor |
| GET | `/api/rooms/:id/snapshot` | สมาชิก, instructor (โหมดสำรอง 8.6) |
| POST | `/api/rooms/:id/questions` | learner สมาชิก |
| DELETE | `/api/rooms/:id/questions/:qid` | เจ้าของ, instructor |
| POST | `/api/rooms/:id/questions/:qid/answers` | instructor |
| DELETE | `/api/rooms/:id/questions/:qid/answers/:aid` | instructor |
| PUT | `/api/rooms/:id/questions/:qid/resolved` | instructor |
| GET | `/api/admin/users?q=` | instructor |
| POST | `/api/admin/users/:id/reset-link` | instructor |

Input ตรวจด้วย schema และ reject field ที่ไม่รู้จัก ห้องที่ไม่มีจริงกับห้องที่ไม่ได้เป็นสมาชิกตอบ `404` เหมือนกันทั้ง WS upgrade และ snapshot

### 8.6 โหมดสำรอง: HTTP polling
ใช้เมื่อ WebSocket ใช้ไม่ได้ เช่น ถูก proxy หรือ network บล็อก ทุกฟีเจอร์ยังใช้ได้เพราะ write เป็น HTTP อยู่แล้ว ต่างแค่การเห็นของคนอื่นช้าลง ตัวเลขที่ไม่ใช่ "ประมาณ 30 วินาที" เป็น default ของ builder

| เรื่อง | พฤติกรรม |
| --- | --- |
| เข้าโหมด | socket ที่กำลังต่อ error **หรือถูกปิดด้วย code ใดก็ได้ก่อนได้ `snapshot` แรกของ socket นั้น** ยกเว้น `4003` ซึ่งทำตามแถว `404`/`4003` ด้านล่าง (spike M0: socket ที่ถูกบล็อกได้ `close` โดยไม่มี `error`), ไม่ได้ `snapshot` ทาง WS ใน 3 วินาทีนับจากเปิดหน้าหรือ socket หลุด (รวมกรณีเปิดได้แต่เงียบ) หรือ `pong` หาย (8.2) การถูกปิดตามปกติ (`4001`) แล้วต่อใหม่ได้ใน 3 วินาทีไม่เข้าโหมด เมื่ออยู่ในโหมดแล้ว ความพยายามต่อที่ล้มเพิ่มไม่ทำให้ดึงเพิ่ม |
| การดึง | `GET .../snapshot` **ทันที**หนึ่งครั้ง แล้วทุก 30 วินาที + สุ่ม 0 ถึง 5 วินาที มี request ค้างได้ครั้งละหนึ่ง นับรอบใหม่หลังได้คำตอบ หยุดเมื่อ tab ซ่อน และดึงทันทีเมื่อกลับมา |
| Refresh หน้า | กฎเดียวกัน จึงเห็นข้อมูลปัจจุบันภายในไม่กี่วินาที ไม่ต้องรอรอบ 30 วินาที |
| ผลลัพธ์ | รูปเดียวกับ message `snapshot` ใช้**แทนที่** state ทั้งหมด presenter mode กรองตอน render จึงใช้เหมือนกัน |
| Write ของตัวเอง | ใช้ view จาก response ของ write ทันที (ลบก็เอาออกทันที) snapshot ที่**เริ่มส่งก่อน** write ล่าสุดของ tab สำเร็จ ให้ทิ้ง กันของที่เพิ่งเขียนหายไปชั่วคราว |
| กลับสู่ WS | ลอง WS ต่อเนื่องด้วย backoff ตาม 8.3 เมื่อได้ `snapshot` ทาง WS ให้หยุด polling และทิ้งคำตอบ polling ที่ค้างอยู่ |
| ตัวบอกสถานะ | โหมดสำรอง: "โหมดสำรอง: อัปเดตประมาณทุก 30 วินาที รีเฟรชเพื่อดูทันที" พร้อมเวลาอัปเดตล่าสุด ถ้า polling ก็ล้ม: "เชื่อมต่อไม่ได้ กำลังลองใหม่" และคงข้อมูลเดิมไว้ ต่อ WS ได้แล้วเอาออก |
| `401` | หยุด polling และ WS ล้าง state ไปหน้า login |
| `404` หรือ WS close `4003` | หยุดทั้งสองอย่าง ล้าง state แจ้งว่าไม่มีสิทธิ์เข้าห้อง |
| `429` / `5xx` / network error | รอรอบถัดไป (`429` รออย่างน้อยตาม `Retry-After`) |

**Revocation:** ทุก poll เช็ก session และสมาชิกใน D1 และคำนวณ role จาก env การ logout หรือ reset password จึงมีผลกับ poll ถัดไป ไม่มีเรื่อง `validUntil` ส่วน logout ฝั่ง client ต้องหยุด timer และล้าง state ทุก tab เหมือน socket (8.4)

การ poll ผ่าน Better Auth อาจต่ออายุ session ตามปกติ tab ที่เปิดทิ้งไว้จึงคง session ไว้ (หยุดเมื่อ tab ซ่อน)

## 9. Acceptance criteria

"Auto" = test อัตโนมัติ (รันใน `pnpm test` หรือ Playwright suite), "Manual" = Mild ทดสอบบนเครื่อง local ทุกข้อเป็นข้อกำหนด ยังไม่มีข้อใดถูกรัน

กฎทั้ง suite:
1. ทุก assertion แบบ "ไม่ได้รับ" ต้องคู่กับ "ได้รับ" **บน channel เดียวกันใน phase เดียวกัน** phase ที่ positive control ไม่มาถึง ถือว่า fail ไม่ใช่ผ่าน
2. ทุก "ถูกปฏิเสธ" ต้องมี "อนุญาต" ใน test เดียวกัน
3. ต้องเคยเห็นแดงเมื่อจงใจทำกฎให้เสีย และรายงานจำนวน test ที่รัน

| ID | เกณฑ์และ control | วิธี |
| --- | --- | --- |
| AC1 | สมัครด้วย password แล้ว login ได้ เป็น learner | Auto, Manual |
| AC2 | Email ใน list login ด้วย password (Auto) หรือ Google (Manual) ได้หน้า instructor, email อื่นด้วยวิธีเดียวกันได้ learner | Auto, Manual |
| AC3 | สมัครด้วย password โดยใช้ email ใน list (รวมตัวพิมพ์ต่างกัน) สำเร็จและเป็นผู้สอน, email นอก list เป็น learner. ผู้ใช้เปลี่ยน email ไม่ได้: `/update-user` และ `/change-email` ได้ `404` (control: `/get-session` ของ user เดียวกันได้ `200` และ email เดิม) | Auto |
| AC4 | Role ตาม env: user เดียวกัน เมื่อ list ไม่มี email ของเขา API ของ instructor ได้ `403`, เมื่อ list มีได้ `200` โดยไม่ต้องมี Google account หรือ `emailVerified`. list ว่าง: ไม่มีใครเป็นผู้สอน. M1 ตรวจผ่าน role ของ `/api/me` ส่วน `403`/`200` ของ API ผู้สอนตรวจใน M2 ด้วย `POST /api/rooms` (API ผู้สอนตัวแรก) | Auto |
| AC5 | ไม่ auto-link: บัญชี password เดิมกด Google ด้วย email เดียวกันได้ `account not linked`, บัญชี Google เดิมสมัคร password ซ้ำถูกปฏิเสธ รวมกรณี email ผู้สอน. mock provider จำกัดเวลาครึ่งวันใน M0 ถ้าทำไม่ได้: assert config ที่ resolve แล้ว (ไม่มี `trustedProviders`, `requireLocalEmailVerified` ไม่เป็น `false`) + Manual. fallback นี้พิสูจน์แค่ config ไม่ใช่พฤติกรรม | Auto, Manual |
| AC6 | Instructor สร้าง Room ได้ code 10 ตัวตาม alphabet, learner สร้างไม่ได้ | Auto |
| AC7 | Join ด้วย code และ direct link ได้ รวมกรณีต้อง login ก่อน, code หลัง rotate ใช้ไม่ได้ (code ใหม่ใช้ได้), คนไม่ join เปิด WS ไม่ได้ (สมาชิกเปิดได้) | Auto, Manual |
| AC8 | โหมด WS: Question, Answer, resolved, delete ปรากฏบนทุกจอที่มีสิทธิ์ภายใน 2 วินาที (local) โดยไม่ refresh | Auto (browser หลาย context), Manual |
| AC9 | **Leak canary**: B ต่อ socket **ก่อน** A โพสต์ A ถาม private ที่มี marker เฉพาะ เก็บทุก byte ที่ B ได้ (HTTP + WS) ตาม phase: ถาม, ตอบ, resolve, delete, reconnect, fresh connect, หลัง `evictDurableObject` หลังแต่ละ phase A โพสต์ **public marker ใหม่** และ test assert ว่า B ได้รับบน socket ที่กำลังตรวจภายใน timeout จากนั้นจึง assert ว่าไม่มี private marker, question id หรือ frame จากกิจกรรม private. A และผู้สอนต้องเห็น private marker ใน phase นั้น (phase delete: ได้ `question.remove`) . **ทางที่สองและสามในรอบเดียวกัน:** หลังแต่ละ phase B เรียก HTTP snapshot และคำตอบต้อง**มี public marker ของ phase นั้น** (control) โดยไม่มี private marker, question id หรือชื่อที่ผูกกับคำถามนั้น ขณะที่ snapshot ของ A และผู้สอนมี และ response ของ write ที่ B ส่งเองไม่มีข้อมูลนั้น phase ที่ snapshot ไม่มี public marker ถือว่า fail | Auto |
| AC10 | ทั้ง frame WS และ HTTP snapshot: ผู้สอนได้ชื่อผู้ถามของ private Question ถูกคน (ไม่มี `authorId`), เจ้าของได้ `isMine` โดย `authorName` เป็น `null`, B ไม่ได้รับอะไรจากกิจกรรมนั้น (marker, ชื่อที่ผูกกับคำถาม, id) ขณะที่ได้ public marker บนช่องทางเดียวกัน | Auto |
| AC11 | B ลบ/อ้าง id ของ private Question ได้ response เท่ากับ id ที่ไม่มีจริงแบบ byte (status, body, header ที่เกี่ยว ไม่นับ header เวลา/trace). Control ใน test เดียวกัน: เจ้าของลบ id นั้นสำเร็จ | Auto |
| AC12 | ตาราง test จาก matrix 6.1: ทุกแถว action มีทั้งช่องที่อนุญาตและช่องที่ปฏิเสธ ยิง API ตรง รันในตารางเดียวกัน นับและรายงานจำนวนทั้งสองแบบ | Auto |
| AC13 | หลุดแล้วต่อใหม่ state ตรงกับ DB รวมรายการที่ถูกลบระหว่างหลุด, retry ด้วย `clientRequestId` เดิมไม่สร้างซ้ำ (id ใหม่สร้างได้) ใช้เกณฑ์เดียวกันกับ HTTP snapshot | Auto |
| AC14 | พิสูจน์ว่า eviction เกิดจริง (instance marker ใน memory เปลี่ยน อ่านด้วย `runInDurableObject`) และ socket เดิมรอดแบบ hibernate (`webSockets` option ค่า default) แล้วยังได้ event โดยกฎสิทธิ์ยังถูก | Auto |
| AC15 | ลิงก์ที่ admin API คืนมาตั้งรหัสได้จริง, ใช้ครั้งเดียว, หมดอายุแล้วใช้ไม่ได้, ลิงก์เก่าตายเมื่อสร้างใหม่ (ลิงก์ใหม่ใช้ได้), session เดิมใช้ไม่ได้, socket ที่เคยได้ event ถูกปิด, สร้างให้ instructor ไม่ได้, `/request-password-reset` และ `GET /reset-password/:token` ได้ `404`, มี audit row. การหมดอายุ: ตั้ง `RESET_LINK_TTL_SECONDS` เป็นไม่กี่วินาทีแล้วรอจริง. Control: ภายใต้ config เดียวกัน ลิงก์ที่ใช้ก่อนหมดอายุสำเร็จ | Auto, Manual |
| AC16 | Session ที่ revoke แล้วต่อ socket ใหม่ไม่ได้ และ socket ที่เลย `validUntil` ไม่ได้ event. Control: socket นั้นได้ event ก่อน revoke และ session ที่สองของ user เดียวกันยังได้หลังจากนั้น. client logout ปิด socket ทุก tab. การหมดอายุ: ตั้ง `SOCKET_MAX_LIFETIME_SECONDS` เป็นไม่กี่วินาทีแล้วรอจริง. Control: socket นั้นได้ event ก่อนหมดอายุ และ socket ที่ต่อใหม่ในรอบเดียวกันได้ event ที่ socket หมดอายุไม่ได้. HTTP snapshot: session ที่ revoke แล้วได้ `401` ในการเรียกถัดไป (control: ได้ `200` ก่อน revoke และ session ที่สองยังได้ `200`) | Auto |
| AC17 | `/api/auth/*`, write และ WS upgrade จาก `Origin` อื่นถูกปฏิเสธโดย middleware ของเรา. Control: request เดียวกันด้วย Origin ถูกต้องสำเร็จ รันโดย `disableOriginCheck: false`. HTTP snapshot ไม่มี header `Access-Control-Allow-Origin` เมื่อส่ง `Origin` อื่น (control: same-origin ที่ไม่มี `Origin` ได้ `200`) และมี `X-Content-Type-Options: nosniff` กับ `Content-Type: application/json` (R25) | Auto |
| AC18 | ส่ง `cf-connecting-ip` สองค่าต่างกันแล้วได้ bucket แยกกัน, ค่าเดียวได้ `429` ที่ครั้งที่ limit+1 ขณะอีกค่ายังผ่าน, sign-in 50 ครั้งจาก IP เดียวใน 1 นาทีผ่าน | Auto |
| AC19 | ข้อความที่มี HTML/script แสดงเป็นตัวอักษร | Auto |
| AC20 | Clone ใหม่ ทำตาม README แล้ว `pnpm test` และ dev รันได้ บนสภาพที่ `wrangler whoami` แสดงว่าไม่ได้ authenticated (ใช้ HOME แยก ไม่มี `CLOUDFLARE_API_TOKEN`) | Manual |
| AC21 | Presenter mode เปิด: private marker และชื่อที่ผูกกับคำถามนั้นไม่อยู่ใน DOM รวมข้อที่เข้ามาหลังเปิดและหลัง reload (ใช้ผู้ถามที่ไม่มี public question เพื่อให้ตรวจชื่อได้). Control: public marker อยู่ใน DOM และปิดโหมดแล้ว private กลับมาพร้อมชื่อและรูปแบบที่ต่างจาก public | Auto (browser) |
| AC22 | Options ที่ resolve จาก `createAuth(env)` ตรงตาราง 7.0 ทั้ง test env และ env แบบ production, secret ขาดแล้ว fail (มี secret แล้วผ่าน), password hash ที่เก็บมี prefix, ไม่ตั้ง config เวลาแล้วได้ `86400` และ `900`, ค่าที่ตั้งมีผลจริง, ค่าผิดรูปหรือนอกช่วง fail, ไม่ตั้ง `INSTRUCTOR_EMAILS` แล้ว fail ส่วนค่าว่างผ่าน, list ที่มีรายการผิดรูปแม้รายการเดียว fail ทั้ง list (control: list ที่ถูกทั้งหมด รวมตัวพิมพ์ใหญ่และช่องว่างรอบ comma ผ่าน), `advanced.database.validateSchema` เป็น `false` และ drift test: `getMigrations` กับ D1 ที่ apply migration แล้วไม่มีอะไรต้องสร้างหรือเพิ่ม (ต้องเคยแดงเมื่อ migration ขาด column) | Auto |
| AC23 | `GET /api/version` คืน SHA ตรงกับ commit ที่ build | Auto |
| AC24 | Check ความเป็นเจ้าของบัญชีผู้สอน (N7): ผ่านเมื่อทุก email ใน list มีบัญชีและเจ้าของ login แล้วได้ role ผู้สอน ต้องเคยเห็นแดงใน local สองกรณี: email ใน list ที่ไม่มีบัญชี และบัญชีที่คนอื่นสมัครไว้ก่อน (เจ้าของ login ไม่ได้) | Auto + Manual (local และหลัง deploy) |
| AC25 | Load check บน Workers Paid (หลัง deploy) ตามส่วน 14: ทุก request สำเร็จ ไม่มี `429`, `exceededCpu`, `1102` หรือ exceeded memory, บันทึก p99 CPU ms และ p99 wall time (p99 wall เกิน 5 วินาทีให้รายงาน Mild เป็นข้อสังเกต ไม่ใช่ fail), hash ที่เก็บยังมี prefix และ parameter ตาม 7.1 ไม่ผ่านให้หยุดและรายงาน Mild โดยไม่แก้ hash | Manual (deploy) |
| AC26 | กู้รหัสผู้สอนตาม runbook กับ local D1 (`wrangler d1 execute --local`) ก่อน G1: รหัสเดิมใช้ login ไม่ได้, รหัสใหม่ใช้ได้, ใช้ token ซ้ำไม่ได้, ผู้ใช้ยังเป็นผู้สอน. Control: รหัสเดิมใช้ได้ก่อนเริ่มกู้ | Auto หรือ Manual (local, M5) |
| AC27 | **WebSocket ถูกบล็อกตั้งแต่เปิดหน้า** (Playwright ดัก WS): B เห็นข้อมูลเดิมภายใน 5 วินาที มีตัวบอกโหมดสำรอง และ public question ใหม่ของ A ปรากฏเองภายใน 40 วินาทีโดยไม่ refresh, private ของ A ไม่ปรากฏ, refresh แล้วเห็นข้อมูลล่าสุดภายใน 5 วินาที, ในช่วง 90 วินาทีที่ไม่มีการ refresh มี snapshot request 2 ถึง 4 ครั้ง. ทำซ้ำกรณี socket เปิดได้แต่เงียบ. Control: ยืนยันว่า page ไม่ได้ frame WS เลย และ test ต้องเคยแดงเมื่อปิด polling | Auto (browser), Manual |
| AC28 | โหมดสำรอง: โพสต์ ตอบ resolve ลบ ของตัวเองเห็นบนจอผู้ทำภายใน 2 วินาทีโดยไม่รอรอบ poll และเมื่อหน่วง snapshot ที่เริ่มก่อน write แล้วปล่อยทีหลัง รายการที่เพิ่งเขียนไม่หาย (ที่ลบไม่กลับมา). Control: snapshot รอบถัดไปถูกใช้ตามปกติ | Auto (browser) |
| AC29 | เลิกบล็อก WS: ภายใน 40 วินาทีตัวบอกโหมดสำรองหาย ไม่มี snapshot request อีกในช่วง 70 วินาทีต่อมา และ event ใหม่มาถึงภายใน 2 วินาที. Control: ก่อนเลิกบล็อกมี snapshot request | Auto (browser) |
| AC30 | 50 user จาก `cf-connecting-ip` เดียวกัน poll ตามรอบปกติได้ `200` ทั้งหมด (เพดานต่อ user ตัดออกตาม review R24) | Auto |

## 10. Local dev และ local acceptance (ไม่ deploy)

### 10.1 เครื่องมือ
- Node `>=22.12` (wrangler 4.168.0 กำหนด, เครื่องนี้มี 22.22.1), pnpm
- `vite dev` + `@cloudflare/vite-plugin`: รันบน `workerd` ผ่าน Miniflare, D1 และ DO จำลองบนเครื่อง
- Hibernation จำลองใน local ได้ตั้งแต่ wrangler 3.13.2
- Test: Vitest + `@cloudflare/vitest-plugin` (ชื่อใหม่ของ `@cloudflare/vitest-pool-workers` ซึ่ง npm ประกาศ deprecated ว่า "has been renamed to @cloudflare/vitest-plugin"; ต้องใช้ Vitest `^4.1`), E2E ใน local ด้วย Playwright หลาย browser context
- โหมดสำรอง: กฎ visibility ทดสอบที่ API (เร็ว) ส่วนพฤติกรรม client (AC27 ถึง AC29) บล็อก WS จากฝั่ง test ด้วย Playwright (`routeWebSocket` พิสูจน์ใน spike M0 แล้วทั้งแบบต่อไม่ได้และแบบเปิดได้แต่เงียบ กับ server จำลอง ยังไม่ได้รันกับ app จริง) และรอเวลาจริง ชุดนี้จึงเพิ่มเวลารัน test หลายนาที แยกเป็น Playwright project ช้าที่รันตอน gate ของ milestone และก่อน G1 ส่วน `pnpm test` ยังเร็ว มี script gate ตัวเดียวที่รันทุก check (review R26) ไม่มี switch ปิด WS หรือย่นรอบ poll ใน production code
- ให้ Mild ลองเอง: script Playwright แบบ headed ที่เปิด browser โดยบล็อก WS (ส่งมอบใน M5)
- ข้อจำกัดที่เอกสารระบุ: DO WebSocket ใช้กับ per-file storage isolation ไม่ได้ ต้องรัน `--max-workers=1 --no-isolate` และแยก room ต่อ test

ขั้นตอนที่จะอยู่ใน README (ชื่อคำสั่งจะยืนยันตอน implement): ติดตั้ง, copy `.dev.vars.example` เป็น `.dev.vars`, apply D1 migrations แบบ `--local`, รัน dev, รัน test

### 10.2 สิ่งที่ Mild ต้องเตรียม
1. Google Cloud project: ตั้ง OAuth consent screen และสร้าง OAuth client แบบ **Web application**
2. Authorized redirect URI: `http://localhost:5173/api/auth/callback/google` (Google ยกเว้น HTTPS ให้ localhost)
3. ส่ง `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` โดยใส่ใน `.dev.vars` บนเครื่องเอง **ไม่ส่งในแชต ไม่ commit**
4. `INSTRUCTOR_EMAILS` = email ที่ Mild จะใช้เป็นผู้สอน (สมัครด้วย password ได้ ถ้าจะทดสอบ Google ต้องเป็น Google account ที่ login ได้จริง)
5. (แนะนำ) Google account ที่สองสำหรับทดสอบ learner ผ่าน Google
6. เอกสาร Google ระบุว่า app ที่ขอแค่ name/email/profile ไม่ต้องใส่ test user และ consent ไม่หมดอายุ 7 วัน

`BETTER_AUTH_SECRET` สร้างเองในเครื่อง, `BETTER_AUTH_URL=http://localhost:5173`

ทดสอบหลายคนใช้ browser profile / incognito บนเครื่องเดียว การเปิดจากมือถือผ่าน IP ในวง LAN จะใช้ Google login ไม่ได้ (Google ไม่รับ IP ที่ไม่ใช่ localhost)

### 10.3 Test โดยไม่เรียก Google
Test สร้างผู้สอนและผู้เรียนผ่าน sign-up API จริง โดยตั้ง `INSTRUCTOR_EMAILS` ใน test env จึงไม่ต้อง seed session หรือ signed cookie มี mock OAuth provider ฝั่ง test สำหรับ AC5 (จำกัดครึ่งวัน มี fallback ใน AC5) **ไม่มี** dev login endpoint หรือ bypass ใน production code

### 10.4 สิ่งที่ local พิสูจน์ไม่ได้ (ต้องตรวจหลัง sign off และ deploy)
CPU limit และ memory ของ password hashing (ถือว่า local ไม่ enforce จนกว่าจะพิสูจน์), `Secure` cookie บน HTTPS, `cf-connecting-ip`, latency และตำแหน่งของ DO/D1, socket หลุดตอน deploy, Google redirect ของ domain จริง

### 10.5 Local acceptance script สำหรับ Mild
ขั้นตอนฉบับเต็มอยู่ใน `docs/plan/plan.md` ส่วน 3 สรุป: ผู้สอนสมัครด้วย password (หรือ Google) -> สร้างห้อง -> เปิด direct link ใน 2 profile สมัคร learner A, B -> A ถาม public และ private -> จอ B เห็นเฉพาะ public ผู้สอนเห็นชื่อ A บนทั้งสองข้อ -> ผู้สอนตอบ, resolve, ลองเปิด presenter mode -> A offline แล้ว online -> เปิด browser ที่บล็อก WS ด้วย script แล้วดูตัวบอกโหมดสำรอง รอประมาณ 30 วินาที และลอง refresh -> restart dev server ข้อมูลยังอยู่ -> สร้าง reset link ให้ B และใช้งาน -> ทดลอง Google login และกรณี `account not linked` (AC2, AC5) -> เช็ก AC20 -> **sign off**

## 11. ลำดับงานและการส่งต่อ

รายละเอียด gate อยู่ใน `docs/plan/plan.md` G0 ให้แล้วแบบมีเงื่อนไข (spec ต้องได้ director PASS) และเริ่มเมื่อ Clara สั่ง

1. **M0 spike**: Better Auth + D1 บน workerd local, migration, gate ของ password hashing (7.1), วัดตามส่วน 14, WS + `evictDurableObject`, พิสูจน์ว่า Playwright บล็อก WS ได้ (8.6), mock OAuth (ครึ่งวัน)
2. M1 auth + role จาก env + `createAuth` (AC1 ถึง AC5, AC22)
3. M2 Room + join (AC6, AC7)
4. M3 RoomDO + protocol + กฎ visibility + HTTP snapshot และโหมดสำรองของ client + presenter mode พร้อม leak canary ตั้งแต่ increment แรก (AC8 ถึง AC14, AC21, AC27 ถึง AC30)
5. M4 reset link + hardening (AC15 ถึง AC19)
6. M5 README, runbook (ขั้นตอนบัญชีผู้สอน N7 และ AC24, ลบ user ที่ squat, กู้รหัสผู้สอน, query `reset_audit`), `/api/version`, Playwright suite (AC20, AC23, AC24 ใน local, AC26) script บล็อก WS, พิสูจน์การตั้ง `INSTRUCTOR_EMAILS` ค่าว่าง (7.3) และ `wrangler deploy --dry-run --var "INSTRUCTOR_EMAILS:"` กับ output ของ Vite plugin build แสดง binding นี้ (R22) -> รอ Mild sign off

หลัง M6 deploy: AC24 และ AC25

### ข้อกำหนดที่ส่งให้ platform operator (หลัง Mild sign off และอนุมัติ action บน account)

| เรื่อง | ข้อกำหนด |
| --- | --- |
| Target | environment e2e แยกชื่อ `handsup-e2e` บน `workers.dev` **ไม่ใช่ production** D1 และ DO ของตัวเอง |
| สิ่งที่ deploy | commit SHA ที่ Mild sign off, working tree สะอาด |
| Config | **Workers Paid** (DEC-3) operator ไม่เปิดหรือเปลี่ยน plan เองถ้าไม่อยู่ในรายการที่ Mild อนุมัติ, `nodejs_compat`, DO migration `new_sqlite_classes`, D1 migrations |
| Secrets / vars | secrets: `BETTER_AUTH_SECRET` (ค่าใหม่ ไม่ใช้ของ local), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ค่า secret ไม่ผ่านแชต, vars: `BETTER_AUTH_URL` เป็น URL ของ e2e และ `INSTRUCTOR_EMAILS` ส่งด้วย `--var` ตาม 7.3 (เริ่มด้วยค่าว่าง) |
| Google | Mild เพิ่ม redirect URI `<URL ของ e2e>/api/auth/callback/google` เอง |
| E2E suite | Playwright รับ `BASE_URL`, email และรหัสผ่านของผู้สอนสำหรับ e2e ผ่าน environment variable สร้าง learner ด้วย password ผ่าน API จริง ใช้ marker และชื่อห้องที่ระบุ run ได้ |
| บัญชีผู้สอน | **ไม่มี backdoor** ใช้ password ตามปกติ สร้างตามลำดับ N7 ก่อนแชร์ URL (เริ่มด้วย `INSTRUCTOR_EMAILS` ว่าง) ใช้ email สำหรับ e2e โดยเฉพาะ ค่าไม่ผ่านแชต Google login บน URL จริงตรวจด้วยมือ |
| พิสูจน์ว่าอะไรรันอยู่ | `GET /api/version` ตรงกับ SHA และตรงกับ deployment ล่าสุดของ Cloudflare |
| ส่วนที่รันกับ deploy จริงไม่ได้ | phase `evictDurableObject` ใน AC9/AC14 (ใช้การปล่อย idle เกินช่วง hibernate แทน และบอกว่าพิสูจน์ eviction ไม่ได้), การตรวจหมดอายุใน AC15/AC16 (e2e ไม่ตั้ง config เวลา จึงใช้ค่า production และพิสูจน์การหมดอายุใน local เท่านั้น), การปลอม `cf-connecting-ip` ใน AC18 (ตรวจ key ในตาราง `rateLimit` ว่าเป็น IP จริง การพิสูจน์สอง bucket ต้องใช้ IP ต้นทางสองค่า) |
| Post-check | AC หลักด้วย suite, cookie `Secure` + prefix `__Secure-`, AC24, AC25 (เว้นจาก suite ให้พ้น window ของ rate limit), AC27 กับ URL จริง |
| Rollback | deploy แรกไม่มี version ก่อนหน้า: เอา Worker ลง, `wrangler rollback` ไม่ย้อน D1 schema และ DO migration, backup D1 ก่อน migration รอบถัดไป, canary ไม่ผ่านให้เอาลงทันที |
| Cleanup | ข้อมูลทดสอบอยู่เฉพาะ resource ของ e2e ลบหรือเก็บตามที่ Mild สั่ง, ห้ามลบบัญชีผู้สอนขณะ email ยังอยู่ใน env |

## 12. ความเสี่ยง

| ความเสี่ยง | ผล | การรับมือ |
| --- | --- | --- |
| Private question รั่วถึงผู้เรียนอื่นจาก code path ใหม่ | เสียความไว้ใจ แก้ย้อนหลังไม่ได้ | ตัวกรองเดียวสำหรับทั้งสามทางออก, leak canary ทุกทางออก ใน `pnpm test` (repo ยังไม่มี CI) |
| scrypt ใช้ memory เกินเมื่อคน sign-in พร้อมกัน (128 MB ต่อ isolate) | sign-up/in ล้ม | gate M0, AC25, ทางสำรองใน 7.1 โดยแจ้ง Mild ก่อน |
| ค่าใช้จ่ายเกินที่รวมใน plan (เช่น spam sign-up กิน CPU) | บิลเพิ่ม | rate limit, ดู usage ใน dashboard, ตัวเลขในส่วน 14 |
| deploy โดยลืม `--var INSTRUCTOR_EMAILS` หรือส่งค่าผิด | app fail หรือผู้สอนหมดสิทธิ์ | fail ปิดไว้ก่อน, pre-flight, AC24 |
| คนอื่นสมัคร email ผู้สอนก่อน | ยึดสิทธิ์ผู้สอนและบัญชีผู้เรียน | N7, AC24, ปิดทางเปลี่ยน email |
| ลืมเปิด presenter mode ตอนฉายจอ | ผู้เรียนอื่นเห็น private | จำสถานะปุ่ม, private ดูต่างชัดเจน, ทางเลือกใน N6 |
| Reset password ตัด socket ไม่สำเร็จ | socket เก่าได้ event ต่อ | `validUntil` ไม่เกิน 15 นาที (config ขยายเกินนี้ไม่ได้) |
| `workerd` export condition ไม่ถูกใช้ตอน bundle ได้ pure JS scrypt | ช้ากว่ามาก | ตรวจ bundle ใน M0 |
| D1 ไม่มี interactive transaction (adapter ปิด transaction) sign-up อาจเหลือ user ไม่มี account | สมัครซ้ำไม่ได้ | reset link กู้ได้ (7.4 ข้อ 2 ไม่ปฏิเสธ user ที่ไม่มี account เลย) |
| Rate limit ต่อ IP กระทบห้องเรียน | สมัครไม่ได้ตอนเริ่มคาบ | 7.6, AC18 |
| สมัครแทน email คนอื่น / ตั้งชื่อเลียนแบบ | เจ้าของเข้าไม่ได้ / เข้าใจผิดว่าใครพูด | reset link (ผู้เรียน), badge ผู้สอนมาจาก server เท่านั้น, ลบ user ด้วย script |
| Better Auth เปลี่ยนพฤติกรรมระหว่าง version | กฎ auth พังเงียบ | pin version, AC3 ถึง AC5, AC15, AC22 เป็น regression |
| Deploy ตัด socket | reconnect พร้อมกันทั้งห้อง | backoff + jitter, snapshot เป็น source of truth |
| WS ถูกบล็อกทั้งห้อง | อัปเดตช้าได้ถึงราว 35 วินาที, request และแถวที่อ่านเพิ่ม | polling สำรอง, jitter, limit ต่อ user, ประมาณการในส่วน 14 |
| ผู้สอนไม่รู้ว่าผู้เรียนอยู่ในโหมดสำรอง | คิดว่าทุกคนเห็นทันที | ตัวบอกสถานะบนจอของแต่ละคน (v1 ไม่มีสรุปให้ผู้สอน) |
| ข้อมูลหาย / ลบผิด (hard delete) | กู้รายโพสต์ไม่ได้ | D1 Time Travel 30 วันบน Paid และ PITR ของ DO 30 วัน กู้ระดับ DB, ใช้ PITR ใน local ไม่ได้ |

## 13. สิ่งที่ตรวจแล้วและยังไม่ตรวจ

### ตรวจจาก source ของ package (อ่านโค้ด ไม่ได้รัน), `better-auth@1.7.28`, `@better-auth/core@1.7.28`, `@better-auth/kysely-adapter@1.7.28`, `@better-auth/utils@0.5.1`
- มี D1 dialect อัตโนมัติ และปิด transaction สำหรับ D1
- scrypt N=16384 r=16 p=1, export condition `workerd` ชี้ไป `node:crypto`
- Implicit linking ถูกปฏิเสธเมื่อบัญชี local `emailVerified=false` (default), option นี้ deprecated
- Password sign-up สร้าง user ด้วย `emailVerified: false`
- Reset password สร้าง credential account ถ้ายังไม่มี, revoke session เฉพาะเมื่อเปิด option, token ถูก consume ก่อนตั้งรหัส, default อายุ 1 ชม.
- `disabledPaths` ทำงานที่ HTTP router
- Rate limit default: เปิดใน production, memory, sign-in/up 3 ครั้ง/10 วินาที, IP จาก `x-forwarded-for`, ใน test/dev ถ้าไม่มี header ใช้ localhost
- `skipOriginCheck` เป็น `true` ใน test เว้นแต่ตั้ง `disableOriginCheck`, `runInBackgroundOrAwait` await เมื่อไม่มี `backgroundTasks.handler`

### ตรวจจาก source ของ `cloudflare/workerd` branch main (commit `9eeb52b`, 2026-11-27) อ่านโค้ด ไม่ได้รัน
- [`limit-enforcer.h`](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h): default จำกัด PBKDF2 100,000 iterations และ scrypt N*r*p ไม่เกิน 2^20 (ค่าปัจจุบันและทางสำรองใน 7.1 อยู่ในเกณฑ์: 262,144 และ 655,360)
- [`crypto_scrypt.ts`](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts): มี `node:crypto` scrypt และคำนวณ synchronous ภายใน Promise executor
- เป็น default ของ open source production อาจใช้ limit enforcer ต่างจากนี้ (ยังไม่ยืนยัน) [issue #1346](https://github.com/cloudflare/workerd/issues/1346) ยังเปิดอยู่และไม่พบประกาศเพิ่ม limit ของ PBKDF2 ใน production

### ตรวจจากเอกสารหลัก
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): CPU Free 10 ms, Paid default 30 s สูงสุด 5 นาที, memory 128 MB ทั้งสอง plan, subrequest (ส่วน 14)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): Paid ขั้นต่ำ $5/เดือน และโควตาที่รวม (ส่วน 14)
- [node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/): ใช้ได้กับ `nodejs_compat` (หน้านี้ไม่ได้เอ่ยชื่อ scrypt แต่ไม่อยู่ในข้อยกเว้น)
- [DO WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [state API](https://developers.cloudflare.com/durable-objects/api/state/): attachment 16,384 bytes, 10 tags x 256 ตัว, hibernate หลัง idle 10 วินาทีเมื่อเข้าเงื่อนไข, local hibernate ตั้งแต่ wrangler 3.13.2, พฤติกรรมตอน deploy ขึ้นกับ update strategy
- [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): Free ใช้ได้เฉพาะ SQLite DO, incoming WS message คิด 20:1, ไม่คิด duration ตอน hibernate
- [DO SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/): `exec` synchronous, `transactionSync`, PITR 30 วัน ใช้ใน local ไม่ได้
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/): Free 500 MB และ 50 queries/invocation, Time Travel 7/30 วัน
- [Local dev](https://developers.cloudflare.com/workers/development-testing/), [Vitest known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/), [test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [local secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)
- [Google redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server), [test users](https://support.google.com/cloud/answer/15549945), [Better Auth Google](https://www.better-auth.com/docs/authentication/google)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): ค่าขั้นต่ำของ scrypt (หลายชุด) และ PBKDF2-HMAC-SHA256 600,000 (ค่าปัจจุบันของ library คือ r=16 p=1 ที่ N=2^14 ต่ำกว่าชุดในรายการ)
- [Google: browser ที่อาจถูกบล็อก](https://support.google.com/accounts/answer/7675428) รวมที่ถูกควบคุมด้วย automation

### ตรวจจาก source ของ `wrangler@4.168.0` (อ่านโค้ด ไม่ได้รัน)
- `--var KEY:` ได้ค่าเป็น string ว่าง, `wrangler secret put` ตัดช่องว่างท้ายและไม่ปฏิเสธค่าว่างก่อนส่ง API (พฤติกรรมของ API กับค่าว่างไม่ทราบ จึงไม่เลือกใช้ secret)

### ยังไม่ได้ตรวจ / เป็นการอนุมาน
- M0 (2026-11-27) รัน Better Auth + D1 + RoomDO บน `workerd` local แล้ว (ส่วน 14 "วัดใน M0") ส่วนบน Cloudflare จริงยังไม่เคยรัน
- เวลา CPU ของ scrypt บน `workerd` และบน production, การนับ memory ของมัน (วัดแล้วเฉพาะ Node บนเครื่องนี้ ส่วน 14)
- Local บังคับ CPU limit หรือไม่ (เอกสารที่อ่านไม่ระบุ)
- การใช้ local ได้โดยไม่มี Cloudflare account (อนุมานจากเอกสาร local dev, ตรวจด้วย AC20)
- วิธี generate D1 migration ด้วย `npx auth@latest generate`, การสร้าง signed cookie ใน test, mock OAuth provider
- การฉีด commit SHA ตอน build, การกู้รหัสผู้สอนด้วยการเขียน `verification`, `rowsRead`/`rowsWritten` ที่ใช้นับใน local
- version และการตั้งค่าร่วมกันของ Tailwind CSS, shadcn/ui, React Router กับ Vite และ Cloudflare plugin
- `new_sqlite_classes`, static assets + SPA routing, การ mount Better Auth ใน Hono, rate limit ของ `/api/join`, foreign key ใน DO SQLite
- Playwright `routeWebSocket` กับ app จริง (spike M0 พิสูจน์กับ server จำลองแล้ว), การคิดเงินของ `ping`, CPU ต่อ snapshot
- ผลของ `--var` ค่าว่างบน Cloudflare จริง และการใช้ `--var` กับ config ที่ Vite plugin สร้าง

## 14. Workers Paid (DEC-3): ข้อจำกัด ค่าใช้จ่าย และ load check

อ่านเอกสารเมื่อ 2026-11-27 ผ่านเครื่องมือสรุปหน้าเว็บ

### ข้อจำกัดที่เกี่ยวข้อง

| เรื่อง | Paid |
| --- | --- |
| CPU ต่อ HTTP request | default 30 วินาที ตั้งได้สูงสุด 5 นาที |
| Memory | 128 MB ต่อ isolate (**เท่ากับ Free**) |
| D1 | 1,000 queries ต่อ invocation, 10 GB ต่อ database, Time Travel 30 วัน |
| Durable Object (SQLite) | 10 GB ต่อ object, CPU default 30 วินาทีต่อ request, soft limit 1,000 requests/วินาทีต่อ object |

Subrequest ข้อความจากหน้า limits: "Subrequests per invocation" Free 50, Paid 10,000 (up to 10M) และ "Subrequests to internal services" Free 1,000, Paid "Matches configured limit (default 10,000)" นิยาม: "A subrequest is any request a Worker makes using the Fetch API or to Cloudflare services like R2, KV, or D1." หน้านี้**ไม่ได้บอกว่า call ไป Durable Object นับในแถวไหน** design ใน 8.4 ไม่ได้พึ่งข้อนี้

### โควตาที่รวมใน plan (เกินแล้วคิดเงินเพิ่ม)

| ส่วน | รวมต่อเดือน | ส่วนเกินต่อ 1 ล้าน |
| --- | --- | --- |
| Workers requests / CPU ms | 10 ล้าน / 30 ล้าน | $0.30 / $0.02 |
| DO requests / duration | 1 ล้าน / 400,000 GB-s | $0.15 / $12.50 ต่อ 1 ล้าน GB-s |
| DO และ D1 rows read / written | อย่างละ 25 พันล้าน / 50 ล้าน | $0.001 / $1.00 |
| Storage | DO 5 GB-month, D1 5 GB | DO $0.20, D1 $0.75 ต่อ GB-month |

จากตัวเลข 105 ms ต่อ hash โควตา CPU รองรับราว 285,000 ครั้ง/เดือนถ้าใช้กับ hash อย่างเดียว ห้องเรียนขนาดหลักร้อยคนคาดว่าอยู่ในโควตา (อนุมาน ยังไม่วัด)

### โหมดสำรอง (polling) บน Paid: ประมาณการ ยังไม่ได้วัด

กรณีแย่สุด: ทั้งห้อง 50 คนถูกบล็อก WS ตลอดคาบ 2 ชั่วโมง tab เปิดอยู่ตลอด

| รายการ | ประมาณ |
| --- | --- |
| ต่อ poll 1 ครั้ง | 1 Worker request, 1 DO request, D1 query สำหรับ session และสมาชิก, DO อ่านแถวทั้ง snapshot |
| Poll | 50 x ราว 110 ครั้ง/ชม. (รอบ 30 ถึง 35 วินาที ใช้เพดาน 120) = ไม่เกิน 6,000/ชม., 12,000/คาบ |
| WS ที่ยังลองต่อ (backoff สูงสุด 30 วินาที) | ถ้าไปถึง server เพิ่มอีกราวเท่ากัน รวมไม่เกินราว 24,000 Worker request และ DO request ต่อคาบ |
| DO rows read | ห้อง 400 แถว: 4.8 ล้าน/คาบ, เต็มเพดาน 2,000 แถว: 24 ล้าน/คาบ |
| DO duration | มี request ถี่กว่า 10 วินาที object จึงไม่ hibernate: 128 MB x 7,200 วินาที = ราว 900 GB-s/คาบ |

ทุกค่าเป็นส่วนน้อยของโควตาที่รวมใน plan (10 ล้าน Worker requests, 1 ล้าน DO requests, 400,000 GB-s, 25 พันล้านแถว ต่อเดือน) CPU ต่อ poll ยังไม่ได้วัด (วัดใน M0/M3) การคิดเงินของข้อความ `ping` ที่ auto-response ตอบ ยังไม่ได้ยืนยัน

### Password hashing บน Paid

วัดบนเครื่องนี้ (Node 22.22.1 `scryptSync`, Intel i5-7400T, ชุดละ 20 ครั้ง, CPU time median):

| Parameter | CPU ms | Memory |
| --- | --- | --- |
| N=16384 r=16 p=1 (ค่าปัจจุบัน) | 104.6 (ต่ำสุด 102.8) | ราว 32 MiB |
| N=16384 r=8 p=5 | 215.9 | ราว 16 MiB |
| N=8192 r=8 p=10 | 212.3 | ราว 8 MiB |

- **CPU:** ทุกชุดต่ำกว่า default 30 วินาทีมาก ไม่ใช่ `workerd` และไม่ใช่เครื่องของ Cloudflare จึงเป็นตัวบ่งชี้
- **Cost cap:** ทุกชุดอยู่ใต้ N*r*p 2^20 ใน source ของ `workerd` production อาจต่างออกไป (ยังไม่ยืนยัน)
- **Memory:** Paid ไม่ได้เพิ่ม จาก source คาดว่า hash ใน isolate เดียวทำทีละครั้งจึงไม่ซ้อนกัน (อนุมาน) และการนับ memory ของ native scrypt ยังไม่ทราบ
- **Latency:** ถ้าทำทีละครั้งจริง sign-in พร้อมกัน 30 คนใน isolate เดียวจะรอคิวได้ถึงหลักวินาที (อนุมานจากเวลาบนเครื่องนี้) จึงบันทึก wall time ด้วย

### วัดใน M0 (local `workerd`, เครื่องเดียวกัน, 2026-11-27)

ตัวเลขของเครื่องนี้กับ database ที่เกือบว่าง ไม่ใช่ของ Cloudflare test: `test/measurements.test.ts` (director รันซ้ำจาก clone ใหม่ได้ค่าใกล้กัน)

- Hash ด้วย `@better-auth/utils/password` (native `node:crypto` scrypt, N=16384 r=16 p=1) ใน `workerd`: **wall time median ราว 72 ถึง 78 ms ต่อ hash** (20 ครั้ง, verify ใกล้กัน) เป็น wall time ไม่ใช่ CPU time และ local ไม่ enforce CPU ตัวเลข 105 ms ด้านบนยังเป็นตัวประมาณ CPU ที่ใช้คิดโควตา pure JS fallback ช้ากว่ามาก (test ที่บังคับใช้ pure JS เกิน 60 วินาทีสำหรับ 60 hash)
- D1 ต่อ request เมื่อ `advanced.database.validateSchema: false` (7.0) `rowsRead`/`rowsWritten` มาจาก metadata ของ D1 local (ถือว่าเทียบกับการคิดเงินได้ แต่ยังไม่ยืนยัน):

| Request | Queries | Rows read | Rows written |
| --- | --- | --- | --- |
| route ที่ไม่มี (control) | 0 | 0 | 0 |
| sign-up | 6 | 4 | 13 |
| `GET /api/me` มี session | 2 | 2 | 0 |
| `GET /api/me` ไม่มี session | 0 | 0 | 0 |
| sign-out | 7 | 6 | 4 |
| sign-in | 5 | 4 ถึง 7 | 5 ถึง 7 |
| sign-in รหัสผิด | 4 | 6 | 1 |

  ถ้าเปิด `validateSchema` (default) ทุก request ที่ผ่าน Better Auth เพิ่มราว 8 query และอ่านราว 60 แถว
- แถวของ DO SQLite ต่อ operation และเวลาต่อ snapshot: วัดใน M3 ดูหัวข้อถัดไป

### วัดใน M3 (local `workerd`, เครื่องเดียวกัน, 2026-11-27)

`test/room-measurements.test.ts` นับ `rowsRead` / `rowsWritten` ของ SqlStorage cursor ทุก statement ของ operation นั้น ห้องมีคำถามและคำตอบอย่างละเท่ากัน ข้อความละ 200 ตัวอักษร ค่าเป็นของ local ไม่ใช่ตัวเลขคิดเงินของ Cloudflare

| Operation | 200 + 200 แถว: อ่าน / เขียน | 999 + 999 แถว: อ่าน / เขียน |
| --- | --- | --- |
| snapshot (ผู้สอนหรือผู้เรียน) | 800 / 0 | 3,996 / 0 |
| post คำถาม | 201 / 3 | 1,000 / 3 |
| ตอบ | 4 / 4 | 4 / 4 |
| resolve | 5 / 1 | 5 / 1 |
| ลบคำตอบ | 3 / 1 | 3 / 1 |
| ลบคำถาม (ยังไม่มีคำตอบ) | 2 / 1 | 2 / 1 |

- snapshot อ่านราว **2 เท่าของจำนวนแถว** (อ่านและเรียงลำดับ ไม่มี index บน `created_at`) ตัวเลข polling ด้านบนที่คิด 1 เท่าจึงต้องคูณสอง: ห้อง 400 แถวราว 9.6 ล้านแถว/คาบ, เต็มเพดานราว 48 ล้าน/คาบ ยังเป็นส่วนน้อยของ 25 พันล้าน/เดือน
- post อ่านทั้งตาราง `question` เพื่อเช็กเพดาน 1,000
- เวลาต่อ snapshot รวม serialize เป็น JSON (median ของ 7 ชุด ชุดละ 20 ครั้ง, 2 รอบ): 200 + 200 แถว ราว **3 ถึง 4 ms**, 999 + 999 แถว ราว **16 ถึง 17 ms** เป็น wall time ของงาน synchronous บนเครื่องนี้ ใช้เป็นตัวแทน CPU ได้คร่าว ๆ ไม่ใช่ CPU time ที่ Cloudflare รายงาน ขนาดข้อความราว 99k ถึง 662k ตัวอักษร
- ยังไม่ได้วัด: ค่า CPU และการคิดเงินบน Cloudflare, เวลา broadcast ถึงหลาย socket, แถวของ D1 ต่อ request ของห้อง

### ตรวจอะไรได้ที่ไหน

| ขั้น | ตรวจได้ | ตรวจไม่ได้ |
| --- | --- | --- |
| M0 / local | bundle ใช้ native scrypt, ทำงานใน `workerd`, เวลาต่อ hash บนเครื่องนี้, จำนวน D1 query ต่อ request, แถวที่อ่าน/เขียนต่อ operation | การบังคับ CPU และ memory (ถือว่า local ไม่ enforce), ความเร็ว CPU ของ Cloudflare, cost cap ของ production |
| Deploy | `exceededCpu` / `1102` / exceeded memory ใน logs และ analytics, CPU quantile, wall time, usage จริง | พฤติกรรมภายใต้การใช้จริงระยะยาว, isolate กระจายแบบใดตอน load จริง, quantile เป็นการ sample |

### Load check (AC25)

1. ยิง sign-up พร้อมกัน 30 ครั้ง เว้นอย่างน้อย 61 วินาที แล้วยิง sign-in พร้อมกัน 30 ครั้ง โดยเว้นจาก e2e suite อย่างน้อย 61 วินาทีด้วย (พ้น rate limit)
2. ผ่าน: ทุก request สำเร็จ ไม่มี `429`, `exceededCpu`, `1102` หรือ exceeded memory และมีบันทึก p99 CPU ms กับ p99 wall time ถ้า p99 wall time เกิน 5 วินาที ให้รายงาน Mild เป็นข้อสังเกต ไม่ใช่เกณฑ์หยุด (R21)
3. ไม่ผ่าน: หยุด เก็บหลักฐาน กลับไปถาม Mild ห้ามเปลี่ยน hash หรือสถาปัตยกรรมเอง
