import { NextRequest } from 'next/server';

const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz/v1/chat/completions';
const HYPERBOLIC_API_KEY = process.env.HYPERBOLIC_API_KEY!;
const MODELS = [
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'deepseek-ai/DeepSeek-V3-0324',
  'meta-llama/Llama-3.3-70B-Instruct',
];

async function tryModel(model: string, body: any): Promise<Response> {
  return fetch(HYPERBOLIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HYPERBOLIC_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      stream: body.stream !== undefined ? body.stream : true,
      temperature: body.temperature ?? 0.3,
      top_p: body.top_p ?? 0.95,
      max_tokens: body.max_tokens ?? 65536,
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedModel = body.model || MODELS[0];

    // Try models in order: requested → next in chain → last fallback
    let response = await tryModel(requestedModel, body);
    let usedModel = requestedModel;
    const startIdx = MODELS.indexOf(requestedModel) >= 0 ? MODELS.indexOf(requestedModel) : 0;
    
    for (let i = startIdx + 1; i < MODELS.length; i++) {
      if (response.ok) break;
      // Retry on 500, 502, 503, 504 (server errors)
      if ([500, 502, 503, 504].includes(response.status)) {
        response = await tryModel(MODELS[i], body);
        usedModel = MODELS[i];
      } else {
        break;
      }
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return new Response(JSON.stringify({ error: `Upstream API error ${response.status}`, detail: errText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the response back
    const reader = response.body?.getReader();
    if (!reader) {
      const data = await response.json();
      return Response.json(data);
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        await writer.close();
      }
    };

    pump();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Model-Used': usedModel,
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
