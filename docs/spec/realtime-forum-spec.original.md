# headsup

Realtime Learner Forum: Spec (draft)

## เป้าหมาย

Forum realtime ให้ผู้เรียนถามคำถาม และผู้สอนตอบ ทุกคนที่เกี่ยวข้องเห็นการเปลี่ยนแปลงทันทีโดยไม่ต้อง refresh รันบน Cloudflare

## Roles

| Role | ใคร | ทำอะไรได้ |
| --- | --- | --- |
| learner | ทุกคนที่ login ยกเว้นผู้สอน | ถาม Question (แบบ public หรือ anonymous), ดูคำตอบ, ลบ Question ของตัวเอง |
| instructor | email ที่กำหนดไว้ใน env | เห็นทุก Question รวมแบบ anonymous, ตอบ Answer, mark resolved, ลบได้ทุกโพสต์, สร้าง Room, generate reset-password link |

## ฟีเจอร์หลัก

- **Room**: ผู้สอนสร้างห้อง (เช่น ต่อ course) ผู้เรียนเข้าไปถามในห้องนั้น
- **Ask**: ผู้เรียนพิมพ์ Question แล้วเลือกได้ว่าจะถามแบบ public หรือ anonymous
- **Answer**: ผู้สอนตอบใต้ Question
- **Resolved**: ผู้สอน mark Question ว่าตอบแล้ว
- **Realtime**: Question, Answer และสถานะ resolved ขึ้นบนหน้าจอทุกคนที่มีสิทธิ์เห็นทันที

## Anonymous Question

ผู้เรียนเลือก "ถามแบบ anonymous" ตอนโพสต์ได้

- Question แบบนี้ **ผู้เรียนคนอื่นมองไม่เห็น** เห็นเฉพาะผู้สอน
- ผู้ถามเห็น Question ของตัวเองและคำตอบที่ผู้สอนตอบ
- Question แบบ public ทุกคนในห้องเห็นพร้อมชื่อผู้ถาม

## Sign-in

- สมัครด้วย name + email + password หรือ login ด้วย Google
- ไม่มี email verification และไม่มี forgot password
- ทุกคนเป็น learner ยกเว้น email ที่ล็อกไว้ใน env ซึ่งเป็น instructor (ให้ instructor login ผ่าน Google)
- ลืมรหัสผ่าน: ผู้สอนกดสร้างลิงก์ reset ในหน้า admin แล้วส่งลิงก์ให้ผู้เรียนเอง

## Out of scope (v1)

- ผู้เรียนตอบกันเอง
- ส่งอีเมลทุกชนิด
- Notification, แนบไฟล์, reply หลายชั้น

## Platform

Cloudflare (Workers, Durable Objects, D1) 

## Open questions

1. ผู้สอนเห็นว่าใครเป็นคนถามแบบ anonymous หรือไม่ (ผู้สอนเห็น Question แน่นอน แต่ชื่อผู้ถามจะโชว์ไหม)
2. ผู้สอนเลือกเผยแพร่ Question แบบ anonymous พร้อมคำตอบให้ทุกคนเห็นได้ไหม (เช่น เป็น FAQ โดยไม่เปิดเผยชื่อ)
3. ผู้เรียนเข้าได้ทุก Room หรือต้องถูกเพิ่มเข้า Room ก่อน
4. ผู้เรียนตอบกันเองได้ไหม (v1 สมมติว่าไม่ได้)
5. ต้องค้นหาคำถามเก่าข้ามห้องไหม

----


Decided
* ใช้ Cloudflare ทำ realtime forum
* Auth: name + email + password ปกติ และ Google SSO ใช้ทั้งผู้เรียนและผู้สอน
* ทุกคนเป็น learner ยกเว้นผู้สอน ซึ่งล็อกด้วย email ใน env
* ผู้สอน login ด้วย Better Auth
* ไม่มี email OTP และไม่มี forgot password: หน้า admin สร้างลิงก์ reset password แล้วคุณส่งให้ผู้เรียนเอง
* ผู้เรียนถามแบบ anonymous ได้ โดยคนอื่นไม่เห็น เห็นเฉพาะผู้สอน
* ใช้ invite code สำหรับ Join room ใช้ 10 ตัว share invite code ผ่าน direct link ได้ 

ยังไม่แน่ใจ
* 1 Room = 1 Durable Object ใช้ WebSocket Hibernation API
* เก็บ User/Session ใน D1 ส่วน Question/Answer เก็บใน SQLite ของ Durable Object แต่ละห้อง
* Room เก็บใน D1 และให้ instructor สร้างเท่านั้น
* ผู้สอนต้อง login ผ่าน Google เท่านั้น และปฏิเสธการสมัครหรือ sign-in ด้วย password ถ้า email ตรงกับ list (กันคนสมัครด้วย email ผู้สอนก่อน)
* ใช้ Hono บน Workers