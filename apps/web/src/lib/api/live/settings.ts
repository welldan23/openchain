/** Pengaturan akun dari API `/api/account` (profil, preferensi, sumber data). */
import type { AvatarChange } from "../../profile";
import type { AccountSettings, DataSourceKind, DataSourceSetting, DataSourceStatus, DisplayPreferences, UserProfile } from "../../types";
import { apiJson, seg } from "../http";
import { toChainId } from "./common";

export interface ApiProfile {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  joinedAt: string;
  avatarUrl: string | null;
}

export interface ApiPreferences extends Omit<DisplayPreferences, "defaultChain"> {
  defaultChain: string | null;
  defaultChainSource: "chosen" | "fallback" | "none";
  defaultChainNote: string | null;
}

export interface ApiDataSource {
  id: string;
  name: string;
  kind: DataSourceKind;
  description: string;
  chains: string[];
  status: DataSourceStatus;
  statusNote: string;
  envVars: Array<{ name: string; purpose: string; required: boolean; configured: boolean }>;
  lastCheckedAt: string | null;
  enabled: boolean;
  lockedReason: string | null;
  offEffect: string;
  attribution: string | null;
}

export function toUserProfile(profile: ApiProfile): UserProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    timezone: profile.timezone,
    joinedAt: profile.joinedAt,
    avatarUrl: profile.avatarUrl,
  };
}

export function toPreferences(preferences: ApiPreferences): DisplayPreferences {
  const { defaultChain, defaultChainSource, defaultChainNote, ...rest } = preferences;
  return { ...rest, defaultChain: toChainId(defaultChain), defaultChainNote: defaultChainSource === "chosen" ? null : defaultChainNote };
}

export function toDataSource(source: ApiDataSource): DataSourceSetting {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    chains: source.chains.map(toChainId).filter((chain) => chain !== null),
    status: source.status,
    statusNote: source.attribution ? `${source.statusNote} ${source.attribution}.` : source.statusNote,
    envVars: source.envVars,
    lastCheckedAt: source.lastCheckedAt,
    enabled: source.enabled,
    lockedReason: source.lockedReason,
    offEffect: source.offEffect,
  };
}

export async function getAccountSettings(): Promise<AccountSettings> {
  const [profile, preferences, sources, cases, reports, history] = await Promise.all([
    apiJson<ApiProfile>("/account/profile"),
    apiJson<ApiPreferences>("/account/preferences"),
    apiJson<{ sources: ApiDataSource[] }>("/account/data-sources"),
    apiJson<unknown[]>("/cases"),
    apiJson<unknown[]>("/reports"),
    apiJson<{ total: number }>("/investigations", { query: { limit: 1 } }),
  ]);
  return {
    profile: toUserProfile(profile),
    preferences: toPreferences(preferences),
    dataSources: sources.sources.map(toDataSource),
    storage: { cases: cases.length, reports: reports.length, history: history.total },
  };
}

/** Simpan nama lalu foto; foto dikirim multipart dan jenisnya diperiksa ulang di server dari isinya. */
export async function updateProfile(input: { displayName: string; avatar: AvatarChange }): Promise<UserProfile> {
  let profile = await apiJson<ApiProfile>("/account/profile", { method: "PATCH", body: { displayName: input.displayName.trim() } });
  if (input.avatar.kind === "replace") {
    const form = new FormData();
    form.append("avatar", input.avatar.file);
    profile = await apiJson<ApiProfile>("/account/avatar", { method: "PUT", body: form });
  } else if (input.avatar.kind === "remove") {
    profile = await apiJson<ApiProfile>("/account/avatar", { method: "DELETE" });
  }
  return toUserProfile(profile);
}

export async function updateDisplayPreferences(changes: Partial<DisplayPreferences>): Promise<DisplayPreferences> {
  const { defaultChainNote: _note, ...body } = changes;
  void _note;
  return toPreferences(await apiJson<ApiPreferences>("/account/preferences", { method: "PATCH", body }));
}

export async function setDataSourceEnabled(id: string, enabled: boolean): Promise<DataSourceSetting> {
  return toDataSource(await apiJson<ApiDataSource>(`/account/data-sources/${seg(id)}`, { method: "PATCH", body: { enabled } }));
}
