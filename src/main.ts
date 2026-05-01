import './style.css'
import { APP_MODE, PLAY_STYLE, CATEGORY_COLOR, QUESTION_TYPE, MEDIA_TYPE, DEFAULT_QUESTION_TEXT, loadAppData, saveAppData, defaultQuestion, answerDisplayText } from './persistence/db.ts'
import type { AppData, CategoryColor, Question, QuestionType, QuestionMedia, MultiPartMediaPart, OrderingItem, Team } from './persistence/db.ts'
import { scoreCorrect, scoreWrong, nextCorrectPreview, streakBonusFor, scorePartial } from './lib/scoring.ts'

type ActiveQ = {
  catIdx: number
  qIdx: number
  pts: number
  stealTargetIdx: number | null
}

// ── Constants ──

const COLOR_ORDER = [
  CATEGORY_COLOR.blue, CATEGORY_COLOR.orange, CATEGORY_COLOR.purple,
  CATEGORY_COLOR.green, CATEGORY_COLOR.red, CATEGORY_COLOR.teal,
  CATEGORY_COLOR.pink, CATEGORY_COLOR.yellow,
] as const

const MAX_CATEGORIES = 12

// ── State ──

const data: AppData = {
  mode: APP_MODE.edit,
  playStyle: PLAY_STYLE.classic,
  categories: [],
  teams: [],
  used: {},
  currentTurnIndex: 0,
}

type MpmPartResult = 'correct' | 'wrong' | null

type MpmCarouselState = {
  parts: MultiPartMediaPart[]
  pts: number
  currentIdx: number
  results: MpmPartResult[]
  teamIdx: number | null
  ffaTeamPerPart: (number | null)[]
}

let activeQ: ActiveQ | null = null
let mpmCarousel: MpmCarouselState | null = null
let activeEditCell: { ci: number; qi: number } | null = null
const mediaStaging: Record<string, QuestionMedia | null> = {}

// ── Persistence ──

async function loadData(): Promise<void> {
  const saved = await loadAppData()
  if (saved) {
    data.mode = saved.mode
    data.playStyle = saved.playStyle
    data.categories = saved.categories
    data.teams = saved.teams
    data.used = saved.used
    data.currentTurnIndex = saved.currentTurnIndex
  } else {
    await saveAppData(data)
  }
}

function saveData(): void {
  saveAppData(data).catch(() => {})
}

// ── Helpers ──

function cloneTemplate(id: string): HTMLElement {
  const tmpl = document.getElementById(id)
  if (!(tmpl instanceof HTMLTemplateElement)) throw new Error(`unreachable: template #${id} missing`)
  const el = tmpl.content.firstElementChild
  if (!el) throw new Error(`unreachable: template #${id} empty`)
  return el.cloneNode(true) as HTMLElement
}

function clearRecord(rec: Record<string, unknown>): void {
  for (const k of Object.keys(rec)) delete rec[k]
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`unreachable: #${id} missing`)
  return el
}

function nextColor(): CategoryColor {
  const usedColors = new Set(data.categories.map((c) => c.color))
  return COLOR_ORDER.find((c) => !usedColors.has(c)) ?? CATEGORY_COLOR.blue
}

function needsAttention(q: Question): boolean {
  return q.q === DEFAULT_QUESTION_TEXT || q.q.trim() === ''
}

// ── YouTube ──

function parseYoutubeUrl(raw: string): { videoId: string; startSeconds: number | undefined } | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  let videoId: string | undefined
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? undefined
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.slice('/embed/'.length).split('/')[0]
    }
  } else if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0]
  }

  if (!videoId) return undefined

  const tParam = url.searchParams.get('t') ?? url.searchParams.get('start')
  const startSeconds = tParam ? parseInt(tParam, 10) : undefined

  return { videoId, startSeconds: Number.isFinite(startSeconds) ? startSeconds : undefined }
}

let ytApiReady = false
let ytApiLoading = false
let ytPlayer: YT.Player | null = null
const ytReadyCallbacks: Array<() => void> = []

function ensureYoutubeApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve()
  return new Promise<void>((resolve) => {
    ytReadyCallbacks.push(resolve)
    if (ytApiLoading) return
    ytApiLoading = true
    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true
      ytApiLoading = false
      for (const cb of ytReadyCallbacks) cb()
      ytReadyCallbacks.length = 0
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
}

function destroyYoutubePlayer(): void {
  if (!ytPlayer) return
  try { ytPlayer.destroy() } catch { /* player already gone */ }
  ytPlayer = null
}

let ytPlaying = false

function updatePlayButton(): void {
  const btn = document.getElementById('m-yt-play-btn')
  if (!btn) return
  btn.textContent = ytPlaying ? '⏸' : '🔊'
  btn.classList.toggle('playing', ytPlaying)
}

function toggleYoutubePlayback(): void {
  if (!ytPlayer) return
  if (ytPlaying) {
    ytPlayer.pauseVideo()
    ytPlaying = false
  } else {
    ytPlayer.playVideo()
    ytPlaying = true
  }
  updatePlayButton()
}

function createYoutubePlayer(containerId: string, videoId: string, startSeconds?: number, endSeconds?: number, autoplay = false): void {
  destroyYoutubePlayer()
  ytPlaying = false
  const container = document.getElementById(containerId)
  if (!container) return

  container.textContent = ''

  const hiddenPlayer = document.createElement('div')
  hiddenPlayer.className = 'yt-hidden-player'
  const target = document.createElement('div')
  hiddenPlayer.appendChild(target)
  container.appendChild(hiddenPlayer)

  const playBtn = document.createElement('button')
  playBtn.type = 'button'
  playBtn.id = 'm-yt-play-btn'
  playBtn.className = 'yt-play-btn'
  playBtn.textContent = '🔊'
  playBtn.dataset.action = 'yt-toggle-play'
  container.appendChild(playBtn)

  ensureYoutubeApi().then(() => {
    ytPlayer = new YT.Player(target, {
      videoId,
      width: 1,
      height: 1,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        ...(startSeconds !== undefined ? { start: startSeconds } : {}),
        ...(endSeconds !== undefined ? { end: endSeconds } : {}),
        rel: 0,
        fs: 0,
      },
      events: {
        onReady: (event: YT.PlayerEvent) => {
          event.target.setVolume(100)
          if (autoplay) {
            ytPlaying = true
            updatePlayButton()
          }
        },
        onStateChange: (event: YT.OnStateChangeEvent) => {
          if (event.data === 0) {
            ytPlaying = false
            updatePlayButton()
          }
        },
      },
    })
  })
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }) as T
}

// ── Mode ──

function switchMode(mode: typeof APP_MODE.edit | typeof APP_MODE.play): void {
  data.mode = mode
  saveData()
  renderAll()
}

// ── Render ──

function renderAll(): void {
  renderSubtitle()
  renderControls()
  if (data.mode === APP_MODE.play) {
    renderScoreboard()
  } else {
    $('scoreboard').textContent = ''
  }
  renderBoard()
}

function renderSubtitle(): void {
  const el = $('subtitle')
  el.textContent = ''
  if (data.mode === APP_MODE.edit) {
    const badge = document.createElement('span')
    badge.className = 'edit-mode-badge'
    badge.textContent = 'Edit Mode'
    el.appendChild(badge)
    el.appendChild(document.createTextNode(' Click a title to rename • Click a tile to edit'))
  } else {
    const team = data.teams[data.currentTurnIndex]
    el.textContent = team ? `${team.name}'s turn — pick a tile` : 'Click a tile to play'
  }
}

function renderControls(): void {
  const el = $('controls')
  el.textContent = ''
  const frag = document.createDocumentFragment()

  if (data.mode === APP_MODE.edit) {
    if (data.categories.length < MAX_CATEGORIES) {
      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'ctrl-btn'
      addBtn.textContent = '+ Add Category'
      addBtn.dataset.action = 'add-category'
      frag.appendChild(addBtn)
    }

    const resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'ctrl-btn danger'
    resetBtn.textContent = '↺ Reset'
    resetBtn.dataset.action = 'reset-all'
    frag.appendChild(resetBtn)

    const playBtn = document.createElement('button')
    playBtn.type = 'button'
    playBtn.className = 'ctrl-btn play-btn'
    playBtn.textContent = '▶ Play Quiz'
    playBtn.dataset.action = 'play-quiz'
    frag.appendChild(playBtn)
  } else {
    const winnerBtn = document.createElement('button')
    winnerBtn.type = 'button'
    winnerBtn.className = 'ctrl-btn'
    winnerBtn.textContent = '🏆 Show Winner'
    winnerBtn.dataset.action = 'show-winner'
    frag.appendChild(winnerBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'ctrl-btn danger'
    cancelBtn.textContent = '✕ Cancel Game'
    cancelBtn.dataset.action = 'cancel-game'
    frag.appendChild(cancelBtn)
  }

  el.appendChild(frag)
}

function renderScoreboard(): void {
  const el = $('scoreboard')
  const frag = document.createDocumentFragment()

  for (const [i, t] of data.teams.entries()) {
    const card = cloneTemplate('tmpl-team-card')
    card.dataset.team = String(i)
    const isActive = i === data.currentTurnIndex
    if (isActive) card.classList.add('active')

    const nameInput = card.querySelector('.team-name') as HTMLInputElement
    nameInput.value = t.name

    const score = card.querySelector('.team-score') as HTMLElement
    score.textContent = t.score.toLocaleString()

    if (isActive) {
      const turnBadge = document.createElement('div')
      turnBadge.className = 'team-turn-badge'
      turnBadge.textContent = 'YOUR TURN'
      card.appendChild(turnBadge)
    }

    if (data.playStyle === PLAY_STYLE.streak && t.streak > 0) {
      const streakBadge = document.createElement('span')
      streakBadge.className = 'team-streak'
      const capped = Math.min(t.streak, 7)
      streakBadge.style.setProperty('--streak', String(capped))
      streakBadge.textContent = ` ${t.streak}`
      const nameWrap = card.querySelector('.team-name-wrap')
      if (nameWrap) nameWrap.appendChild(streakBadge)
    }

    for (const btn of card.querySelectorAll<HTMLButtonElement>('[data-action="adjust-score"]')) {
      btn.dataset.team = String(i)
    }

    frag.appendChild(card)
  }

  el.textContent = ''
  el.appendChild(frag)
}

function renderBoard(): void {
  const el = $('board')
  const frag = document.createDocumentFragment()
  const isEdit = data.mode === APP_MODE.edit

  if (data.categories.length === 0) {
    el.style.gridTemplateColumns = ''
    el.style.gridTemplateRows = ''
  }

  if (isEdit && data.categories.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'board-empty'
    const icon = document.createElement('div')
    icon.className = 'board-empty__icon'
    icon.textContent = '＋'
    empty.appendChild(icon)
    const text = document.createElement('div')
    text.className = 'board-empty__text'
    text.textContent = 'No categories yet'
    empty.appendChild(text)
    const hint = document.createElement('div')
    hint.className = 'board-empty__hint'
    hint.textContent = 'Add a category to start building your quiz board'
    empty.appendChild(hint)
    frag.appendChild(empty)
    el.textContent = ''
    el.appendChild(frag)
    return
  }

  const maxQ = Math.max(0, ...data.categories.map(c => c.points.length))
  const totalRows = 1 + maxQ + (isEdit ? 1 : 0)

  for (const [ci, cat] of data.categories.entries()) {
    const col = document.createElement('div')
    col.className = 'board-column'
    col.style.gridRow = `span ${totalRows}`
    col.dataset.color = cat.color
    col.dataset.ci = String(ci)
    if (cat.steal) col.dataset.steal = ''
    if (isEdit) col.draggable = true

    const header = cloneTemplate('tmpl-cat-header')
    const catName = header.querySelector('.cat-name') as HTMLButtonElement
    catName.textContent = cat.name
    catName.dataset.ci = String(ci)

    if (cat.steal) {
      const stealBadge = document.createElement('span')
      stealBadge.className = 'cat-steal-badge'
      stealBadge.textContent = 'STEAL'
      header.appendChild(stealBadge)
    }

    if (isEdit) {
      const dragHandle = document.createElement('span')
      dragHandle.className = 'cat-drag-handle'
      dragHandle.textContent = '⠿'
      header.insertBefore(dragHandle, header.firstChild)

      const editIcon = document.createElement('span')
      editIcon.className = 'cat-edit-icon'
      editIcon.textContent = '✎'
      header.appendChild(editIcon)

      const removeBadge = document.createElement('button')
      removeBadge.type = 'button'
      removeBadge.className = 'cat-remove-badge'
      removeBadge.textContent = '✕'
      removeBadge.dataset.action = 'remove-category'
      removeBadge.dataset.ci = String(ci)
      header.appendChild(removeBadge)
    }

    col.appendChild(header)

    for (const [qi, pts] of cat.points.entries()) {
      const question = cat.questions[qi]
      const tile = cloneTemplate('tmpl-tile')
      const tileBtn = tile as HTMLButtonElement
      tileBtn.dataset.ci = String(ci)
      tileBtn.dataset.qi = String(qi)

      const displayPts = !isEdit && question?.x2 ? pts * 2 : pts
      const ptsSpan = tileBtn.querySelector('.tile-pts') as HTMLElement
      ptsSpan.textContent = String(displayPts)

      if (question?.x2) {
        const x2Badge = document.createElement('span')
        x2Badge.className = 'tile-x2'
        tileBtn.appendChild(x2Badge)
      }

      if (isEdit) {
        if (question && needsAttention(question)) {
          tileBtn.classList.add('tile--needs-attention')
          const pencil = document.createElement('span')
          pencil.className = 'tile-pencil'
          pencil.textContent = '✎'
          tileBtn.appendChild(pencil)
        }
        if (cat.questions.length > 1) {
          const tileRemove = document.createElement('span')
          tileRemove.className = 'tile-remove'
          tileRemove.textContent = '✕'
          tileRemove.dataset.action = 'remove-question'
          tileRemove.dataset.ci = String(ci)
          tileRemove.dataset.qi = String(qi)
          tileBtn.appendChild(tileRemove)
        }
      } else {
        const used = !!data.used[`${cat.id}-${qi}`]
        if (used) {
          tileBtn.classList.add('used')
          tileBtn.disabled = true
        }
      }

      col.appendChild(tileBtn)
    }

    if (isEdit) {
      const addQBtn = document.createElement('button')
      addQBtn.type = 'button'
      addQBtn.className = 'add-question-btn'
      addQBtn.textContent = '+'
      addQBtn.dataset.action = 'add-question'
      addQBtn.dataset.ci = String(ci)
      col.appendChild(addQBtn)
    }

    frag.appendChild(col)
  }

  el.textContent = ''
  el.style.gridTemplateColumns = `repeat(${data.categories.length}, minmax(0, 280px))`
  el.style.gridTemplateRows = `auto repeat(${maxQ}, 1fr)${isEdit ? ' auto' : ''}`
  el.appendChild(frag)
}

function renderCurrentTeamLabel(): void {
  const el = $('m-teams')
  el.textContent = ''
  const team = data.teams[data.currentTurnIndex]
  if (!team) return

  const label = document.createElement('div')
  label.className = 'current-team-label'
  label.textContent = `${team.name}'s answer`

  const pts = activeQ?.pts ?? 0
  const info = document.createElement('span')
  info.className = 'current-team-streak-info'
  if (data.playStyle === PLAY_STYLE.streak) {
    const nextTotal = nextCorrectPreview(pts, team.streak)
    if (team.streak > 0) {
      const bonus = streakBonusFor(team.streak + 1)
      info.textContent = ` — streak ${team.streak}, worth +${nextTotal} (${pts} + ${bonus} bonus)`
    } else {
      info.textContent = ` — worth +${nextTotal}`
    }
  } else {
    info.textContent = ` — worth +${pts}`
  }
  label.appendChild(info)

  el.appendChild(label)
}

// ── Question Modal ──

function shuffle<T>(arr: readonly T[]): T[] {
  if (arr.length <= 1) return [...arr]
  const out = [...arr]
  do {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = out[i]!
      out[i] = out[j]!
      out[j] = tmp
    }
  } while (out.every((v, i) => v === arr[i]))
  return out
}

