"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [ready, setReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined).finally(() => setReady(true));
    } else {
      setReady(true);
    }

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setShowHelp(false);
    };
    const clearPrompt = () => {
      setInstallPrompt(undefined);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  if (!ready || installed) return null;

  return (
    <div className="install-app-wrap">
      <button
        className="install-app"
        type="button"
        title="安装 GTD Flow"
        aria-expanded={showHelp}
        onClick={async () => {
          if (!installPrompt) {
            setShowHelp((current) => !current);
            return;
          }
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          setInstallPrompt(undefined);
          if (choice.outcome === "accepted") setInstalled(true);
          else setShowHelp(true);
        }}
      >
        <span aria-hidden="true">↓</span>
        安装应用
      </button>
      {showHelp && (
        <div className="install-help" role="status">
          <strong>浏览器暂未提供一键安装</strong>
          <span>请使用 HTTPS 打开页面，然后在浏览器菜单中选择“安装 GTD Flow”或“添加到主屏幕”。</span>
          <button type="button" onClick={() => setShowHelp(false)} aria-label="关闭安装提示">×</button>
        </div>
      )}
    </div>
  );
}
