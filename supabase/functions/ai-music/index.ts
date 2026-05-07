// KLabMusic — AI proxy
// Forwards chat completion requests to the Anthropic API and streams the
// response back as Server-Sent Events. Keeps the API key server-side.
//
// Deploy:
//   npx supabase functions deploy ai-music
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The function runs on Deno. No npm install needed.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  messages: AnthropicMessage[]
  system?: string
  model?: string
  max_tokens?: number
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not set on this Edge Function' }, 500)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: 'messages[] is required' }, 400)
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: body.model ?? 'claude-sonnet-4-6',
      max_tokens: body.max_tokens ?? 1024,
      stream: true,
      system: body.system,
      messages: body.messages,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'Anthropic API error')
    return jsonResponse({ error: errText }, upstream.status)
  }

  return new Response(upstream.body, {
    headers: {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  })
})
