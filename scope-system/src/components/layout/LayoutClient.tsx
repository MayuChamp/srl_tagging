"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { Sidebar, mainNav, bottomNav, isNavActive } from "./Sidebar";
import { Menu, Tags } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export function LayoutClient({ children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Light is the default theme; only a saved "dark" preference keeps dark
  // (same rule as the pre-paint script in app/layout.tsx).
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mounted, setMounted] = useState(false);

  // Load preferences from localStorage after mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("ates-sidebar-collapsed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (savedCollapsed === "true") setSidebarCollapsed(true);

    const savedTheme = localStorage.getItem("ates-theme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setTheme(savedTheme === "dark" ? "dark" : "light");

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
  // Display-only: current section name for the mobile header (same names and
  // matching rules as the sidebar nav).
  const currentSection = [...mainNav, ...bottomNav].find((item) => isNavActive(pathname, item.href))?.name;

  // Close mobile sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setMobileOpen(false);
  }, [pathname]);

  if (isLoginPage) {
    return (
      <main className="flex-1 w-full h-dvh overflow-y-auto bg-background bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_60%)] flex flex-col items-center justify-center-safe px-4 py-10">
        {children}
      </main>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onThemeToggle={toggleTheme}
        theme={theme}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 h-dvh">
        {/* Mobile Header: always-dark app chrome, same as the sidebar drawer */}
        <div className="md:hidden surface-dark bg-sidebar flex items-center justify-between gap-3 px-4 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-8 rounded-[0.625rem] bg-primary-solid text-primary-foreground grid place-items-center shrink-0">
              <Tags size={15} />
            </div>
            <span className="text-md font-bold tracking-wide leading-none shrink-0">
              SCOPE
            </span>
            {currentSection && (
              <>
                <span className="toolbar-sep" aria-hidden="true" />
                <span className="text-sm text-muted-foreground truncate">{currentSection}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
            className="btn btn-secondary btn-icon size-10 shrink-0"
          >
            <Menu size={20} />
          </button>
        </div>
        <main className="flex-1 overflow-y-auto min-w-0 min-h-0">{children}</main>
      </div>
    </MotionConfig>
  );
}
