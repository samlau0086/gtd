"use client";

import { useEffect } from "react";

type Theme = "light" | "dark";

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export function ThemeToggle() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const saved = localStorage.getItem("gtdflow-theme");
    const initial = saved === "light" || saved === "dark" ? saved : systemTheme();
    document.documentElement.dataset.theme = initial;
    document.documentElement.dataset.themeSource = saved ? "manual" : "system";

    const followSystem = (event: MediaQueryListEvent) => {
      if (localStorage.getItem("gtdflow-theme")) return;
      const next = event.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const toggle = () => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("gtdflow-theme", next);
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.themeSource = "manual";
  };

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label="切换浅色或深色模式" title="切换浅色或深色模式">
      <span className="theme-icon-light" aria-hidden="true">☀</span>
      <span className="theme-icon-dark" aria-hidden="true">☾</span>
    </button>
  );
}