function renderPlayTypeContent(q: Question, container: HTMLElement): void {
  container.textContent = ''

  switch (q.type) {
    case QUESTION_TYPE.open:
      break
    case QUESTION_TYPE.multipleChoice: {
      const list = document.createElement('div')
      list.className = 'play-mc-options'
      for (const [i, opt] of q.options.entries()) {
        const card = document.createElement('div')
        card.className = 'play-mc-option'
        card.dataset.idx = String(i)
        card.dataset.action = 'mc-select'
        const letter = document.createElement('span')
        letter.className = 'play-mc-letter'
        letter.textContent = String.fromCharCode(65 + i)
        card.appendChild(letter)
        card.appendChild(document.createTextNode(opt))
        list.appendChild(card)
      }
      container.appendChild(list)
      break
    }
    case QUESTION_TYPE.trueFalse: {
      const row = document.createElement('div')
      row.className = 'play-tf-row'
      for (const val of ['True', 'False']) {
        const card = document.createElement('div')
        card.className = 'play-tf-option'
        card.dataset.val = val.toLowerCase()
        card.textContent = val
        row.appendChild(card)
      }
      container.appendChild(row)
      break
    }
    case QUESTION_TYPE.ordering: {
      const shuffled = shuffle(q.items)
      const list = document.createElement('div')
      list.className = 'play-ord-items'
      list.dataset.correctOrder = JSON.stringify(q.items.map((it) => it.label))
      for (const [i, ordItem] of shuffled.entries()) {
        const card = document.createElement('div')
        card.className = 'play-ord-item'
        const num = document.createElement('span')
        num.className = 'play-ord-num'
        num.textContent = `${i + 1}.`
        card.appendChild(num)

        if (ordItem.media?.type === MEDIA_TYPE.image) {
          const img = document.createElement('img')
          img.src = ordItem.media.src
          img.alt = ordItem.label
          img.className = 'play-ord-item-img'
          card.appendChild(img)
        } else if (ordItem.media?.type === MEDIA_TYPE.youtube) {
          const ytBtn = document.createElement('button')
          ytBtn.type = 'button'
          ytBtn.className = 'yt-play-btn play-ord-yt-btn'
          ytBtn.textContent = '🔊'
          ytBtn.dataset.action = 'ord-yt-play'
          ytBtn.dataset.videoId = ordItem.media.videoId
          if (ordItem.media.startSeconds !== undefined) ytBtn.dataset.start = String(ordItem.media.startSeconds)
          if (ordItem.media.endSeconds !== undefined) ytBtn.dataset.end = String(ordItem.media.endSeconds)
          card.appendChild(ytBtn)
        }

        card.appendChild(document.createTextNode(ordItem.label))
        list.appendChild(card)
      }
      container.appendChild(list)
      break
    }
    case QUESTION_TYPE.numeric: {
      const prompt = document.createElement('div')
      prompt.className = 'play-numeric-prompt'
      prompt.textContent = q.unit ? `Answer in ${q.unit}` : 'Enter a number'
      container.appendChild(prompt)
      break
    }
    case QUESTION_TYPE.multiPartMedia: {
      const carousel = document.createElement('div')
      carousel.className = 'play-mpm-carousel'

      const progress = document.createElement('div')
      progress.className = 'play-mpm-progress'
      carousel.appendChild(progress)

      const slide = document.createElement('div')
      slide.className = 'play-mpm-slide'
      carousel.appendChild(slide)

      container.appendChild(carousel)
      break
    }
    default: {
      const _exhaustive: never = q
      throw new Error(`unreachable: unknown question type ${(_exhaustive as Question).type}`)
    }
  }
}

function revealPlayTypeContent(q: Question, container: HTMLElement): void {
  switch (q.type) {
    case QUESTION_TYPE.open:
      break
    case QUESTION_TYPE.multipleChoice: {
      const options = container.querySelectorAll<HTMLElement>('.play-mc-option')
      const selectedOpt = container.querySelector<HTMLElement>('.play-mc-option.selected')
      const selectedIdx = selectedOpt ? Number(selectedOpt.dataset.idx) : null

      for (const opt of options) {
        const idx = Number(opt.dataset.idx)
        if (idx === q.correctIndex) {
          opt.classList.add('correct')
        } else {
          opt.classList.add('dimmed')
        }
      }

      if (selectedOpt && selectedIdx !== null) {
        if (selectedIdx === q.correctIndex) {
          selectedOpt.classList.add('selected-correct')
        } else {
          selectedOpt.classList.remove('dimmed')
          selectedOpt.classList.add('selected-wrong')
        }
      }
      break
    }
    case QUESTION_TYPE.trueFalse: {
      const correctVal = q.correctAnswer ? 'true' : 'false'
      const options = container.querySelectorAll<HTMLElement>('.play-tf-option')
      for (const opt of options) {
        if (opt.dataset.val === correctVal) {
          opt.classList.add('correct')
        } else {
          opt.classList.add('dimmed')
        }
      }
      break
    }
    case QUESTION_TYPE.ordering: {
      const list = container.querySelector('.play-ord-items')
      if (!list) break
      list.textContent = ''
      for (const [i, ordItem] of q.items.entries()) {
        const card = document.createElement('div')
        card.className = 'play-ord-item'
        const num = document.createElement('span')
        num.className = 'play-ord-num'
        num.textContent = `${i + 1}.`
        card.appendChild(num)

        if (ordItem.media?.type === MEDIA_TYPE.image) {
          const img = document.createElement('img')
          img.src = ordItem.media.src
          img.alt = ordItem.label
          img.className = 'play-ord-item-img'
          card.appendChild(img)
        } else if (ordItem.media?.type === MEDIA_TYPE.youtube) {
          const ytBtn = document.createElement('button')
          ytBtn.type = 'button'
          ytBtn.className = 'yt-play-btn play-ord-yt-btn'
          ytBtn.textContent = '🔊'
          ytBtn.dataset.action = 'ord-yt-play'
          ytBtn.dataset.videoId = ordItem.media.videoId
          if (ordItem.media.startSeconds !== undefined) ytBtn.dataset.start = String(ordItem.media.startSeconds)
          if (ordItem.media.endSeconds !== undefined) ytBtn.dataset.end = String(ordItem.media.endSeconds)
          card.appendChild(ytBtn)
        }

        card.appendChild(document.createTextNode(ordItem.label))
        list.appendChild(card)
      }
      break
    }
    case QUESTION_TYPE.numeric:
      break
    case QUESTION_TYPE.multiPartMedia:
      break
    default: {
      const _exhaustive: never = q
      throw new Error(`unreachable: unknown question type ${(_exhaustive as Question).type}`)
    }
  }
}

function renderMpmSlide(state: MpmCarouselState): void {
  const carousel = document.querySelector('.play-mpm-carousel')
  if (!carousel) return

  const part = state.parts[state.currentIdx]
  if (!part) return

  const progress = carousel.querySelector('.play-mpm-progress')
  if (progress) {
    progress.textContent = ''

    const correctSoFar = state.results.filter((r) => r === 'correct').length
    const perPart = Math.floor(state.pts / state.parts.length)
    const scoreInfo = document.createElement('span')
    scoreInfo.className = 'play-mpm-score-info'
    scoreInfo.textContent = `${correctSoFar * perPart} pts so far`
    progress.appendChild(scoreInfo)

    const dots = document.createElement('div')
    dots.className = 'play-mpm-dots'
    for (let i = 0; i < state.parts.length; i++) {
      const dot = document.createElement('span')
      dot.className = 'play-mpm-dot'
      if (i === state.currentIdx) dot.classList.add('active')
      if (state.results[i] === 'correct') dot.classList.add('correct')
      if (state.results[i] === 'wrong') dot.classList.add('wrong')
      dots.appendChild(dot)
    }
    progress.appendChild(dots)
  }

  const slide = carousel.querySelector('.play-mpm-slide')
  if (!slide) return
  slide.textContent = ''
  destroyYoutubePlayer()
  $('m-yt-wrap').style.display = 'none'

  if (part.media.type === MEDIA_TYPE.image) {
    const img = document.createElement('img')
    img.src = part.media.src
    img.alt = `Part ${state.currentIdx + 1}`
    img.className = 'play-mpm-slide-img'
    slide.appendChild(img)
  } else if (part.media.type === MEDIA_TYPE.youtube) {
    const ytBtn = document.createElement('button')
    ytBtn.type = 'button'
    ytBtn.className = 'yt-play-btn play-mpm-yt-btn'
    ytBtn.textContent = '🔊'
    ytBtn.dataset.action = 'mpm-yt-play'
    ytBtn.dataset.partIdx = String(state.currentIdx)
    ytBtn.dataset.videoId = part.media.videoId
    if (part.media.startSeconds !== undefined) ytBtn.dataset.start = String(part.media.startSeconds)
    if (part.media.endSeconds !== undefined) ytBtn.dataset.end = String(part.media.endSeconds)
    slide.appendChild(ytBtn)
  }

}

function mpmCarouselJudge(result: MpmPartResult): void {
  if (!mpmCarousel) return
  if (result !== null) mpmCarousel.results[mpmCarousel.currentIdx] = result
  mpmCarouselAdvance()
}

function mpmCarouselAdvance(): void {
  if (!mpmCarousel) return
  const { results, currentIdx } = mpmCarousel
  const len = results.length

  for (let offset = 1; offset <= len; offset++) {
    const idx = (currentIdx + offset) % len
    if (results[idx] === null) {
      mpmCarousel.currentIdx = idx
      renderMpmSlide(mpmCarousel)
      if (activeQ) {
        const cat = data.categories[activeQ.catIdx]
        const q = cat?.questions[activeQ.qIdx]
        if (q?.ffa) {
          $('btn-correct').style.display = 'none'
          $('btn-wrong').style.display = 'none'
          $('btn-skip').style.display = 'none'
          renderFfaTeamPicker()
        }
      }
      return
    }
  }

  renderMpmSummary()
}

function renderMpmSummary(): void {
  if (!mpmCarousel || !activeQ) return

  const { parts, results, pts } = mpmCarousel
  const correctCount = results.filter((r) => r === 'correct').length
  const totalScore = scorePartial(pts, parts.length, correctCount)

  $('btn-correct').style.display = 'none'
  $('btn-wrong').style.display = 'none'
  $('btn-skip').style.display = 'none'

  const ffaPicker = document.getElementById('ffa-team-picker')
  if (ffaPicker) ffaPicker.remove()

  destroyYoutubePlayer()
  $('m-yt-wrap').style.display = 'none'

  const container = $('m-type-content')
  container.textContent = ''

  const summary = document.createElement('div')
  summary.className = 'mpm-summary'

  const heading = document.createElement('div')
  heading.className = 'mpm-summary-heading'
  heading.textContent = 'Results'
  summary.appendChild(heading)

  const isFfaMpm = mpmCarousel.ffaTeamPerPart.some((t) => t !== null)

  for (const [i, part] of parts.entries()) {
    const row = document.createElement('div')
    row.className = 'mpm-summary-row'
    row.classList.add(results[i] === 'correct' ? 'correct' : 'wrong')

    const icon = document.createElement('span')
    icon.className = 'mpm-summary-icon'
    icon.textContent = results[i] === 'correct' ? '✓' : '✗'
    row.appendChild(icon)

    const text = document.createElement('span')
    text.textContent = `Part ${i + 1}: ${part.answer}`
    row.appendChild(text)

    const teamForPart = mpmCarousel.ffaTeamPerPart[i]
    if (teamForPart !== null && teamForPart !== undefined) {
      const teamName = document.createElement('span')
      teamName.className = 'mpm-summary-team'
      teamName.textContent = data.teams[teamForPart]?.name ?? ''
      row.appendChild(teamName)
    } else if (isFfaMpm) {
      const noTeam = document.createElement('span')
      noTeam.className = 'mpm-summary-team mpm-summary-team--nobody'
      noTeam.textContent = 'Nobody'
      row.appendChild(noTeam)
    }

    summary.appendChild(row)
  }

  if (isFfaMpm) {
    const perPart = Math.floor(pts / parts.length)
    const teamScores = new Map<number, number>()
    for (const [i, result] of results.entries()) {
      if (result !== 'correct') continue
      const tIdx = mpmCarousel.ffaTeamPerPart[i]
      if (tIdx === null || tIdx === undefined) continue
      teamScores.set(tIdx, (teamScores.get(tIdx) ?? 0) + perPart)
    }
    const totalEl = document.createElement('div')
    totalEl.className = 'mpm-summary-total'
    if (teamScores.size === 0) {
      totalEl.textContent = `${correctCount} of ${parts.length} correct — 0 pts`
    } else {
      const lines = [...teamScores.entries()]
        .map(([tIdx, score]) => `${data.teams[tIdx]?.name ?? ''}: +${score}`)
        .join(', ')
      totalEl.textContent = `${correctCount} of ${parts.length} correct — ${lines}`
    }
    summary.appendChild(totalEl)
  } else {
    const total = document.createElement('div')
    total.className = 'mpm-summary-total'
    total.textContent = `${correctCount} of ${parts.length} correct — ${totalScore} pts`
    summary.appendChild(total)
  }

  const submitBtn = document.createElement('button')
  submitBtn.type = 'button'
  submitBtn.className = 'modal-btn btn-correct'
  submitBtn.textContent = '✓ Submit Score'
  submitBtn.dataset.action = 'mpm-carousel-submit'
  summary.appendChild(submitBtn)

  container.appendChild(summary)

  $('m-answer').style.display = 'block'
}

