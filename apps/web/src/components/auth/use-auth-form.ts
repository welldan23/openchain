"use client";

import { useRef, useState, useTransition } from "react";
import { firstErrorField, type FieldErrors } from "@/lib/auth";

/**
 * Status bersama form akun: nilai kolom, galat per kolom (dicek ulang saat
 * mengetik setelah pernah dikirim), fokus ke kolom salah pertama, dan galat
 * dari layanan.
 */
export function useAuthForm<F extends string>(order: readonly F[], initial: Record<F, string>, validate: (values: Record<F, string>) => FieldErrors<F>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<F>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refs = useRef<Partial<Record<F, HTMLInputElement | null>>>({});

  function set(field: F, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
  }

  /** Validasi lalu jalankan `action`; galat kolom difokuskan, galat layanan ditampilkan di atas form. */
  function submit(action: (values: Record<F, string>) => Promise<void>) {
    setSubmitted(true);
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    const first = firstErrorField(found, order);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    startTransition(async () => {
      try {
        await action(values);
      } catch (cause) {
        setFormError(cause instanceof Error ? cause.message : "Permintaan gagal. Coba lagi.");
      }
    });
  }

  const bind = (field: F) => ({
    ref: (element: HTMLInputElement | null) => {
      refs.current[field] = element;
    },
    value: values[field],
    error: errors[field],
    disabled: pending,
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
  });

  return { values, errors, formError, pending, submit, bind };
}
