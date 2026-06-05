"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Menu, Tags } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export function LayoutClient({ children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  // Load preferences from localStorage after mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("ates-sidebar-collapsed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (savedCollapsed === "true") setSidebarCollapsed(true);

    const savedTheme = localStorage.getItem("ates-theme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  // Close mobile sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setMobileOpen(false);
  }, [pathname]);

  if (isLoginPage) {
    return (
      <main className="flex-1 w-full min-h-screen bg-zinc-950 flex flex-col items-center justify-center">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onThemeToggle={toggleTheme}
        theme={theme}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(109,108,249,0.45)]">
              <Tags size={15} className="text-white" />
            </div>
            <span className="text-[15px] font-extrabold tracking-tight">
              <span className="gradient-text">SCOPE</span>
            </span>
          </div>
          <button 
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
        <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
      </div>
    </>
  );
}
