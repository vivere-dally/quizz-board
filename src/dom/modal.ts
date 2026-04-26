import { $ } from "./helpers.ts";

const OVERLAY_IDS = [
  "q-overlay",
  "edit-overlay",
  "admin-overlay",
  "winner-overlay",
  "team-setup-overlay",
] as const;

export function openOverlay(id: string): void {
  $(id).style.display = "flex";
}

export function closeOverlay(id: string): void {
  $(id).style.display = "none";
}

export function setupModalDismiss(signal: AbortSignal): void {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        for (const id of OVERLAY_IDS) closeOverlay(id);
      }
    },
    { signal },
  );

  for (const id of OVERLAY_IDS) {
    $(id).addEventListener(
      "click",
      (e) => {
        if (e.target === e.currentTarget) closeOverlay(id);
      },
      { signal },
    );
  }
}
