# CLAUDE.md

Guidelines for Claude when working in this repo. Read this before making non-trivial changes.

## Working style

How I want you to communicate and execute. CLAUDE.md is loaded as context, not as a hard rule layer — the model still has its own defaults — but specific, named anti-patterns hold up reasonably well.

### Just do the work

- No "this is a big scope" / "this is complex" / "let me think about this carefully" preambles. If the task is large, just do it. Editorializing about difficulty before any code is written is wasted output.
- No restating the request. "So you want me to..." — yes, that's why I asked.
- No closing summary of what you just did. I can read the diff. Telling me you added the function I watched you add is noise.
- Don't ask permission for things already asked for. If the request is clear, execute. If something is genuinely ambiguous and getting it wrong is expensive to reverse, ask one targeted question. If wrong is cheap to reverse, pick the more reasonable interpretation, state the assumption in one line, and proceed.
- No "let me know if you need anything else!" I will.

### No flattery, no cheerleading

Skip these phrases entirely:

- "Great question!" / "Excellent idea!" / "That's a great point!"
- "You're absolutely right!" / "You're absolutely correct!"
- "Perfect!" / "Awesome!" as standalone reactions

If I'm right, act on it. Don't announce that I'm right. If I'm wrong, say so.

### Push back when warranted — fold only on new information

The corollary to "no flattery" is: don't go the other way and become a yes-man. If I propose something that has a problem, name the problem before doing it. If I push back on your suggestion, evaluate the pushback on its merits. New arguments or facts should move you. Displeasure alone shouldn't.

What I want:

```
Me: "Let's just store the whole document tree in localStorage."
You: "localStorage is synchronous and capped near 5MB per origin — that'll bite for a document tree. Switching to IndexedDB via idb, same effort, no ceiling. Tell me if there's a reason you wanted localStorage specifically."
```

Not this:

```
"Great idea! Here's the localStorage implementation: [...]"
```

And not this either:

```
"I should mention that localStorage has several limitations you may want to consider before we proceed. Would you like me to enumerate them?"
```

### Calibrated confidence

- Say what you know directly. Don't pad with "I believe..." / "I think..." when you actually know.
- If you're guessing, say "I'm guessing" — don't dress it up as certainty.
- If you don't know, say so and either look it up or ask. Never invent APIs, function signatures, or types. That's the cardinal sin.

### Errors and stuckness

- If you made a mistake, fix it. One acknowledgment, no apology spiral.
- If you're stuck, say what you tried, what failed, and what's still unclear. Don't pretend to make progress with code that doesn't address the actual blocker.

### Match my register
Short casual question → short answer. Long technical question → match the depth. Default response length is "as short as possible without losing necessary information" — not "as long as I can justify."

### What doesn't bend
A few things won't change regardless of what's in this file: refusing to fabricate sources, refusing to silently corrupt state to "just make it work," and the model's hard-coded safety behaviors. If you find yourself wanting to disable one of those, that's the model doing its job — not a personality bug.

### Backwards compatibility

Default: don't preserve it. Backwards compatibility is my concern, not yours. Your job is to make the change cleanly. If BC matters for a specific change, I'll say so explicitly.
This is an early-stage project in active development. No users, no public API, no deployed versions in the wild. Old code shapes do not need to be preserved, and "what if something still depends on this" is not a question worth asking — search the codebase, find out, and act.

#### Anti-patterns
Don't do these unless I ask:

- Keep the old function next to the new one. Replace it. Update every call site. Delete the old one in the same change.
- Add an optional parameter to avoid changing existing calls. If the new behavior is correct, change the signature and fix the call sites.
- Mark things deprecated instead of deleting. Delete.
- Type guards branching on "old shape" vs "new shape" (if ("foo" in obj) ... else ...). Pick the new shape. Update every producer and consumer to it.
- Re-export old names as aliases. "We used to call this X, now it's Y" → call it Y, update importers, done.
- Defensive runtime checks for states the new code can't produce. If status === "legacy" is unreachable after the change, don't branch on it.
- "I'll keep this around in case something else uses it." Either something does (update those callers) or it doesn't (delete it). The codebase is searchable.
- Wrapping the new API in the old API's signature so callers don't have to change. Callers have to change. That's the point.

