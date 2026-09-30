export const shell = 'mx-auto w-[calc(100%-3rem)] max-w-[1240px] max-[720px]:w-[calc(100%-2rem)]'

export const wordmark = 'inline-flex items-center gap-2.5 whitespace-nowrap font-display text-[0.9375rem] font-[720]'

export const wordmarkMark = 'size-8 shrink-0'

export const eyebrow = 'mb-3 font-mono text-xs font-[650] text-brand'

export const buttonBase = 'inline-flex min-h-11 items-center justify-center gap-2.5 whitespace-normal text-center [&>svg]:shrink-0 rounded-[6px] border border-transparent px-4 py-2.5 text-sm font-[680] leading-[1.2] transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px'

export const buttonPrimary = `${buttonBase} bg-brand text-brand-contrast hover:bg-brand-hover`

export const buttonSecondary = `${buttonBase} border-line bg-panel text-ink hover:border-copy-muted hover:bg-panel-soft`

export const iconControl = 'inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-[6px] border border-transparent bg-transparent text-copy-muted transition-[background-color,color,transform] duration-200 hover:bg-panel-soft hover:text-ink active:translate-y-px'

export const section = 'py-20 max-[720px]:py-14'

/** Tighter vertical rhythm for the homepage proof arc only. */
export const homeSection = 'py-14 max-[720px]:py-10'

export const homeSectionStart = 'pt-14 pb-8 max-[720px]:pt-10 max-[720px]:pb-6'

export const homeSectionMiddle = 'py-8 max-[720px]:py-6'

export const homeSectionEnd = 'pt-8 pb-14 max-[720px]:pt-6 max-[720px]:pb-10'

export const homeSectionPack = {
  start: homeSectionStart,
  middle: homeSectionMiddle,
  end: homeSectionEnd,
} as const

export const sectionHeading = 'mb-12 max-w-[720px] max-[720px]:mb-9'

export const compactSectionHeading = 'mb-10 max-w-[620px] max-[720px]:mb-8'

export const sectionTitle = 'mb-4 font-display text-[2.75rem] font-[680] max-[720px]:text-[2.125rem]'

export const sectionDescription = 'mb-0 max-w-[620px] text-lg text-copy-muted max-[720px]:text-base'

export const featuredTitle = 'font-display text-[2.125rem] font-[680] max-[720px]:text-[1.5rem]'

/** Page-level display titles for pricing / policy / 404 heroes. */
export const pageTitle = 'font-display text-[clamp(2.125rem,6vw,4rem)] font-[700] leading-[1.12]'

export const projectTone = 'text-[color-mix(in_srgb,var(--project-accent)_58%,var(--text))]'

export const platformPill = 'rounded-[6px] border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-copy-muted'
