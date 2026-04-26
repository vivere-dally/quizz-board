import { openDB } from 'idb'

// ── Types ──

export const CATEGORY_COLOR = {
  blue: 'blue',
  orange: 'orange',
  purple: 'purple',
  green: 'green',
  red: 'red',
  teal: 'teal',
  pink: 'pink',
  yellow: 'yellow',
} as const
export type CategoryColor = (typeof CATEGORY_COLOR)[keyof typeof CATEGORY_COLOR]

export const APP_MODE = { edit: 'edit', play: 'play' } as const
export type AppMode = (typeof APP_MODE)[keyof typeof APP_MODE]

export const QUESTION_TYPE = {
  open: 'open',
  multipleChoice: 'multiple-choice',
  trueFalse: 'true-false',
  ordering: 'ordering',
  numeric: 'numeric',
} as const
export type QuestionType = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE]

export const MEDIA_TYPE = { image: 'image', youtube: 'youtube' } as const
export type MediaType = (typeof MEDIA_TYPE)[keyof typeof MEDIA_TYPE]

export type ImageMedia = { type: typeof MEDIA_TYPE.image; src: string }
export type YoutubeMedia = { type: typeof MEDIA_TYPE.youtube; videoId: string; startSeconds?: number; endSeconds?: number }
export type QuestionMedia = ImageMedia | YoutubeMedia

type QuestionBase = {
  q: string
  media?: QuestionMedia
  x2?: boolean
}

export type OpenQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.open
  a: string
}

export type MultipleChoiceQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.multipleChoice
  options: string[]
  correctIndex: number
}

export type TrueFalseQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.trueFalse
  correctAnswer: boolean
}

export type OrderingQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.ordering
  items: string[]
}

export type NumericQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.numeric
  correctValue: number
  unit?: string
}

export type Question =
  | OpenQuestion
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | OrderingQuestion
  | NumericQuestion

export const DEFAULT_QUESTION_TEXT = 'Write your question'
export const DEFAULT_ANSWER_TEXT = 'Write your answer'

export function defaultQuestion(): OpenQuestion {
  return { type: QUESTION_TYPE.open, q: DEFAULT_QUESTION_TEXT, a: DEFAULT_ANSWER_TEXT }
}

export function answerDisplayText(q: Question): string {
  switch (q.type) {
    case QUESTION_TYPE.open:
      return q.a
    case QUESTION_TYPE.multipleChoice: {
      const opt = q.options[q.correctIndex]
      return opt ?? ''
    }
    case QUESTION_TYPE.trueFalse:
      return q.correctAnswer ? 'True' : 'False'
    case QUESTION_TYPE.ordering:
      return q.items.join(' → ')
    case QUESTION_TYPE.numeric:
      return q.unit ? `${q.correctValue} ${q.unit}` : String(q.correctValue)
    default: {
      const _exhaustive: never = q
      throw new Error(`unreachable: unknown question type ${(_exhaustive as Question).type}`)
    }
  }
}

export type Category = {
  id: string
  name: string
  color: CategoryColor
  points: number[]
  questions: Question[]
}

export type Team = {
  name: string
  score: number
}

export type AppData = {
  mode: AppMode
  categories: Category[]
  teams: Team[]
  used: Record<string, boolean>
}

// ── Database ──

const DB_NAME = 'quizboard'
const DB_VERSION = 3
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

const VALID_COLORS = new Set<string>(Object.values(CATEGORY_COLOR))
const VALID_MODES = new Set<string>(Object.values(APP_MODE))
const VALID_QUESTION_TYPES = new Set<string>(Object.values(QUESTION_TYPE))

function isValidMedia(m: unknown): boolean {
  if (!isRecord(m)) return false
  switch (m.type) {
    case MEDIA_TYPE.image:
      return typeof m.src === 'string' && m.src.length > 0
    case MEDIA_TYPE.youtube:
      return typeof m.videoId === 'string' && m.videoId.length > 0
        && (m.startSeconds === undefined || typeof m.startSeconds === 'number')
        && (m.endSeconds === undefined || typeof m.endSeconds === 'number')
    default:
      return false
  }
}

function isValidQuestion(q: unknown): boolean {
  if (!isRecord(q)) return false
  if (typeof q.q !== 'string') return false
  if ('media' in q && q.media !== undefined && !isValidMedia(q.media)) return false
  if ('x2' in q && q.x2 !== undefined && typeof q.x2 !== 'boolean') return false

  switch (q.type) {
    case QUESTION_TYPE.open:
      return typeof q.a === 'string'
    case QUESTION_TYPE.multipleChoice:
      return Array.isArray(q.options)
        && q.options.length >= 2
        && q.options.every((o: unknown) => typeof o === 'string')
        && typeof q.correctIndex === 'number'
        && q.correctIndex >= 0
        && q.correctIndex < q.options.length
    case QUESTION_TYPE.trueFalse:
      return typeof q.correctAnswer === 'boolean'
    case QUESTION_TYPE.ordering:
      return Array.isArray(q.items)
        && q.items.length >= 2
        && q.items.every((i: unknown) => typeof i === 'string')
    case QUESTION_TYPE.numeric:
      return typeof q.correctValue === 'number'
    default:
      return false
  }
}

function normalizeAppData(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.categories)) return
  for (const cat of value.categories) {
    if (!isRecord(cat) || !Array.isArray(cat.questions)) continue
    for (const q of cat.questions) {
      if (!isRecord(q)) continue
      if (!('type' in q) || !VALID_QUESTION_TYPES.has(q.type as string)) {
        q.type = QUESTION_TYPE.open
      }
      if ('img' in q && typeof q.img === 'string' && q.img && !('media' in q)) {
        q.media = { type: MEDIA_TYPE.image, src: q.img }
      }
      delete q.img
      delete q.audio
    }
  }
}

function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false
  if (typeof value.mode !== 'string' || !VALID_MODES.has(value.mode)) return false
  if (!Array.isArray(value.categories) || !Array.isArray(value.teams) || !isRecord(value.used)) return false

  for (const cat of value.categories) {
    if (!isRecord(cat)) return false
    if (typeof cat.id !== 'string') return false
    if (typeof cat.name !== 'string') return false
    if (typeof cat.color !== 'string' || !VALID_COLORS.has(cat.color)) return false
    if (!Array.isArray(cat.points) || !Array.isArray(cat.questions)) return false
    for (const q of cat.questions) {
      if (!isValidQuestion(q)) return false
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
    normalizeAppData(raw)
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
