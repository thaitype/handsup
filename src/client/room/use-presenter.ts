import { useCallback, useEffect, useState } from "react";

/** Spec N6: a per-browser switch that survives a reload while the screen is being shown. */
export const PRESENTER_KEY = "handsup.presenterMode";

const read = () => {
  try {
    return window.localStorage.getItem(PRESENTER_KEY) === "on";
  } catch {
    return false;
  }
};

export function usePresenterMode() {
  // Read before the first render, so a private question never flashes after a reload.
  const [isOn, setIsOn] = useState(read);
  useEffect(() => {
    // Every instructor tab of this browser follows the switch.
    const follow = (event: StorageEvent) => {
      if (event.key === PRESENTER_KEY) setIsOn(read());
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);
  const toggle = useCallback(() => {
    setIsOn((current) => {
      try {
        window.localStorage.setItem(PRESENTER_KEY, current ? "off" : "on");
      } catch {
        // Without storage the switch still works until the page is reloaded.
      }
      return !current;
    });
  }, []);
  return { isOn, toggle };
}
