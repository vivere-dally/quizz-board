import { openDB } from 'idb'
import { z } from 'zod'

// ── Scalar enums ──

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

export type QuizId = string & { readonly __brand: 'QuizId' }

// ── Schemas ──
//
// Zod is the single source of runtime validation; every domain type below is
// `z.infer`red from its schema so the shape and the validator can't drift.
// `z.object` strips unknown keys, which subsumes the old `delete q.img/audio`
// cleanup for free. Scalar unions and the branded `QuizId` stay hand-written:
// `z.enum(CONST)` re-derives the same literal union, and `z.custom<QuizId>`
// carries our brand rather than Zod's `.brand()` shape.

const imageMediaSchema = z.object({
  type: z.literal(MEDIA_TYPE.image),
  src: z.string().min(1),
})
export type ImageMedia = z.infer<typeof imageMediaSchema>

const youtubeMediaSchema = z.object({
  type: z.literal(MEDIA_TYPE.youtube),
  videoId: z.string().min(1),
  startSeconds: z.number().optional(),
  endSeconds: z.number().optional(),
})
export type YoutubeMedia = z.infer<typeof youtubeMediaSchema>

const questionMediaSchema = z.discriminatedUnion('type', [imageMediaSchema, youtubeMediaSchema])
export type QuestionMedia = z.infer<typeof questionMediaSchema>

const questionBaseFields = {
  q: z.string(),
  media: questionMediaSchema.optional(),
  x2: z.boolean().optional(),
  ffa: z.boolean().optional(),
}

const openQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.open),
  a: z.string(),
})
export type OpenQuestion = z.infer<typeof openQuestionSchema>

const multipleChoiceQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.multipleChoice),
  options: z.array(z.string()).min(2),
  correctIndex: z.number(),
})
export type MultipleChoiceQuestion = z.infer<typeof multipleChoiceQuestionSchema>

const trueFalseQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.trueFalse),
  correctAnswer: z.boolean(),
})
export type TrueFalseQuestion = z.infer<typeof trueFalseQuestionSchema>

const orderingItemSchema = z.object({
  label: z.string(),
  media: questionMediaSchema.optional(),
})
export type OrderingItem = z.infer<typeof orderingItemSchema>

const orderingQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.ordering),
  items: z.array(orderingItemSchema).min(2),
})
export type OrderingQuestion = z.infer<typeof orderingQuestionSchema>

const numericQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.numeric),
  correctValue: z.number(),
  unit: z.string().optional(),
})
export type NumericQuestion = z.infer<typeof numericQuestionSchema>

const multiPartMediaPartSchema = z.object({
  media: questionMediaSchema,
  answer: z.string(),
})
export type MultiPartMediaPart = z.infer<typeof multiPartMediaPartSchema>

const multiPartMediaQuestionSchema = z.object({
  ...questionBaseFields,
  type: z.literal(QUESTION_TYPE.multiPartMedia),
  parts: z.array(multiPartMediaPartSchema).min(1),
})
export type MultiPartMediaQuestion = z.infer<typeof multiPartMediaQuestionSchema>

const VALID_QUESTION_TYPES = new Set<string>(Object.values(QUESTION_TYPE))

// Forward-migrations of pre-v5 stored question shapes, run as the question
// schema's pre-parse step so it stays inside Zod's coverage: unknown/missing
// `type` becomes `open`, legacy `img` moves to `media`, ordering items stored
// as plain strings become `{ label }`. Legacy `img`/`audio` keys are dropped by
// `z.object`'s strip, so no explicit delete is needed.
function migrateQuestion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const q: Record<string, unknown> = { ...(raw as Record<string, unknown>) }

  if (typeof q.type !== 'string' || !VALID_QUESTION_TYPES.has(q.type)) {
    q.type = QUESTION_TYPE.open
  }
  if (typeof q.img === 'string' && q.img.length > 0 && q.media === undefined) {
    q.media = { type: MEDIA_TYPE.image, src: q.img }
  }
  if (q.type === QUESTION_TYPE.ordering && Array.isArray(q.items)) {
    q.items = q.items.map((item: unknown) => (typeof item === 'string' ? { label: item } : item))
  }
  return q
}