function openQuestion(catIdx: number, qIdx: number, pts: number): void {
  const cat = data.categories[catIdx]
  if (!cat) return
  const q = cat.questions[qIdx]
  if (!q) return

  activeQ = { catIdx, qIdx, pts, stealTargetIdx: null }

  const modal = $('q-modal')
  modal.className = 'modal'
  modal.dataset.color = cat.color

  const mPts = $('m-pts')
  mPts.textContent = String(pts)
  if (q.x2) {
    const x2Badge = document.createElement('span')
    x2Badge.className = 'modal-x2-badge'
    x2Badge.textContent = '×2'
    mPts.appendChild(x2Badge)
  }
  $('m-cat').textContent = cat.name.toUpperCase()
  $('m-question').textContent = q.q

  const typeContent = $('m-type-content')
  renderPlayTypeContent(q, typeContent)

  const mAnswer = $('m-answer')
  mAnswer.textContent = 'Answer: ' + answerDisplayText(q)
  mAnswer.style.display = 'none'

  const imgWrap = $('m-image-wrap')
  const imgEl = $('m-image') as HTMLImageElement
  const ytWrap = $('m-yt-wrap')

  destroyYoutubePlayer()

  if (q.ffa || cat.steal) {
    imgEl.src = ''
    imgWrap.style.display = 'none'
    ytWrap.style.display = 'none'
  } else if (q.media?.type === MEDIA_TYPE.image) {
    imgEl.src = q.media.src
    imgWrap.style.display = 'flex'
    ytWrap.style.display = 'none'
  } else if (q.media?.type === MEDIA_TYPE.youtube) {
    imgEl.src = ''
    imgWrap.style.display = 'none'
    ytWrap.style.display = 'flex'
    createYoutubePlayer('m-yt-player', q.media.videoId, q.media.startSeconds, q.media.endSeconds)
  } else {
    imgEl.src = ''
    imgWrap.style.display = 'none'
    ytWrap.style.display = 'none'
  }

  const shouldCenter = !q.media && q.type === QUESTION_TYPE.open && !q.ffa && !cat.steal
  modal.classList.toggle('q-centered', shouldCenter)

  const isMpmCarousel = q.type === QUESTION_TYPE.multiPartMedia
  if (isMpmCarousel && !q.ffa && !cat.steal) {
    mpmCarousel = {
      parts: q.parts, pts, currentIdx: 0,
      results: q.parts.map(() => null), teamIdx: null,
      ffaTeamPerPart: q.parts.map(() => null),
    }
    $('btn-reveal').style.display = 'none'
    $('btn-correct').style.display = 'inline-flex'
    $('btn-wrong').style.display = 'inline-flex'
    renderMpmSlide(mpmCarousel)
  } else {
    $('btn-reveal').style.display = 'inline-flex'
    $('btn-correct').style.display = 'none'
    $('btn-wrong').style.display = 'none'
  }

  const existingFfa = document.getElementById('ffa-announcement')
  if (existingFfa) existingFfa.remove()
  const existingSteal = document.getElementById('steal-announcement')
  if (existingSteal) existingSteal.remove()

  if (cat.steal) {
    $('m-question').style.display = 'none'
    $('m-type-content').style.display = 'none'
    $('btn-reveal').style.display = 'none'
    $('btn-correct').style.display = 'none'
    $('btn-wrong').style.display = 'none'
    $('btn-skip').style.display = 'none'

    const currentTeam = data.teams[data.currentTurnIndex]

    const announcement = document.createElement('div')
    announcement.id = 'steal-announcement'
    announcement.className = 'steal-announcement'

    const stealTitle = document.createElement('div')
    stealTitle.className = 'steal-title'
    stealTitle.textContent = 'STEAL'
    announcement.appendChild(stealTitle)

    const stealSub = document.createElement('div')
    stealSub.className = 'steal-subtitle'
    stealSub.textContent = `${currentTeam?.name ?? 'Team'}, choose a team to steal from!`
    announcement.appendChild(stealSub)

    const grid = document.createElement('div')
    grid.className = 'steal-team-grid'

    for (const [i, team] of data.teams.entries()) {
      if (i === data.currentTurnIndex) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'modal-btn steal-team-btn'
      btn.textContent = team.name
      btn.dataset.action = 'steal-pick-target'
      btn.dataset.teamIdx = String(i)
      grid.appendChild(btn)
    }
    announcement.appendChild(grid)

    modal.querySelector('.modal-btn-row')!.before(announcement)

    const teamEl = $('m-teams')
    teamEl.textContent = ''
    const label = document.createElement('div')
    label.className = 'current-team-label steal-team-label'
    label.textContent = `${currentTeam?.name ?? 'Team'}'s steal`
    teamEl.appendChild(label)
  } else if (q.ffa) {
    $('m-question').style.display = 'none'
    $('m-type-content').style.display = 'none'
    $('btn-reveal').style.display = 'none'
    $('btn-skip').style.display = 'none'

    const announcement = document.createElement('div')
    announcement.id = 'ffa-announcement'
    announcement.className = 'ffa-announcement'

    const title = document.createElement('div')
    title.className = 'ffa-title'
    title.textContent = 'FREE FOR ALL'
    announcement.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'ffa-subtitle'
    sub.textContent = 'Every team can answer this question!'
    announcement.appendChild(sub)

    const revealBtn = document.createElement('button')
    revealBtn.type = 'button'
    revealBtn.className = 'modal-btn btn-reveal'
    revealBtn.textContent = 'Reveal Question'
    revealBtn.addEventListener('click', () => {
      announcement.remove()
      $('m-question').style.display = ''
      $('m-type-content').style.display = ''

      if (isMpmCarousel) {
        mpmCarousel = {
          parts: q.parts, pts, currentIdx: 0,
          results: q.parts.map(() => null), teamIdx: null,
          ffaTeamPerPart: q.parts.map(() => null),
        }
        $('btn-reveal').style.display = 'none'
        $('btn-correct').style.display = 'none'
        $('btn-wrong').style.display = 'none'
        $('btn-skip').style.display = 'none'
        renderPlayTypeContent(q, $('m-type-content'))
        renderMpmSlide(mpmCarousel)
        renderFfaTeamPicker()
      } else {
        $('btn-reveal').style.display = 'inline-flex'
        $('btn-skip').style.display = ''
      }

      if (q.media?.type === MEDIA_TYPE.image) {
        imgEl.src = q.media.src
        imgWrap.style.display = 'flex'
      } else if (q.media?.type === MEDIA_TYPE.youtube) {
        ytWrap.style.display = 'flex'
        createYoutubePlayer('m-yt-player', q.media.videoId, q.media.startSeconds, q.media.endSeconds)
      }
    }, { once: true })
    announcement.appendChild(revealBtn)

    modal.querySelector('.modal-btn-row')!.before(announcement)

    const teamEl = $('m-teams')
    teamEl.textContent = ''
    const label = document.createElement('div')
    label.className = 'current-team-label ffa-team-label'
    label.textContent = 'Any team can answer!'
    teamEl.appendChild(label)
  } else {
    $('m-question').style.display = ''
    $('m-type-content').style.display = ''
    $('btn-skip').style.display = ''
    renderCurrentTeamLabel()
  }

  $('q-overlay').style.display = 'flex'
}

function revealAnswer(): void {
  if (!activeQ) return
  const cat = data.categories[activeQ.catIdx]
  const q = cat?.questions[activeQ.qIdx]
  if (!q) return

  revealPlayTypeContent(q, $('m-type-content'))

  $('m-answer').style.display = 'block'
  $('btn-reveal').style.display = 'none'

  if (q.ffa) {
    $('btn-correct').style.display = 'none'
    $('btn-wrong').style.display = 'none'
    $('btn-skip').style.display = 'none'
    renderFfaTeamPicker()
    return
  }

  $('btn-correct').style.display = 'inline-flex'
  $('btn-wrong').style.display = 'inline-flex'

  if (q.type === QUESTION_TYPE.multipleChoice) {
    const selected = $('m-type-content').querySelector<HTMLElement>('.play-mc-option.selected')
    if (selected) {
      const selectedIdx = Number(selected.dataset.idx)
      if (selectedIdx === q.correctIndex) {
        $('btn-correct').classList.add('auto-suggested')
      } else {
        $('btn-wrong').classList.add('auto-suggested')
      }
    }
  }
}

function renderFfaTeamPicker(): void {
  const existing = document.getElementById('ffa-team-picker')
  if (existing) existing.remove()

  const container = document.createElement('div')
  container.id = 'ffa-team-picker'
  container.className = 'ffa-team-picker'

  const heading = document.createElement('div')
  heading.className = 'ffa-picker-heading'
  heading.textContent = 'Which team answered?'
  container.appendChild(heading)

  const grid = document.createElement('div')
  grid.className = 'ffa-team-grid'

  for (const [i, team] of data.teams.entries()) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'modal-btn ffa-team-btn'
    btn.textContent = team.name
    btn.dataset.action = 'ffa-pick-team'
    btn.dataset.teamIdx = String(i)
    grid.appendChild(btn)
  }
  container.appendChild(grid)

  const nobodyBtn = document.createElement('button')
  nobodyBtn.type = 'button'
  nobodyBtn.className = 'modal-btn ffa-nobody-btn'
  nobodyBtn.textContent = 'Nobody got it'
  nobodyBtn.dataset.action = 'ffa-nobody'
  container.appendChild(nobodyBtn)

  const teamEl = $('m-teams')
  teamEl.textContent = ''
  teamEl.appendChild(container)
}


function markFfaResult(teamIdx: number): void {
  if (!activeQ) return
  const team = data.teams[teamIdx]
  if (!team) return

  team.score += activeQ.pts
  if (data.playStyle === PLAY_STYLE.classic) {
    data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
  }

  saveData()
  markUsed()
  closeQModal()
  renderScoreboard()
  renderSubtitle()
}

function markFfaNobody(): void {
  if (!activeQ) return

  if (data.playStyle === PLAY_STYLE.classic) {
    data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
  }

  markUsed()
  closeQModal()
  renderScoreboard()
  renderSubtitle()
}

function markResult(correct: boolean): void {
  if (!activeQ) return
  const team = data.teams[data.currentTurnIndex]
  if (!team) return

  const stealTarget = activeQ.stealTargetIdx !== null
    ? data.teams[activeQ.stealTargetIdx]
    : null

  if (stealTarget) {
    if (data.playStyle === PLAY_STYLE.streak) {
      if (correct) {
        const result = scoreCorrect(activeQ.pts, team.streak)
        team.score += result.points
        team.streak = result.newStreak
        stealTarget.score -= activeQ.pts
      } else {
        team.score -= activeQ.pts
        team.streak = 0
        data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
      }
    } else {
      team.score += correct ? activeQ.pts : -activeQ.pts
      if (correct) stealTarget.score -= activeQ.pts
      data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
    }
  } else if (data.playStyle === PLAY_STYLE.streak) {
    const result = correct ? scoreCorrect(activeQ.pts, team.streak) : scoreWrong()
    team.score += result.points
    team.streak = result.newStreak
    if (!correct) {
      data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
    }
  } else {
    team.score += correct ? activeQ.pts : 0
    data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
  }

  saveData()
  markUsed()
  closeQModal()
  renderScoreboard()
  renderSubtitle()
}

function skipQuestion(): void {
  if (!activeQ) return
  if (data.playStyle === PLAY_STYLE.classic) {
    data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
  }
  markUsed()
  closeQModal()
  renderScoreboard()
  renderSubtitle()
}

function markUsed(): void {
  if (!activeQ) return
  const cat = data.categories[activeQ.catIdx]
  if (!cat) return
  data.used[`${cat.id}-${activeQ.qIdx}`] = true
  saveData()
  renderBoard()
  activeQ = null
}

function closeQModal(): void {
  destroyYoutubePlayer()
  $('q-overlay').style.display = 'none'
  activeQ = null
  mpmCarousel = null
  const ffaAnnouncement = document.getElementById('ffa-announcement')
  if (ffaAnnouncement) ffaAnnouncement.remove()
  const ffaPicker = document.getElementById('ffa-team-picker')
  if (ffaPicker) ffaPicker.remove()
}

// ── Confirm Modal ──

function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = $('confirm-overlay')
    const msg = $('confirm-message')
    const okBtn = $('confirm-ok')
    const cancelBtn = $('confirm-cancel')
    msg.textContent = message
    overlay.style.display = 'flex'
    okBtn.focus()

    const ac = new AbortController()
    function close(result: boolean): void {
      ac.abort()
      overlay.style.display = 'none'
      resolve(result)
    }

    okBtn.addEventListener('click', () => close(true), { signal: ac.signal })
    cancelBtn.addEventListener('click', () => close(false), { signal: ac.signal })
  })
}

// ── Category Edit ──

function editCategory(ci: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  const content = $('edit-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.className = 'modal-title'
  title.textContent = 'Edit Category'
  content.appendChild(title)

  const nameLabel = document.createElement('div')
  nameLabel.className = 'field-label'
  nameLabel.textContent = 'Category Name'
  content.appendChild(nameLabel)

  const nameInput = document.createElement('input')
  nameInput.className = 'edit-input'
  nameInput.id = 'ec-name'
  nameInput.value = cat.name
  content.appendChild(nameInput)

  const colorLabel = document.createElement('div')
  colorLabel.className = 'field-label'
  colorLabel.style.marginTop = '16px'
  colorLabel.textContent = 'Color'
  content.appendChild(colorLabel)

  const colorRow = document.createElement('div')
  colorRow.className = 'color-picker-row'
  colorRow.id = 'ec-colors'
  for (const c of COLOR_ORDER) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'color-swatch'
    swatch.dataset.color = c
    swatch.dataset.action = 'pick-color'
    if (c === cat.color) swatch.classList.add('selected')
    colorRow.appendChild(swatch)
  }
  content.appendChild(colorRow)

  const stealLabel = document.createElement('label')
  stealLabel.className = 'steal-toggle'
  const stealCheckbox = document.createElement('input')
  stealCheckbox.type = 'checkbox'
  stealCheckbox.id = 'ec-steal'
  stealCheckbox.checked = cat.steal === true
  stealLabel.appendChild(stealCheckbox)
  stealLabel.appendChild(document.createTextNode('Steal'))
  content.appendChild(stealLabel)

  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'edit-save'
  saveBtn.textContent = 'Save Category'
  saveBtn.dataset.action = 'save-category'
  saveBtn.dataset.ci = String(ci)
  content.appendChild(saveBtn)

  $('edit-overlay').style.display = 'flex'
}

function saveCategoryEdit(ci: number): void {
  const cat = data.categories[ci]
  if (!cat) return

  const nameEl = document.getElementById('ec-name') as HTMLInputElement | null
  if (nameEl) cat.name = nameEl.value.trim() || cat.name

  const selectedSwatch = document.querySelector('#ec-colors .color-swatch.selected') as HTMLElement | null
  const color = selectedSwatch?.dataset.color
  if (color && Object.values(CATEGORY_COLOR).includes(color as CategoryColor)) {
    cat.color = color as CategoryColor
  }

  const stealEl = document.getElementById('ec-steal') as HTMLInputElement | null
  if (stealEl?.checked) {
    cat.steal = true
    for (const q of cat.questions) delete q.ffa
  } else {
    delete cat.steal
  }

  saveData()
  renderAll()
  closeEditModal()
}

function closeEditModal(): void {
  activeEditCell = null
  $('edit-overlay').style.display = 'none'
}

// ── Answer Fields ──

const TYPE_LABELS: Record<QuestionType, string> = {
  [QUESTION_TYPE.open]: 'Open Answer',
  [QUESTION_TYPE.multipleChoice]: 'Multiple Choice',
  [QUESTION_TYPE.trueFalse]: 'True / False',
  [QUESTION_TYPE.ordering]: 'Ordering',
  [QUESTION_TYPE.numeric]: 'Numeric',
  [QUESTION_TYPE.multiPartMedia]: 'Multi-Part Media',
}

