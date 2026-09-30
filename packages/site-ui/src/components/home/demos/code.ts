export interface CodePart {
  text: string
  tone?: 'keyword' | 'string' | 'comment'
}

export function codeText(parts: CodePart[]) {
  return parts.map(part => part.text).join('')
}

export function updateCode(root: HTMLElement, parts: CodePart[]) {
  const code = root.querySelector('code')!
  code.replaceChildren(...parts.map((part) => {
    const span = document.createElement('span')
    span.textContent = part.text
    if (part.tone) {
      span.className = `demo-syntax-${part.tone}`
    }
    return span
  }))
  root.querySelector('[role="status"]')!.textContent = ''
}
