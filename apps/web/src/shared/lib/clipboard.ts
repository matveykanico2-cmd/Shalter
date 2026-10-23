import { toast } from "../ui/toast-store";

/** Скопировать и сказать об этом; буфер недоступен — даём скопировать руками. */
export async function copyText(text: string, note = "Скопировано") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Скопируйте вручную:", text);
    return;
  }
  toast(note);
}
