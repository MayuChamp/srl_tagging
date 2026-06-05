"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Tags, Settings, Video, LogOut,
  BookOpen, ChevronLeft, ChevronRight, Sun, Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const mainNav = [
  { name: "Dashboard",       href: "/",         icon: LayoutDashboard },
  { name: "Tagging Mode",    href: "/tagging",  icon: Tags },
  { name: "Video Library",   href: "/videos",   icon: Video },
  { name: "Session Library", href: "/sessions", icon: BookOpen },
];

const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onThemeToggle: () => void;
  theme: "dark" | "light";
}

export function Sidebar({ isCollapsed, onToggle, onThemeToggle, theme }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const NavItem = ({ item }: { item: typeof mainNav[0] }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        title={isCollapsed ? item.name : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-xl transition-all duration-150 group",
          isCollapsed ? "h-10 w-10 mx-auto justify-center" : "h-10 px-3",
          active
            ? "bg-primary/12 text-primary"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
        )}
      >
        <AnimatePresence>
          {active && (
            <motion.span
              layoutId="sidebar-pill"
              className="absolute inset-0 rounded-xl bg-primary/10"
              initial={false}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
        </AnimatePresence>
        {active && !isCollapsed && (
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
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.13 }}
              className="relative text-[13.5px] font-medium whitespace-nowrap"
            >
              {item.name}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    );
  };

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 68 : 240 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-screen shrink-0 border-r border-border bg-accent/40 overflow-hidden"
      style={{ backdropFilter: "blur(8px)" }}
    >
      {/* Brand top accent line */}
      <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-primary/60 via-violet-400/80 to-primary/30" />

      {/* Logo */}
      <div className={cn(
        "h-14 flex items-center shrink-0 border-b border-border",
        isCollapsed ? "justify-center px-2" : "px-4 gap-3"
      )}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(109,108,249,0.45)]">
          <Tags size={15} className="text-white" />
        </div>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.14 }}
            >
              <span className="text-[15px] font-extrabold tracking-tight leading-none">
                <span className="gradient-text">SCOPE</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main nav */}
      <nav className={cn(
        "flex-1 py-4 space-y-0.5 overflow-hidden",
        isCollapsed ? "px-2" : "px-3"
      )}>
        {mainNav.map(item => <NavItem key={item.href} item={item} />)}

        {/* Separator before Settings */}
        <div className="py-2">
          <div className="h-px bg-border mx-1" />
        </div>

        {bottomNav.map(item => <NavItem key={item.href} item={item} />)}
      </nav>

      {/* Footer */}
      <div className={cn(
        "shrink-0 border-t border-border py-2 space-y-0.5",
        isCollapsed ? "px-2" : "px-3"
      )}>
        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          className={cn(
            "flex items-center gap-3 rounded-xl text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all",
            isCollapsed ? "h-10 w-10 mx-auto justify-center" : "h-10 px-3 w-full"
          )}
        >
          {theme === "dark"
            ? <Sun size={16} className="shrink-0" />
            : <Moon size={16} className="shrink-0" />
          }
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-[13.5px] font-medium whitespace-nowrap"
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Logout */}
        <button
          title={isCollapsed ? "Logout" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all",
            isCollapsed ? "h-10 w-10 mx-auto justify-center" : "h-10 px-3 w-full"
          )}
        >
          <LogOut size={16} className="shrink-0" />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-[13.5px] font-medium whitespace-nowrap"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={isCollapsed ? "Expand" : "Collapse sidebar"}
          className={cn(
            "flex items-center rounded-xl text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all",
            isCollapsed ? "h-10 w-10 mx-auto justify-center" : "h-10 px-3 w-full justify-end gap-2"
          )}
        >
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-[12px] font-medium text-muted-foreground/60 whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
          {isCollapsed
            ? <ChevronRight size={15} className="shrink-0" />
            : <ChevronLeft size={15} className="shrink-0" />
          }
        </button>

        {/* Rights / Footer Info */}
        <div className="pt-2 mt-1 border-t border-border/30">
          <AnimatePresence mode="wait">
            {!isCollapsed ? (
              <motion.div
                key="expanded-copyright"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="text-[10px] text-muted-foreground/40 text-center font-medium leading-relaxed select-none px-1"
              >
                Yeara dany, Bar Ilan University 2026
              </motion.div>
            ) : (
              <motion.div
                key="collapsed-copyright"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-[9px] text-muted-foreground/30 text-center font-bold select-none cursor-help"
                title="Yeara dany, Bar Ilan University 2026"
              >
                © 2026
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
