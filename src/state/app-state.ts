import { APP_MODE, CATEGORY_COLOR, loadAppData, saveAppData } from '../persistence/db.ts'
import type { AppData, CategoryColor } from '../persistence/db.ts'

const COLOR_ORDER = [
  CATEGORY_COLOR.blue, CATEGORY_COLOR.orange, CATEGORY_COLOR.purple,
  CATEGORY_COLOR.green, CATEGORY_COLOR.red, CATEGORY_COLOR.teal,
  CATEGORY_COLOR.pink, CATEGORY_COLOR.yellow,
] as const

export const MAX_CATEGORIES = 12

export const appState = {
  data: {
    mode: APP_MODE.edit,
    categories: [],
    teams: [],
    used: {},
  } as AppData,
  selectedTeamIdx: 0,
  imgStaging: {} as Record<string, string>,
}

export async function loadData(): Promise<void> {
  const saved = await loadAppData()
  if (saved) {
    appState.data.mode = saved.mode
    appState.data.categories = saved.categories
    appState.data.teams = saved.teams
    appState.data.used = saved.used
  } else {
    await saveAppData(appState.data)
  }
}

export function saveData(): void {
  saveAppData(appState.data).catch(() => {})
}

export function nextColor(): CategoryColor {
  const usedColors = new Set(appState.data.categories.map((c) => c.color))
  return COLOR_ORDER.find((c) => !usedColors.has(c)) ?? CATEGORY_COLOR.blue
}