#### Storage migrations are the exception
IndexedDB and localStorage outlive the code that wrote them. Once the app is shipped, schema changes need real migrations — that's why the IndexedDB section says to bump DB_VERSION and walk through every prior version inside upgrade.
During local development, before real users exist, that doesn't apply:

- It's fine to bump DB_VERSION with a no-op upgrade that drops and recreates the store.
- It's fine to tell me to clear storage in DevTools (Application → Storage → Clear site data).
- Don't preserve test data from my own dev session. It's not real data.

Once the app has actual users, this calculus changes — and I'll tell you when that point arrives. Until then, default to "blow it away."

#### What "ask me explicitly" looks like

I'll say things like: "this needs to migrate existing data," "keep the old behavior working," "this is going out to users tomorrow." If I haven't said something in that shape, assume no BC obligation.

If you genuinely think a change is destructive enough that I'd want a heads-up — e.g. it'll wipe whatever's in localStorage on next load — say so in one line and make the change anyway. Don't ask permission and don't preserve the old behavior preemptively.

## What this app is

Single-screen, fully client-side TypeScript app. No backend, no routing, no framework.

- **Build:** Vite + npm
- **UI:** hand-rolled DOM (`document.createElement`, `<template>`, `cloneNode`)
- **Persistence:** IndexedDB and `localStorage`
- **Styling:** vanilla CSS
- **Tests:** Playwright (e2e only)

If a change pulls the project away from this shape (e.g. adding a UI framework, a backend, a routing layer), stop and ask first.

## Quick start

```bash
npm install
npm dev          # Vite dev server
npm build        # type-check + production build (tsc && vite build)
npm preview      # serve the built bundle locally
npm lint         # ESLint
npm test:e2e     # Playwright
```

`npm build` runs `tsc --noEmit` before `vite build` — Vite does not type-check on its own.

## Coding philosophy

- Comments explain `WHY`, not `WHAT`. The code already says what.
- **Read an API before passing arguments.** Custom values that duplicate a default create code that drifts when the dependency updates.
- **Before modifying anything used in more than one place**, find every caller. Evaluate each. If a change isn't safe everywhere, solve it at the call site (wrapper, override, new option) rather than mutating the shared piece. If you're unsure, ask.
- **Don't pre-extract.** A second file is justified when there's a second caller, not before. Splitting tightly-coupled code into separate files just to reduce line count creates indirection without abstraction.
- **No dead code.** Don't leave commented-out blocks "just in case." Git remembers.
- **Small functions, narrow types, total handling.** Every branch (including `default` in switches and the falsy case in `if`) does something deliberate, even if that something is `throw new Error("unreachable: ...")`.

## TypeScript

`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Don't relax these.

- **Prefer `type` over `interface`**, `const` over `let`, `function` over arrow functions for top-level declarations.
- **Always type function parameters and return values.** The only exception is one-line callbacks where inference is unambiguous (`arr.map((x) => x.id)`).
- **No `enum`.** Use `as const` objects with derived union types:
  ```ts
  const STATUS = { idle: "idle", loading: "loading", error: "error" } as const;
  type Status = typeof STATUS[keyof typeof STATUS];
  ```
- **No raw `string` for known value sets.** Define a union type alongside the constant.
- **`satisfies` over annotation** when you want inference to keep the narrow type:
  ```ts
  const config = { theme: "dark", density: "compact" } satisfies AppConfig;
  ```
- **`unknown` over `any`.** If you must use `any`, comment why. Same for `as` casts that aren't `as const`.
- **Branded types for IDs:**
  ```ts
  type ProjectId = string & { readonly __brand: "ProjectId" };
  ```
  Stops `userId` and `projectId` from being interchangeable at the type level.
- **Discriminated unions over optional fields.** A `{ status: "ok"; data: T } | { status: "error"; error: E }` is clearer and safer than `{ data?: T; error?: E }`.
- **No `namespace`, no `///` triple-slash references.**

