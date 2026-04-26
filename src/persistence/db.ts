import { openDB } from 'idb'

// ── Types ──

export const CATEGORY_KIND = { standard: 'standard', x2: 'x2', music: 'music' } as const
export type CategoryKind = (typeof CATEGORY_KIND)[keyof typeof CATEGORY_KIND]

export type Question = {
  q: string
  a: string
  img?: string
}

export type MusicQuestion = Question & {
  mp3: string
}

export type StandardCategory = {
  kind: typeof CATEGORY_KIND.standard
  name: string
  questions: Question[]
}

export type X2Category = {
  kind: typeof CATEGORY_KIND.x2
  name: string
  questions: Question[]
}

export type MusicCategory = {
  kind: typeof CATEGORY_KIND.music
  name: string
  questions: MusicQuestion[]
}

export type Category = StandardCategory | X2Category | MusicCategory

export type Team = {
  name: string
  score: number
}

export type AppData = {
  categories: Category[]
  teams: Team[]
  used: Record<string, boolean>
}

// ── Database ──

const DB_NAME = 'quizboard'
const DB_VERSION = 1
const STORE_NAME = 'app'
const DOC_KEY = 'current'

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore(STORE_NAME)
    }
  },
})

// ── Validation ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const VALID_KINDS = new Set<string>(Object.values(CATEGORY_KIND))

function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.categories) || !Array.isArray(value.teams) || !isRecord(value.used)) return false

  for (const cat of value.categories) {
    if (!isRecord(cat)) return false
    if (typeof cat.kind !== 'string' || !VALID_KINDS.has(cat.kind)) return false
    if (typeof cat.name !== 'string') return false
    if (!Array.isArray(cat.questions)) return false
    for (const q of cat.questions) {
      if (!isRecord(q)) return false
      if (typeof q.q !== 'string' || typeof q.a !== 'string') return false
    }
  }

  for (const team of value.teams) {
    if (!isRecord(team)) return false
    if (typeof team.name !== 'string' || typeof team.score !== 'number') return false
  }

  return true
}

// ── Persistence ──

export async function loadAppData(): Promise<AppData | undefined> {
  try {
    const db = await dbPromise
    const raw: unknown = await db.get(STORE_NAME, DOC_KEY)
    if (!raw) return undefined
    if (!isAppData(raw)) return undefined
    return raw
  } catch {
    return undefined
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  try {
    const db = await dbPromise
    await db.put(STORE_NAME, data, DOC_KEY)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      showPersistenceError('Storage full — changes may not be saved.')
    } else {
      showPersistenceError('Failed to save — changes may be lost on refresh.')
    }
  }
}

// ── Error Toast ──

const TOAST_ID = 'persistence-toast'

function showPersistenceError(message: string): void {
  let toast = document.getElementById(TOAST_ID)
  if (!toast) {
    toast = document.createElement('div')
    toast.id = TOAST_ID
    toast.className = 'persistence-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.add('visible')

  setTimeout(() => {
    toast?.classList.remove('visible')
    setTimeout(() => toast?.remove(), 300)
  }, 5000)
}
