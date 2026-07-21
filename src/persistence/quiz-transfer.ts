import { z } from 'zod'
import { categorySchema, PLAY_STYLE } from './db.ts'
import type { Quiz } from './db.ts'

// Single JSON file: media images are already base64 data-URLs inside `media.src`,
// so JSON is lossless for content with no zip dependency. `format` + integer
// `version` is the backwards-compatibility seam — future readers switch on
// `version` and must keep every older branch working.
export const EXPORT_FORMAT = 'quizboard-quizzes'
export const EXPORT_VERSION = 1

// Session state (mode, teams, used, currentTurnIndex) is deliberately NOT
// exported — quizzes travel as content; imports start fresh in edit mode.
// playStyle IS exported: it's quiz configuration, not round state. Category ids
// are exported verbatim; the only thing that references them is the per-quiz
// `used` map, which starts empty on import, so no cross-quiz lookups exist.
// The category shape is validated by the SAME schema the DB uses — no dupe.
const exportedQuizSchema = z.object({
  name: z.string().min(1),
  playStyle: z.enum(PLAY_STYLE),
  categories: z.array(categorySchema),
})
export type ExportedQuiz = z.infer<typeof exportedQuizSchema>

export type QuizExportFile = {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  quizzes: ExportedQuiz[]
}

export function buildExportFile(quizzes: Quiz[]): QuizExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    quizzes: quizzes.map((q) => ({
      name: q.name,
      playStyle: q.playStyle,
      categories: q.categories,
    })),
  }
}

type ParseResult =
  | { status: 'ok'; quizzes: ExportedQuiz[] }
  | { status: 'error'; message: string }

// Only `format`/`version`/`quizzes` are read; other keys are ignored. Rejects
// non-objects (arrays, null, primitives) → "Not a Quiz Board export file."
const envelopeSchema = z.object({
  format: z.unknown(),
  version: z.unknown(),
  quizzes: z.unknown(),
})

export function parseExportFile(raw: unknown): ParseResult {
  const envelope = envelopeSchema.safeParse(raw)
  if (!envelope.success || envelope.data.format !== EXPORT_FORMAT) {
    return { status: 'error', message: 'Not a Quiz Board export file.' }
  }

  // Versions start at 1; anything else (0, fractions, NaN, non-number) is a
  // hand-edited file, not a real export.
  const version = z.number().int().min(1).safeParse(envelope.data.version)
  if (!version.success) {
    return { status: 'error', message: 'File is corrupted or not a valid export.' }
  }
  if (version.data > EXPORT_VERSION) {
    return { status: 'error', message: 'This file was exported by a newer version of Quiz Board.' }
  }

  // All-or-nothing: a v1 file with even one invalid quiz is corruption, not a
  // partial import.
  const quizzes = z.array(exportedQuizSchema).safeParse(envelope.data.quizzes)
  if (!quizzes.success) {
    return { status: 'error', message: 'File is corrupted or not a valid export.' }
  }

  // v1 files are current-shape by construction (written by buildExportFile from
  // live Quiz objects). A future version 2 is an added branch here, never an
  // edit to this one.
  if (version.data === 1) {
    return { status: 'ok', quizzes: quizzes.data }
  }
  throw new Error('unreachable: version guard')
}
