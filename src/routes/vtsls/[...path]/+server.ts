import { type RequestHandler } from '@sveltejs/kit'

export const GET = (async ({ fetch, url, params }) => {
  const response = await fetch(new URL(`/__vtsls/${params.path}`, url.origin))
  if (response.status != 200) {
    return new Response('', { headers: response.headers, status: response.status })
  }
  return new Response(response.body, {
    headers: response.headers,
  });
}) satisfies RequestHandler
