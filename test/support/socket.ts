/** A client socket to a room object that records everything it receives. */
export async function connect(stub: { fetch: typeof fetch }) {
  const response = await stub.fetch("https://room/ws", { headers: { Upgrade: "websocket" } });
  const socket = response.webSocket;
  if (!socket) throw new Error(`upgrade failed with ${response.status}`);
  const messages: string[] = [];
  const closes: number[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(String(event.data));
  });
  socket.addEventListener("close", (event) => {
    closes.push(event.code);
  });
  socket.accept();
  return { socket, messages, closes };
}
