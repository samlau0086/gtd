import { GTDApp } from "./GTDApp";
import { PWAInstall } from "./PWAInstall";
import { ThemeToggle } from "./ThemeToggle";

export default function Home() {
  return (
    <>
      <ThemeToggle />
      <PWAInstall />
      <GTDApp />
    </>
  );
}