const questionSchema = z
  .preprocess(migrateQuestion, z.discriminatedUnion('type', [
    openQuestionSchema,
    multipleChoiceQuestionSchema,
    trueFalseQuestionSchema,
    orderingQuestionSchema,
    numericQuestionSchema,
    multiPartMediaQuestionSchema,
  ]))
  // cross-field bound: correctIndex must point at a real option
  .refine((q) => q.type !== QUESTION_TYPE.multipleChoice || (q.correctIndex >= 0 && q.correctIndex < q.options.length))
export type Question = z.infer<typeof questionSchema>

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(CATEGORY_COLOR),
  steal: z.boolean().optional(),
  points: z.array(z.number()),
  questions: z.array(questionSchema),
})
export type Category = z.infer<typeof categorySchema>

const teamSchema = z.object({
  name: z.string(),
  score: z.number(),
  // pre-streak-feature records lack `streak`; default it rather than reject
  streak: z.number().catch(0),
})
export type Team = z.infer<typeof teamSchema>

const quizSchema = z.object({
  id: z.custom<QuizId>((v) => typeof v === 'string'),
  name: z.string(),
  updatedAt: z.number(),
  mode: z.enum(APP_MODE),
  // invalid/missing round config falls back instead of dropping the quiz
  playStyle: z.enum(PLAY_STYLE).catch(PLAY_STYLE.classic),
  categories: z.array(categorySchema),
  teams: z.array(teamSchema),
  used: z.record(z.string(), z.boolean()),
  currentTurnIndex: z.number().catch(0),
})
export type Quiz = z.infer<typeof quizSchema>

export type QuizMeta = {
  id: QuizId
  name: string
  updatedAt: number
  questionCount: number
}

// ── Question helpers ──

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
      const legacy = z.looseObject({}).safeParse(await meta.get(LEGACY_DOC_KEY))
      if (legacy.success) {
        const id = newQuizId()
        await tx.objectStore(QUIZ_STORE).put({ ...legacy.data, id, name: DEFAULT_QUIZ_NAME, updatedAt: Date.now() })
        await meta.put(id, ACTIVE_QUIZ_KEY)
      }
      await meta.delete(LEGACY_DOC_KEY)
    }
  },
})

// ── Validation ──

function parseQuiz(raw: unknown): Quiz | undefined {
  const result = quizSchema.safeParse(raw)
  return result.success ? result.data : undefined
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
      showToast('Storage full — changes may not be saved.', TOAST_VARIANT.error)
    } else {
      showToast('Failed to save — changes may be lost on refresh.', TOAST_VARIANT.error)
    }
  }
}

export async function deleteQuiz(id: QuizId): Promise<void> {
  try {
    const db = await dbPromise
    await db.delete(QUIZ_STORE, id)
  } catch {
    showToast('Failed to delete — changes may be lost on refresh.', TOAST_VARIANT.error)
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
    showToast('Failed to save — changes may be lost on refresh.', TOAST_VARIANT.error)
  }
}

// ── Status Toast ──

const TOAST_ID = 'persistence-toast'

export const TOAST_VARIANT = { error: 'error', success: 'success' } as const
export type ToastVariant = (typeof TOAST_VARIANT)[keyof typeof TOAST_VARIANT]

export function showToast(message: string, variant: ToastVariant): void {
  let toast = document.getElementById(TOAST_ID)
  if (!toast) {
    toast = document.createElement('div')
    toast.id = TOAST_ID
    toast.className = 'persistence-toast'
    // async status must reach screen readers, not just flash visually
    toast.setAttribute('role', 'status')
    toast.setAttribute('aria-live', 'polite')
    document.body.appendChild(toast)
  }
  toast.classList.toggle('persistence-toast--success', variant === TOAST_VARIANT.success)
  toast.textContent = message
  toast.classList.add('visible')

  setTimeout(() => {
    toast?.classList.remove('visible')
    setTimeout(() => toast?.remove(), 300)
  }, 5000)
}
