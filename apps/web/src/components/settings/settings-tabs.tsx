"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SETTINGS_TABS, settingsTabFromPath } from "@/lib/settings";

/** Navigasi tiga tab pengaturan; tiap tab punya alamat sendiri supaya bisa dibuka langsung. */
export function SettingsTabs() {
  const current = settingsTabFromPath(usePathname());
  return (
    <nav aria-label="Bagian pengaturan" className="-mx-1 overflow-x-auto border-b border-line px-1">
      <ul className="flex gap-1">
        {SETTINGS_TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                title={tab.description}
                className={cn(
                  "-mb-px inline-flex whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active ? "border-accent text-accent" : "border-transparent text-muted hover:border-line hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
