import './style.css'
import { CATEGORY_KIND, loadAppData, saveAppData } from './persistence/db.ts'
import type { AppData, Category, CategoryKind, MusicQuestion } from './persistence/db.ts'

type ActiveQ = {
  catIdx: number
  qIdx: number
  pts: number
  kind: CategoryKind
}

// ── Constants ──

const POINTS = [100, 200, 300, 400, 500] as const

// ── State ──

const data: AppData = {
  categories: [
    {
      kind: CATEGORY_KIND.standard,
      name: 'Science',
      questions: [
        { q: 'What planet is known as the Red Planet?', a: 'Mars' },
        { q: 'What is the chemical symbol for water?', a: 'H₂O' },
        { q: 'How many bones are in the adult human body?', a: '206' },
        { q: 'What force keeps planets in orbit around the sun?', a: 'Gravity' },
        { q: 'What is the speed of light in a vacuum (approx)?', a: '299,792,458 m/s (~3×10⁸ m/s)' },
      ],
    },
    {
      kind: CATEGORY_KIND.standard,
      name: 'History',
      questions: [
        { q: 'In what year did World War II end?', a: '1945' },
        { q: 'Who was the first President of the United States?', a: 'George Washington' },
        { q: 'Which empire built the Colosseum?', a: 'The Roman Empire' },
        { q: 'In what year did the Berlin Wall fall?', a: '1989' },
        { q: 'Who was the longest-reigning British monarch?', a: 'Queen Elizabeth II (70 years)' },
      ],
    },
    {
      kind: CATEGORY_KIND.standard,
      name: 'Geography',
      questions: [
        { q: 'What is the capital of Australia?', a: 'Canberra' },
        { q: 'Which is the longest river in the world?', a: 'The Nile' },
        { q: 'What country has the most natural lakes?', a: 'Canada' },
        { q: 'What is the smallest country in the world by area?', a: 'Vatican City' },
        { q: 'On which continent is the Sahara Desert located?', a: 'Africa' },
      ],
    },
    {
      kind: CATEGORY_KIND.standard,
      name: 'Pop Culture',
      questions: [
        { q: "Which movie features the line 'To infinity and beyond!'?", a: 'Toy Story' },
        { q: 'What band was Freddie Mercury the lead singer of?', a: 'Queen' },
        { q: "Which TV show featured characters living at 'The Peach Pit'?", a: 'Beverly Hills, 90210' },
        { q: 'What year was the first iPhone released?', a: '2007' },
        { q: 'Who wrote the Harry Potter book series?', a: 'J.K. Rowling' },
      ],
    },
    {
      kind: CATEGORY_KIND.standard,
      name: 'Sports',
      questions: [
        { q: 'How many players are on a standard soccer (football) team?', a: '11' },
        { q: 'In what city are the 2028 Summer Olympics being held?', a: 'Los Angeles' },
        { q: 'Which country has won the most FIFA World Cups?', a: 'Brazil (5 times)' },
        { q: 'What sport uses a puck?', a: 'Ice Hockey' },
        { q: 'How long is a standard marathon in kilometers?', a: '42.195 km' },
      ],
    },
    {
      kind: CATEGORY_KIND.standard,
      name: 'Words & Language',
      questions: [
        { q: 'What is a word that reads the same forwards and backwards?', a: "Palindrome (e.g. 'racecar')" },
        { q: 'How many letters are in the English alphabet?', a: '26' },
        { q: 'What is the most spoken language in the world by native speakers?', a: 'Mandarin Chinese' },
        { q: "What does the word 'ubiquitous' mean?", a: 'Present, appearing, or found everywhere' },
        { q: 'Which punctuation mark looks like a period with a comma below it?', a: 'Semicolon ( ; )' },
      ],
    },
    {
      kind: CATEGORY_KIND.music,
      name: 'Music',
      questions: [
        { q: 'Write your question here', a: 'Write your answer here', mp3: '' },
        { q: 'Write your question here', a: 'Write your answer here', mp3: '' },
        { q: 'Write your question here', a: 'Write your answer here', mp3: '' },
        { q: 'Write your question here', a: 'Write your answer here', mp3: '' },
        { q: 'Write your question here', a: 'Write your answer here', mp3: '' },
      ],
    },
    {
      kind: CATEGORY_KIND.x2,
      name: 'X2',
      questions: [
        { q: 'Write your hard question here', a: 'Write your answer here' },
        { q: 'Write your hard question here', a: 'Write your answer here' },
        { q: 'Write your hard question here', a: 'Write your answer here' },
        { q: 'Write your hard question here', a: 'Write your answer here' },
        { q: 'Write your hard question here', a: 'Write your answer here' },
      ],
    },
  ],
  teams: [
    { name: 'Team 1', score: 0 },
    { name: 'Team 2', score: 0 },
    { name: 'Team 3', score: 0 },
  ],
  used: {},
}

