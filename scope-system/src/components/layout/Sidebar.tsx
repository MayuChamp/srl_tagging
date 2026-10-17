"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Tags, Settings, Video, LogOut,
  BookOpen, ChevronLeft, ChevronRight, Sun, Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase/client";

export const mainNav = [
  { name: "Dashboard",       href: "/",         icon: LayoutDashboard },
  { name: "Tagging Mode",    href: "/tagging",  icon: Tags },
  { name: "Video Library",   href: "/videos",   icon: Video },
  { name: "Session Library", href: "/sessions", icon: BookOpen },
];

export const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
];

/** Dashboard matches "/" exactly; every other item matches by prefix. */
export function isNavActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type NavEntry = (typeof mainNav)[number];

// Shared row look for nav links and footer buttons (Studio: 40px rows,
// .625rem radius, muted text that brightens on a faint foreground tint).
const ROW = "flex items-center gap-3 rounded-[0.625rem] transition-all duration-150";
const ROW_SIZE_COLLAPSED = "h-10 w-10 mx-auto justify-center";
const ROW_SIZE_EXPANDED = "h-10 px-3 w-full";

// Module scope so links keep their identity across renders (focus, hover and
// the shared "sidebar-pill" layout animation survive route/theme changes).
function NavItem({ item, active, collapsed }: { item: NavEntry; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.name : undefined}
      aria-label={collapsed ? item.name : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative group",
        ROW,
        collapsed ? ROW_SIZE_COLLAPSED : "h-10 px-3",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-foreground/6 hover:text-foreground"
      )}
    >
      <AnimatePresence>
        {active && (
          <motion.span
            layoutId="sidebar-pill"
            className="absolute inset-0 rounded-[0.625rem] bg-foreground/9"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </AnimatePresence>
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
      )}
      <Icon
        size={17}
        className={cn(
          "relative shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.13 }}
            className="relative text-sm font-medium whitespace-nowrap"
          >
            {item.name}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onThemeToggle: () => void;
  theme: "dark" | "light";
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export function Sidebar({ isCollapsed, onToggle, onThemeToggle, theme, mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();

  // Presentation only: the mobile drawer always shows labels, even when the
  // persisted desktop preference (isCollapsed) is collapsed.
  const collapsed = isCollapsed && !mobileOpen;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const isActive = (href: string) => isNavActive(pathname, href);

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden="true"
            className="fixed inset-0 bg-overlay backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileOpen?.(false)}
          />
        )}
      </AnimatePresence>
      {/* Always-dark sidebar (both themes): .surface-dark re-themes every
          token-based utility inside it to the dark palette. */}
      <motion.aside
        id="app-sidebar"
        initial={false}
        animate={{ width: collapsed ? 68 : 240 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "surface-dark bg-sidebar flex flex-col h-dvh shrink-0 border-r border-border overflow-hidden transition-transform duration-300",
          "fixed inset-y-0 left-0 z-50 md:relative",
          mobileOpen ? "translate-x-0 !w-[240px] shadow-lg md:shadow-none" : "-translate-x-full md:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center shrink-0",
        collapsed ? "justify-center px-2" : "px-4 gap-3"
      )}>
        <div className="size-8 rounded-[0.625rem] bg-primary-solid text-primary-foreground grid place-items-center shrink-0">
          <Tags size={15} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.14 }}
              className="flex flex-col gap-1 min-w-0"
            >
              <span className="text-md font-bold tracking-wide leading-none">
                SCOPE
              </span>
              <span className="text-2xs leading-none text-muted-foreground whitespace-nowrap">
                SRL Video Analysis
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main nav */}
      <nav
        aria-label="Main navigation"
        className={cn(
          "flex-1 min-h-0 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-contain",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {mainNav.map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}

        {/* Separator before Settings */}
        <div className="py-2.5" aria-hidden="true">
          <div className="h-px bg-border mx-1" />
        </div>

        {bottomNav.map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className={cn(
        "shrink-0 border-t border-border py-3 space-y-0.5",
        collapsed ? "px-2" : "px-3"
      )}>
        {/* Theme toggle */}
        <button
          type="button"
          onClick={onThemeToggle}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
          className={cn(
            ROW,
            "text-muted-foreground hover:bg-foreground/6 hover:text-foreground",
            collapsed ? ROW_SIZE_COLLAPSED : ROW_SIZE_EXPANDED
          )}
        >
          {theme === "dark"
            ? <Sun size={16} className="shrink-0" />
            : <Moon size={16} className="shrink-0" />
          }
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-sm font-medium whitespace-nowrap"
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          aria-label="Logout"
          className={cn(
            ROW,
            "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
            collapsed ? ROW_SIZE_COLLAPSED : ROW_SIZE_EXPANDED
          )}
        >
          <LogOut size={16} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-sm font-medium whitespace-nowrap"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Collapse toggle: its icon, label and title describe the persisted
            preference (isCollapsed), which is what the button changes. */}
        <button
          type="button"
          onClick={onToggle}
          title={isCollapsed ? "Expand" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
          className={cn(
            ROW,
            "text-muted-foreground hover:bg-foreground/6 hover:text-foreground",
            collapsed ? ROW_SIZE_COLLAPSED : ROW_SIZE_EXPANDED
          )}
        >
          {isCollapsed
            ? <ChevronRight size={16} className="shrink-0" />
            : <ChevronLeft size={16} className="shrink-0" />
          }
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-sm font-medium whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Rights / Footer Info */}
        <div className="pt-2.5">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="expanded-copyright"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="text-2xs text-muted-foreground text-start text-balance font-medium leading-relaxed select-none px-3"
              >
                Yeara dany, Bar Ilan University 2026
              </motion.div>
            ) : (
              <motion.div
                key="collapsed-copyright"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-2xs text-muted-foreground text-center font-medium select-none cursor-help"
                title="Yeara dany, Bar Ilan University 2026"
              >
                © 2026
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
    </>
  );
}
