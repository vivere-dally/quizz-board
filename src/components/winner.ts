import { appState } from '../state/app-state.ts'
import { $ } from '../dom/helpers.ts'
import { closeOverlay, openOverlay } from '../dom/modal.ts'

export function showWinner(): void {
  const sorted = [...appState.data.teams].sort((a, b) => b.score - a.score)
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

  openOverlay('winner-overlay')
}

export function setupWinnerEvents(signal: AbortSignal): void {
  $('btn-close-winner').addEventListener(
    'click',
    () => closeOverlay('winner-overlay'),
    { signal },
  )
}
