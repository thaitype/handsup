import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

/**
 * Stand-in server for the spike. It sends a frame as soon as a socket connects, so a test
 * that sees no frame knows the block worked and not that there was nothing to receive.
 */
export async function startServer() {
  let connections = 0;
  const http = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>ws spike</title><script>
      window.log = [];
      window.open_socket = () => {
        const socket = new WebSocket("ws://" + location.host + "/ws");
        socket.onopen = () => { log.push("open"); socket.send("ping"); };
        socket.onmessage = (event) => log.push("message:" + event.data);
        socket.onerror = () => log.push("error");
        socket.onclose = (event) => log.push("close:" + event.code);
      };
      open_socket();
    </script>`);
  });
  const sockets = new WebSocketServer({ server: http, path: "/ws" });
  sockets.on("connection", (socket) => {
    connections += 1;
    socket.on("message", (data) => {
      if (String(data) === "ping") socket.send("pong");
    });
    socket.send("snapshot");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/`,
    connections: () => connections,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
    },
  };
}
