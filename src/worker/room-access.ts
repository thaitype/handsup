import type { RoomInfo } from "../shared/protocol.ts";
import type { Viewer } from "./http.ts";

/**
 * Spec 6.1 and 8.5: the room, if this viewer may enter it. A room that does not exist and a
 * room you are not a member of both give null, so the answers cannot be told apart.
 */
export async function roomFor(db: D1Database, viewer: Viewer, roomId: string): Promise<RoomInfo | null> {
  const statement =
    viewer.role === "instructor"
      ? db.prepare("select id, name from room where id = ?").bind(roomId)
      : db
          .prepare(
            `select r.id, r.name from room r
             join room_member m on m.room_id = r.id
             where r.id = ? and m.user_id = ?`,
          )
          .bind(roomId, viewer.id);
  return statement.first<RoomInfo>();
}

export async function isMember(db: D1Database, userId: string, roomId: string): Promise<boolean> {
  const row = await db
    .prepare("select 1 as found from room_member where room_id = ? and user_id = ?")
    .bind(roomId, userId)
    .first();
  return row !== null;
}
