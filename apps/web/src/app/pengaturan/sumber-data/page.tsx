import type { Metadata } from "next";
import { DataSourceSettings } from "@/components/settings/data-source-settings";
import { requireSignIn } from "@/lib/api/require-sign-in";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Sumber data" };

export default async function DataSourceSettingsPage() {
  await requireSignIn("/pengaturan/sumber-data");
  const { dataSources } = await getAccountSettings();
  return <DataSourceSettings sources={dataSources} />;
}
