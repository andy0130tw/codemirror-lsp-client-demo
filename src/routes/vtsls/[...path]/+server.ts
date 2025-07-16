import { type RequestHandler } from '@sveltejs/kit'

// meant to add COI headers because we do not have control on headers of static files
export const GET = (async ({ fetch, url, params }) => {
  const response = await fetch(new URL(`/__vtsls/${params.path}`, url.origin))
  if (response.status != 200) {
    return new Response('', { headers: response.headers, status: response.status })
  }

  // the server might return compressed body, but we receive it uncompressed
  // https://answers.netlify.com/t/how-to-pass-through-the-compressed-body-of-a-fetch-response-in-edge-function/128112
  const headers = Array.from(response.headers.entries())
    .filter(([name]) => !name.match(/content-(encoding|length)/i))
  return new Response(response.body, { headers });
}) satisfies RequestHandler
