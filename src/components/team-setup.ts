import { APP_MODE } from '../persistence/db.ts'
import { appState, saveData } from '../state/app-state.ts'
import { $ } from '../dom/helpers.ts'
import { closeOverlay, openOverlay } from '../dom/modal.ts'
import { renderAll } from '../render.ts'

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

export function openTeamSetup(): void {
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

  openOverlay('team-setup-overlay')
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

  appState.data.teams = teams
  appState.data.used = {}
  appState.selectedTeamIdx = 0
  appState.data.mode = APP_MODE.play
  closeOverlay('team-setup-overlay')
  saveData()
  renderAll()
}

export function cancelGame(): void {
  if (!confirm('Cancel the game? All scores will be lost.')) return
  appState.data.teams = []
  appState.data.used = {}
  appState.data.mode = APP_MODE.edit
  saveData()
  renderAll()
}

export function setupTeamSetupEvents(signal: AbortSignal): void {
  $('btn-close-team-setup').addEventListener(
    'click',
    () => closeOverlay('team-setup-overlay'),
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
}
