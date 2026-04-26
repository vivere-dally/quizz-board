import { appState, saveData } from '../state/app-state.ts'
import { $, cloneTemplate } from '../dom/helpers.ts'

export function renderScoreboard(): void {
  const el = $('scoreboard')
  const frag = document.createDocumentFragment()

  for (const [i, t] of appState.data.teams.entries()) {
    const card = cloneTemplate('tmpl-team-card')
    card.dataset.team = String(i)
    if (i === appState.selectedTeamIdx) card.classList.add('active')

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

export function adjustScore(i: number, delta: number): void {
  const team = appState.data.teams[i]
  if (!team) return
  team.score += delta
  saveData()
  renderScoreboard()
}

export function setupScoreboardEvents(signal: AbortSignal): void {
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
        appState.selectedTeamIdx = Number(card.dataset.team)
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
      const team = appState.data.teams[idx]
      if (team) {
        team.name = (target as HTMLInputElement).value
        saveData()
        renderScoreboard()
      }
    },
    { signal },
  )
}