function renderAnswerFields(container: HTMLElement, question: Question): void {
  container.textContent = ''

  switch (question.type) {
    case QUESTION_TYPE.open: {
      const label = document.createElement('div')
      label.className = 'field-label'
      label.textContent = 'Answer'
      container.appendChild(label)

      const input = document.createElement('input')
      input.className = 'edit-input'
      input.id = 'cell-a'
      input.value = question.a
      container.appendChild(input)
      break
    }
    case QUESTION_TYPE.multipleChoice: {
      const label = document.createElement('div')
      label.className = 'field-label'
      label.textContent = 'Options (select the correct one)'
      container.appendChild(label)

      const list = document.createElement('div')
      list.id = 'cell-mc-options'
      list.className = 'mc-options-list'

      for (const [i, opt] of question.options.entries()) {
        list.appendChild(buildMcOptionRow(i, opt, i === question.correctIndex))
      }
      container.appendChild(list)

      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'edit-add-btn'
      addBtn.textContent = '+ Add Option'
      addBtn.dataset.action = 'mc-add-option'
      if (question.options.length >= 6) addBtn.style.display = 'none'
      container.appendChild(addBtn)
      break
    }
    case QUESTION_TYPE.trueFalse: {
      const label = document.createElement('div')
      label.className = 'field-label'
      label.textContent = 'Correct Answer'
      container.appendChild(label)

      const row = document.createElement('div')
      row.className = 'tf-radio-row'

      for (const val of [true, false] as const) {
        const radioLabel = document.createElement('label')
        radioLabel.className = 'tf-radio-label'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'cell-tf'
        radio.value = String(val)
        if (question.correctAnswer === val) radio.checked = true

        radioLabel.appendChild(radio)
        radioLabel.appendChild(document.createTextNode(val ? 'True' : 'False'))
        row.appendChild(radioLabel)
      }
      container.appendChild(row)
      break
    }
    case QUESTION_TYPE.ordering: {
      const label = document.createElement('div')
      label.className = 'field-label'
      label.textContent = 'Items (in correct order — shuffled during play)'
      container.appendChild(label)

      const list = document.createElement('div')
      list.id = 'cell-ord-items'
      list.className = 'ord-items-list'

      for (const [i, ordItem] of question.items.entries()) {
        list.appendChild(buildOrderingItemRow(i, ordItem, question.items.length))
      }
      container.appendChild(list)

      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'edit-add-btn'
      addBtn.textContent = '+ Add Item'
      addBtn.dataset.action = 'ord-add-item'
      container.appendChild(addBtn)
      break
    }
    case QUESTION_TYPE.numeric: {
      const valLabel = document.createElement('div')
      valLabel.className = 'field-label'
      valLabel.textContent = 'Correct Value'
      container.appendChild(valLabel)

      const valInput = document.createElement('input')
      valInput.type = 'number'
      valInput.className = 'edit-input'
      valInput.id = 'cell-numeric-value'
      valInput.value = String(question.correctValue)
      container.appendChild(valInput)

      const unitLabel = document.createElement('div')
      unitLabel.className = 'field-label'
      unitLabel.textContent = 'Unit (optional)'
      container.appendChild(unitLabel)

      const unitInput = document.createElement('input')
      unitInput.className = 'edit-input'
      unitInput.id = 'cell-numeric-unit'
      unitInput.value = question.unit ?? ''
      unitInput.placeholder = 'e.g. km, years, meters'
      container.appendChild(unitInput)
      break
    }
    case QUESTION_TYPE.multiPartMedia: {
      const label = document.createElement('div')
      label.className = 'field-label'
      label.textContent = 'Parts (each needs media + answer)'
      container.appendChild(label)

      const list = document.createElement('div')
      list.id = 'cell-mpm-parts'
      list.className = 'mpm-parts-list'
      for (const [i, part] of question.parts.entries()) {
        list.appendChild(buildMultiPartMediaRow(i, part, question.parts.length))
      }
      container.appendChild(list)

      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'edit-add-btn'
      addBtn.textContent = '+ Add Part'
      addBtn.dataset.action = 'mpm-add-part'
      container.appendChild(addBtn)
      break
    }
    default: {
      const _exhaustive: never = question
      throw new Error(`unreachable: unknown question type ${(_exhaustive as Question).type}`)
    }
  }
}

function buildMcOptionRow(index: number, value: string, checked: boolean): HTMLElement {
  const row = document.createElement('div')
  row.className = 'mc-option-row'

  const radio = document.createElement('input')
  radio.type = 'radio'
  radio.name = 'cell-mc-correct'
  radio.value = String(index)
  if (checked) radio.checked = true
  row.appendChild(radio)

  const label = document.createElement('span')
  label.className = 'mc-option-label'
  label.textContent = String.fromCharCode(65 + index) + '.'
  row.appendChild(label)

  const input = document.createElement('input')
  input.className = 'edit-input mc-option-input'
  input.value = value
  input.placeholder = `Option ${String.fromCharCode(65 + index)}`
  row.appendChild(input)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ec-remove-btn'
  removeBtn.textContent = '✕'
  removeBtn.dataset.action = 'mc-remove-option'
  row.appendChild(removeBtn)

  return row
}

function buildOrderingItemRow(index: number, item: OrderingItem, total: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ord-item-row'
  if (item.media) row.classList.add('has-media')

  // Top bar: number, input, media toggle, move buttons, remove
  const topBar = document.createElement('div')
  topBar.className = 'ord-item-top'

  const num = document.createElement('span')
  num.className = 'ord-item-num'
  num.textContent = `${index + 1}.`
  topBar.appendChild(num)

  const input = document.createElement('input')
  input.className = 'edit-input ord-item-input'
  input.value = item.label
  input.placeholder = `Item ${index + 1}`
  topBar.appendChild(input)

  const mediaToggle = document.createElement('button')
  mediaToggle.type = 'button'
  mediaToggle.className = 'ord-media-toggle'
  mediaToggle.textContent = item.media ? '♫' : '♪'
  mediaToggle.title = 'Toggle media attachment'
  mediaToggle.dataset.action = 'ord-toggle-media'
  if (item.media) mediaToggle.classList.add('active')
  topBar.appendChild(mediaToggle)

  const btnGroup = document.createElement('span')
  btnGroup.className = 'ord-btn-group'

  const upBtn = document.createElement('button')
  upBtn.type = 'button'
  upBtn.className = 'ord-move-btn'
  upBtn.textContent = '▲'
  upBtn.dataset.action = 'ord-move-up'
  if (index === 0) upBtn.disabled = true
  btnGroup.appendChild(upBtn)

  const downBtn = document.createElement('button')
  downBtn.type = 'button'
  downBtn.className = 'ord-move-btn'
  downBtn.textContent = '▼'
  downBtn.dataset.action = 'ord-move-down'
  if (index === total - 1) downBtn.disabled = true
  btnGroup.appendChild(downBtn)

  topBar.appendChild(btnGroup)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ec-remove-btn'
  removeBtn.textContent = '✕'
  removeBtn.dataset.action = 'ord-remove-item'
  topBar.appendChild(removeBtn)

  row.appendChild(topBar)

  // Media section (stacks below the top bar)
  const mediaSec = document.createElement('div')
  mediaSec.className = 'ord-item-media'
  mediaSec.style.display = item.media ? '' : 'none'

  const mediaTypeSelect = document.createElement('select')
  mediaTypeSelect.className = 'edit-input ord-media-type'
  for (const [value, label] of [['none', 'None'], ['image', 'Image'], ['youtube', 'YouTube']] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (item.media?.type === value) opt.selected = true
    if (!item.media && value === 'none') opt.selected = true
    mediaTypeSelect.appendChild(opt)
  }
  mediaSec.appendChild(mediaTypeSelect)

  // Image sub
  const imgSub = document.createElement('div')
  imgSub.className = 'ord-img-section'
  imgSub.style.display = item.media?.type === MEDIA_TYPE.image ? '' : 'none'

  const imgUrl = document.createElement('input')
  imgUrl.type = 'url'
  imgUrl.className = 'edit-input ord-img-url'
  imgUrl.placeholder = 'Image URL...'
  if (item.media?.type === MEDIA_TYPE.image && item.media.src.startsWith('http')) {
    imgUrl.value = item.media.src
  }
  imgSub.appendChild(imgUrl)

  const imgPreview = document.createElement('img')
  imgPreview.className = 'img-preview-thumb ord-img-preview'
  imgPreview.alt = 'Item image'
  if (item.media?.type === MEDIA_TYPE.image && item.media.src) {
    imgPreview.src = item.media.src
    imgPreview.style.display = 'block'
  } else {
    imgPreview.style.display = 'none'
  }
  imgSub.appendChild(imgPreview)
  mediaSec.appendChild(imgSub)

  // YouTube sub
  const ytSub = document.createElement('div')
  ytSub.className = 'ord-yt-section'
  ytSub.style.display = item.media?.type === MEDIA_TYPE.youtube ? '' : 'none'

  const ytUrl = document.createElement('input')
  ytUrl.type = 'url'
  ytUrl.className = 'edit-input ord-yt-url'
  ytUrl.placeholder = 'YouTube URL...'
  if (item.media?.type === MEDIA_TYPE.youtube) {
    ytUrl.value = `https://www.youtube.com/watch?v=${item.media.videoId}`
  }
  ytSub.appendChild(ytUrl)

  const ytThumb = document.createElement('img')
  ytThumb.className = 'media-yt-thumb ord-yt-thumb'
  ytThumb.alt = 'YouTube thumbnail'
  if (item.media?.type === MEDIA_TYPE.youtube) {
    ytThumb.src = `https://img.youtube.com/vi/${item.media.videoId}/hqdefault.jpg`
    ytThumb.style.display = 'block'
  } else {
    ytThumb.style.display = 'none'
  }
  ytSub.appendChild(ytThumb)

  const timeRow = document.createElement('div')
  timeRow.className = 'media-time-row'
  const startLabel = document.createElement('label')
  startLabel.textContent = 'Start'
  timeRow.appendChild(startLabel)
  const startInput = document.createElement('input')
  startInput.type = 'number'
  startInput.className = 'edit-input ord-yt-start'
  startInput.min = '0'
  startInput.placeholder = '0'
  if (item.media?.type === MEDIA_TYPE.youtube && item.media.startSeconds !== undefined) {
    startInput.value = String(item.media.startSeconds)
  }
  timeRow.appendChild(startInput)
  const endLabel = document.createElement('label')
  endLabel.textContent = 'End'
  timeRow.appendChild(endLabel)
  const endInput = document.createElement('input')
  endInput.type = 'number'
  endInput.className = 'edit-input ord-yt-end'
  endInput.min = '0'
  endInput.placeholder = ''
  if (item.media?.type === MEDIA_TYPE.youtube && item.media.endSeconds !== undefined) {
    endInput.value = String(item.media.endSeconds)
  }
  timeRow.appendChild(endInput)
  ytSub.appendChild(timeRow)
  mediaSec.appendChild(ytSub)

  row.appendChild(mediaSec)

  return row
}

