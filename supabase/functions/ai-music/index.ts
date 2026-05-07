// KLabMusic — AI proxy
// Forwards chat completion requests to Groq (free tier, global, no credit card)
// and streams the response back as a simple Server-Sent Event format:
//   data: {"text": "hello"}
//   data: {"text": " world"}
//   data: {"done": true}
//
// Deploy via the Supabase web dashboard:
//   Edge Functions → Deploy new function → name: ai-music → paste this file
// Then add the secret:
//   Project Settings → Edge Functions → Secrets → GROQ_API_KEY = gsk_...
//
// Get a free Groq key at https://console.groq.com/keys

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  messages: ChatMessage[]
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

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return jsonResponse(
      { error: 'GROQ_API_KEY not set on this Edge Function. Add it in Project Settings → Edge Functions → Secrets.' },
      500,
    )
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

  const requestBody = {
    model: body.model ?? 'llama-3.3-70b-versatile',
    stream: true,
    max_tokens: body.max_tokens ?? 1024,
    temperature: 0.7,
    messages: body.system
      ? [{ role: 'system', content: body.system }, ...body.messages]
      : body.messages,
  }

  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'Groq API error')
    return jsonResponse({ error: `Groq API ${upstream.status}: ${errText}` }, upstream.status)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ''
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data) continue
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode(sseEvent({ done: true })))
              return
            }
            try {
              const event = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[]
              }
              const text = event.choices?.[0]?.delta?.content
              if (text) controller.enqueue(encoder.encode(sseEvent({ text })))
            } catch {
              /* skip malformed line */
            }
          }
        }
        controller.enqueue(encoder.encode(sseEvent({ done: true })))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream error'
        controller.enqueue(encoder.encode(sseEvent({ error: msg })))
      } finally {
        controller.close()
        reader.releaseLock()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  })
})
