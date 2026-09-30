/** Keep the visible source selected for manual copying if clipboard access fails. */
export async function copyCode(code: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code.textContent ?? '')
    return true
  }
  catch {
    const target = code.closest('pre') ?? code
    target.tabIndex = 0
    target.focus({ preventScroll: true })
    const range = document.createRange()
    range.selectNodeContents(code)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return false
  }
}
