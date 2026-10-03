import { parse } from 'node-html-parser'
import { expect, test } from './test'

for (const prefix of ['', '/en']) {
  test(`booking product is complete in the static response: ${prefix || 'zh'}`, async ({ request }) => {
    const path = `${prefix}/products/weapp-booking/`
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    const page = parse(await response.text())
    expect(page.querySelectorAll('h1')).toHaveLength(1)
    expect(page.querySelector('h1')?.textContent).toBe('weapp-booking')
    expect(page.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://weapp.dev${path}`)
    expect(page.querySelector('main')?.textContent).toContain(prefix ? 'Not yet commercially released' : '尚未正式商业发布')
    expect(page.querySelector('main')?.textContent).toContain(prefix ? 'external integration acceptance pending' : '外部联调待验收')
    for (const id of ['scope', 'delivery', 'deployment', 'license', 'consultation']) {
      expect(page.querySelector(`#${id}`), id).not.toBeNull()
    }
    const contact = page.querySelector(`main a[href="${prefix}/pricing/#contact"]`)
    expect(contact?.textContent).toContain(prefix ? 'Arrange a demo' : '预约演示')
    const contactPage = parse(await (await request.get(`${prefix}/pricing/`)).text())
    expect(contactPage.querySelector('#contact a[href^="mailto:"]')).not.toBeNull()
    expect(page.querySelectorAll('main a[download]')).toHaveLength(0)
    expect(page.querySelectorAll('script[type="application/ld+json"]').map(node => node.textContent).join(' ')).not.toMatch(/"offers"|"price"|"aggregateRating"/)
    for (const entryPath of [`${prefix}/`, `${prefix}/pricing/`]) {
      const entry = parse(await (await request.get(entryPath)).text())
      expect(entry.querySelector(`[data-booking-entry] a[href="${path}"]`)).not.toBeNull()
    }
  })
}