let activeQ: ActiveQ | null = null
let selectedTeamIdx = 0
const imgStaging: Record<string, string> = {}
const mp3Staging: Record<string, string> = {}

// ── Persistence ──

async function loadData(): Promise<void> {
  const saved = await loadAppData()
  if (saved) {
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

// ── Render ──

function renderAll(): void {
  renderScoreboard()
  renderBoard()
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

  if (data.teams.length < 6) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'add-team-btn'
    btn.textContent = '+ Add Team'
    btn.dataset.action = 'add-team'
    frag.appendChild(btn)
  }

  el.textContent = ''
  el.appendChild(frag)
}

function renderBoard(): void {
  const el = $('board')
  el.style.gridTemplateColumns = `repeat(${data.categories.length}, 1fr)`

  const frag = document.createDocumentFragment()

  for (const [ci, cat] of data.categories.entries()) {
    const header = cloneTemplate('tmpl-cat-header')
    const catName = header.querySelector('.cat-name') as HTMLButtonElement
    catName.textContent = cat.name
    catName.dataset.ci = String(ci)

    switch (cat.kind) {
      case CATEGORY_KIND.x2: {
        header.classList.add('x2-header')
        const badge = document.createElement('div')
        badge.className = 'x2-badge'
        badge.textContent = 'DOUBLE SCORE'
        header.appendChild(badge)
        break
      }
      case CATEGORY_KIND.music: {
        header.classList.add('music-header')
        const badge = document.createElement('div')
        badge.className = 'music-badge'
        badge.textContent = '🎵 MUSIC'
        header.appendChild(badge)
        break
      }
      case CATEGORY_KIND.standard: {
        const editIcon = document.createElement('span')
        editIcon.className = 'cat-edit-icon'
        editIcon.textContent = '✎'
        header.appendChild(editIcon)
        break
      }
    }

    frag.appendChild(header)
  }

  for (const [pi, pts] of POINTS.entries()) {
    for (const [ci, cat] of data.categories.entries()) {
      const used = !!data.used[`${ci}-${pi}`]
      const tile = cloneTemplate('tmpl-tile')
      const tileBtn = tile as HTMLButtonElement

      tileBtn.dataset.ci = String(ci)
      tileBtn.dataset.pi = String(pi)

      if (cat.kind === CATEGORY_KIND.x2) tileBtn.classList.add('x2-tile')
      if (cat.kind === CATEGORY_KIND.music) tileBtn.classList.add('music-tile')

      const ptsSpan = tileBtn.querySelector('.tile-pts') as HTMLElement
      if (cat.kind === CATEGORY_KIND.x2) {
        ptsSpan.className = 'bomb-icon'
        ptsSpan.textContent = '💣'
      } else {
        ptsSpan.textContent = String(pts)
      }

      if (used) {
        tileBtn.classList.add('used')
        tileBtn.disabled = true
      }

      frag.appendChild(tileBtn)
    }
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

  activeQ = { catIdx, qIdx, pts, kind: cat.kind }

  const modal = $('q-modal')
  modal.className = 'modal'
  if (cat.kind === CATEGORY_KIND.x2) modal.classList.add('x2-modal')
  if (cat.kind === CATEGORY_KIND.music) modal.classList.add('music-modal')

  const mPts = $('m-pts')
  const mCat = $('m-cat')
  switch (cat.kind) {
    case CATEGORY_KIND.x2:
      mPts.textContent = '💣 X2'
      mCat.textContent = 'DOUBLE SCORE — ' + cat.name.toUpperCase()
      break
    case CATEGORY_KIND.music:
      mPts.textContent = '🎵 ' + pts
      mCat.textContent = 'MUSIC — ' + cat.name.toUpperCase()
      break
    case CATEGORY_KIND.standard:
      mPts.textContent = String(pts)
      mCat.textContent = cat.name.toUpperCase()
      break
  }

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

  let ytWrap = document.getElementById('m-yt-play-wrap')
  if (!ytWrap) {
    ytWrap = document.createElement('div')
    ytWrap.id = 'm-yt-play-wrap'
    ytWrap.className = 'yt-play-wrap'
    imgWrap.after(ytWrap)
  }

  const mp3Src = cat.kind === CATEGORY_KIND.music ? (q as MusicQuestion).mp3 : ''
  if (mp3Src.trim()) {
    ytWrap.textContent = ''
    const playBtn = document.createElement('button')
    playBtn.type = 'button'
    playBtn.className = 'yt-play-btn'
    playBtn.id = 'mp3-play-btn'
    playBtn.dataset.action = 'toggle-mp3'
    const playIcon = document.createElement('span')
    playIcon.id = 'mp3-play-icon'
    playIcon.style.cssText =
      'font-size:18px;line-height:1;width:32px;height:32px;background:var(--purple-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0'
    playIcon.textContent = '▶'
    const playLabel = document.createElement('span')
    playLabel.id = 'mp3-play-label'
    playLabel.textContent = 'Play'
    playBtn.appendChild(playIcon)
    playBtn.appendChild(playLabel)
    ytWrap.appendChild(playBtn)
    ytWrap.style.display = 'flex'

    const audio = $('music-audio') as HTMLAudioElement
    audio.src = mp3Src
    audio.load()
    audio.onended = resetMp3Btn
  } else {
    ytWrap.textContent = ''
    ytWrap.style.display = 'none'
    stopMp3()
  }

  let x2Label = document.getElementById('x2-info-label')
  if (!x2Label) {
    x2Label = document.createElement('div')
    x2Label.id = 'x2-info-label'
    x2Label.className = 'x2-label'
    $('m-question').before(x2Label)
  }
  if (cat.kind === CATEGORY_KIND.x2) {
    x2Label.textContent = "Correct answer doubles this player's current score! (x2)"
    x2Label.style.display = 'block'
  } else {
    x2Label.style.display = 'none'
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
  const team = data.teams[selectedTeamIdx]
  if (!team) return

  if (activeQ.kind === CATEGORY_KIND.x2 && correct) {
    team.score *= 2
    saveData()
    renderScoreboard()
  } else if (activeQ.kind !== CATEGORY_KIND.x2) {
    const delta = correct ? activeQ.pts : -activeQ.pts
    adjustScore(selectedTeamIdx, delta)
  }
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
  data.used[`${activeQ.catIdx}-${activeQ.qIdx}`] = true
  saveData()
  renderBoard()
  activeQ = null
}

function closeQModal(): void {
  $('q-overlay').style.display = 'none'
  stopMp3()
  activeQ = null
}

// ── Audio ──

function toggleMp3(): void {
  const audio = document.getElementById('music-audio') as HTMLAudioElement | null
  if (!audio || !audio.src || audio.src === window.location.href) return

  const label = document.getElementById('mp3-play-label')
  const icon = document.getElementById('mp3-play-icon')
  const btn = document.getElementById('mp3-play-btn')

  if (audio.paused) {
    audio.play().then(() => {
      if (label) label.textContent = 'Pause'
      if (icon) icon.textContent = '⏸'
      if (btn) btn.style.boxShadow = '0 0 20px var(--purple-glow)'
    }).catch((err: unknown) => {
      console.error('Audio play failed:', err)
    })
  } else {
    audio.pause()
    if (label) label.textContent = 'Play'
    if (icon) icon.textContent = '▶'
    if (btn) btn.style.boxShadow = ''
  }
}

function resetMp3Btn(): void {
  const btn = document.getElementById('mp3-play-btn')
  const label = document.getElementById('mp3-play-label')
  const icon = document.getElementById('mp3-play-icon')
  if (btn) btn.style.boxShadow = ''
  if (label) label.textContent = 'Play'
  if (icon) icon.textContent = '▶'
}

function stopMp3(): void {
  const audio = document.getElementById('music-audio') as HTMLAudioElement | null
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    audio.src = ''
  }
  resetMp3Btn()
}

// ── Category Edit ──

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

  const qTitle = document.createElement('div')
  qTitle.className = 'field-label'
  qTitle.style.marginTop = '20px'
  qTitle.textContent = 'Quick Edit Questions'
  content.appendChild(qTitle)

  for (const [pi, pts] of POINTS.entries()) {
    const wrap = document.createElement('div')
    wrap.style.marginBottom = '14px'

    const ptsLabel = document.createElement('div')
    ptsLabel.style.cssText =
      'font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em'
    ptsLabel.textContent = `${pts} pts`
    wrap.appendChild(ptsLabel)

    const qLabel = document.createElement('div')
    qLabel.className = 'field-label'
    qLabel.style.cssText = 'margin-top:6px;font-size:10px'
    qLabel.textContent = 'Question'
    wrap.appendChild(qLabel)

    const qInput = document.createElement('input')
    qInput.className = 'edit-input'
    qInput.id = `ec-q-${pi}`
    qInput.value = cat.questions[pi]?.q ?? ''
    wrap.appendChild(qInput)

    const aLabel = document.createElement('div')
    aLabel.className = 'field-label'
    aLabel.style.fontSize = '10px'
    aLabel.textContent = 'Answer'
    wrap.appendChild(aLabel)

    const aInput = document.createElement('input')
    aInput.className = 'edit-input'
    aInput.id = `ec-a-${pi}`
    aInput.value = cat.questions[pi]?.a ?? ''
    wrap.appendChild(aInput)

    content.appendChild(wrap)
  }

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

  for (const [pi] of POINTS.entries()) {
    const qEl = document.getElementById(`ec-q-${pi}`) as HTMLInputElement | null
    const aEl = document.getElementById(`ec-a-${pi}`) as HTMLInputElement | null
    if (!qEl || !aEl) continue
    const existing = cat.questions[pi]
    if (existing) {
      existing.q = qEl.value
      existing.a = aEl.value
    } else if (cat.kind === CATEGORY_KIND.music) {
      cat.questions[pi] = { q: qEl.value, a: aEl.value, mp3: '' }
    } else {
      cat.questions[pi] = { q: qEl.value, a: aEl.value }
    }
  }
  saveData()
  renderAll()
  closeEditModal()
}

function closeEditModal(): void {
  $('edit-overlay').style.display = 'none'
}

// ── Admin Panel ──

function buildAdminAccordion(cat: Category, ci: number, pi: number, pts: number): HTMLElement {
  const q = cat.questions[pi]
  const hasImg = !!q?.img
  const hasMp3 = cat.kind === CATEGORY_KIND.music && !!(q as MusicQuestion | undefined)?.mp3
  const isX2 = cat.kind === CATEGORY_KIND.x2
  const isMusic = cat.kind === CATEGORY_KIND.music

  const accordion = document.createElement('div')
  accordion.className = 'q-accordion' + (isX2 ? ' x2-acc' : isMusic ? ' music-acc' : '')

  const accHeader = document.createElement('div')
  accHeader.className = 'q-acc-header'
  accHeader.dataset.action = 'toggle-accordion'
  const headerLabel = document.createElement('span')
  let headerText = (isX2 ? '💣 ' : isMusic ? '🎵 ' : '') + pts + (isX2 ? ' — Double Score' : ' pts')
  if (hasImg) headerText += ' 📷'
  if (hasMp3) headerText += ' 🎵'
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

  const labelColor = isX2 ? 'rgba(255,122,0,0.8)' : isMusic ? 'rgba(168,85,247,0.9)' : 'var(--text-muted)'

  const qLabel = document.createElement('label')
  qLabel.style.cssText = `font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:.08em`
  qLabel.textContent = 'Question'
  fieldRow.appendChild(qLabel)

  const qTextarea = document.createElement('textarea')
  qTextarea.className = 'mini-textarea'
  qTextarea.id = `adm-q-${ci}-${pi}`
  qTextarea.textContent = q?.q ?? ''
  fieldRow.appendChild(qTextarea)

  const aLabel = document.createElement('label')
  aLabel.style.cssText = `font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:.08em`
  aLabel.textContent = 'Answer'
  fieldRow.appendChild(aLabel)

  const aInput = document.createElement('input')
  aInput.className = 'mini-input'
  aInput.id = `adm-a-${ci}-${pi}`
  aInput.value = q?.a ?? ''
  fieldRow.appendChild(aInput)

  // Image upload zone
  const imgZone = document.createElement('div')
  imgZone.className = 'img-upload-zone' + (isX2 ? ' x2-zone' : '')

  const imgLabel = document.createElement('span')
  imgLabel.className = 'img-upload-label' + (isX2 ? ' x2-label-text' : '')
  imgLabel.textContent = 'Image (optional) — shown during the question'
  imgZone.appendChild(imgLabel)

  const imgPreview = document.createElement('img')
  imgPreview.className = 'img-preview-thumb'
  imgPreview.id = `adm-img-preview-${ci}-${pi}`
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
  chooseImgBtn.className = 'img-file-btn' + (isX2 ? ' x2-btn' : '')
  chooseImgBtn.textContent = '📷 Choose Image'
  chooseImgBtn.dataset.action = 'choose-image'
  chooseImgBtn.dataset.ci = String(ci)
  chooseImgBtn.dataset.pi = String(pi)
  imgBtnRow.appendChild(chooseImgBtn)

  const clearImgBtn = document.createElement('button')
  clearImgBtn.type = 'button'
  clearImgBtn.className = 'img-clear-btn'
  clearImgBtn.id = `adm-img-clear-${ci}-${pi}`
  if (!hasImg) clearImgBtn.style.display = 'none'
  clearImgBtn.textContent = '✗ Remove'
  clearImgBtn.dataset.action = 'clear-image'
  clearImgBtn.dataset.ci = String(ci)
  clearImgBtn.dataset.pi = String(pi)
  imgBtnRow.appendChild(clearImgBtn)
  imgZone.appendChild(imgBtnRow)

  const imgFileInput = document.createElement('input')
  imgFileInput.type = 'file'
  imgFileInput.accept = 'image/*'
  imgFileInput.className = 'admin-img-file'
  imgFileInput.id = `adm-img-file-${ci}-${pi}`
  imgFileInput.dataset.ci = String(ci)
  imgFileInput.dataset.pi = String(pi)
  imgFileInput.style.display = 'none'
  imgZone.appendChild(imgFileInput)
  fieldRow.appendChild(imgZone)

  if (isMusic) {
    const mp3Zone = document.createElement('div')
    mp3Zone.className = 'yt-input-zone'

    const mp3Label = document.createElement('span')
    mp3Label.className = 'yt-input-label'
    mp3Label.textContent = '🎵 Audio File (MP3) — players click Play to hear it'
    mp3Zone.appendChild(mp3Label)

    const mp3BtnRow = document.createElement('div')
    mp3BtnRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px'

    const chooseMp3Btn = document.createElement('button')
    chooseMp3Btn.type = 'button'
    chooseMp3Btn.className = 'img-file-btn'
    chooseMp3Btn.textContent = '🎵 Choose MP3'
    chooseMp3Btn.dataset.action = 'choose-mp3'
    chooseMp3Btn.dataset.ci = String(ci)
    chooseMp3Btn.dataset.pi = String(pi)
    mp3BtnRow.appendChild(chooseMp3Btn)

    const clearMp3Btn = document.createElement('button')
    clearMp3Btn.type = 'button'
    clearMp3Btn.className = 'img-clear-btn'
    clearMp3Btn.id = `adm-mp3-clear-${ci}-${pi}`
    if (!hasMp3) clearMp3Btn.style.display = 'none'
    clearMp3Btn.textContent = '✗ Remove'
    clearMp3Btn.dataset.action = 'clear-mp3'
    clearMp3Btn.dataset.ci = String(ci)
    clearMp3Btn.dataset.pi = String(pi)
    mp3BtnRow.appendChild(clearMp3Btn)
    mp3Zone.appendChild(mp3BtnRow)

    const mp3Status = document.createElement('div')
    mp3Status.className = 'yt-link-preview'
    mp3Status.id = `adm-mp3-status-${ci}-${pi}`
    mp3Status.textContent = hasMp3 ? '✓ Audio loaded' : 'No audio file yet'
    mp3Zone.appendChild(mp3Status)

    const mp3FileInput = document.createElement('input')
    mp3FileInput.type = 'file'
    mp3FileInput.accept = 'audio/mp3,audio/mpeg,audio/*'
    mp3FileInput.className = 'admin-mp3-file'
    mp3FileInput.id = `adm-mp3-file-${ci}-${pi}`
    mp3FileInput.dataset.ci = String(ci)
    mp3FileInput.dataset.pi = String(pi)
    mp3FileInput.style.display = 'none'
    mp3Zone.appendChild(mp3FileInput)
    fieldRow.appendChild(mp3Zone)
  }

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
    const isX2 = cat.kind === CATEGORY_KIND.x2
    const isMusic = cat.kind === CATEGORY_KIND.music

    const sectionTitle = document.createElement('div')
    sectionTitle.className = 'admin-section-title' + (isX2 ? ' x2-title' : isMusic ? ' music-title' : '')
    const prefix = isX2 ? '💣 ' : isMusic ? '🎵 ' : ''
    const suffix = isX2 ? ' — X2 Double Score' : isMusic ? ' — Music' : ''
    sectionTitle.textContent = `${prefix}${cat.name} — Category ${ci + 1}${suffix}`
    content.appendChild(sectionTitle)

    const catRow = document.createElement('div')
    catRow.className = 'admin-cat-row'

    const catLabel = document.createElement('label')
    catLabel.style.cssText = `font-size:11px;color:${isX2 ? 'rgba(255,122,0,0.8)' : isMusic ? 'rgba(168,85,247,0.9)' : 'var(--text-muted)'};white-space:nowrap`
    catLabel.textContent = 'Category Name'
    catRow.appendChild(catLabel)

    const catInput = document.createElement('input')
    catInput.className = 'admin-cat-input' + (isX2 ? ' x2-cat-input' : '')
    catInput.id = `adm-cat-${ci}`
    catInput.value = cat.name
    catRow.appendChild(catInput)
    content.appendChild(catRow)

    for (const [pi, pts] of POINTS.entries()) {
      content.appendChild(buildAdminAccordion(cat, ci, pi, pts))
    }
  }

  $('admin-overlay').style.display = 'flex'
}

