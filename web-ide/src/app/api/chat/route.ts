import { NextRequest } from 'next/server';

const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz/v1/chat/completions';
const HYPERBOLIC_API_KEY = process.env.HYPERBOLIC_API_KEY!;

// Primary model + fallbacks (in order of preference)
const MODELS = [
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',  // Best coding model
  'meta-llama/Llama-3.3-70B-Instruct',      // Reliable fallback
  'meta-llama/Meta-Llama-3.1-70B-Instruct', // Second fallback
];

async function callHyperbolic(model: string, body: any): Promise<Response> {
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

    // Build model list: requested model first, then fallbacks (deduplicated)
    const modelsToTry = [requestedModel, ...MODELS.filter(m => m !== requestedModel)];

    let response: Response | null = null;
    let lastError = '';

    for (const model of modelsToTry) {
      try {
        response = await callHyperbolic(model, body);

        if (response.ok) {
          // Success — stream the response back
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
              'X-Model-Used': model,
            },
          });
        }

        // Model failed — save error and try next
        lastError = await response.text().catch(() => `HTTP ${response!.status}`);
        console.error(`Model ${model} failed: ${lastError}`);
      } catch (err: any) {
        lastError = err.message;
        console.error(`Model ${model} error: ${lastError}`);
      }
    }

    // All models failed
    return new Response(JSON.stringify({
      error: 'All AI models unavailable',
      detail: lastError,
      modelsTried: modelsToTry,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
