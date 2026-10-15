import { describe, expect, it } from 'vitest'
import { clipLine, graphemes, padLine } from '../src/terminal/session.js'

describe('terminal display width', () => {
  it.each(['👨‍👩‍👧‍👦', '👍🏽', '🇨🇳', '1️⃣'])('keeps the complete %s grapheme within two display cells', (emoji) => {
    expect(clipLine(`${emoji}weapp`, 1)).toBe('')
    expect(clipLine(`${emoji}weapp`, 3)).toBe(`${emoji}w`)
    expect(padLine(emoji, 4)).toBe(`${emoji}  `)
  })

  it('keeps Chinese, combining accents and ANSI styling within the same cell budget', () => {
    expect(graphemes('中é👨‍👩‍👧‍👦')).toEqual(['中', 'é', '👨‍👩‍👧‍👦'])
    expect(clipLine('中é👨‍👩‍👧‍👦文', 5)).toBe('中é👨‍👩‍👧‍👦')
    expect(clipLine('\u001B[32m中文👨‍👩‍👧‍👦app\u001B[0m', 6)).toBe('\u001B[32m中文👨‍👩‍👧‍👦\u001B[0m')
    expect(padLine('中文👨‍👩‍👧‍👦', 8)).toBe('中文👨‍👩‍👧‍👦  ')
  })
})
