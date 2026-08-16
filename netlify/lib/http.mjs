export function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function errorResponse(error) {
  const status = Number(error?.statusCode || error?.status || 500);
  return json({ ok: false, message: error?.message || String(error) }, status);
}

export async function parseJsonRequest(request, maxChars = 100_000) {
  const text = await request.text();
  if (text.length > maxChars) {
    const error = new Error("請求內容過大。");
    error.statusCode = 413;
    throw error;
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    const error = new Error("請求不是有效 JSON。");
    error.statusCode = 400;
    throw error;
  }
}
