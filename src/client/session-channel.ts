/** Tells the other tabs of this browser that who is signed in has changed (spec 8.4). */
export type SessionEvent = "signed-in" | "signed-out";

const channel = new BroadcastChannel("handsup.session");

export const sessionChannel = {
  announce: (event: SessionEvent) => channel.postMessage(event),
  /** Hears the other tabs only; a tab does not receive its own announcements. */
  listen: (listener: (event: SessionEvent) => void) => {
    const handle = (message: MessageEvent<SessionEvent>) => listener(message.data);
    channel.addEventListener("message", handle);
    return () => channel.removeEventListener("message", handle);
  },
};
