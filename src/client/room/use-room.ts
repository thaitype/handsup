import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoveResult, UpsertResult } from "../../shared/protocol.ts";
import { initialRoomState, RoomConnection, type RoomState } from "./connection.ts";

export function useRoom(roomId: string) {
  const [state, setState] = useState<RoomState>(initialRoomState);
  const connection = useRef<RoomConnection | null>(null);
  useEffect(() => {
    setState(initialRoomState);
    const next = new RoomConnection(roomId, setState);
    connection.current = next;
    next.start();
    return () => next.stop();
  }, [roomId]);
  const applyWrite = useCallback((result: UpsertResult | RemoveResult) => {
    connection.current?.applyWrite(result);
  }, []);
  return { ...state, applyWrite };
}
