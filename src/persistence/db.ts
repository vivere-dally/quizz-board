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

export const PLAY_STYLE = { classic: 'classic', streak: 'streak' } as const
export type PlayStyle = (typeof PLAY_STYLE)[keyof typeof PLAY_STYLE]

export const QUESTION_TYPE = {
  open: 'open',
  multipleChoice: 'multiple-choice',
  trueFalse: 'true-false',
  ordering: 'ordering',
  numeric: 'numeric',
  multiPartMedia: 'multi-part-media',
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
  ffa?: boolean
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

export type OrderingItem = {
  label: string
  media?: QuestionMedia
}

export type OrderingQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.ordering
  items: OrderingItem[]
}

export type NumericQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.numeric
  correctValue: number
  unit?: string
}

export type MultiPartMediaPart = {
  media: QuestionMedia
  answer: string
}

export type MultiPartMediaQuestion = QuestionBase & {
  type: typeof QUESTION_TYPE.multiPartMedia
  parts: MultiPartMediaPart[]
}

export type Question =
  | OpenQuestion
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | OrderingQuestion
  | NumericQuestion
  | MultiPartMediaQuestion

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
      return q.items.map((item, i) => item.label || `#${i + 1}`).join(' → ')
    case QUESTION_TYPE.numeric:
      return q.unit ? `${q.correctValue} ${q.unit}` : String(q.correctValue)
    case QUESTION_TYPE.multiPartMedia:
      return q.parts.map((p, i) => `${i + 1}. ${p.answer}`).join(' | ')
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
  steal?: boolean
  points: number[]
  questions: Question[]
}

export type Team = {
  name: string
  score: number
  streak: number
}

export type QuizId = string & { readonly __brand: 'QuizId' }

export type Quiz = {
  id: QuizId
  name: string
  updatedAt: number
  mode: AppMode
  playStyle: PlayStyle
  categories: Category[]
  teams: Team[]
  used: Record<string, boolean>
  currentTurnIndex: number
}

export type QuizMeta = {
  id: QuizId
  name: string
  updatedAt: number
  questionCount: number
}

export const DEFAULT_QUIZ_NAME = 'My quiz'

export function newQuizId(): QuizId {
  // cast applies the brand at the only place ids are minted
  return crypto.randomUUID() as QuizId
}

export function createQuiz(name: string): Quiz {
  return {
    id: newQuizId(),
    name,
    updatedAt: Date.now(),
    mode: APP_MODE.edit,
    playStyle: PLAY_STYLE.classic,
    categories: [],
    teams: [],
    used: {},
    currentTurnIndex: 0,
  }
}

// ── Database ──

const DB_NAME = 'quizboard'
const DB_VERSION = 5
const META_STORE = 'app'
const QUIZ_STORE = 'quizzes'
const ACTIVE_QUIZ_KEY = 'activeQuizId'
const LEGACY_DOC_KEY = 'current'

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    // versions 2-4 changed data shapes only (handled at read time), never the schema
    if (oldVersion < 1) {
      db.createObjectStore(META_STORE)
    }
    if (oldVersion < 5) {
      db.createObjectStore(QUIZ_STORE, { keyPath: 'id' })
      // Wrap the legacy single-document record into the first Quiz. Purely
      // structural — content validation stays at read time (parseQuiz), so a
      // corrupt legacy record degrades exactly as it did before: fresh seed.
      const meta = tx.objectStore(META_STORE)
      const legacy: unknown = await meta.get(LEGACY_DOC_KEY)
      if (isRecord(legacy)) {
        const id = newQuizId()
        await tx.objectStore(QUIZ_STORE).put({ ...legacy, id, name: DEFAULT_QUIZ_NAME, updatedAt: Date.now() })
        await meta.put(id, ACTIVE_QUIZ_KEY)
      }
      await meta.delete(LEGACY_DOC_KEY)
    }
  },
})

