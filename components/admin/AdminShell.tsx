"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import {
  BadgePercent,
  CalendarRange,
  Coins,
  ExternalLink,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/lib/admin/actions/auth";
import { ROLE_LABELS, can, type Permission } from "@/lib/admin/permissions";
import { PUBLIC_SITE_URL } from "@/lib/admin/site-url";
import type { AdminRole } from "@/lib/admin/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, permission: "catalog.read" },
  { href: "/admin/packages", label: "Packages", icon: MapIcon, permission: "catalog.read" },
  { href: "/admin/seasons", label: "Seasons", icon: CalendarRange, permission: "catalog.read" },
  { href: "/admin/promotions", label: "Promotions", icon: BadgePercent, permission: "catalog.read" },
  { href: "/admin/settings", label: "Currency", icon: Coins, permission: "catalog.read" },
  { href: "/admin/team", label: "Team", icon: Users, permission: "team.manage" },
  { href: "/admin/activity", label: "Activity", icon: History, permission: "catalog.read" },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({
  actor,
  children,
}: {
  actor: { email: string; role: AdminRole };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const items = NAV_ITEMS.filter((item) => can(actor.role, item.permission));

  return (
    <div className={clsx("adm-shell", navOpen && "is-nav-open")}>
      <a className="adm-skip" href="#adm-main">
        Skip to content
      </a>
      <header className="adm-topbar">
        <button
          type="button"
          className="adm-icon-button"
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls="adm-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <span className="adm-topbar-brand">
          Bueno<em>Back Office</em>
        </span>
      </header>

      <aside id="adm-sidebar" className="adm-sidebar" aria-label="Back office">
        <Link href="/admin" className="adm-brand">
          <Image src="/images/logo-white.svg" alt="" width={64} height={64} priority />
          <span className="adm-brand-text">
            <span className="adm-brand-name">Bueno Leisure</span>
            <span className="adm-brand-tagline">Back Office</span>
          </span>
        </Link>
        <nav className="adm-nav" aria-label="Sections">
          <ul>
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx("adm-nav-link", active && "is-active")}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="adm-sidebar-footer">
          <a className="adm-nav-link adm-nav-link--muted" href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            <span>View website</span>
          </a>
          <div className="adm-user">
            <span className="adm-user-email" title={actor.email}>
              {actor.email}
            </span>
            <span className="adm-user-role">{ROLE_LABELS[actor.role]}</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="adm-nav-link">
              <LogOut size={16} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      {navOpen && (
        <button type="button" className="adm-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      )}

      <main id="adm-main" className="adm-main" tabIndex={-1}>
        <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
          {children}
        </motion.div>
      </main>
    </div>
  );
}
