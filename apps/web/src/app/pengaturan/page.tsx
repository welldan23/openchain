import { redirect } from "next/navigation";
import { SETTINGS_TABS, DEFAULT_SETTINGS_TAB } from "@/lib/settings";

export default function SettingsIndexPage() {
  redirect(SETTINGS_TABS.find((tab) => tab.id === DEFAULT_SETTINGS_TAB)!.href);
}
