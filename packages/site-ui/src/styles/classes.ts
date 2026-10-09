export const shell = 'mx-auto w-[calc(100%-3rem)] max-w-[1240px] max-[720px]:w-[calc(100%-2rem)]'

export const wordmark = 'inline-flex items-center gap-2.5 whitespace-nowrap font-display text-[0.9375rem] font-[720]'

export const wordmarkMark = 'size-8 shrink-0'

export const eyebrow = 'mb-4 font-sans text-sm font-[600] text-copy-muted'

export const buttonBase = 'inline-flex min-h-11 items-center justify-center gap-2.5 whitespace-normal text-center [&>svg]:shrink-0 rounded-full border border-transparent px-6 py-3 text-sm font-[600] leading-[1.2] transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px'

export const buttonPrimary = `${buttonBase} bg-brand text-brand-contrast hover:bg-brand-hover`

export const buttonSecondary = `${buttonBase} border-transparent bg-panel-soft text-ink hover:bg-panel-strong`

export const iconControl = 'inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-transparent bg-transparent text-copy-muted transition-[background-color,color,transform] duration-200 hover:bg-panel-soft hover:text-ink active:translate-y-px'

export const section = 'py-28 max-[720px]:py-16'

/** Spacious chapters with a separate rhythm for grouped project evidence. */
export const homeSection = 'py-24 max-[720px]:py-16'

export const homeSectionStart = 'pt-28 pb-16 max-[720px]:pt-16 max-[720px]:pb-10'

export const homeSectionMiddle = 'py-20 max-[720px]:py-14'

export const homeSectionEnd = 'pt-20 pb-28 max-[720px]:pt-14 max-[720px]:pb-16'

export const homeSectionPack = {
  start: homeSectionStart,
  middle: homeSectionMiddle,
  end: homeSectionEnd,
} as const

export const sectionHeading = 'mb-16 max-w-[900px] max-[720px]:mb-9'

export const compactSectionHeading = 'mb-14 max-w-[800px] max-[720px]:mb-8'

export const sectionTitle = 'mb-4 font-display text-[clamp(2.25rem,4.5vw,4rem)] font-[650] leading-[1.08]'

export const sectionDescription = 'mb-0 max-w-[680px] text-xl text-copy-muted max-[720px]:text-base'

export const featuredTitle = 'font-display text-[clamp(1.875rem,3.5vw,3.25rem)] font-[650]'

/** Page-level display titles for pricing / policy / 404 heroes. */
export const pageTitle = 'font-display text-[clamp(2.5rem,6vw,5rem)] font-[700] leading-[1.12]'

/** Status text needs theme contrast independent of each project's brand color. */
export const projectTone = 'text-brand'

export const platformPill = 'rounded-full border border-line bg-panel px-2.5 py-1.5 font-sans text-xs text-copy-muted'
