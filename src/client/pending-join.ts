/**
 * Spec 7.5: a code from a direct link waits in sessionStorage while the person signs in or
 * signs up, including the round trip to Google, and is only used when they confirm.
 */
const KEY = "handsup.pendingJoinCode";

export const pendingJoin = {
  get: () => sessionStorage.getItem(KEY),
  set: (code: string) => sessionStorage.setItem(KEY, code),
  clear: () => sessionStorage.removeItem(KEY),
};

/** Where to go after signing in: back to the join confirmation if a code is waiting. */
export const afterSignIn = () => (pendingJoin.get() ? "/join" : "/");
