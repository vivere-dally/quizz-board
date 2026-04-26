import { appState, saveData } from '../state/app-state.ts'
import { $, cloneTemplate } from '../dom/helpers.ts'
import { closeOverlay, openOverlay } from '../dom/modal.ts'
import { renderBoard } from './board.ts'
import { adjustScore } from './scoreboard.ts'

type ActiveQ = {
  catIdx: number
  qIdx: number
  pts: number
}

let activeQ: ActiveQ | null = null

export function openQuestion(catIdx: number, qIdx: number, pts: number): void {
  const cat = appState.data.categories[catIdx]
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
  openOverlay('q-overlay')
}

function renderTeamSelector(): void {
  const el = $('m-teams')
  const frag = document.createDocumentFragment()

  const label = document.createElement('span')
  label.style.cssText = 'font-size:12px;color:var(--text-muted);margin-right:8px;align-self:center'
  label.textContent = 'Awarding:'
  frag.appendChild(label)

  for (const [i, t] of appState.data.teams.entries()) {
    const chip = cloneTemplate('tmpl-ts-chip') as HTMLButtonElement
    chip.textContent = t.name
    chip.dataset.team = String(i)
    if (i === appState.selectedTeamIdx) chip.classList.add('selected')
    frag.appendChild(chip)
  }

  el.textContent = ''
  el.appendChild(frag)
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
  adjustScore(appState.selectedTeamIdx, delta)
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
  const cat = appState.data.categories[activeQ.catIdx]
  if (!cat) return
  appState.data.used[`${cat.id}-${activeQ.qIdx}`] = true
  saveData()
  renderBoard()
  activeQ = null
}

function closeQModal(): void {
  closeOverlay('q-overlay')
  activeQ = null
}

export function setupQuestionModalEvents(signal: AbortSignal): void {
  $('btn-close-question').addEventListener('click', closeQModal, { signal })
  $('btn-reveal').addEventListener('click', revealAnswer, { signal })
  $('btn-correct').addEventListener('click', () => markResult(true), { signal })
  $('btn-wrong').addEventListener('click', () => markResult(false), { signal })
  $('btn-skip').addEventListener('click', skipQuestion, { signal })

  $('m-teams').addEventListener(
    'click',
    (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-action="select-awarding"]')
      if (!chip) return
      appState.selectedTeamIdx = Number(chip.dataset.team)
      renderTeamSelector()
    },
    { signal },
  )
}