function handleAdminImgUpload(ci: number, pi: number, file: File): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = (e.target as FileReader).result as string
    imgStaging[`${ci}-${pi}`] = base64
    const preview = document.getElementById(`adm-img-preview-${ci}-${pi}`) as HTMLImageElement | null
    if (preview) {
      preview.src = base64
      preview.style.display = 'block'
    }
    const clearBtn = document.getElementById(`adm-img-clear-${ci}-${pi}`)
    if (clearBtn) clearBtn.style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
}

function handleAdminMp3Upload(ci: number, pi: number, file: File): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    mp3Staging[`${ci}-${pi}`] = (e.target as FileReader).result as string
    const status = document.getElementById(`adm-mp3-status-${ci}-${pi}`)
    if (status) status.textContent = '✓ ' + file.name + ' loaded'
    const clearBtn = document.getElementById(`adm-mp3-clear-${ci}-${pi}`)
    if (clearBtn) clearBtn.style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
}

function saveAdmin(): void {
  for (const [ci, cat] of data.categories.entries()) {
    const catInput = document.getElementById(`adm-cat-${ci}`) as HTMLInputElement | null
    if (catInput) cat.name = catInput.value.trim() || cat.name

    for (const [pi] of POINTS.entries()) {
      const qEl = document.getElementById(`adm-q-${ci}-${pi}`) as HTMLTextAreaElement | null
      const aEl = document.getElementById(`adm-a-${ci}-${pi}`) as HTMLInputElement | null
      if (!qEl || !aEl) continue

      const existing = cat.questions[pi]
      if (existing) {
        existing.q = qEl.value
        existing.a = aEl.value
      } else if (cat.kind === CATEGORY_KIND.music) {
        cat.questions[pi] = { q: qEl.value, a: aEl.value, mp3: '' }
      } else {
        cat.questions[pi] = { q: qEl.value, a: aEl.value }
      }

      const question = cat.questions[pi]
      if (!question) continue

      const imgKey = `${ci}-${pi}`
      const imgValue = imgStaging[imgKey]
      if (imgValue !== undefined) {
        if (imgValue) {
          question.img = imgValue
        } else {
          delete question.img
        }
      }

      if (cat.kind === CATEGORY_KIND.music) {
        const mp3Value = mp3Staging[imgKey]
        if (mp3Value !== undefined) {
          (question as MusicQuestion).mp3 = mp3Value
        }
      }
    }
  }

  clearRecord(imgStaging)
  clearRecord(mp3Staging)
  saveData()
  renderAll()
  closeAdmin()
}

