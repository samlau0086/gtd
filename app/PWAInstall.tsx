"use client";

import { useEffect } from "react";

/** Registers the PWA shell and leaves installation UI to the browser. */
export function PWAInstall() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
