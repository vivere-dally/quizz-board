export function cloneTemplate(id: string): HTMLElement {
  const tmpl = document.getElementById(id);
  if (!(tmpl instanceof HTMLTemplateElement))
    throw new Error(`unreachable: template #${id} missing`);
  const el = tmpl.content.firstElementChild;
  if (!el) throw new Error(`unreachable: template #${id} empty`);
  return el.cloneNode(true) as HTMLElement;
}

export function clearRecord(rec: Record<string, string>): void {
  for (const k of Object.keys(rec)) delete rec[k];
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`unreachable: #${id} missing`);
  return el;
}