function closeAdmin(): void {
  $('admin-overlay').style.display = 'none'
}

// ── Teams & Scoring ──

function addTeam(): void {
  data.teams.push({ name: `Team ${data.teams.length + 1}`, score: 0 })
  saveData()
  renderScoreboard()
}

function adjustScore(i: number, delta: number): void {
  const team = data.teams[i]
  if (!team) return
  team.score += delta
  saveData()
  renderScoreboard()
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

// ── Reset ──

function resetBoard(): void {
  if (!confirm('Reset all used tiles? Scores and questions are kept.')) return
  data.used = {}
  saveData()
  renderBoard()
}

// ── Event Setup ──

function setupEvents(): void {
  const ac = new AbortController()
  const { signal } = ac

  // Keyboard
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        for (const id of ['q-overlay', 'edit-overlay', 'admin-overlay', 'winner-overlay']) {
          $(id).style.display = 'none'
        }
        stopMp3()
      }
    },
    { signal },
  )

  // Overlay dismiss on backdrop click
  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      ;(e.currentTarget as HTMLElement).style.display = 'none'
      if ((e.currentTarget as HTMLElement).id === 'q-overlay') stopMp3()
    }
  }

  for (const id of ['q-overlay', 'edit-overlay', 'admin-overlay', 'winner-overlay']) {
    $(id).addEventListener('click', handleOverlayClick, { signal })
  }

  // Controls
  $('controls').addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!btn) return
      switch (btn.dataset.action) {
        case 'edit-all':
          openAdmin()
          break
        case 'show-winner':
          showWinner()
          break
        case 'reset-board':
          resetBoard()
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

  // Edit modal
  $('btn-close-edit').addEventListener('click', closeEditModal, { signal })
  $('edit-modal').addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="save-category"]')
      if (!btn) return
      const ci = Number(btn.dataset.ci)
      saveCategoryEdit(ci)
    },
    { signal },
  )

  // Admin modal buttons
  $('btn-close-admin').addEventListener('click', closeAdmin, { signal })
  $('btn-save-admin').addEventListener('click', saveAdmin, { signal })

  // Admin modal delegation (accordions, image/mp3 buttons)
  $('admin-modal').addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return

      const ci = Number(target.dataset.ci)
      const pi = Number(target.dataset.pi)

      switch (target.dataset.action) {
        case 'toggle-accordion': {
          target.classList.toggle('collapsed')
          const body = target.nextElementSibling as HTMLElement | null
          if (body) body.classList.toggle('hidden')
          break
        }
        case 'choose-image':
          document.getElementById(`adm-img-file-${ci}-${pi}`)?.click()
          break
        case 'clear-image': {
          imgStaging[`${ci}-${pi}`] = ''
          const preview = document.getElementById(`adm-img-preview-${ci}-${pi}`) as HTMLImageElement | null
          if (preview) {
            preview.src = ''
            preview.style.display = 'none'
          }
          target.style.display = 'none'
          break
        }
        case 'choose-mp3':
          document.getElementById(`adm-mp3-file-${ci}-${pi}`)?.click()
          break
        case 'clear-mp3': {
          mp3Staging[`${ci}-${pi}`] = ''
          const status = document.getElementById(`adm-mp3-status-${ci}-${pi}`)
          if (status) status.textContent = 'No audio file yet'
          target.style.display = 'none'
          break
        }
        default:
          break
      }
    },
    { signal },
  )

  // Admin modal file input changes (delegation)
  $('admin-modal').addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLInputElement
      const ci = Number(target.dataset.ci)
      const pi = Number(target.dataset.pi)
      const file = target.files?.[0]
      if (!file) return

      if (target.classList.contains('admin-img-file')) {
        handleAdminImgUpload(ci, pi, file)
      } else if (target.classList.contains('admin-mp3-file')) {
        handleAdminMp3Upload(ci, pi, file)
      }
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

  // Scoreboard delegation
  $('scoreboard').addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement

      // Add team
      if (target.closest('[data-action="add-team"]')) {
        addTeam()
        return
      }

      // Score adjustment
      const scoreBtn = target.closest<HTMLElement>('[data-action="adjust-score"]')
      if (scoreBtn) {
        adjustScore(Number(scoreBtn.dataset.team), Number(scoreBtn.dataset.delta))
        return
      }

      // Don't select team when clicking name input
      if (target.closest('.team-name')) return

      // Select team
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

      // Category name / edit icon
      const catBtn = target.closest<HTMLElement>('[data-action="edit-category"]')
      if (catBtn) {
        editCategory(Number(catBtn.dataset.ci))
        return
      }

      // Edit icon click (inside cat-header, but not the button itself)
      if (target.closest('.cat-edit-icon')) {
        const header = target.closest('.cat-header')
        const nameBtn = header?.querySelector<HTMLElement>('[data-action="edit-category"]')
        if (nameBtn) editCategory(Number(nameBtn.dataset.ci))
        return
      }

      // Tile
      const tile = target.closest<HTMLButtonElement>('[data-action="open-question"]')
      if (tile && !tile.disabled) {
        const ci = Number(tile.dataset.ci)
        const pi = Number(tile.dataset.pi)
        const pts = POINTS[pi]
        if (pts !== undefined) openQuestion(ci, pi, pts)
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

  // MP3 play button (dynamically created, delegate from modal)
  $('q-modal').addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="toggle-mp3"]')
      if (btn) toggleMp3()
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
