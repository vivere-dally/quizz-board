import './style.css'
import { APP_MODE, CATEGORY_COLOR, loadAppData, saveAppData } from './persistence/db.ts'
import type { AppData, Category, CategoryColor } from './persistence/db.ts'

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
const imgStaging: Record<string, string> = {}

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

function clearRecord(rec: Record<string, string>): void {
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

    const editAllBtn = document.createElement('button')
    editAllBtn.type = 'button'
    editAllBtn.className = 'ctrl-btn'
    editAllBtn.textContent = '⚙ Edit All Questions'
    editAllBtn.dataset.action = 'edit-all'
    frag.appendChild(editAllBtn)

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
    }

    col.appendChild(header)

    for (const [qi, pts] of cat.points.entries()) {
      const tile = cloneTemplate('tmpl-tile')
      const tileBtn = tile as HTMLButtonElement
      tileBtn.dataset.ci = String(ci)
      tileBtn.dataset.qi = String(qi)

      const ptsSpan = tileBtn.querySelector('.tile-pts') as HTMLElement
      ptsSpan.textContent = String(pts)

      if (!isEdit) {
        const used = !!data.used[`${cat.id}-${qi}`]
        if (used) {
          tileBtn.classList.add('used')
          tileBtn.disabled = true
        }
      }

      col.appendChild(tileBtn)
    }

    if (isEdit) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'remove-cat-btn'
      removeBtn.textContent = '✕ Remove'
      removeBtn.dataset.action = 'remove-category'
      removeBtn.dataset.ci = String(ci)
      col.appendChild(removeBtn)
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

  const mAnswer = $('m-answer')
  mAnswer.textContent = 'Answer: ' + q.a
  mAnswer.style.display = 'none'

  const imgWrap = $('m-image-wrap')
  const imgEl = $('m-image') as HTMLImageElement
  if (q.img) {
    imgEl.src = q.img
    imgWrap.style.display = 'flex'
  } else {
    imgEl.src = ''
    imgWrap.style.display = 'none'
  }

  $('btn-reveal').style.display = 'inline-flex'
  $('btn-correct').style.display = 'none'
  $('btn-wrong').style.display = 'none'

  renderTeamSelector()
  $('q-overlay').style.display = 'flex'
}

