import './style.css'
import { APP_MODE, CATEGORY_COLOR, loadAppData, saveAppData } from './persistence/db.ts'
import type { AppData, Category, CategoryColor, Question } from './persistence/db.ts'

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
  categories: [
    {
      id: crypto.randomUUID(),
      name: 'Science',
      color: CATEGORY_COLOR.blue,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: 'What planet is known as the Red Planet?', a: 'Mars' },
        { q: 'What is the chemical symbol for water?', a: 'H₂O' },
        { q: 'How many bones are in the adult human body?', a: '206' },
        { q: 'What force keeps planets in orbit around the sun?', a: 'Gravity' },
        { q: 'What is the speed of light in a vacuum (approx)?', a: '299,792,458 m/s (~3×10⁸ m/s)' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'History',
      color: CATEGORY_COLOR.orange,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: 'In what year did World War II end?', a: '1945' },
        { q: 'Who was the first President of the United States?', a: 'George Washington' },
        { q: 'Which empire built the Colosseum?', a: 'The Roman Empire' },
        { q: 'In what year did the Berlin Wall fall?', a: '1989' },
        { q: 'Who was the longest-reigning British monarch?', a: 'Queen Elizabeth II (70 years)' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Geography',
      color: CATEGORY_COLOR.green,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: 'What is the capital of Australia?', a: 'Canberra' },
        { q: 'Which is the longest river in the world?', a: 'The Nile' },
        { q: 'What country has the most natural lakes?', a: 'Canada' },
        { q: 'What is the smallest country in the world by area?', a: 'Vatican City' },
        { q: 'On which continent is the Sahara Desert located?', a: 'Africa' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Pop Culture',
      color: CATEGORY_COLOR.purple,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: "Which movie features the line 'To infinity and beyond!'?", a: 'Toy Story' },
        { q: 'What band was Freddie Mercury the lead singer of?', a: 'Queen' },
        { q: "Which TV show featured characters living at 'The Peach Pit'?", a: 'Beverly Hills, 90210' },
        { q: 'What year was the first iPhone released?', a: '2007' },
        { q: 'Who wrote the Harry Potter book series?', a: 'J.K. Rowling' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Sports',
      color: CATEGORY_COLOR.red,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: 'How many players are on a standard soccer (football) team?', a: '11' },
        { q: 'In what city are the 2028 Summer Olympics being held?', a: 'Los Angeles' },
        { q: 'Which country has won the most FIFA World Cups?', a: 'Brazil (5 times)' },
        { q: 'What sport uses a puck?', a: 'Ice Hockey' },
        { q: 'How long is a standard marathon in kilometers?', a: '42.195 km' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Words & Language',
      color: CATEGORY_COLOR.teal,
      points: [100, 200, 300, 400, 500],
      questions: [
        { q: 'What is a word that reads the same forwards and backwards?', a: "Palindrome (e.g. 'racecar')" },
        { q: 'How many letters are in the English alphabet?', a: '26' },
        { q: 'What is the most spoken language in the world by native speakers?', a: 'Mandarin Chinese' },
        { q: "What does the word 'ubiquitous' mean?", a: 'Present, appearing, or found everywhere' },
        { q: 'Which punctuation mark looks like a period with a comma below it?', a: 'Semicolon ( ; )' },
      ],
    },
  ],
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
  if (data.mode === APP_MODE.edit) {
    el.textContent = 'Click a category to edit • Click a tile to edit a question'
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

    if (isEdit && data.categories.length > 1) {
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

function buildEditQuestionRow(qi: number, pts: number, q: string, a: string, canRemove: boolean, origQi: number): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ec-question-row'
  wrap.dataset.origQi = String(origQi)

  const header = document.createElement('div')
  header.className = 'ec-question-header'

  const ptsLabel = document.createElement('span')
  ptsLabel.className = 'ec-pts-label'
  ptsLabel.textContent = 'Points:'
  header.appendChild(ptsLabel)

  const ptsInput = document.createElement('input')
  ptsInput.type = 'number'
  ptsInput.className = 'ec-pts-input'
  ptsInput.value = String(pts)
  ptsInput.min = '0'
  ptsInput.step = '50'
  header.appendChild(ptsInput)

  if (canRemove) {
    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'ec-remove-btn'
    removeBtn.textContent = '✕'
    removeBtn.dataset.action = 'remove-question'
    removeBtn.dataset.qi = String(qi)
    header.appendChild(removeBtn)
  }

  wrap.appendChild(header)

  const qLabel = document.createElement('div')
  qLabel.className = 'field-label'
  qLabel.style.cssText = 'margin-top:6px;font-size:10px'
  qLabel.textContent = 'Question'
  wrap.appendChild(qLabel)

  const qInput = document.createElement('input')
  qInput.className = 'edit-input ec-q-input'
  qInput.value = q
  wrap.appendChild(qInput)

  const aLabel = document.createElement('div')
  aLabel.className = 'field-label'
  aLabel.style.fontSize = '10px'
  aLabel.textContent = 'Answer'
  wrap.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'edit-input ec-a-input'
  aInput.value = a
  wrap.appendChild(aInput)

  return wrap
}

function renderEditQuestions(cat: Category): void {
  const wrap = document.getElementById('ec-questions')
  if (!wrap) return
  wrap.textContent = ''
  const canRemove = cat.questions.length > 1
  for (const [qi, question] of cat.questions.entries()) {
    wrap.appendChild(buildEditQuestionRow(qi, cat.points[qi] ?? 100, question.q, question.a, canRemove, qi))
  }
}

function readEditFormIntoCategory(ci: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  const rows = document.querySelectorAll('#ec-questions .ec-question-row')
  const newQuestions: Question[] = []
  const newPoints: number[] = []

  for (const row of rows) {
    const ptsEl = row.querySelector('.ec-pts-input') as HTMLInputElement | null
    const qEl = row.querySelector('.ec-q-input') as HTMLInputElement | null
    const aEl = row.querySelector('.ec-a-input') as HTMLInputElement | null
    const origQi = Number((row as HTMLElement).dataset.origQi)
    const origQuestion = origQi >= 0 ? cat.questions[origQi] : undefined

    newPoints.push(Number(ptsEl?.value) || 100)
    const question: Question = { q: qEl?.value ?? '', a: aEl?.value ?? '' }
    if (origQuestion?.img) question.img = origQuestion.img
    newQuestions.push(question)
  }

  cat.questions = newQuestions
  cat.points = newPoints
}

function editCategory(ci: number): void {
  const cat = data.categories[ci]
  if (!cat) return
  const content = $('edit-content')
  content.textContent = ''

  const title = document.createElement('div')
  title.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:18px"
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

  const qTitle = document.createElement('div')
  qTitle.className = 'field-label'
  qTitle.style.marginTop = '20px'
  qTitle.textContent = 'Questions'
  content.appendChild(qTitle)

  const questionsWrap = document.createElement('div')
  questionsWrap.id = 'ec-questions'
  content.appendChild(questionsWrap)

  renderEditQuestions(cat)

  const addQBtn = document.createElement('button')
  addQBtn.type = 'button'
  addQBtn.className = 'edit-add-btn'
  addQBtn.textContent = '+ Add Question'
  addQBtn.dataset.action = 'add-question'
  addQBtn.dataset.ci = String(ci)
  content.appendChild(addQBtn)

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

  readEditFormIntoCategory(ci)
  saveData()
  renderAll()
  closeEditModal()
}

function closeEditModal(): void {
  $('edit-overlay').style.display = 'none'
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
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = (e.target as FileReader).result as string
    imgStaging[`${ci}-${qi}`] = base64
    const preview = document.getElementById(`adm-img-preview-${ci}-${qi}`) as HTMLImageElement | null
    if (preview) {
      preview.src = base64
      preview.style.display = 'block'
    }
    const clearBtn = document.getElementById(`adm-img-clear-${ci}-${qi}`)
    if (clearBtn) clearBtn.style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
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
  if (!cat || data.categories.length <= 1) return
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
        case 'add-question': {
          const ci = Number(target.dataset.ci)
          const cat = data.categories[ci]
          if (!cat) break
          readEditFormIntoCategory(ci)
          const lastPts = cat.points[cat.points.length - 1] ?? 0
          cat.questions.push({ q: '', a: '' })
          cat.points.push(lastPts + 100)
          renderEditQuestions(cat)
          break
        }
        case 'remove-question': {
          const saveBtnEl = document.querySelector<HTMLElement>('[data-action="save-category"]')
          const ci = Number(saveBtnEl?.dataset.ci)
          const cat = data.categories[ci]
          if (!cat || cat.questions.length <= 1) break
          readEditFormIntoCategory(ci)
          const qi = Number(target.dataset.qi)
          cat.questions.splice(qi, 1)
          cat.points.splice(qi, 1)
          renderEditQuestions(cat)
          break
        }
        default:
          break
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
          editCategory(Number(tile.dataset.ci))
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