function buildMultiPartMediaRow(index: number, part: MultiPartMediaPart, total: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'mpm-part-row'
  row.dataset.partIdx = String(index)

  const header = document.createElement('div')
  header.className = 'mpm-part-header'
  const num = document.createElement('span')
  num.className = 'mpm-part-num'
  num.textContent = `Part ${index + 1}`
  header.appendChild(num)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ec-remove-btn'
  removeBtn.textContent = '✕'
  removeBtn.dataset.action = 'mpm-remove-part'
  if (total <= 1) removeBtn.style.display = 'none'
  header.appendChild(removeBtn)
  row.appendChild(header)

  const mediaTypeSelect = document.createElement('select')
  mediaTypeSelect.className = 'edit-input mpm-media-type'
  for (const [value, label] of [['image', 'Image'], ['youtube', 'YouTube']] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (part.media.type === value) opt.selected = true
    mediaTypeSelect.appendChild(opt)
  }
  row.appendChild(mediaTypeSelect)

  // Image subsection
  const imgSec = document.createElement('div')
  imgSec.className = 'mpm-img-section'
  imgSec.style.display = part.media.type === MEDIA_TYPE.image ? '' : 'none'

  const imgUrlInput = document.createElement('input')
  imgUrlInput.type = 'url'
  imgUrlInput.className = 'edit-input mpm-img-url'
  imgUrlInput.placeholder = 'Paste image URL...'
  if (part.media.type === MEDIA_TYPE.image && part.media.src.startsWith('http')) {
    imgUrlInput.value = part.media.src
  }
  imgSec.appendChild(imgUrlInput)

  const imgUrlError = document.createElement('div')
  imgUrlError.className = 'media-error mpm-img-url-error'
  imgSec.appendChild(imgUrlError)

  const orText = document.createElement('div')
  orText.className = 'media-or'
  orText.textContent = 'or'
  imgSec.appendChild(orText)

  const imgBtnRow = document.createElement('div')
  imgBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center'

  const chooseBtn = document.createElement('button')
  chooseBtn.type = 'button'
  chooseBtn.className = 'img-file-btn'
  chooseBtn.textContent = 'Choose Image'
  chooseBtn.dataset.action = 'mpm-choose-image'
  imgBtnRow.appendChild(chooseBtn)

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'img-clear-btn mpm-img-clear'
  clearBtn.textContent = 'Remove'
  clearBtn.dataset.action = 'mpm-clear-image'
  clearBtn.style.display = part.media.type === MEDIA_TYPE.image && part.media.src ? 'inline-block' : 'none'
  imgBtnRow.appendChild(clearBtn)
  imgSec.appendChild(imgBtnRow)

  const preview = document.createElement('img')
  preview.className = 'img-preview-thumb mpm-img-preview'
  preview.alt = 'Part image preview'
  if (part.media.type === MEDIA_TYPE.image && part.media.src) {
    preview.src = part.media.src
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
  imgSec.appendChild(preview)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.className = 'mpm-img-file'
  fileInput.style.display = 'none'
  imgSec.appendChild(fileInput)

  row.appendChild(imgSec)

  // YouTube subsection
  const ytSec = document.createElement('div')
  ytSec.className = 'mpm-yt-section'
  ytSec.style.display = part.media.type === MEDIA_TYPE.youtube ? '' : 'none'

  const ytUrlInput = document.createElement('input')
  ytUrlInput.type = 'url'
  ytUrlInput.className = 'edit-input mpm-yt-url'
  ytUrlInput.placeholder = 'Paste YouTube URL...'
  if (part.media.type === MEDIA_TYPE.youtube) {
    ytUrlInput.value = `https://www.youtube.com/watch?v=${part.media.videoId}`
  }
  ytSec.appendChild(ytUrlInput)

  const ytError = document.createElement('div')
  ytError.className = 'media-error mpm-yt-error'
  ytSec.appendChild(ytError)

  const ytThumb = document.createElement('img')
  ytThumb.className = 'media-yt-thumb mpm-yt-thumb'
  ytThumb.alt = 'YouTube thumbnail'
  if (part.media.type === MEDIA_TYPE.youtube) {
    ytThumb.src = `https://img.youtube.com/vi/${part.media.videoId}/hqdefault.jpg`
    ytThumb.style.display = 'block'
  } else {
    ytThumb.style.display = 'none'
  }
  ytSec.appendChild(ytThumb)

  const timeRow = document.createElement('div')
  timeRow.className = 'media-time-row'

  const startLabel = document.createElement('label')
  startLabel.textContent = 'Start (sec)'
  timeRow.appendChild(startLabel)

  const startInput = document.createElement('input')
  startInput.type = 'number'
  startInput.className = 'edit-input mpm-yt-start'
  startInput.min = '0'
  startInput.placeholder = '0'
  if (part.media.type === MEDIA_TYPE.youtube && part.media.startSeconds !== undefined) {
    startInput.value = String(part.media.startSeconds)
  }
  timeRow.appendChild(startInput)

  const endLabel = document.createElement('label')
  endLabel.textContent = 'End (sec)'
  timeRow.appendChild(endLabel)

  const endInput = document.createElement('input')
  endInput.type = 'number'
  endInput.className = 'edit-input mpm-yt-end'
  endInput.min = '0'
  endInput.placeholder = ''
  if (part.media.type === MEDIA_TYPE.youtube && part.media.endSeconds !== undefined) {
    endInput.value = String(part.media.endSeconds)
  }
  timeRow.appendChild(endInput)

  ytSec.appendChild(timeRow)
  row.appendChild(ytSec)

  // Answer input
  const ansLabel = document.createElement('div')
  ansLabel.className = 'field-label'
  ansLabel.textContent = 'Answer'
  row.appendChild(ansLabel)

  const ansInput = document.createElement('input')
  ansInput.className = 'edit-input mpm-answer-input'
  ansInput.value = part.answer
  ansInput.placeholder = 'Correct answer for this part'
  row.appendChild(ansInput)

  return row
}

function rebuildMpmPartNumbers(list: HTMLElement): void {
  const rows = list.querySelectorAll('.mpm-part-row')
  const total = rows.length
  for (const [i, row] of [...rows].entries()) {
    (row as HTMLElement).dataset.partIdx = String(i)
    const num = row.querySelector('.mpm-part-num')
    if (num) num.textContent = `Part ${i + 1}`
    const removeBtn = row.querySelector<HTMLElement>('[data-action="mpm-remove-part"]')
    if (removeBtn) removeBtn.style.display = total <= 1 ? 'none' : ''
  }
}

function readPartMedia(row: HTMLElement): QuestionMedia {
  const typeSelect = row.querySelector('.mpm-media-type') as HTMLSelectElement | null
  const mediaType = typeSelect?.value ?? 'image'

  if (mediaType === 'youtube') {
    const urlInput = row.querySelector('.mpm-yt-url') as HTMLInputElement | null
    const parsed = urlInput?.value ? parseYoutubeUrl(urlInput.value) : undefined
    if (parsed) {
      const startEl = row.querySelector('.mpm-yt-start') as HTMLInputElement | null
      const endEl = row.querySelector('.mpm-yt-end') as HTMLInputElement | null
      const startVal = startEl?.value ? Number(startEl.value) : undefined
      const endVal = endEl?.value ? Number(endEl.value) : undefined
      const result: QuestionMedia = { type: MEDIA_TYPE.youtube, videoId: parsed.videoId }
      if (startVal !== undefined && Number.isFinite(startVal)) result.startSeconds = startVal
      if (endVal !== undefined && Number.isFinite(endVal)) result.endSeconds = endVal
      return result
    }
  }

  // Check for staged file upload
  const partIdx = row.dataset.partIdx
  const stagingKey = mpmStagingKey(partIdx ?? '0')
  const staged = mediaStaging[stagingKey]
  if (staged && staged.type === MEDIA_TYPE.image) return staged

  const urlInput = row.querySelector('.mpm-img-url') as HTMLInputElement | null
  const urlVal = urlInput?.value.trim()
  if (urlVal) return { type: MEDIA_TYPE.image, src: urlVal }

  // Fallback: preview src (may be from a prior load)
  const preview = row.querySelector('.mpm-img-preview') as HTMLImageElement | null
  if (preview?.src && preview.style.display !== 'none') return { type: MEDIA_TYPE.image, src: preview.src }

  return { type: MEDIA_TYPE.image, src: '' }
}

function readOrderingItemMedia(row: HTMLElement): QuestionMedia | undefined {
  const typeSelect = row.querySelector('.ord-media-type') as HTMLSelectElement | null
  if (!typeSelect || typeSelect.value === 'none') return undefined

  if (typeSelect.value === 'youtube') {
    const urlInput = row.querySelector('.ord-yt-url') as HTMLInputElement | null
    const parsed = urlInput?.value ? parseYoutubeUrl(urlInput.value) : undefined
    if (parsed) {
      const startEl = row.querySelector('.ord-yt-start') as HTMLInputElement | null
      const endEl = row.querySelector('.ord-yt-end') as HTMLInputElement | null
      const startVal = startEl?.value ? Number(startEl.value) : undefined
      const endVal = endEl?.value ? Number(endEl.value) : undefined
      const result: QuestionMedia = { type: MEDIA_TYPE.youtube, videoId: parsed.videoId }
      if (startVal !== undefined && Number.isFinite(startVal)) result.startSeconds = startVal
      if (endVal !== undefined && Number.isFinite(endVal)) result.endSeconds = endVal
      return result
    }
    return undefined
  }

  const urlInput = row.querySelector('.ord-img-url') as HTMLInputElement | null
  const urlVal = urlInput?.value.trim()
  if (urlVal) return { type: MEDIA_TYPE.image, src: urlVal }

  const preview = row.querySelector('.ord-img-preview') as HTMLImageElement | null
  if (preview?.src && preview.style.display !== 'none') return { type: MEDIA_TYPE.image, src: preview.src }

  return undefined
}

function mpmStagingKey(partIdx: string): string {
  if (!activeEditCell) return `mpm-${partIdx}`
  return `${activeEditCell.ci}-${activeEditCell.qi}-part-${partIdx}`
}

function readQuestionFromDOM(currentType: QuestionType): Question {
  const q = (document.getElementById('cell-q') as HTMLTextAreaElement | null)?.value ?? ''

  switch (currentType) {
    case QUESTION_TYPE.open: {
      const a = (document.getElementById('cell-a') as HTMLInputElement | null)?.value ?? ''
      return { type: QUESTION_TYPE.open, q, a }
    }
    case QUESTION_TYPE.multipleChoice: {
      const rows = document.querySelectorAll('#cell-mc-options .mc-option-row')
      const options: string[] = []
      let correctIndex = 0
      for (const [i, row] of [...rows].entries()) {
        const input = row.querySelector('.mc-option-input') as HTMLInputElement | null
        options.push(input?.value ?? '')
        const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null
        if (radio?.checked) correctIndex = i
      }
      return { type: QUESTION_TYPE.multipleChoice, q, options, correctIndex }
    }
    case QUESTION_TYPE.trueFalse: {
      const checked = document.querySelector<HTMLInputElement>('input[name="cell-tf"]:checked')
      return { type: QUESTION_TYPE.trueFalse, q, correctAnswer: checked?.value === 'true' }
    }
    case QUESTION_TYPE.ordering: {
      const rows = document.querySelectorAll('#cell-ord-items .ord-item-row')
      const items: OrderingItem[] = []
      for (const row of rows) {
        const input = row.querySelector('.ord-item-input') as HTMLInputElement | null
        const label = input?.value ?? ''
        const media = readOrderingItemMedia(row as HTMLElement)
        const ordItem: OrderingItem = { label }
        if (media) ordItem.media = media
        items.push(ordItem)
      }
      return { type: QUESTION_TYPE.ordering, q, items }
    }
    case QUESTION_TYPE.numeric: {
      const val = Number((document.getElementById('cell-numeric-value') as HTMLInputElement | null)?.value) || 0
      const unit = (document.getElementById('cell-numeric-unit') as HTMLInputElement | null)?.value.trim()
      const result: Question = { type: QUESTION_TYPE.numeric, q, correctValue: val }
      if (unit) (result as { unit: string }).unit = unit
      return result
    }
    case QUESTION_TYPE.multiPartMedia: {
      const rows = document.querySelectorAll('#cell-mpm-parts .mpm-part-row')
      const parts: MultiPartMediaPart[] = []
      for (const row of rows) {
        const answer = (row.querySelector('.mpm-answer-input') as HTMLInputElement | null)?.value ?? ''
        const media = readPartMedia(row as HTMLElement)
        parts.push({ media, answer })
      }
      if (parts.length === 0) {
        parts.push({ media: { type: MEDIA_TYPE.image, src: '' }, answer: '' })
      }
      return { type: QUESTION_TYPE.multiPartMedia, q, parts }
    }
    default: {
      const _exhaustive: never = currentType
      throw new Error(`unreachable: unknown question type ${_exhaustive}`)
    }
  }
}

function convertQuestion(from: Question, toType: QuestionType): Question {
  const base = { q: from.q, ...(from.media ? { media: from.media } : {}), ...(from.x2 ? { x2: true as const } : {}) }

  switch (toType) {
    case QUESTION_TYPE.open:
      return { ...base, type: QUESTION_TYPE.open, a: '' }
    case QUESTION_TYPE.multipleChoice:
      return { ...base, type: QUESTION_TYPE.multipleChoice, options: ['', '', '', ''], correctIndex: 0 }
    case QUESTION_TYPE.trueFalse:
      return { ...base, type: QUESTION_TYPE.trueFalse, correctAnswer: true }
    case QUESTION_TYPE.ordering:
      return { ...base, type: QUESTION_TYPE.ordering, items: [{ label: '' }, { label: '' }] }
    case QUESTION_TYPE.numeric:
      return { ...base, type: QUESTION_TYPE.numeric, correctValue: 0 }
    case QUESTION_TYPE.multiPartMedia: {
      const defaultMedia: QuestionMedia = base.media ?? { type: MEDIA_TYPE.image, src: '' }
      return { ...base, type: QUESTION_TYPE.multiPartMedia, parts: [{ media: defaultMedia, answer: '' }] }
    }
    default: {
      const _exhaustive: never = toType
      throw new Error(`unreachable: unknown question type ${_exhaustive}`)
    }
  }
}

function rebuildMcLabels(list: HTMLElement): void {
  for (const [i, row] of [...list.children].entries()) {
    const label = row.querySelector('.mc-option-label')
    if (label) label.textContent = String.fromCharCode(65 + i) + '.'
    const input = row.querySelector('.mc-option-input') as HTMLInputElement | null
    if (input) input.placeholder = `Option ${String.fromCharCode(65 + i)}`
    const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null
    if (radio) radio.value = String(i)
  }
}

function rebuildOrdControls(list: HTMLElement): void {
  const rows = [...list.children]
  for (const [i, row] of rows.entries()) {
    const num = row.querySelector('.ord-item-num')
    if (num) num.textContent = `${i + 1}.`
    const input = row.querySelector('.ord-item-input') as HTMLInputElement | null
    if (input) input.placeholder = `Item ${i + 1}`
    const upBtn = row.querySelector('[data-action="ord-move-up"]') as HTMLButtonElement | null
    if (upBtn) upBtn.disabled = i === 0
    const downBtn = row.querySelector('[data-action="ord-move-down"]') as HTMLButtonElement | null
    if (downBtn) downBtn.disabled = i === rows.length - 1
  }
}

let editingQuestionType: QuestionType = QUESTION_TYPE.open

// ── Cell Edit ──

function editCell(ci: number, qi: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  const question = cat.questions[qi]
  if (!question) return
  const pts = cat.points[qi] ?? 100

  const content = $('edit-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.className = 'modal-title'
  title.textContent = 'Edit Question'
  content.appendChild(title)

  const context = document.createElement('div')
  context.className = 'cell-editor-context'
  const catDot = document.createElement('span')
  catDot.className = 'cell-editor-dot'
  catDot.dataset.color = cat.color
  context.appendChild(catDot)
  context.appendChild(document.createTextNode(`${cat.name} — ${pts} pts`))
  content.appendChild(context)

  const ptsLabel = document.createElement('div')
  ptsLabel.className = 'field-label'
  ptsLabel.textContent = 'Points'
  content.appendChild(ptsLabel)

  const ptsInput = document.createElement('input')
  ptsInput.type = 'number'
  ptsInput.className = 'ec-pts-input'
  ptsInput.id = 'cell-pts'
  ptsInput.value = String(pts)
  ptsInput.min = '0'
  ptsInput.step = '50'
  ptsInput.style.width = '100%'
  content.appendChild(ptsInput)

  const x2Label = document.createElement('label')
  x2Label.className = 'x2-toggle'
  const x2Checkbox = document.createElement('input')
  x2Checkbox.type = 'checkbox'
  x2Checkbox.className = 'x2-toggle__checkbox'
  x2Checkbox.id = 'cell-x2'
  x2Checkbox.checked = question.x2 === true
  x2Label.appendChild(x2Checkbox)
  x2Label.appendChild(document.createTextNode('×2 Multiplier'))
  content.appendChild(x2Label)

  const isStealCat = data.categories[ci]?.steal === true
  const ffaLabel = document.createElement('label')
  ffaLabel.className = 'ffa-toggle'
  if (isStealCat) ffaLabel.style.display = 'none'
  const ffaCheckbox = document.createElement('input')
  ffaCheckbox.type = 'checkbox'
  ffaCheckbox.className = 'ffa-toggle__checkbox'
  ffaCheckbox.id = 'cell-ffa'
  ffaCheckbox.checked = !isStealCat && question.ffa === true
  ffaLabel.appendChild(ffaCheckbox)
  ffaLabel.appendChild(document.createTextNode('Free for All'))
  content.appendChild(ffaLabel)

  activeEditCell = { ci, qi }
  editingQuestionType = question.type

  const typeLabel = document.createElement('div')
  typeLabel.className = 'field-label'
  typeLabel.textContent = 'Answer Type'
  content.appendChild(typeLabel)

  const typeSelect = document.createElement('select')
  typeSelect.className = 'edit-input'
  typeSelect.id = 'cell-type'
  for (const [value, label] of Object.entries(TYPE_LABELS)) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    if (value === question.type) option.selected = true
    typeSelect.appendChild(option)
  }
  content.appendChild(typeSelect)

  const qLabel = document.createElement('div')
  qLabel.className = 'field-label'
  qLabel.textContent = 'Question'
  content.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'edit-textarea'
  qTextarea.id = 'cell-q'
  qTextarea.value = question.q
  content.appendChild(qTextarea)

  const answerContainer = document.createElement('div')
  answerContainer.id = 'cell-answer-fields'
  renderAnswerFields(answerContainer, question)
  content.appendChild(answerContainer)

  const mediaWrap = document.createElement('div')
  mediaWrap.id = 'cell-media-wrap'
  if (question.type === QUESTION_TYPE.multiPartMedia) mediaWrap.style.display = 'none'

  const mediaLabel = document.createElement('div')
  mediaLabel.className = 'field-label'
  mediaLabel.textContent = 'Media (optional)'
  mediaWrap.appendChild(mediaLabel)

  const mediaTypeSelect = document.createElement('select')
  mediaTypeSelect.className = 'edit-input'
  mediaTypeSelect.id = 'cell-media-type'
  for (const [value, label] of [['none', 'None'], ['image', 'Image'], ['youtube', 'YouTube Music']] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (question.media?.type === value || (!question.media && value === 'none')) opt.selected = true
    mediaTypeSelect.appendChild(opt)
  }
  mediaWrap.appendChild(mediaTypeSelect)

  const mediaSection = document.createElement('div')
  mediaSection.className = 'media-section'

  // Image sub-section
  const imageSection = document.createElement('div')
  imageSection.id = 'cell-media-image'
  imageSection.className = 'media-subsection'
  imageSection.style.display = question.media?.type === MEDIA_TYPE.image ? '' : 'none'

  const imgUrlInput = document.createElement('input')
  imgUrlInput.type = 'url'
  imgUrlInput.className = 'edit-input'
  imgUrlInput.id = 'cell-img-url'
  imgUrlInput.placeholder = 'Paste image URL...'
  if (question.media?.type === MEDIA_TYPE.image && question.media.src.startsWith('http')) {
    imgUrlInput.value = question.media.src
  }
  imageSection.appendChild(imgUrlInput)

  const imgUrlError = document.createElement('div')
  imgUrlError.className = 'media-error'
  imgUrlError.id = 'cell-img-url-error'
  imageSection.appendChild(imgUrlError)

  const orText = document.createElement('div')
  orText.className = 'media-or'
  orText.textContent = 'or'
  imageSection.appendChild(orText)

  const imgBtnRow = document.createElement('div')
  imgBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center'

  const chooseBtn = document.createElement('button')
  chooseBtn.type = 'button'
  chooseBtn.className = 'img-file-btn'
  chooseBtn.textContent = 'Choose Image'
  chooseBtn.dataset.action = 'cell-choose-image'
  imgBtnRow.appendChild(chooseBtn)

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'img-clear-btn'
  clearBtn.id = 'cell-img-clear'
  clearBtn.textContent = 'Remove'
  clearBtn.dataset.action = 'cell-clear-media'
  clearBtn.dataset.ci = String(ci)
  clearBtn.dataset.qi = String(qi)
  clearBtn.style.display = question.media?.type === MEDIA_TYPE.image ? 'inline-block' : 'none'
  imgBtnRow.appendChild(clearBtn)

  imageSection.appendChild(imgBtnRow)

  const preview = document.createElement('img')
  preview.className = 'img-preview-thumb'
  preview.id = 'cell-img-preview'
  preview.alt = 'Question image preview'
  if (question.media?.type === MEDIA_TYPE.image) {
    preview.src = question.media.src
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
  imageSection.appendChild(preview)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.id = 'cell-img-file'
  fileInput.dataset.ci = String(ci)
  fileInput.dataset.qi = String(qi)
  fileInput.style.display = 'none'
  imageSection.appendChild(fileInput)

  mediaSection.appendChild(imageSection)

  // YouTube sub-section
  const ytSection = document.createElement('div')
  ytSection.id = 'cell-media-youtube'
  ytSection.className = 'media-subsection'
  ytSection.style.display = question.media?.type === MEDIA_TYPE.youtube ? '' : 'none'

  const ytUrlInput = document.createElement('input')
  ytUrlInput.type = 'url'
  ytUrlInput.className = 'edit-input'
  ytUrlInput.id = 'cell-yt-url'
  ytUrlInput.placeholder = 'Paste YouTube URL...'
  if (question.media?.type === MEDIA_TYPE.youtube) {
    ytUrlInput.value = `https://www.youtube.com/watch?v=${question.media.videoId}`
  }
  ytSection.appendChild(ytUrlInput)

  const ytError = document.createElement('div')
  ytError.className = 'media-error'
  ytError.id = 'cell-yt-error'
  ytSection.appendChild(ytError)

  const ytThumb = document.createElement('img')
  ytThumb.className = 'media-yt-thumb'
  ytThumb.id = 'cell-yt-thumb'
  ytThumb.alt = 'YouTube thumbnail'
  if (question.media?.type === MEDIA_TYPE.youtube) {
    ytThumb.src = `https://img.youtube.com/vi/${question.media.videoId}/hqdefault.jpg`
    ytThumb.style.display = 'block'
  } else {
    ytThumb.style.display = 'none'
  }
  ytSection.appendChild(ytThumb)

  const timeRow = document.createElement('div')
  timeRow.className = 'media-time-row'

  const startLabel = document.createElement('label')
  startLabel.textContent = 'Start (sec)'
  timeRow.appendChild(startLabel)

  const startInput = document.createElement('input')
  startInput.type = 'number'
  startInput.className = 'edit-input'
  startInput.id = 'cell-yt-start'
  startInput.min = '0'
  startInput.placeholder = '0'
  if (question.media?.type === MEDIA_TYPE.youtube && question.media.startSeconds !== undefined) {
    startInput.value = String(question.media.startSeconds)
  }
  timeRow.appendChild(startInput)

  const endLabel = document.createElement('label')
  endLabel.textContent = 'End (sec)'
  timeRow.appendChild(endLabel)

  const endInput = document.createElement('input')
  endInput.type = 'number'
  endInput.className = 'edit-input'
  endInput.id = 'cell-yt-end'
  endInput.min = '0'
  endInput.placeholder = ''
  if (question.media?.type === MEDIA_TYPE.youtube && question.media.endSeconds !== undefined) {
    endInput.value = String(question.media.endSeconds)
  }
  timeRow.appendChild(endInput)

  ytSection.appendChild(timeRow)
  mediaSection.appendChild(ytSection)
  mediaWrap.appendChild(mediaSection)
  content.appendChild(mediaWrap)

  const actions = document.createElement('div')
  actions.className = 'cell-editor-actions'

  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'edit-save'
  saveBtn.textContent = 'Save'
  saveBtn.dataset.action = 'save-cell'
  saveBtn.dataset.ci = String(ci)
  saveBtn.dataset.qi = String(qi)
  actions.appendChild(saveBtn)

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'cell-editor-cancel'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.dataset.action = 'cancel-cell'
  actions.appendChild(cancelBtn)

  content.appendChild(actions)

  $('edit-overlay').style.display = 'flex'
}

function readMediaFromEditForm(ci: number, qi: number, existingMedia: QuestionMedia | undefined): QuestionMedia | undefined {
  const typeSelect = document.getElementById('cell-media-type') as HTMLSelectElement | null
  if (!typeSelect) return existingMedia

  switch (typeSelect.value) {
    case 'none':
      return undefined

    case 'image': {
      const key = `${ci}-${qi}`
      const staged = mediaStaging[key]
      if (staged && staged.type === MEDIA_TYPE.image) return staged

      const urlInput = document.getElementById('cell-img-url') as HTMLInputElement | null
      const urlVal = urlInput?.value.trim()
      if (urlVal) return { type: MEDIA_TYPE.image, src: urlVal }

      if (existingMedia?.type === MEDIA_TYPE.image) return existingMedia
      return undefined
    }

    case 'youtube': {
      const urlInput = document.getElementById('cell-yt-url') as HTMLInputElement | null
      const parsed = urlInput?.value ? parseYoutubeUrl(urlInput.value) : undefined
      if (!parsed) {
        if (existingMedia?.type === MEDIA_TYPE.youtube) return existingMedia
        return undefined
      }
      const startEl = document.getElementById('cell-yt-start') as HTMLInputElement | null
      const endEl = document.getElementById('cell-yt-end') as HTMLInputElement | null
      const startVal = startEl?.value ? Number(startEl.value) : undefined
      const endVal = endEl?.value ? Number(endEl.value) : undefined
      const result: QuestionMedia = { type: MEDIA_TYPE.youtube, videoId: parsed.videoId }
      if (startVal !== undefined && Number.isFinite(startVal)) result.startSeconds = startVal
      if (endVal !== undefined && Number.isFinite(endVal)) result.endSeconds = endVal
      return result
    }

    default:
      return undefined
  }
}

function saveCellEdit(ci: number, qi: number): void {
  const cat = data.categories[ci]
  if (!cat) return

  const ptsEl = document.getElementById('cell-pts') as HTMLInputElement | null
  if (ptsEl) cat.points[qi] = Number(ptsEl.value) || 100

  const newQ = readQuestionFromDOM(editingQuestionType)

  const x2El = document.getElementById('cell-x2') as HTMLInputElement | null
  if (x2El?.checked) newQ.x2 = true

  const ffaEl = document.getElementById('cell-ffa') as HTMLInputElement | null
  if (ffaEl?.checked) newQ.ffa = true

  if (editingQuestionType !== QUESTION_TYPE.multiPartMedia) {
    const oldQ = cat.questions[qi]
    const media = readMediaFromEditForm(ci, qi, oldQ?.media)
    if (media) {
      newQ.media = media
    }
  }

  cat.questions[qi] = newQ
  activeEditCell = null
  clearRecord(mediaStaging)
  saveData()
  renderAll()
  closeEditModal()
}

// ── Reset ──

async function resetAll(): Promise<void> {
  if (!await showConfirm('Delete all categories and reset the board? This cannot be undone.')) return
  data.categories = []
  data.teams = []
  data.used = {}
  saveData()
  renderAll()
}

// ── Media Upload ──

function handleMediaFileUpload(ci: number, qi: number, file: File, previewId: string, clearBtnId: string): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = (e.target as FileReader).result as string
    mediaStaging[`${ci}-${qi}`] = { type: MEDIA_TYPE.image, src: base64 }
    const preview = document.getElementById(previewId) as HTMLImageElement | null
    if (preview) {
      preview.src = base64
      preview.style.display = 'block'
    }
    const clearBtn = document.getElementById(clearBtnId)
    if (clearBtn) clearBtn.style.display = 'inline-block'
    const urlInput = document.getElementById('cell-img-url') as HTMLInputElement | null
    if (urlInput) urlInput.value = ''
    const urlError = document.getElementById('cell-img-url-error')
    if (urlError) urlError.textContent = ''
  }
  reader.readAsDataURL(file)
}

