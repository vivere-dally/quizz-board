import './style.css'
import { APP_MODE, CATEGORY_COLOR, QUESTION_TYPE, MEDIA_TYPE, loadAppData, saveAppData, defaultQuestion, answerDisplayText } from './persistence/db.ts'
import type { AppData, CategoryColor, Question, QuestionType, QuestionMedia } from './persistence/db.ts'

type ActiveQ = {
  catIdx: number
  qIdx: number
  pts: number
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
  categories: [],
  teams: [],
  used: {},
}

let activeQ: ActiveQ | null = null
let selectedTeamIdx = 0
const mediaStaging: Record<string, QuestionMedia | null> = {}

// ── Persistence ──

async function loadData(): Promise<void> {
  const saved = await loadAppData()
  if (saved) {
    data.mode = saved.mode
    data.categories = saved.categories
    data.teams = saved.teams
    data.used = saved.used
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

function createYoutubePlayer(containerId: string, videoId: string, startSeconds?: number, endSeconds?: number): void {
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
        autoplay: 0,
        ...(startSeconds !== undefined ? { start: startSeconds } : {}),
        ...(endSeconds !== undefined ? { end: endSeconds } : {}),
        rel: 0,
        fs: 0,
      },
      events: {
        onStateChange: (event: YT.OnStateChangeEvent) => {
          // 0 = ended
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
    el.textContent = 'Click a tile to play'
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
    if (i === selectedTeamIdx) card.classList.add('active')

    const nameInput = card.querySelector('.team-name') as HTMLInputElement
    nameInput.value = t.name

    const score = card.querySelector('.team-score') as HTMLElement
    score.textContent = t.score.toLocaleString()

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

  for (const [ci, cat] of data.categories.entries()) {
    const col = document.createElement('div')
    col.className = 'board-column'
    col.dataset.color = cat.color

    const header = cloneTemplate('tmpl-cat-header')
    const catName = header.querySelector('.cat-name') as HTMLButtonElement
    catName.textContent = cat.name
    catName.dataset.ci = String(ci)

    if (isEdit) {
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
      const tile = cloneTemplate('tmpl-tile')
      const tileBtn = tile as HTMLButtonElement
      tileBtn.dataset.ci = String(ci)
      tileBtn.dataset.qi = String(qi)

      const ptsSpan = tileBtn.querySelector('.tile-pts') as HTMLElement
      ptsSpan.textContent = String(pts)

      if (isEdit) {
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
  el.appendChild(frag)
}

function renderTeamSelector(): void {
  const el = $('m-teams')
  const frag = document.createDocumentFragment()

  const label = document.createElement('span')
  label.style.cssText = 'font-size:12px;color:var(--text-muted);margin-right:8px;align-self:center'
  label.textContent = 'Awarding:'
  frag.appendChild(label)

  for (const [i, t] of data.teams.entries()) {
    const chip = cloneTemplate('tmpl-ts-chip') as HTMLButtonElement
    chip.textContent = t.name
    chip.dataset.team = String(i)
    if (i === selectedTeamIdx) chip.classList.add('selected')
    frag.appendChild(chip)
  }

  el.textContent = ''
  el.appendChild(frag)
}

// ── Question Modal ──

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
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
      list.dataset.correctOrder = JSON.stringify(q.items)
      for (const [i, item] of shuffled.entries()) {
        const card = document.createElement('div')
        card.className = 'play-ord-item'
        const num = document.createElement('span')
        num.className = 'play-ord-num'
        num.textContent = `${i + 1}.`
        card.appendChild(num)
        card.appendChild(document.createTextNode(item))
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
      for (const opt of options) {
        const idx = Number(opt.dataset.idx)
        if (idx === q.correctIndex) {
          opt.classList.add('correct')
        } else {
          opt.classList.add('dimmed')
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
      for (const [i, item] of q.items.entries()) {
        const card = document.createElement('div')
        card.className = 'play-ord-item correct'
        const num = document.createElement('span')
        num.className = 'play-ord-num'
        num.textContent = `${i + 1}.`
        card.appendChild(num)
        card.appendChild(document.createTextNode(item))
        list.appendChild(card)
      }
      break
    }
    case QUESTION_TYPE.numeric:
      break
    default: {
      const _exhaustive: never = q
      throw new Error(`unreachable: unknown question type ${(_exhaustive as Question).type}`)
    }
  }
}

function openQuestion(catIdx: number, qIdx: number, pts: number): void {
  const cat = data.categories[catIdx]
  if (!cat) return
  const q = cat.questions[qIdx]
  if (!q) return

  activeQ = { catIdx, qIdx, pts }

  const modal = $('q-modal')
  modal.className = 'modal'
  modal.dataset.color = cat.color

  $('m-pts').textContent = String(pts)
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

  if (q.media?.type === MEDIA_TYPE.image) {
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

  $('btn-reveal').style.display = 'inline-flex'
  $('btn-correct').style.display = 'none'
  $('btn-wrong').style.display = 'none'

  renderTeamSelector()
  $('q-overlay').style.display = 'flex'
}

function revealAnswer(): void {
  if (activeQ) {
    const cat = data.categories[activeQ.catIdx]
    const q = cat?.questions[activeQ.qIdx]
    if (q) revealPlayTypeContent(q, $('m-type-content'))
  }

  $('m-answer').style.display = 'block'
  $('btn-reveal').style.display = 'none'
  $('btn-correct').style.display = 'inline-flex'
  $('btn-wrong').style.display = 'inline-flex'
}

function markResult(correct: boolean): void {
  if (!activeQ) return
  const delta = correct ? activeQ.pts : -activeQ.pts
  adjustScore(selectedTeamIdx, delta)
  markUsed()
  closeQModal()
}

function skipQuestion(): void {
  if (!activeQ) return
  markUsed()
  closeQModal()
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

  saveData()
  renderAll()
  closeEditModal()
}

function closeEditModal(): void {
  $('edit-overlay').style.display = 'none'
}

// ── Answer Fields ──

const TYPE_LABELS: Record<QuestionType, string> = {
  [QUESTION_TYPE.open]: 'Open Answer',
  [QUESTION_TYPE.multipleChoice]: 'Multiple Choice',
  [QUESTION_TYPE.trueFalse]: 'True / False',
  [QUESTION_TYPE.ordering]: 'Ordering',
  [QUESTION_TYPE.numeric]: 'Numeric',
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

      for (const [i, item] of question.items.entries()) {
        list.appendChild(buildOrderingItemRow(i, item, question.items.length))
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

function buildOrderingItemRow(index: number, value: string, total: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ord-item-row'

  const num = document.createElement('span')
  num.className = 'ord-item-num'
  num.textContent = `${index + 1}.`
  row.appendChild(num)

  const input = document.createElement('input')
  input.className = 'edit-input ord-item-input'
  input.value = value
  input.placeholder = `Item ${index + 1}`
  row.appendChild(input)

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

  row.appendChild(btnGroup)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ec-remove-btn'
  removeBtn.textContent = '✕'
  removeBtn.dataset.action = 'ord-remove-item'
  row.appendChild(removeBtn)

  return row
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
      const items: string[] = []
      for (const row of rows) {
        const input = row.querySelector('.ord-item-input') as HTMLInputElement | null
        items.push(input?.value ?? '')
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
    default: {
      const _exhaustive: never = currentType
      throw new Error(`unreachable: unknown question type ${_exhaustive}`)
    }
  }
}

function convertQuestion(from: Question, toType: QuestionType): Question {
  const base = { q: from.q, ...(from.media ? { media: from.media } : {}) }

  switch (toType) {
    case QUESTION_TYPE.open:
      return { ...base, type: QUESTION_TYPE.open, a: '' }
    case QUESTION_TYPE.multipleChoice:
      return { ...base, type: QUESTION_TYPE.multipleChoice, options: ['', '', '', ''], correctIndex: 0 }
    case QUESTION_TYPE.trueFalse:
      return { ...base, type: QUESTION_TYPE.trueFalse, correctAnswer: true }
    case QUESTION_TYPE.ordering:
      return { ...base, type: QUESTION_TYPE.ordering, items: ['', ''] }
    case QUESTION_TYPE.numeric:
      return { ...base, type: QUESTION_TYPE.numeric, correctValue: 0 }
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

  const mediaLabel = document.createElement('div')
  mediaLabel.className = 'field-label'
  mediaLabel.textContent = 'Media (optional)'
  content.appendChild(mediaLabel)

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
  content.appendChild(mediaTypeSelect)

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
  content.appendChild(mediaSection)

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

  const oldQ = cat.questions[qi]
  const media = readMediaFromEditForm(ci, qi, oldQ?.media)
  if (media) {
    newQ.media = media
  }

  cat.questions[qi] = newQ
  clearRecord(mediaStaging)
  saveData()
  renderAll()
  closeEditModal()
}

// ── Reset ──

function resetAll(): void {
  if (!confirm('Delete all categories and reset the board? This cannot be undone.')) return
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

function removeCategory(ci: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  if (!confirm(`Remove category "${cat.name}"?`)) return
  data.categories.splice(ci, 1)
  saveData()
  renderAll()
}

// ── Team Setup ──

function buildTeamSetupRow(index: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ts-team-row'

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

  const teamsWrap = document.createElement('div')
  teamsWrap.id = 'ts-teams'
  content.appendChild(teamsWrap)

  for (let i = 0; i < 2; i++) {
    teamsWrap.appendChild(buildTeamSetupRow(i))
  }

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
  const teams: Array<{ name: string; score: number }> = []
  for (const row of rows) {
    const input = row.querySelector('.ts-team-name') as HTMLInputElement | null
    const name = input?.value.trim() || `Team ${teams.length + 1}`
    teams.push({ name, score: 0 })
  }
  if (teams.length < 2) return

  data.teams = teams
  data.used = {}
  selectedTeamIdx = 0
  $('team-setup-overlay').style.display = 'none'
  switchMode(APP_MODE.play)
}

function cancelGame(): void {
  if (!confirm('Cancel the game? All scores will be lost.')) return
  data.teams = []
  data.used = {}
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
  $('btn-correct').addEventListener('click', () => markResult(true), { signal })
  $('btn-wrong').addEventListener('click', () => markResult(false), { signal })
  $('btn-skip').addEventListener('click', skipQuestion, { signal })

  $('q-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return
      if (target.dataset.action === 'yt-toggle-play') toggleYoutubePlayback()
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
          list.appendChild(buildOrderingItemRow(count, '', count + 1))
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
    (e) => {
      const target = e.target as HTMLElement

      const scoreBtn = target.closest<HTMLElement>('[data-action="adjust-score"]')
      if (scoreBtn) {
        adjustScore(Number(scoreBtn.dataset.team), Number(scoreBtn.dataset.delta))
        return
      }

      if (target.closest('.team-name')) return

      const card = target.closest<HTMLElement>('[data-action="select-team"]')
      if (card) {
        selectedTeamIdx = Number(card.dataset.team)
        renderScoreboard()
      }
    },
    { signal },
  )

  $('scoreboard').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLElement
      if (!target.matches('.team-name')) return
      const card = target.closest<HTMLElement>('[data-action="select-team"]')
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

  // Board delegation
  $('board').addEventListener(
    'click',
    (e) => {
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
            if (!confirm(`Remove this ${cat.points[qi] ?? 0} pts question?`)) return
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
          const pts = cat?.points[qi]
          if (pts !== undefined) openQuestion(ci, qi, pts)
        }
      }
    },
    { signal },
  )

  // Team selector delegation (in question modal)
  $('m-teams').addEventListener(
    'click',
    (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-action="select-awarding"]')
      if (!chip) return
      selectedTeamIdx = Number(chip.dataset.team)
      renderTeamSelector()
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