// ── Validation ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const VALID_COLORS = new Set<string>(Object.values(CATEGORY_COLOR))
const VALID_MODES = new Set<string>(Object.values(APP_MODE))
const VALID_PLAY_STYLES = new Set<string>(Object.values(PLAY_STYLE))
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
  if ('ffa' in q && q.ffa !== undefined && typeof q.ffa !== 'boolean') return false

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
        && q.items.every((item: unknown) =>
          typeof item === 'string'
          || (isRecord(item) && typeof item.label === 'string'
            && (!('media' in item) || item.media === undefined || isValidMedia(item.media)))
        )
    case QUESTION_TYPE.numeric:
      return typeof q.correctValue === 'number'
    case QUESTION_TYPE.multiPartMedia:
      return Array.isArray(q.parts) && q.parts.length >= 1
        && q.parts.every((p: unknown) => isRecord(p) && typeof p.answer === 'string' && isValidMedia(p.media))
    default:
      return false
  }
}

function normalizeQuiz(value: unknown): void {
  if (!isRecord(value)) return

  if (typeof value.currentTurnIndex !== 'number') value.currentTurnIndex = 0
  if (typeof value.playStyle !== 'string' || !VALID_PLAY_STYLES.has(value.playStyle)) value.playStyle = PLAY_STYLE.classic

  if (Array.isArray(value.teams)) {
    for (const team of value.teams) {
      if (isRecord(team) && typeof team.streak !== 'number') team.streak = 0
    }
  }

  if (!Array.isArray(value.categories)) return
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
      if (q.type === QUESTION_TYPE.ordering && Array.isArray(q.items)) {
        q.items = q.items.map((item: unknown) => typeof item === 'string' ? { label: item } : item)
      }
    }
  }
}

function isQuiz(value: unknown): value is Quiz {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.updatedAt !== 'number') return false
  if (typeof value.mode !== 'string' || !VALID_MODES.has(value.mode)) return false
  if (typeof value.playStyle !== 'string' || !VALID_PLAY_STYLES.has(value.playStyle)) return false
  if (!Array.isArray(value.categories) || !Array.isArray(value.teams) || !isRecord(value.used) || typeof value.currentTurnIndex !== 'number') return false

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
    if (typeof team.name !== 'string' || typeof team.score !== 'number' || typeof team.streak !== 'number') return false
  }

  return true
}

function parseQuiz(raw: unknown): Quiz | undefined {
  normalizeQuiz(raw)
  return isQuiz(raw) ? raw : undefined
}

// ── Persistence ──

export async function listQuizzes(): Promise<QuizMeta[]> {
  try {
    const db = await dbPromise
    // TODO(perf): getAll deserializes full quizzes (incl. base64 images) just to list names
    const raws: unknown[] = await db.getAll(QUIZ_STORE)
    const metas: QuizMeta[] = []
    for (const raw of raws) {
      const quiz = parseQuiz(raw)
      if (!quiz) continue
      const questionCount = quiz.categories.reduce((sum, cat) => sum + cat.questions.length, 0)
      metas.push({ id: quiz.id, name: quiz.name, updatedAt: quiz.updatedAt, questionCount })
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt)
    return metas
  } catch {
    return []
  }
}

export async function loadQuiz(id: QuizId): Promise<Quiz | undefined> {
  try {
    const db = await dbPromise
    return parseQuiz(await db.get(QUIZ_STORE, id))
  } catch {
    return undefined
  }
}

export async function saveQuiz(quiz: Quiz): Promise<void> {
  try {
    const db = await dbPromise
    await db.put(QUIZ_STORE, quiz)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      showPersistenceError('Storage full — changes may not be saved.')
    } else {
      showPersistenceError('Failed to save — changes may be lost on refresh.')
    }
  }
}

export async function deleteQuiz(id: QuizId): Promise<void> {
  try {
    const db = await dbPromise
    await db.delete(QUIZ_STORE, id)
  } catch {
    showPersistenceError('Failed to delete — changes may be lost on refresh.')
  }
}

export async function getActiveQuizId(): Promise<QuizId | undefined> {
  try {
    const db = await dbPromise
    const raw: unknown = await db.get(META_STORE, ACTIVE_QUIZ_KEY)
    // brand applied at the storage boundary
    return typeof raw === 'string' ? (raw as QuizId) : undefined
  } catch {
    return undefined
  }
}

export async function setActiveQuizId(id: QuizId): Promise<void> {
  try {
    const db = await dbPromise
    await db.put(META_STORE, id, ACTIVE_QUIZ_KEY)
  } catch {
    showPersistenceError('Failed to save — changes may be lost on refresh.')
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
