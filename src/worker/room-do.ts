import { DurableObject } from "cloudflare:workers";
import { socketMaxLifetimeSeconds } from "./config.ts";

type SocketAttachment = { validUntil: number };

/**
 * M0 skeleton: hibernatable sockets with a validity limit. No route reaches it yet,
 * and it holds no room data. M3 replaces `broadcast` with the filtered protocol.
 */
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      validUntil: Date.now() + socketMaxLifetimeSeconds(this.env) * 1000,
    } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Returns how many sockets received the message. Expired sockets are closed instead. */
  broadcast(message: string): number {
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const { validUntil } = socket.deserializeAttachment() as SocketAttachment;
      if (validUntil <= Date.now()) {
        socket.close(4001, "expired");
        continue;
      }
      socket.send(message);
      delivered += 1;
    }
    return delivered;
  }
}
