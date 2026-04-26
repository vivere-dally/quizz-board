import { APP_MODE } from './persistence/db.ts'
import { appState, MAX_CATEGORIES } from './state/app-state.ts'
import { $ } from './dom/helpers.ts'
import { renderBoard } from './components/board.ts'
import { renderScoreboard } from './components/scoreboard.ts'

export function renderAll(): void {
  renderSubtitle()
  renderControls()
  if (appState.data.mode === APP_MODE.play) {
    renderScoreboard()
  } else {
    $('scoreboard').textContent = ''
  }
  renderBoard()
}

function renderSubtitle(): void {
  const el = $('subtitle')
  el.textContent = ''
  if (appState.data.mode === APP_MODE.edit) {
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

  if (appState.data.mode === APP_MODE.edit) {
    if (appState.data.categories.length < MAX_CATEGORIES) {
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
