export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export async function postChatCompletion(
  payload: ChatCompletionRequest,
  sessionId: string
): Promise<Response> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: payload.model || 'meta-llama/Llama-3.3-70B-Instruct',
      messages: payload.messages,
      stream: payload.stream !== undefined ? payload.stream : true,
      temperature: payload.temperature ?? 0.3,
      top_p: payload.top_p ?? 0.95,
      max_tokens: payload.max_tokens ?? 65536,
    }),
  });
  return response;
}

export async function postChatCompletionSync(
  payload: ChatCompletionRequest,
  sessionId: string
): Promise<any> {
  const response = await postChatCompletion({ ...payload, stream: false }, sessionId);
  return response.json();
}