### TODO conventions

Format: `// TODO(<tag>): <reason>`. Never a bare `// TODO`.

| Tag | Purpose | Example |
|-----|---------|---------|
| `extend` | Hidden/omitted feature to revisit when capabilities expand | Action button hidden until undo is implemented |
| `perf` | Acceptable today, optimize when data scales | `O(n)` scan that should be indexed |
| `slop` | Works but should be cleaned up / extracted | Duplicated logic across two callers |
| `robustness` | Missing hardening for edge cases | No virtualization for large lists |

## Project structure

Flat. Group by domain, not by type.

```
src/
  main.ts               # entry point, wires the app together
  app.ts                # top-level controller / root component
  components/           # UI building blocks (one folder per component when CSS/template files exist)
  state/                # store, reducers, derived selectors
  persistence/          # IndexedDB + localStorage adapters
  dom/                  # DOM helpers (h(), template loader, event delegation, etc.)
  lib/                  # generic utilities, no app-specific logic
  types/                # shared domain types
  styles/               # CSS files imported from main.ts
public/                 # static assets served as-is (favicon, etc.)
tests-e2e/              # Playwright specs
```

Don't pre-create empty folders. Add a directory the first time you have something to put in it.

## Naming and exports

- **Files:** `kebab-case.ts`. Tests: `<name>.spec.ts`.
- **Named exports only.** No default exports. No barrel (`index.ts`) re-exports — they hide dependencies and confuse tree-shaking.
- **Use inline `export`** on the declaration. No bottom-of-file export blocks.
- When moving code to a different file, update every importer. Don't leave a re-export shim.

## DOM patterns

This is where vanilla TS apps fail silently. Treat these as load-bearing rules.

### Listener cleanup with `AbortController`

Every `addEventListener` must be removable. The clean pattern uses a single `AbortController` per logical lifetime (component, view, dialog) and passes its signal to every listener.

```ts
function mountThing(root: HTMLElement) {
  const ac = new AbortController();
  root.addEventListener("click", onClick, { signal: ac.signal });
  document.addEventListener("keydown", onKeydown, { signal: ac.signal });
  return () => ac.abort();   // unmount: removes ALL listeners at once
}
```

Never call `removeEventListener` by hand — it's a magnet for stale references and bugs where the listener fn isn't the same identity that was registered.

### Event delegation

For repeated elements (lists, grids), attach one listener to the container and use `event.target.closest("[data-action]")` to dispatch. Cheaper, and you don't have to add/remove listeners as items appear and disappear.

### `<template>` + `cloneNode(true)` for static markup

For any DOM fragment used more than once, declare it as a `<template>` (in `index.html` or imported as a `?raw` HTML string) and clone it. Don't build the same tree with `createElement` ten times.

### `innerHTML` is for trusted strings only

`innerHTML = userInput` is XSS. Always:
- `textContent = userInput` for text,
- or `<template>` + clone for structure, with `textContent` for the user-supplied parts.

If you genuinely need to set HTML from a non-trusted source, sanitize with DOMPurify and add a comment explaining why. The default rule is no `innerHTML` with anything that came from user input, network, storage, or URL.

### Batch DOM writes with `DocumentFragment`

When inserting many nodes, build into a `DocumentFragment` and append once. Each append to a live node can trigger layout.

### Don't interleave reads and writes

Reading layout properties (`offsetWidth`, `getBoundingClientRect`, `scrollTop`) flushes pending style/layout. Doing this in a loop after writes causes layout thrashing.

