const errorPage = /^\/(en\/)?404(?:\.html|\/(?:index(?:\.html)?)?)?$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const match = errorPage.exec(url.pathname)
    if (!match || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return env.ASSETS.fetch(request)
    }

    // Fetch the canonical asset directly: forwarding the alias could return a
    // redirect or a conditional 304 instead of the complete error document.
    url.pathname = match[1] ? '/en/404/' : '/404'
    url.search = ''
    const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
    if (response.status !== 200) {
      return response
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: 404,
      statusText: 'Not Found',
      headers: response.headers,
    })
  },
} satisfies ExportedHandler<Env>