// ── Admin Panel ──

function handleAdminImgUpload(ci: number, qi: number, file: File): void {
  handleMediaFileUpload(ci, qi, file, `adm-img-preview-${ci}-${qi}`, `adm-img-clear-${ci}-${qi}`)
}

function saveAdmin(): void {
  for (const [ci, cat] of data.categories.entries()) {
    const catInput = document.getElementById(`adm-cat-${ci}`) as HTMLInputElement | null
    if (catInput) cat.name = catInput.value.trim() || cat.name

    for (const [qi] of cat.questions.entries()) {
      const qEl = document.getElementById(`adm-q-${ci}-${qi}`) as HTMLTextAreaElement | null
      const aEl = document.getElementById(`adm-a-${ci}-${qi}`) as HTMLInputElement | null
      if (!qEl) continue

      const existing = cat.questions[qi]
      if (existing) {
        existing.q = qEl.value
        if (existing.type === QUESTION_TYPE.open && aEl) {
          existing.a = aEl.value
        }
      }

      const question = cat.questions[qi]
      if (!question) continue

      const mediaKey = `${ci}-${qi}`
      const mediaValue = mediaStaging[mediaKey]
      if (mediaValue !== undefined) {
        if (mediaValue) {
          question.media = mediaValue
        } else {
          delete question.media
        }
      }
    }
  }

  clearRecord(mediaStaging)
  saveData()
  renderAll()
  closeAdmin()
}

function closeAdmin(): void {
  $('admin-overlay').style.display = 'none'
}

// ── Teams & Scoring ──

function adjustScore(i: number, delta: number): void {
  const team = data.teams[i]
  if (!team) return
  team.score += delta
  saveData()
  renderScoreboard()
}

// ── Category Management ──

function addCategory(): void {
  if (data.categories.length >= MAX_CATEGORIES) return
  data.categories.push({
    id: crypto.randomUUID(),
    name: `Category ${data.categories.length + 1}`,
    color: nextColor(),
    points: [100, 200, 300, 400, 500],
    questions: Array.from({ length: 5 }, () => defaultQuestion()),
  })
  saveData()
  renderAll()
}

async function removeCategory(ci: number): Promise<void> {
  const cat = data.categories[ci]
  if (!cat) return
  if (!await showConfirm(`Remove category "${cat.name}"?`)) return
  data.categories.splice(ci, 1)
  saveData()
  renderAll()
}

// ── Team Setup ──

function buildTeamSetupRow(index: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ts-team-row'
  row.draggable = true

  const handle = document.createElement('span')
  handle.className = 'ts-drag-handle'
  handle.textContent = '⠿'
  row.appendChild(handle)

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'edit-input ts-team-name'
  input.value = `Team ${index + 1}`
  input.placeholder = 'Team name'
  row.appendChild(input)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ec-remove-btn'
  removeBtn.textContent = '✕'
  removeBtn.dataset.action = 'ts-remove-team'
  row.appendChild(removeBtn)

  return row
}

function openTeamSetup(): void {
  const content = $('team-setup-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:18px"
  title.textContent = 'Team Setup'
  content.appendChild(title)

  const styleLabel = document.createElement('label')
  styleLabel.className = 'ts-field-label'
  styleLabel.htmlFor = 'ts-play-style'
  styleLabel.textContent = 'Game Mode'
  content.appendChild(styleLabel)

  const styleSelect = document.createElement('select')
  styleSelect.className = 'edit-input'
  styleSelect.id = 'ts-play-style'
  const classicOpt = document.createElement('option')
  classicOpt.value = PLAY_STYLE.classic
  classicOpt.textContent = 'Classic — one question each'
  styleSelect.appendChild(classicOpt)
  const streakOpt = document.createElement('option')
  streakOpt.value = PLAY_STYLE.streak
  streakOpt.textContent = 'Streak — keep going until wrong'
  styleSelect.appendChild(streakOpt)
  styleSelect.value = PLAY_STYLE.classic
  content.appendChild(styleSelect)

  const teamsWrap = document.createElement('div')
  teamsWrap.id = 'ts-teams'
  content.appendChild(teamsWrap)

  for (let i = 0; i < 2; i++) {
    teamsWrap.appendChild(buildTeamSetupRow(i))
  }

  const hint = document.createElement('div')
  hint.className = 'ts-order-hint'
  hint.textContent = 'Drag to set turn order'
  content.appendChild(hint)

  let dragRow: HTMLElement | null = null

  teamsWrap.addEventListener('dragstart', (e) => {
    const row = (e.target as HTMLElement).closest('.ts-team-row') as HTMLElement | null
    if (!row) return
    dragRow = row
    row.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', '')
  })

  teamsWrap.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (!dragRow) return
    const target = (e.target as HTMLElement).closest('.ts-team-row') as HTMLElement | null
    if (!target || target === dragRow) return
    const rect = target.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    if (e.clientY < mid) {
      teamsWrap.insertBefore(dragRow, target)
    } else {
      teamsWrap.insertBefore(dragRow, target.nextSibling)
    }
  })

  teamsWrap.addEventListener('dragend', () => {
    if (dragRow) dragRow.classList.remove('dragging')
    dragRow = null
  })

  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'edit-add-btn'
  addBtn.textContent = '+ Add Team'
  addBtn.dataset.action = 'ts-add-team'
  addBtn.id = 'ts-add-btn'
  content.appendChild(addBtn)

  const startBtn = document.createElement('button')
  startBtn.type = 'button'
  startBtn.className = 'edit-save play-btn'
  startBtn.textContent = '▶ Start Game'
  startBtn.dataset.action = 'ts-start-game'
  content.appendChild(startBtn)

  $('team-setup-overlay').style.display = 'flex'
}

function startGame(): void {
  const rows = document.querySelectorAll('#ts-teams .ts-team-row')
  const teams: Team[] = []
  for (const row of rows) {
    const input = row.querySelector('.ts-team-name') as HTMLInputElement | null
    const name = input?.value.trim() || `Team ${teams.length + 1}`
    teams.push({ name, score: 0, streak: 0 })
  }
  if (teams.length < 2) return

  const styleSelect = document.getElementById('ts-play-style') as HTMLSelectElement | null
  data.playStyle = styleSelect?.value === PLAY_STYLE.streak ? PLAY_STYLE.streak : PLAY_STYLE.classic
  data.teams = teams
  data.used = {}
  data.currentTurnIndex = 0
  $('team-setup-overlay').style.display = 'none'
  switchMode(APP_MODE.play)
}

async function cancelGame(): Promise<void> {
  if (!await showConfirm('Cancel the game? All scores will be lost.')) return
  data.teams = []
  data.used = {}
  data.currentTurnIndex = 0
  data.playStyle = PLAY_STYLE.classic
  switchMode(APP_MODE.edit)
}

// ── Winner ──

function showWinner(): void {
  const sorted = [...data.teams].sort((a, b) => b.score - a.score)
  const top = sorted[0]
  if (!top) return
  const tied = sorted.filter((t) => t.score === top.score)

  const winnerContent = $('winner-content')
  winnerContent.textContent = ''

  if (tied.length > 1) {
    const tieName = document.createElement('div')
    tieName.className = 'winner-name'
    tieName.style.fontSize = '2rem'
    tieName.textContent = 'TIE!'
    winnerContent.appendChild(tieName)

    const tieNames = document.createElement('div')
    tieNames.style.cssText = 'font-size:1.1rem;color:var(--gold);margin:8px 0'
    tieNames.textContent = tied.map((t) => t.name).join(' & ')
    winnerContent.appendChild(tieNames)

    const tieScore = document.createElement('div')
    tieScore.className = 'winner-score'
    tieScore.textContent = top.score.toLocaleString() + ' points each'
    winnerContent.appendChild(tieScore)
  } else {
    const winName = document.createElement('div')
    winName.className = 'winner-name'
    winName.textContent = top.name
    winnerContent.appendChild(winName)

    const winScore = document.createElement('div')
    winScore.className = 'winner-score'
    winScore.textContent = top.score.toLocaleString() + ' points'
    winnerContent.appendChild(winScore)
  }

  const finalLabel = document.createElement('div')
  finalLabel.style.cssText = 'margin-top:16px;font-size:13px;color:var(--text-muted)'
  finalLabel.textContent = 'Final Scores'
  winnerContent.appendChild(finalLabel)

  const scoreList = document.createElement('div')
  scoreList.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:center'
  for (const [i, t] of sorted.entries()) {
    const row = document.createElement('div')
    row.style.cssText = `font-size:14px;color:${i === 0 ? 'var(--gold)' : 'var(--text-muted)'}`
    row.textContent = `${i + 1}. ${t.name} — ${t.score.toLocaleString()}`
    scoreList.appendChild(row)
  }
  winnerContent.appendChild(scoreList)

  $('winner-overlay').style.display = 'flex'
}