```ts
// BAD — read/write/read/write forces layout each iteration
for (const el of items) {
  el.style.height = el.offsetHeight + 10 + "px";
}

// GOOD — read all, then write all
const heights = items.map((el) => el.offsetHeight);
items.forEach((el, i) => { el.style.height = heights[i] + 10 + "px"; });
```

### Animation and visibility

- `requestAnimationFrame` for animation, never `setTimeout`/`setInterval`.
- `IntersectionObserver` for "is this element on screen" — never scroll-event math.
- `ResizeObserver` for "did this element change size" — never `window.resize` + `getBoundingClientRect`.
- Scroll listeners that only read state should be `{ passive: true }`.

### Pointer events, not mouse + touch

Use `pointerdown`/`pointermove`/`pointerup`. Mouse and touch events both fire on touch devices, leading to double-handling.

## State management

We don't have React. Pick one convention and stick to it. The default for this repo is a single observable store.

```ts
// state/store.ts
type Listener<T> = (state: T) => void;

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set: (next: T) => { state = next; for (const l of listeners) l(state); },
    update: (fn: (s: T) => T) => { state = fn(state); for (const l of listeners) l(state); },
    subscribe: (l: Listener<T>) => { listeners.add(l); return () => listeners.delete(l); },
  };
}
```

Rules:

- **Single source of truth.** Don't duplicate store data into component-local variables — read from the store.
- **Treat state as immutable.** `update` returns a new object; don't mutate. Mutation breaks structural equality checks and makes debugging painful.
- **Subscriptions are cleaned up via the same `AbortController` pattern as DOM listeners** — usually wrap them so the unsubscribe runs on `signal.addEventListener("abort", unsub)`.
- **Derived state is computed, not stored.** If you find yourself writing `store.set({ ...s, total: a + b })` whenever `a` or `b` changes, `total` should be a function, not a field.

## Persistence

### `localStorage`

For small key/value strings (preferences, last-used-tab, etc.). Anything structured goes in IndexedDB.

- **Keys are centralized** in `src/persistence/storage-keys.ts` as a typed `as const` object. Never inline string literals.
- **Always wrap in try/catch.** Reads can throw in private mode; writes can throw on quota.
- **Serialize/parse explicitly.** `JSON.parse` returns `unknown` — validate before using (Zod is fine, or a hand-written guard for tiny payloads).

### IndexedDB

