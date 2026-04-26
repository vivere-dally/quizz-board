import { describe, it, expect } from 'vitest'
import { scoreCorrect, scoreWrong, nextCorrectPreview, streakBonusFor } from './scoring.ts'

describe('scoreCorrect', () => {
  it('first correct answer gives tile points only (no streak bonus)', () => {
    const result = scoreCorrect(100, 0)
    expect(result.points).toBe(100)
    expect(result.newStreak).toBe(1)
  })

  it('second consecutive correct adds +100 streak bonus', () => {
    const result = scoreCorrect(200, 1)
    expect(result.points).toBe(300) // 200 tile + 100 bonus
    expect(result.newStreak).toBe(2)
  })

  it('third consecutive correct adds +200 streak bonus', () => {
    const result = scoreCorrect(300, 2)
    expect(result.points).toBe(500) // 300 tile + 200 bonus
    expect(result.newStreak).toBe(3)
  })

  it('fifth consecutive correct adds +400 streak bonus', () => {
    const result = scoreCorrect(100, 4)
    expect(result.points).toBe(500) // 100 tile + 400 bonus
    expect(result.newStreak).toBe(5)
  })

  it('respects x2 tile points', () => {
    // A 200-pt tile with x2 is passed in as 400
    const result = scoreCorrect(400, 2)
    expect(result.points).toBe(600) // 400 tile + 200 bonus
    expect(result.newStreak).toBe(3)
  })

  it('accumulates correctly over a full streak sequence', () => {
    let streak = 0
    let total = 0
    const tiles = [100, 200, 300, 400, 500]

    for (const tile of tiles) {
      const result = scoreCorrect(tile, streak)
      total += result.points
      streak = result.newStreak
    }

    // 100+0, 200+100, 300+200, 400+300, 500+400
    // = 100 + 300 + 500 + 700 + 900 = 2500
    expect(total).toBe(2500)
    expect(streak).toBe(5)
  })
})

describe('scoreWrong', () => {
  it('returns zero points and resets streak', () => {
    const result = scoreWrong()
    expect(result.points).toBe(0)
    expect(result.newStreak).toBe(0)
  })
})

describe('nextCorrectPreview', () => {
  it('previews first answer points correctly', () => {
    expect(nextCorrectPreview(100, 0)).toBe(100)
  })

  it('previews with existing streak', () => {
    expect(nextCorrectPreview(300, 3)).toBe(600) // 300 + 300
  })

  it('previews x2 tile with streak', () => {
    expect(nextCorrectPreview(400, 1)).toBe(500) // 400 + 100
  })
})

describe('streakBonusFor', () => {
  it('streak 1 has no bonus', () => {
    expect(streakBonusFor(1)).toBe(0)
  })

  it('streak 2 has +100 bonus', () => {
    expect(streakBonusFor(2)).toBe(100)
  })

  it('streak 5 has +400 bonus', () => {
    expect(streakBonusFor(5)).toBe(400)
  })
})
