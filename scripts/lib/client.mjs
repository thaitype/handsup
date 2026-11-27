// A minimal browser for the production check: cookies and our own Origin header.
export function browser(base) {
  const origin = new URL(base).origin;
  const cookies = new Map();
  const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  async function request(path, body, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        origin,
        cookie: cookie(),
        ...(method === "GET" ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Cloudflare's own error pages are not JSON.
    }
    return { status: response.status, setCookies, text, json };
  }
  /** Opens the room socket and records every frame it is sent. */
  function socket(roomId) {
    const url = new URL(`/api/rooms/${roomId}/ws`, origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url, { headers: { origin, cookie: cookie() } });
    const frames = [];
    ws.addEventListener("message", (event) => frames.push(String(event.data)));
    /** Resolves when some frame carries `text`. */
    const received = async (text, timeout = 10_000) => {
      const end = Date.now() + timeout;
      while (!frames.some((frame) => frame.includes(text))) {
        if (Date.now() > end || ws.readyState === WebSocket.CLOSED) return false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return true;
    };
    return { frames, received, close: () => ws.close() };
  }
  return { request, socket };
}