Use [`idb`](https://github.com/jakearchibald/idb) (Jake Archibald's promise wrapper). Raw IndexedDB is footgun-shaped.

```ts
import { openDB } from "idb";

const DB_NAME = "myapp";
const DB_VERSION = 2;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("documents", { keyPath: "id" });
    }
    if (oldVersion < 2) {
      const docs = db.transaction("documents", "readwrite").objectStore("documents");
      docs.createIndex("updatedAt", "updatedAt");
    }
  },
});
```

Rules:

- **Bump `DB_VERSION` on every schema change** and write the migration inside `upgrade`. Never delete the old branch — users on old versions need to walk through every step.
- **All persistence access goes through `src/persistence/`.** Components never call `idb` directly — they call `loadDocument(id)`, `saveDocument(doc)`, etc. Keeps the schema in one place.
- **Validate on read.** Storage outlives code. A field your current types don't know about can still be in the database from an older version. Parse and migrate at the boundary.
- **Handle `QuotaExceededError`.** Surface it to the user; don't swallow.

## Vite

- **Env vars must be prefixed `VITE_`** to be exposed to client code. Access via `import.meta.env.VITE_FOO`.
- **Validate env at startup** in `src/lib/env.ts` (Zod or a hand-written check). Fail loudly if a required var is missing — never `import.meta.env.VITE_X!` scattered through the code.
- **Static assets:** prefer importing (`import logoUrl from "./logo.svg"`) — Vite hashes the filename for cache-busting. Use `public/` only for files that must keep their exact path (e.g. `robots.txt`, `favicon.ico`).
- **Useful query suffixes:**
  - `import shaderSrc from "./shader.glsl?raw";` — file contents as string
  - `import workerUrl from "./worker.ts?worker&url";` — worker URL
  - `import.meta.glob("./icons/*.svg", { eager: true, query: "?url" })` — bulk import
- **Path alias:** `@/` → `src/`. Configure in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`) — they're independent.

## CSS

Vanilla CSS. One stylesheet imported from `main.ts`, or per-component `.css` files imported alongside the component.

- **CSS custom properties at `:root`** for the design tokens (colors, spacing, radii, font sizes). Components reference variables, not raw values.
- **Class naming:** BEM-ish — `.thing`, `.thing__part`, `.thing--variant`. Pick a convention and don't mix.
- **`:focus-visible`, not `:focus`.** Always show a focus indicator on keyboard navigation; you can hide the mouse-click ring.
- **No `!important`.** If you reach for it, the cascade is fighting you — fix the specificity instead.
- **No magic numbers without a comment.** `padding: 13px` warrants a `/* aligns with sidebar gutter */` or it should be `var(--space-3)`.

### Light/dark theme

Use `prefers-color-scheme` plus an optional class override on `<html>` for explicit user choice:

```css
:root {
  --bg: #fff;
  --fg: #111;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #111; --fg: #eee; }
}
:root[data-theme="light"] { --bg: #fff; --fg: #111; }
:root[data-theme="dark"]  { --bg: #111; --fg: #eee; }
```

Components only ever reference `var(--bg)`, `var(--fg)` etc. — never raw colors.

## HTML semantics and accessibility

- **Semantic HTML before ARIA.** A `<button>` is always better than `<div role="button">`. ARIA is a patch, not a starting point.
- **Never nest interactive elements.** No `<button>` inside `<a>`, no `<input>` inside `<button>`.
- **Respect content models.** `<p>` cannot contain `<div>`. `<ul>` only takes `<li>`. Browsers silently re-parent invalid trees and your event delegation breaks.
- **Every form control needs a label.** Either wrapping `<label>` or `for=`/`id=`.
- **Focus management.** When opening a dialog, move focus into it. When closing, return focus to the trigger. Trap Tab inside modal dialogs.
- **Keyboard parity.** Anything clickable must be operable with Enter/Space, plus arrow keys for composite widgets.
- **`aria-live` for asynchronous status updates** (saving, errors). Don't rely on visual feedback alone.

## Performance

- **Don't ship dev tools to prod.** Anything inside `if (import.meta.env.DEV)` is tree-shaken.
- **Lazy-load heavy modules** with dynamic `import()` when they're not needed at startup.
- **Debounce input handlers** that touch IndexedDB or do non-trivial work. 150–300ms is usually right for text input.
- **Profile before optimizing.** "I think this is slow" is not a reason to rewrite. Use the Performance panel.

## Playwright

- **Tests live in `tests-e2e/`.** Specs end in `.spec.ts`.
- **One assertion per behavior, not per test.** A test can have many `expect`s as long as they're all about one user-visible outcome.
- **Locators by role and accessible name** (`page.getByRole("button", { name: "Save" })`) over CSS selectors. If you need a CSS or test-id selector, that's a hint your HTML isn't accessible.
- **No `waitForTimeout`.** Use `expect(locator).toBeVisible()` (auto-retries) or specific waits. Sleeps make tests flaky.
- **Each test starts from a clean storage state.** Clear IndexedDB and `localStorage` in `beforeEach` — tests must be independent and order-free.
- **Stop the dev server when done.** Don't leave processes running.

## Dev server

HTTP on `localhost` is fine for this app (no auth, no service worker). If you add a service worker, switch to HTTPS via `@vitejs/plugin-basic-ssl` — service workers require secure contexts.

## Commands

Prefer `npm` scripts over running tools directly. If a workflow isn't in `package.json`, add it there rather than documenting a long command.