function revealAnswer(): void {
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

  const qLabel = document.createElement('div')
  qLabel.className = 'field-label'
  qLabel.textContent = 'Question'
  content.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'edit-textarea'
  qTextarea.id = 'cell-q'
  qTextarea.value = question.q
  content.appendChild(qTextarea)

  const aLabel = document.createElement('div')
  aLabel.className = 'field-label'
  aLabel.textContent = 'Answer'
  content.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'edit-input'
  aInput.id = 'cell-a'
  aInput.value = question.a
  content.appendChild(aInput)

  const imgLabel = document.createElement('div')
  imgLabel.className = 'field-label'
  imgLabel.textContent = 'Image (optional)'
  content.appendChild(imgLabel)

  const imgZone = document.createElement('div')
  imgZone.className = 'img-upload-zone'

  const preview = document.createElement('img')
  preview.className = 'img-preview-thumb'
  preview.id = 'cell-img-preview'
  preview.alt = 'Question image preview'
  if (question.img) {
    preview.src = question.img
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
  imgZone.appendChild(preview)

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
  clearBtn.dataset.action = 'cell-clear-image'
  clearBtn.dataset.ci = String(ci)
  clearBtn.dataset.qi = String(qi)
  clearBtn.style.display = question.img ? 'inline-block' : 'none'
  imgBtnRow.appendChild(clearBtn)

  imgZone.appendChild(imgBtnRow)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.id = 'cell-img-file'
  fileInput.dataset.ci = String(ci)
  fileInput.dataset.qi = String(qi)
  fileInput.style.display = 'none'
  imgZone.appendChild(fileInput)

  content.appendChild(imgZone)

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

function saveCellEdit(ci: number, qi: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  const question = cat.questions[qi]
  if (!question) return

  const ptsEl = document.getElementById('cell-pts') as HTMLInputElement | null
  const qEl = document.getElementById('cell-q') as HTMLTextAreaElement | null
  const aEl = document.getElementById('cell-a') as HTMLInputElement | null

  if (ptsEl) cat.points[qi] = Number(ptsEl.value) || 100
  if (qEl) question.q = qEl.value
  if (aEl) question.a = aEl.value

  const imgKey = `${ci}-${qi}`
  const imgValue = imgStaging[imgKey]
  if (imgValue !== undefined) {
    if (imgValue) {
      question.img = imgValue
    } else {
      delete question.img
    }
  }

  clearRecord(imgStaging)
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

// ── Image Upload ──

function handleImgUpload(ci: number, qi: number, file: File, previewId: string, clearBtnId: string): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = (e.target as FileReader).result as string
    imgStaging[`${ci}-${qi}`] = base64
    const preview = document.getElementById(previewId) as HTMLImageElement | null
    if (preview) {
      preview.src = base64
      preview.style.display = 'block'
    }
    const clearBtn = document.getElementById(clearBtnId)
    if (clearBtn) clearBtn.style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
}

// ── Admin Panel ──

function buildAdminAccordion(cat: Category, ci: number, qi: number, pts: number): HTMLElement {
  const q = cat.questions[qi]
  const hasImg = !!q?.img

  const accordion = document.createElement('div')
  accordion.className = 'q-accordion'

  const accHeader = document.createElement('div')
  accHeader.className = 'q-acc-header'
  accHeader.dataset.action = 'toggle-accordion'
  const headerLabel = document.createElement('span')
  let headerText = pts + ' pts'
  if (hasImg) headerText += ' 📷'
  headerLabel.textContent = headerText
  const arrow = document.createElement('span')
  arrow.style.cssText = 'font-size:11px;opacity:.6'
  arrow.textContent = '▼'
  accHeader.appendChild(headerLabel)
  accHeader.appendChild(arrow)

  const accBody = document.createElement('div')
  accBody.className = 'q-acc-body'
  const fieldRow = document.createElement('div')
  fieldRow.className = 'q-field-row'

  const qLabel = document.createElement('label')
  qLabel.style.cssText = 'font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em'
  qLabel.textContent = 'Question'
  fieldRow.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'mini-textarea'
  qTextarea.id = `adm-q-${ci}-${qi}`
  qTextarea.textContent = q?.q ?? ''
  fieldRow.appendChild(qTextarea)

  const aLabel = document.createElement('label')
  aLabel.style.cssText = 'font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em'
  aLabel.textContent = 'Answer'
  fieldRow.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'mini-input'
  aInput.id = `adm-a-${ci}-${qi}`
  aInput.value = q?.a ?? ''
  fieldRow.appendChild(aInput)

  const imgZone = document.createElement('div')
  imgZone.className = 'img-upload-zone'

  const imgLabel = document.createElement('span')
  imgLabel.className = 'img-upload-label'
  imgLabel.textContent = 'Image (optional) — shown during the question'
  imgZone.appendChild(imgLabel)

  const imgPreview = document.createElement('img')
  imgPreview.className = 'img-preview-thumb'
  imgPreview.id = `adm-img-preview-${ci}-${qi}`
  if (hasImg && q?.img) {
    imgPreview.src = q.img
  } else {
    imgPreview.style.display = 'none'
  }
  imgZone.appendChild(imgPreview)

  const imgBtnRow = document.createElement('div')
  imgBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'

  const chooseImgBtn = document.createElement('button')
  chooseImgBtn.type = 'button'
  chooseImgBtn.className = 'img-file-btn'
  chooseImgBtn.textContent = '📷 Choose Image'
  chooseImgBtn.dataset.action = 'choose-image'
  chooseImgBtn.dataset.ci = String(ci)
  chooseImgBtn.dataset.qi = String(qi)
  imgBtnRow.appendChild(chooseImgBtn)

  const clearImgBtn = document.createElement('button')
  clearImgBtn.type = 'button'
  clearImgBtn.className = 'img-clear-btn'
  clearImgBtn.id = `adm-img-clear-${ci}-${qi}`
  if (!hasImg) clearImgBtn.style.display = 'none'
  clearImgBtn.textContent = '✗ Remove'
  clearImgBtn.dataset.action = 'clear-image'
  clearImgBtn.dataset.ci = String(ci)
  clearImgBtn.dataset.qi = String(qi)
  imgBtnRow.appendChild(clearImgBtn)
  imgZone.appendChild(imgBtnRow)

  const imgFileInput = document.createElement('input')
  imgFileInput.type = 'file'
  imgFileInput.accept = 'image/*'
  imgFileInput.className = 'admin-img-file'
  imgFileInput.id = `adm-img-file-${ci}-${qi}`
  imgFileInput.dataset.ci = String(ci)
  imgFileInput.dataset.qi = String(qi)
  imgFileInput.style.display = 'none'
  imgZone.appendChild(imgFileInput)
  fieldRow.appendChild(imgZone)

  accBody.appendChild(fieldRow)
  accordion.appendChild(accHeader)
  accordion.appendChild(accBody)
  return accordion
}

function openAdmin(): void {
  const content = $('admin-content')
  content.textContent = ''

  const heading = document.createElement('div')
  heading.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:4px"
  heading.textContent = 'All Questions Editor'
  content.appendChild(heading)

  const desc = document.createElement('p')
  desc.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:18px'
  desc.textContent = 'Edit category names, questions, answers, and add optional images to any tile.'
  content.appendChild(desc)

  for (const [ci, cat] of data.categories.entries()) {
    const sectionTitle = document.createElement('div')
    sectionTitle.className = 'admin-section-title'
    sectionTitle.textContent = `${cat.name} — Category ${ci + 1}`
    content.appendChild(sectionTitle)

    const catRow = document.createElement('div')
    catRow.className = 'admin-cat-row'

    const catLabel = document.createElement('label')
    catLabel.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap'
    catLabel.textContent = 'Category Name'
    catRow.appendChild(catLabel)

    const catInput = document.createElement('input')
    catInput.className = 'admin-cat-input'
    catInput.id = `adm-cat-${ci}`
    catInput.value = cat.name
    catRow.appendChild(catInput)
    content.appendChild(catRow)

    for (const [qi, pts] of cat.points.entries()) {
      content.appendChild(buildAdminAccordion(cat, ci, qi, pts))
    }
  }

  $('admin-overlay').style.display = 'flex'
}

function handleAdminImgUpload(ci: number, qi: number, file: File): void {
  handleImgUpload(ci, qi, file, `adm-img-preview-${ci}-${qi}`, `adm-img-clear-${ci}-${qi}`)
}

function saveAdmin(): void {
  for (const [ci, cat] of data.categories.entries()) {
    const catInput = document.getElementById(`adm-cat-${ci}`) as HTMLInputElement | null
    if (catInput) cat.name = catInput.value.trim() || cat.name

    for (const [qi] of cat.questions.entries()) {
      const qEl = document.getElementById(`adm-q-${ci}-${qi}`) as HTMLTextAreaElement | null
      const aEl = document.getElementById(`adm-a-${ci}-${qi}`) as HTMLInputElement | null
      if (!qEl || !aEl) continue

      const existing = cat.questions[qi]
      if (existing) {
        existing.q = qEl.value
        existing.a = aEl.value
      } else {
        cat.questions[qi] = { q: qEl.value, a: aEl.value }
      }

      const question = cat.questions[qi]
      if (!question) continue

      const imgKey = `${ci}-${qi}`
      const imgValue = imgStaging[imgKey]
      if (imgValue !== undefined) {
        if (imgValue) {
          question.img = imgValue
        } else {
          delete question.img
        }
      }
    }
  }

  clearRecord(imgStaging)
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
    questions: Array.from({ length: 5 }, () => ({ q: 'Write your question', a: 'Write your answer' })),
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
        for (const id of ['q-overlay', 'edit-overlay', 'admin-overlay', 'winner-overlay', 'team-setup-overlay']) {
          $(id).style.display = 'none'
        }
      }
    },
    { signal },
  )

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
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
        case 'edit-all':
          openAdmin()
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
          clearRecord(imgStaging)
          closeEditModal()
          break
        case 'cell-choose-image':
          document.getElementById('cell-img-file')?.click()
          break
        case 'cell-clear-image': {
          const ci = Number(target.dataset.ci)
          const qi = Number(target.dataset.qi)
          imgStaging[`${ci}-${qi}`] = ''
          const preview = document.getElementById('cell-img-preview') as HTMLImageElement | null
          if (preview) { preview.src = ''; preview.style.display = 'none' }
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
      const target = e.target as HTMLInputElement
      if (target.id !== 'cell-img-file') return
      const ci = Number(target.dataset.ci)
      const qi = Number(target.dataset.qi)
      const file = target.files?.[0]
      if (file) handleImgUpload(ci, qi, file, 'cell-img-preview', 'cell-img-clear')
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
          imgStaging[`${ci}-${qi}`] = ''
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
        const tile = target.closest<HTMLButtonElement>('[data-action="open-question"]')
        if (tile) {
          editCell(Number(tile.dataset.ci), Number(tile.dataset.qi))
          return
        }
        const removeBtn = target.closest<HTMLElement>('[data-action="remove-category"]')
        if (removeBtn) {
          removeCategory(Number(removeBtn.dataset.ci))
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
