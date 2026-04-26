export type ScoringResult = {
  points: number
  newStreak: number
}

export function scoreCorrect(tilePts: number, currentStreak: number): ScoringResult {
  const newStreak = currentStreak + 1
  const streakBonus = 100 * (newStreak - 1)
  return { points: tilePts + streakBonus, newStreak }
}

export function scoreWrong(): ScoringResult {
  return { points: 0, newStreak: 0 }
}

export function nextCorrectPreview(tilePts: number, currentStreak: number): number {
  return scoreCorrect(tilePts, currentStreak).points
}

export function streakBonusFor(streak: number): number {
  return 100 * (streak - 1)
}
