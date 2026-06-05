"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";

interface Props {
  children: React.ReactNode;
}

export function LayoutClient({ children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  // Load preferences from localStorage after mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("ates-sidebar-collapsed");
    if (savedCollapsed === "true") setSidebarCollapsed(true);

    const savedTheme = localStorage.getItem("ates-theme");
    if (savedTheme === "light") setTheme("light");

    setMounted(true);
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.add("light");
    } else {
      html.classList.remove("light");
    }
    localStorage.setItem("ates-theme", theme);
  }, [theme, mounted]);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ates-sidebar-collapsed", String(next));
      return next;
    });
  };

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <>
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onThemeToggle={toggleTheme}
        theme={theme}
      />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </>
  );
}