// ── Event Setup ──

function setupEvents(): void {
  const ac = new AbortController()
  const { signal } = ac

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        destroyYoutubePlayer()
        for (const id of ['q-overlay', 'edit-overlay', 'admin-overlay', 'winner-overlay', 'team-setup-overlay']) {
          $(id).style.display = 'none'
        }
      }
    },
    { signal },
  )

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      if ((e.currentTarget as HTMLElement).id === 'q-overlay') destroyYoutubePlayer()
      ;(e.currentTarget as HTMLElement).style.display = 'none'
    }
  }

  for (const id of ['q-overlay', 'edit-overlay', 'admin-overlay', 'winner-overlay', 'team-setup-overlay']) {
    $(id).addEventListener('click', handleOverlayClick, { signal })
  }

  // Controls
  $('controls').addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!btn) return
      switch (btn.dataset.action) {
        case 'add-category':
          addCategory()
          break
        case 'reset-all':
          resetAll()
          break
        case 'play-quiz':
          openTeamSetup()
          break
        case 'show-winner':
          showWinner()
          break
        case 'cancel-game':
          cancelGame()
          break
        default:
          break
      }
    },
    { signal },
  )

  // Question modal buttons
  $('btn-close-question').addEventListener('click', closeQModal, { signal })
  $('btn-reveal').addEventListener('click', revealAnswer, { signal })
  $('btn-correct').addEventListener('click', () => {
    if (mpmCarousel) { mpmCarouselJudge('correct'); return }
    markResult(true)
  }, { signal })
  $('btn-wrong').addEventListener('click', () => {
    if (mpmCarousel) { mpmCarouselJudge('wrong'); return }
    markResult(false)
  }, { signal })
  $('btn-skip').addEventListener('click', () => {
    if (mpmCarousel) { mpmCarouselJudge(null); return }
    skipQuestion()
  }, { signal })

  $('q-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      switch (target.dataset.action) {
        case 'yt-toggle-play':
          toggleYoutubePlayback()
          break
        case 'mc-select': {
          const card = target.closest('.play-mc-option') as HTMLElement | null
          if (!card) break
          if (card.closest('.play-mc-options')?.querySelector('.correct')) break
          card.parentElement?.querySelectorAll('.play-mc-option').forEach((s) => s.classList.remove('selected'))
          card.classList.add('selected')
          break
        }
        case 'mpm-yt-play':
        case 'ord-yt-play': {
          const videoId = target.dataset.videoId
          if (!videoId) break
          const startSec = target.dataset.start ? Number(target.dataset.start) : undefined
          const endSec = target.dataset.end ? Number(target.dataset.end) : undefined
          createYoutubePlayer('m-yt-player', videoId, startSec, endSec, true)
          $('m-yt-wrap').style.display = 'flex'
          break
        }
        case 'mpm-carousel-submit': {
          if (!activeQ || !mpmCarousel) break
          const correctCount = mpmCarousel.results.filter((r) => r === 'correct').length
          const totalParts = mpmCarousel.parts.length
          const pts = scorePartial(mpmCarousel.pts, totalParts, correctCount)

          const submitIsFfaMpm = mpmCarousel.ffaTeamPerPart.some((t) => t !== null)
          if (submitIsFfaMpm) {
            const perPart = Math.floor(mpmCarousel.pts / totalParts)
            for (const [i, result] of mpmCarousel.results.entries()) {
              if (result !== 'correct') continue
              const tIdx = mpmCarousel.ffaTeamPerPart[i]
              if (tIdx === null || tIdx === undefined) continue
              const team = data.teams[tIdx]
              if (team) team.score += perPart
            }
            if (data.playStyle === PLAY_STYLE.classic) {
              data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
            }
          } else if (mpmCarousel.teamIdx !== null) {
            const team = data.teams[mpmCarousel.teamIdx]
            if (!team) break
            team.score += pts
            if (data.playStyle === PLAY_STYLE.classic) {
              data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
            }
          } else {
            const team = data.teams[data.currentTurnIndex]
            if (!team) break

            const mpmStealTarget = activeQ.stealTargetIdx !== null
              ? data.teams[activeQ.stealTargetIdx]
              : null

            if (mpmStealTarget) {
              if (data.playStyle === PLAY_STYLE.streak) {
                if (correctCount === totalParts) {
                  const result = scoreCorrect(activeQ.pts, team.streak)
                  team.score += result.points
                  team.streak = result.newStreak
                  mpmStealTarget.score -= pts
                } else if (correctCount === 0) {
                  team.score -= mpmCarousel.pts
                  team.streak = 0
                  data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
                } else {
                  team.score += pts
                  mpmStealTarget.score -= pts
                  team.streak = 0
                  data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
                }
              } else {
                if (correctCount === 0) {
                  team.score -= mpmCarousel.pts
                } else {
                  team.score += pts
                  mpmStealTarget.score -= pts
                }
                data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
              }
            } else if (data.playStyle === PLAY_STYLE.streak) {
              if (correctCount === totalParts) {
                const result = scoreCorrect(activeQ.pts, team.streak)
                team.score += result.points
                team.streak = result.newStreak
              } else if (correctCount === 0) {
                team.streak = 0
                data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
              } else {
                team.score += pts
                team.streak = 0
                data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
              }
            } else {
              team.score += pts
              data.currentTurnIndex = (data.currentTurnIndex + 1) % data.teams.length
            }
          }

          mpmCarousel = null
          saveData()
          markUsed()
          closeQModal()
          renderScoreboard()
          renderSubtitle()
          break
        }
        case 'ffa-pick-team': {
          const teamIdx = Number(target.dataset.teamIdx)
          if (!activeQ) { markFfaResult(teamIdx); break }
          const cat = data.categories[activeQ.catIdx]
          const q = cat?.questions[activeQ.qIdx]

          if (q?.type === QUESTION_TYPE.multiPartMedia && mpmCarousel) {
            mpmCarousel.ffaTeamPerPart[mpmCarousel.currentIdx] = teamIdx
            const picker = document.getElementById('ffa-team-picker')
            if (picker) picker.remove()
            const teamEl = $('m-teams')
            teamEl.textContent = ''
            const label = document.createElement('div')
            label.className = 'current-team-label'
            label.textContent = `${data.teams[teamIdx]?.name ?? ''}'s answer`
            teamEl.appendChild(label)
            $('btn-correct').style.display = 'inline-flex'
            $('btn-wrong').style.display = 'inline-flex'
            $('btn-skip').style.display = 'none'
          } else {
            markFfaResult(teamIdx)
          }
          break
        }
        case 'ffa-nobody': {
          if (mpmCarousel && activeQ) {
            const nobodyCat = data.categories[activeQ.catIdx]
            const nobodyQ = nobodyCat?.questions[activeQ.qIdx]
            if (nobodyQ?.ffa && nobodyQ.type === QUESTION_TYPE.multiPartMedia) {
              mpmCarousel.results[mpmCarousel.currentIdx] = 'wrong'
              mpmCarouselAdvance()
              break
            }
          }
          markFfaNobody()
          break
        }
        case 'steal-pick-target': {
          if (!activeQ) break
          const targetIdx = Number(target.dataset.teamIdx)
          activeQ.stealTargetIdx = targetIdx
          const stealAnn = document.getElementById('steal-announcement')
          if (stealAnn) stealAnn.remove()

          const stealCat = data.categories[activeQ.catIdx]
          const stealQ = stealCat?.questions[activeQ.qIdx]
          if (!stealQ) break

          $('m-question').style.display = ''
          $('m-type-content').style.display = ''

          const targetTeam = data.teams[targetIdx]
          const currentTeam = data.teams[data.currentTurnIndex]
          const teamEl = $('m-teams')
          teamEl.textContent = ''
          const stealLabel = document.createElement('div')
          stealLabel.className = 'current-team-label steal-team-label'
          stealLabel.textContent = `${currentTeam?.name ?? 'Team'} stealing from ${targetTeam?.name ?? 'Team'}`
          teamEl.appendChild(stealLabel)

          if (stealQ.type === QUESTION_TYPE.multiPartMedia) {
            mpmCarousel = {
              parts: stealQ.parts, pts: activeQ.pts, currentIdx: 0,
              results: stealQ.parts.map(() => null), teamIdx: null,
              ffaTeamPerPart: stealQ.parts.map(() => null),
            }
            $('btn-reveal').style.display = 'none'
            $('btn-correct').style.display = 'inline-flex'
            $('btn-wrong').style.display = 'inline-flex'
            $('btn-skip').style.display = 'inline-flex'
            renderMpmSlide(mpmCarousel)
          } else {
            $('btn-reveal').style.display = 'inline-flex'
            $('btn-skip').style.display = ''
          }

          if (stealQ.media?.type === MEDIA_TYPE.image) {
            const imgEl = $('m-image') as HTMLImageElement
            imgEl.src = stealQ.media.src
            $('m-image-wrap').style.display = 'flex'
          } else if (stealQ.media?.type === MEDIA_TYPE.youtube) {
            $('m-yt-wrap').style.display = 'flex'
            createYoutubePlayer('m-yt-player', stealQ.media.videoId, stealQ.media.startSeconds, stealQ.media.endSeconds)
          }
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  // Edit modal delegation
  $('btn-close-edit').addEventListener('click', closeEditModal, { signal })
  $('edit-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      switch (target.dataset.action) {
        case 'save-category':
          saveCategoryEdit(Number(target.dataset.ci))
          break
        case 'pick-color': {
          document.querySelectorAll('#ec-colors .color-swatch').forEach((s) => s.classList.remove('selected'))
          target.classList.add('selected')
          break
        }
        case 'save-cell':
          saveCellEdit(Number(target.dataset.ci), Number(target.dataset.qi))
          break
        case 'cancel-cell':
          clearRecord(mediaStaging)
          closeEditModal()
          break
        case 'cell-choose-image':
          document.getElementById('cell-img-file')?.click()
          break
        case 'cell-clear-media': {
          const ci = Number(target.dataset.ci)
          const qi = Number(target.dataset.qi)
          mediaStaging[`${ci}-${qi}`] = null
          const preview = document.getElementById('cell-img-preview') as HTMLImageElement | null
          if (preview) { preview.src = ''; preview.style.display = 'none' }
          const urlInput = document.getElementById('cell-img-url') as HTMLInputElement | null
          if (urlInput) urlInput.value = ''
          const urlError = document.getElementById('cell-img-url-error')
          if (urlError) urlError.textContent = ''
          target.style.display = 'none'
          const mediaSelect = document.getElementById('cell-media-type') as HTMLSelectElement | null
          if (mediaSelect) {
            mediaSelect.value = 'none'
            const imgSec = document.getElementById('cell-media-image')
            if (imgSec) imgSec.style.display = 'none'
          }
          break
        }
        case 'mc-add-option': {
          const list = document.getElementById('cell-mc-options')
          if (!list) break
          const count = list.children.length
          if (count >= 6) break
          list.appendChild(buildMcOptionRow(count, '', false))
          if (count + 1 >= 6) target.style.display = 'none'
          break
        }
        case 'mc-remove-option': {
          const list = document.getElementById('cell-mc-options')
          if (!list || list.children.length <= 2) break
          const row = target.closest('.mc-option-row')
          const wasChecked = row?.querySelector<HTMLInputElement>('input[type="radio"]')?.checked
          row?.remove()
          if (wasChecked) {
            const first = list.querySelector<HTMLInputElement>('input[type="radio"]')
            if (first) first.checked = true
          }
          rebuildMcLabels(list)
          const addBtn = document.querySelector<HTMLElement>('[data-action="mc-add-option"]')
          if (addBtn) addBtn.style.display = ''
          break
        }
        case 'ord-add-item': {
          const list = document.getElementById('cell-ord-items')
          if (!list) break
          const count = list.children.length
          list.appendChild(buildOrderingItemRow(count, { label: '' }, count + 1))
          rebuildOrdControls(list)
          break
        }
        case 'ord-remove-item': {
          const list = document.getElementById('cell-ord-items')
          if (!list || list.children.length <= 2) break
          target.closest('.ord-item-row')?.remove()
          rebuildOrdControls(list)
          break
        }
        case 'ord-move-up': {
          const list = document.getElementById('cell-ord-items')
          const row = target.closest('.ord-item-row')
          if (!list || !row || !row.previousElementSibling) break
          list.insertBefore(row, row.previousElementSibling)
          rebuildOrdControls(list)
          break
        }
        case 'ord-move-down': {
          const list = document.getElementById('cell-ord-items')
          const row = target.closest('.ord-item-row')
          if (!list || !row || !row.nextElementSibling) break
          list.insertBefore(row.nextElementSibling, row)
          rebuildOrdControls(list)
          break
        }
        case 'ord-toggle-media': {
          const row = target.closest('.ord-item-row') as HTMLElement | null
          const mediaSec = row?.querySelector('.ord-item-media') as HTMLElement | null
          if (!row || !mediaSec) break
          const isHidden = mediaSec.style.display === 'none'
          mediaSec.style.display = isHidden ? '' : 'none'
          row.classList.toggle('has-media', isHidden)
          target.classList.toggle('active', isHidden)
          break
        }
        case 'mpm-add-part': {
          const list = document.getElementById('cell-mpm-parts')
          if (!list) break
          const count = list.children.length
          const newPart: MultiPartMediaPart = { media: { type: MEDIA_TYPE.image, src: '' }, answer: '' }
          list.appendChild(buildMultiPartMediaRow(count, newPart, count + 1))
          rebuildMpmPartNumbers(list)
          break
        }
        case 'mpm-remove-part': {
          const list = document.getElementById('cell-mpm-parts')
          if (!list || list.children.length <= 1) break
          target.closest('.mpm-part-row')?.remove()
          rebuildMpmPartNumbers(list)
          break
        }
        case 'mpm-choose-image': {
          const row = target.closest('.mpm-part-row')
          const fileInput = row?.querySelector('.mpm-img-file') as HTMLInputElement | null
          fileInput?.click()
          break
        }
        case 'mpm-clear-image': {
          const row = target.closest('.mpm-part-row') as HTMLElement | null
          if (!row) break
          const partIdx = row.dataset.partIdx ?? '0'
          mediaStaging[mpmStagingKey(partIdx)] = null
          const preview = row.querySelector('.mpm-img-preview') as HTMLImageElement | null
          if (preview) { preview.src = ''; preview.style.display = 'none' }
          const urlInput = row.querySelector('.mpm-img-url') as HTMLInputElement | null
          if (urlInput) urlInput.value = ''
          const urlError = row.querySelector('.mpm-img-url-error')
          if (urlError) urlError.textContent = ''
          target.style.display = 'none'
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  $('edit-modal').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLElement

      if (target instanceof HTMLSelectElement && target.id === 'cell-type') {
        const newType = target.value as QuestionType
        if (newType === editingQuestionType) return
        const partial = readQuestionFromDOM(editingQuestionType)
        const converted = convertQuestion(partial, newType)
        editingQuestionType = newType
        const container = document.getElementById('cell-answer-fields')
        if (container) renderAnswerFields(container, converted)
        const mw = document.getElementById('cell-media-wrap')
        if (mw) mw.style.display = newType === QUESTION_TYPE.multiPartMedia ? 'none' : ''
        return
      }

      if (target instanceof HTMLSelectElement && target.id === 'cell-media-type') {
        const imgSec = document.getElementById('cell-media-image')
        const ytSec = document.getElementById('cell-media-youtube')
        if (imgSec) imgSec.style.display = target.value === 'image' ? '' : 'none'
        if (ytSec) ytSec.style.display = target.value === 'youtube' ? '' : 'none'
        return
      }

      if (target instanceof HTMLInputElement && target.id === 'cell-img-file') {
        const ci = Number(target.dataset.ci)
        const qi = Number(target.dataset.qi)
        const file = target.files?.[0]
        if (file) handleMediaFileUpload(ci, qi, file, 'cell-img-preview', 'cell-img-clear')
      }

      if (target instanceof HTMLSelectElement && target.classList.contains('ord-media-type')) {
        const row = target.closest('.ord-item-row') as HTMLElement | null
        if (!row) return
        const imgSec = row.querySelector('.ord-img-section') as HTMLElement | null
        const ytSec = row.querySelector('.ord-yt-section') as HTMLElement | null
        if (imgSec) imgSec.style.display = target.value === 'image' ? '' : 'none'
        if (ytSec) ytSec.style.display = target.value === 'youtube' ? '' : 'none'
      }

      if (target instanceof HTMLSelectElement && target.classList.contains('mpm-media-type')) {
        const row = target.closest('.mpm-part-row') as HTMLElement | null
        if (!row) return
        const imgSec = row.querySelector('.mpm-img-section') as HTMLElement | null
        const ytSec = row.querySelector('.mpm-yt-section') as HTMLElement | null
        if (imgSec) imgSec.style.display = target.value === 'image' ? '' : 'none'
        if (ytSec) ytSec.style.display = target.value === 'youtube' ? '' : 'none'
      }

      if (target instanceof HTMLInputElement && target.classList.contains('mpm-img-file')) {
        const file = target.files?.[0]
        if (!file) return
        const row = target.closest('.mpm-part-row') as HTMLElement | null
        if (!row) return
        const partIdx = row.dataset.partIdx ?? '0'
        const reader = new FileReader()
        reader.onload = (ev) => {
          const base64 = (ev.target as FileReader).result as string
          mediaStaging[mpmStagingKey(partIdx)] = { type: MEDIA_TYPE.image, src: base64 }
          const preview = row.querySelector('.mpm-img-preview') as HTMLImageElement | null
          if (preview) { preview.src = base64; preview.style.display = 'block' }
          const clearBtn = row.querySelector('.mpm-img-clear') as HTMLElement | null
          if (clearBtn) clearBtn.style.display = 'inline-block'
          const urlInput = row.querySelector('.mpm-img-url') as HTMLInputElement | null
          if (urlInput) urlInput.value = ''
          const urlError = row.querySelector('.mpm-img-url-error')
          if (urlError) urlError.textContent = ''
        }
        reader.readAsDataURL(file)
      }
    },
    { signal },
  )

  const debouncedImgUrlCheck = debounce((url: string) => {
    const errorEl = document.getElementById('cell-img-url-error')
    const previewEl = document.getElementById('cell-img-preview') as HTMLImageElement | null
    if (!url) {
      if (errorEl) errorEl.textContent = ''
      if (previewEl) previewEl.style.display = 'none'
      return
    }
    const img = new Image()
    img.onload = () => {
      if (errorEl) errorEl.textContent = ''
      if (previewEl) { previewEl.src = url; previewEl.style.display = 'block' }
      const clearBtn = document.getElementById('cell-img-clear')
      if (clearBtn) clearBtn.style.display = 'inline-block'
    }
    img.onerror = () => {
      if (errorEl) errorEl.textContent = 'Could not load image from this URL'
      if (previewEl) previewEl.style.display = 'none'
    }
    img.src = url
  }, 400)

  const debouncedYtUrlCheck = debounce((url: string) => {
    const errorEl = document.getElementById('cell-yt-error')
    const thumbEl = document.getElementById('cell-yt-thumb') as HTMLImageElement | null
    const startEl = document.getElementById('cell-yt-start') as HTMLInputElement | null
    if (!url) {
      if (errorEl) errorEl.textContent = ''
      if (thumbEl) thumbEl.style.display = 'none'
      return
    }
    const parsed = parseYoutubeUrl(url)
    if (!parsed) {
      if (errorEl) errorEl.textContent = 'Not a valid YouTube URL'
      if (thumbEl) thumbEl.style.display = 'none'
      return
    }
    if (errorEl) errorEl.textContent = ''
    if (thumbEl) {
      thumbEl.src = `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`
      thumbEl.style.display = 'block'
    }
    if (parsed.startSeconds !== undefined && startEl && !startEl.value) {
      startEl.value = String(parsed.startSeconds)
    }
  }, 400)

  $('edit-modal').addEventListener(
    'input',
    (e) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement && target.id === 'cell-img-url') {
        debouncedImgUrlCheck(target.value.trim())
      }
      if (target instanceof HTMLInputElement && target.id === 'cell-yt-url') {
        debouncedYtUrlCheck(target.value.trim())
      }

      if (target instanceof HTMLInputElement && target.classList.contains('ord-img-url')) {
        const row = target.closest('.ord-item-row') as HTMLElement | null
        if (!row) return
        const url = target.value.trim()
        const previewEl = row.querySelector('.ord-img-preview') as HTMLImageElement | null
        if (!url) {
          if (previewEl) previewEl.style.display = 'none'
          return
        }
        const img = new Image()
        img.onload = () => {
          if (previewEl) { previewEl.src = url; previewEl.style.display = 'block' }
        }
        img.onerror = () => {
          if (previewEl) previewEl.style.display = 'none'
        }
        img.src = url
      }

      if (target instanceof HTMLInputElement && target.classList.contains('ord-yt-url')) {
        const row = target.closest('.ord-item-row') as HTMLElement | null
        if (!row) return
        const url = target.value.trim()
        const thumbEl = row.querySelector('.ord-yt-thumb') as HTMLImageElement | null
        const startEl = row.querySelector('.ord-yt-start') as HTMLInputElement | null
        if (!url) {
          if (thumbEl) thumbEl.style.display = 'none'
          return
        }
        const parsed = parseYoutubeUrl(url)
        if (!parsed) {
          if (thumbEl) thumbEl.style.display = 'none'
          return
        }
        if (thumbEl) {
          thumbEl.src = `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`
          thumbEl.style.display = 'block'
        }
        if (parsed.startSeconds !== undefined && startEl && !startEl.value) {
          startEl.value = String(parsed.startSeconds)
        }
      }

      if (target instanceof HTMLInputElement && target.classList.contains('mpm-img-url')) {
        const row = target.closest('.mpm-part-row') as HTMLElement | null
        if (!row) return
        const url = target.value.trim()
        const errorEl = row.querySelector('.mpm-img-url-error')
        const previewEl = row.querySelector('.mpm-img-preview') as HTMLImageElement | null
        if (!url) {
          if (errorEl) errorEl.textContent = ''
          if (previewEl) previewEl.style.display = 'none'
          return
        }
        const img = new Image()
        img.onload = () => {
          if (errorEl) errorEl.textContent = ''
          if (previewEl) { previewEl.src = url; previewEl.style.display = 'block' }
          const clearBtn = row.querySelector('.mpm-img-clear') as HTMLElement | null
          if (clearBtn) clearBtn.style.display = 'inline-block'
        }
        img.onerror = () => {
          if (errorEl) errorEl.textContent = 'Could not load image from this URL'
          if (previewEl) previewEl.style.display = 'none'
        }
        img.src = url
      }

      if (target instanceof HTMLInputElement && target.classList.contains('mpm-yt-url')) {
        const row = target.closest('.mpm-part-row') as HTMLElement | null
        if (!row) return
        const url = target.value.trim()
        const errorEl = row.querySelector('.mpm-yt-error')
        const thumbEl = row.querySelector('.mpm-yt-thumb') as HTMLImageElement | null
        const startEl = row.querySelector('.mpm-yt-start') as HTMLInputElement | null
        if (!url) {
          if (errorEl) errorEl.textContent = ''
          if (thumbEl) thumbEl.style.display = 'none'
          return
        }
        const parsed = parseYoutubeUrl(url)
        if (!parsed) {
          if (errorEl) errorEl.textContent = 'Not a valid YouTube URL'
          if (thumbEl) thumbEl.style.display = 'none'
          return
        }
        if (errorEl) errorEl.textContent = ''
        if (thumbEl) {
          thumbEl.src = `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`
          thumbEl.style.display = 'block'
        }
        if (parsed.startSeconds !== undefined && startEl && !startEl.value) {
          startEl.value = String(parsed.startSeconds)
        }
      }
    },
    { signal },
  )

  // Admin modal
  $('btn-close-admin').addEventListener('click', closeAdmin, { signal })
  $('btn-save-admin').addEventListener('click', saveAdmin, { signal })

  $('admin-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)

      switch (target.dataset.action) {
        case 'toggle-accordion': {
          target.classList.toggle('collapsed')
          const body = target.nextElementSibling as HTMLElement | null
          if (body) body.classList.toggle('hidden')
          break
        }
        case 'choose-image':
          document.getElementById(`adm-img-file-${ci}-${qi}`)?.click()
          break
        case 'clear-image': {
          mediaStaging[`${ci}-${qi}`] = null
          const preview = document.getElementById(`adm-img-preview-${ci}-${qi}`) as HTMLImageElement | null
          if (preview) {
            preview.src = ''
            preview.style.display = 'none'
          }
          target.style.display = 'none'
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  $('admin-modal').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLInputElement
      if (!target.classList.contains('admin-img-file')) return
      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)
      const file = target.files?.[0]
      if (file) handleAdminImgUpload(ci, qi, file)
    },
    { signal },
  )

  // Winner modal close
  $('btn-close-winner').addEventListener(
    'click',
    () => {
      $('winner-overlay').style.display = 'none'
    },
    { signal },
  )

  // Team setup modal delegation
  $('btn-close-team-setup').addEventListener(
    'click',
    () => {
      $('team-setup-overlay').style.display = 'none'
    },
    { signal },
  )

  $('team-setup-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      switch (target.dataset.action) {
        case 'ts-add-team': {
          const teamsWrap = document.getElementById('ts-teams')
          if (!teamsWrap || teamsWrap.children.length >= 6) break
          teamsWrap.appendChild(buildTeamSetupRow(teamsWrap.children.length))
          if (teamsWrap.children.length >= 6) target.style.display = 'none'
          break
        }
        case 'ts-remove-team': {
          const teamsWrap = document.getElementById('ts-teams')
          if (!teamsWrap || teamsWrap.children.length <= 2) break
          target.closest('.ts-team-row')?.remove()
          const addBtn = document.getElementById('ts-add-btn')
          if (addBtn) addBtn.style.display = ''
          break
        }
        case 'ts-start-game':
          startGame()
          break
        default:
          break
      }
    },
    { signal },
  )

  // Scoreboard delegation
  $('scoreboard').addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement

      const scoreBtn = target.closest<HTMLElement>('[data-action="adjust-score"]')
      if (scoreBtn) {
        adjustScore(Number(scoreBtn.dataset.team), Number(scoreBtn.dataset.delta))
        return
      }

      if (target.closest('.team-name')) return

      if (data.mode === APP_MODE.play && !activeQ) {
        const card = target.closest<HTMLElement>('.team-card')
        if (card && !card.classList.contains('active')) {
          const idx = Number(card.dataset.team)
          const team = data.teams[idx]
          if (team && await showConfirm(`Switch turn to ${team.name}?`)) {
            data.currentTurnIndex = idx
            saveData()
            renderSubtitle()
            renderScoreboard()
          }
        }
      }
    },
    { signal },
  )

  $('scoreboard').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLElement
      if (!target.matches('.team-name')) return
      const card = target.closest<HTMLElement>('.team-card')
      if (!card) return
      const idx = Number(card.dataset.team)
      const team = data.teams[idx]
      if (team) {
        team.name = (target as HTMLInputElement).value
        saveData()
        renderScoreboard()
      }
    },
    { signal },
  )

  // Board drag & drop (category reorder in edit mode)
  let dragColumn: HTMLElement | null = null

  $('board').addEventListener(
    'dragstart',
    (e) => {
      if (data.mode !== APP_MODE.edit) return
      const col = (e.target as HTMLElement).closest('.board-column') as HTMLElement | null
      if (!col) return
      dragColumn = col
      col.classList.add('dragging')
      e.dataTransfer?.setData('text/plain', '')
    },
    { signal },
  )

  $('board').addEventListener(
    'dragover',
    (e) => {
      if (!dragColumn) return
      e.preventDefault()
      const target = (e.target as HTMLElement).closest('.board-column') as HTMLElement | null
      if (!target || target === dragColumn) return
      const rect = target.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      const board = $('board')
      if (e.clientX < mid) {
        board.insertBefore(dragColumn, target)
      } else {
        board.insertBefore(dragColumn, target.nextSibling)
      }
    },
    { signal },
  )

  $('board').addEventListener(
    'dragend',
    () => {
      if (!dragColumn) return
      dragColumn.classList.remove('dragging')
      const cols = $('board').querySelectorAll<HTMLElement>('.board-column')
      const newCategories = [...cols].map((col) => {
        const ci = Number(col.dataset.ci)
        return data.categories[ci]!
      })
      data.categories = newCategories
      dragColumn = null
      saveData()
      renderBoard()
    },
    { signal },
  )

  // Board delegation
  $('board').addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement

      if (data.mode === APP_MODE.edit) {
        const catBtn = target.closest<HTMLElement>('[data-action="edit-category"]')
        if (catBtn) {
          editCategory(Number(catBtn.dataset.ci))
          return
        }
        if (target.closest('.cat-edit-icon')) {
          const header = target.closest('.cat-header')
          const nameBtn = header?.querySelector<HTMLElement>('[data-action="edit-category"]')
          if (nameBtn) editCategory(Number(nameBtn.dataset.ci))
          return
        }
        const removeQ = target.closest<HTMLElement>('[data-action="remove-question"]')
        if (removeQ) {
          const ci = Number(removeQ.dataset.ci)
          const qi = Number(removeQ.dataset.qi)
          const cat = data.categories[ci]
          if (cat && cat.questions.length > 1) {
            if (!await showConfirm(`Remove this ${cat.points[qi] ?? 0} pts question?`)) return
            cat.questions.splice(qi, 1)
            cat.points.splice(qi, 1)
            saveData()
            renderAll()
          }
          return
        }
        const removeBtn = target.closest<HTMLElement>('[data-action="remove-category"]')
        if (removeBtn) {
          removeCategory(Number(removeBtn.dataset.ci))
          return
        }
        const tile = target.closest<HTMLButtonElement>('[data-action="open-question"]')
        if (tile) {
          editCell(Number(tile.dataset.ci), Number(tile.dataset.qi))
          return
        }
        const addQ = target.closest<HTMLElement>('[data-action="add-question"]')
        if (addQ) {
          const ci = Number(addQ.dataset.ci)
          const cat = data.categories[ci]
          if (!cat) return
          const lastPts = cat.points[cat.points.length - 1] ?? 0
          cat.points.push(lastPts + 100)
          cat.questions.push(defaultQuestion())
          saveData()
          renderAll()
          return
        }
      } else {
        const tile = target.closest<HTMLButtonElement>('[data-action="open-question"]')
        if (tile && !tile.disabled) {
          const ci = Number(tile.dataset.ci)
          const qi = Number(tile.dataset.qi)
          const cat = data.categories[ci]
          const basePts = cat?.points[qi]
          const question = cat?.questions[qi]
          const pts = basePts !== undefined && question?.x2 ? basePts * 2 : basePts
          if (pts !== undefined) openQuestion(ci, qi, pts)
        }
      }
    },
    { signal },
  )

}

// ── Init ──

async function init(): Promise<void> {
  await loadData()
  renderAll()
  setupEvents()
}

init()
