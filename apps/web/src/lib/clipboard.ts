/**
 * Salin teks ke clipboard.
 *
 * API Clipboard modern hanya tersedia di konteks aman (HTTPS atau localhost).
 * Saat halaman dibuka lewat HTTP biasa, mis. alamat IP jaringan lokal dari HP,
 * dipakai cara cadangan lewat textarea tersembunyi.
 *
 * @returns `true` bila berhasil disalin.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Lanjut ke cara cadangan, mis. bila izin clipboard ditolak.
    }
  }

  return copyWithTextarea(text);
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    // execCommand sudah usang, tapi masih satu-satunya cara di konteks tidak aman.
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  return copied;
}
