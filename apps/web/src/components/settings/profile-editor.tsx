"use client";

import { ImageUp, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { AuthField } from "@/components/auth/auth-field";
import { updateProfile } from "@/lib/api/settings";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { AVATAR_TYPES, validateAvatarFile, validateDisplayName, type AvatarChange } from "@/lib/profile";
import { renameSession } from "@/lib/session-store";
import type { UserProfile } from "@/lib/types";
import { ProfileAvatar } from "./profile-avatar";

const BUTTON = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

/**
 * Profil pengguna dengan mode ubah: nama tampilan dan foto. Foto hanya
 * dibaca di browser untuk pratinjau dan tidak diunggah (simulasi).
 */
export function ProfileEditor({ initial }: { initial: UserProfile }) {
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.displayName);
  const [avatar, setAvatar] = useState<AvatarChange>({ kind: "keep" });
  const [preview, setPreview] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, startSaving] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const fileId = useId();

  // URL pratinjau dilepas saat diganti atau komponen ditutup supaya memori tidak bocor.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (editing) nameRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const shownAvatar = avatar.kind === "replace" ? preview : avatar.kind === "remove" ? null : profile.avatarUrl;

  function startEditing() {
    setName(profile.displayName);
    setAvatar({ kind: "keep" });
    setPreview(null);
    setNameError(null);
    setFileError(null);
    setFormError(null);
    setStatus("");
    setEditing(true);
  }

  function stopEditing() {
    setPreview(null);
    restoreFocus.current = true;
    setEditing(false);
  }

  function chooseFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const error = validateAvatarFile(file);
    setFileError(error);
    if (error) return;
    setAvatar({ kind: "replace", file });
    setPreview(URL.createObjectURL(file));
  }

  function save() {
    const error = validateDisplayName(name);
    setNameError(error);
    if (error) {
      nameRef.current?.focus();
      return;
    }
    setFormError(null);
    startSaving(async () => {
      try {
        const saved = await updateProfile(profile, { displayName: name, avatar });
        if (profile.avatarUrl && saved.avatarUrl !== profile.avatarUrl) URL.revokeObjectURL(profile.avatarUrl);
        setProfile(saved);
        renameSession(saved.displayName);
        setStatus("Profil disimpan.");
        stopEditing();
      } catch (cause) {
        setFormError(cause instanceof Error ? cause.message : "Profil gagal disimpan.");
      }
    });
  }

  const rows = [
    { label: "Email", value: profile.email },
    { label: "Zona waktu", value: profile.timezone },
    { label: "Bergabung", value: formatDate(profile.joinedAt) },
  ];

  return (
    <div>
      <p role="status" aria-live="polite" className={status ? "mb-3 text-xs text-emerald-300" : "sr-only"}>
        {status}
      </p>
      {editing ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          {formError ? <FormAlert>{formError}</FormAlert> : null}
          <div className="flex flex-wrap items-center gap-4">
            <ProfileAvatar name={name.trim() || profile.displayName} url={shownAvatar} />
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  id={fileId}
                  type="file"
                  accept={AVATAR_TYPES.join(",")}
                  className="sr-only"
                  disabled={saving}
                  aria-describedby={`${fileId}-petunjuk${fileError ? ` ${fileId}-galat` : ""}`}
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                <label
                  htmlFor={fileId}
                  className={cn(BUTTON, "cursor-pointer bg-surface-raised text-foreground ring-line hover:ring-accent/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent")}
                >
                  <ImageUp className="size-3.5" aria-hidden />
                  {shownAvatar ? "Ganti foto" : "Pilih foto"}
                </label>
                {shownAvatar ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setAvatar({ kind: "remove" });
                      setPreview(null);
                      setFileError(null);
                    }}
                    className={cn(BUTTON, "text-rose-200 ring-rose-400/30 hover:bg-rose-500/10")}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Hapus foto
                  </button>
                ) : null}
              </div>
              <p id={`${fileId}-petunjuk`} className="text-[11px] text-muted">
                PNG, JPG, atau WebP, maksimal 2 MB. Simulasi: foto hanya dipratinjau di browser ini, tidak diunggah.
              </p>
              {fileError ? (
                <p id={`${fileId}-galat`} className="text-xs text-rose-300">
                  {fileError}
                </p>
              ) : null}
            </div>
          </div>
          <AuthField
            ref={nameRef}
            id="profil-nama"
            label="Nama tampilan"
            autoComplete="name"
            value={name}
            disabled={saving}
            error={nameError ?? undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(validateDisplayName(event.target.value));
            }}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={stopEditing} disabled={saving} className={cn(BUTTON, "text-muted ring-transparent hover:text-foreground")}>
              Batal
            </button>
            <button type="submit" disabled={saving} className={cn(BUTTON, "bg-accent text-background ring-accent hover:bg-accent/90")}>
              {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
              {saving ? "Menyimpan…" : "Simpan profil"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ProfileAvatar name={profile.displayName} url={profile.avatarUrl} />
          <dl className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted">Nama tampilan</dt>
              <dd className="mt-0.5 truncate text-sm text-foreground">{profile.displayName}</dd>
            </div>
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd className="mt-0.5 truncate text-sm text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end">
            <button ref={editRef} type="button" onClick={startEditing} className={cn(BUTTON, "bg-surface-raised text-foreground ring-line hover:ring-accent/50")}>
              <Pencil className="size-3.5" aria-hidden />
              Ubah profil
            </button>
            <Link href="/masuk" className="text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
              Ganti akun
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
