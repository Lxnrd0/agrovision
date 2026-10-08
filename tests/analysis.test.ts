import test from "node:test";
import assert from "node:assert/strict";
import { analyze, status } from "../lib/analysis-server";
import { demoDiagnosis } from "../lib/demo";
const request = (body: unknown, extra: Record<string, string> = {}) =>
  new Request("https://agro.test/api/analyze-crop", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
const image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2Q==";
test("status exposes configuration, never a secret", async () => {
  const result = await status({
    OPENAI_API_KEY: "secret",
    ANALYSIS_ACCESS_TOKEN: "private",
  }).json();
  assert.equal(result.configured, true);
  assert.equal(result.requiresToken, true);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("unconfigured engine fails explicitly instead of returning demo data", async () => {
  const response = await analyze(request({ image }), {});
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
});
test("cross-origin requests and invalid access tokens are rejected", async () => {
  assert.equal(
    (
      await analyze(request({ image }, { origin: "https://other.test" }), {
        OPENAI_API_KEY: "test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await analyze(request({ image }), {
        OPENAI_API_KEY: "test",
        ANALYSIS_ACCESS_TOKEN: "required",
      })
    ).status,
    401,
  );
});
test("invalid base64 image signature is rejected before provider call", async () => {
  const response = await analyze(
    request({ image: "data:image/jpeg;base64,aGVsbG8=" }),
    { OPENAI_API_KEY: "test" },
  );
  assert.equal(response.status, 400);
});
test("valid structured provider result preserves observations and removes unscaled diameter", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (_url, options) => {
    called = true;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "gpt-4o");
    assert.equal(body.response_format.json_schema.strict, true);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(demoDiagnosis) },
        },
      ],
    });
  };
  try {
    const response = await analyze(request({ image, crop: "Rábano" }), {
      OPENAI_API_KEY: "test",
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "openai");
    assert.equal(body.diagnosis.diameterCm, null);
    assert.deepEqual(body.diagnosis.observations, demoDiagnosis.observations);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = original;
  }
});
test("malformed provider output is not published as a diagnosis", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      choices: [{ message: { content: '{"confidence":900}' } }],
    });
  try {
    assert.equal(
      (await analyze(request({ image }), { OPENAI_API_KEY: "test" })).status,
      502,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("provider quota failure is mapped to a useful error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 429 });
  try {
    assert.equal(
      (await analyze(request({ image }), { OPENAI_API_KEY: "test" })).status,
      429,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("provider receives the uploaded photo and its result reaches the UI contract", async () => {
  const original = globalThis.fetch;
  const images = [image, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='];
  const observations = ['Hojas con perforaciones visibles.', 'Hojas de color verde uniforme.'];
  let index = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.messages[1].content[1].image_url.url, images[index]);
    return Response.json({ choices: [{ finish_reason: 'stop', message: {
      content: JSON.stringify({ ...demoDiagnosis, observations: [observations[index]] })
    } }] });
  };
  try {
    for (index = 0; index < images.length; index++) {
      const response = await analyze(request({ image: images[index] }, {origin:'https://agro.test', 'cf-connecting-ip': `photo-${index}`}), { OPENAI_API_KEY: 'test' });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.source, 'openai');
      assert.deepEqual(result.diagnosis.observations, [observations[index]]);
    }
  } finally { globalThis.fetch = original; }
});

test("quota, temporary rate limits and invalid credentials stay distinguishable", async () => {
  const original = globalThis.fetch;
  try {
    for (const [statusCode, providerCode, expected] of [
      [429, 'insufficient_quota', 'QUOTA_EXCEEDED'],
      [429, 'rate_limit_exceeded', 'QUOTA_OR_RATE_LIMIT'],
      [401, 'invalid_api_key', 'INVALID_API_KEY'],
      [404, 'model_not_found', 'MODEL_ACCESS_DENIED'],
    ] as const) {
      globalThis.fetch = async () => Response.json({error:{code:providerCode}}, {status:statusCode});
      const response = await analyze(request({image}, {'cf-connecting-ip':expected}), {OPENAI_API_KEY:'test'});
      const result = await response.json();
      assert.equal(result.code, expected);
      assert.equal(result.diagnosis, undefined);
      assert.ok(result.error.length > 10);
    }
  } finally { globalThis.fetch = original; }
});


test("Gemini receives the uploaded image and returns a validated real diagnosis", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /gemini-3\.1-flash-lite:generateContent/);
    assert.equal(new Headers(options?.headers).get("x-goog-api-key"), "gemini-test");
    const body = JSON.parse(String(options?.body));
    assert.match(body.contents[0].parts[0].text, /Devuelve exclusivamente un JSON válido/);
    assert.match(body.contents[0].parts[1].inline_data.data, /9j/);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ ...demoDiagnosis, observations: ["Imagen observada por Gemini."] }) }] } }] });
  };
  try {
    const response = await analyze(request({image}), {GEMINI_API_KEY:"gemini-test"});
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, "gemini");
    assert.equal(result.model, "gemini-3.1-flash-lite");
    assert.deepEqual(result.diagnosis.observations, ["Imagen observada por Gemini."]);
  } finally { globalThis.fetch = original; }
});

test("Gemini is preferred when both keys exist and status never reveals secrets", async () => {
  const result = await status({GEMINI_API_KEY:"gemini-secret",OPENAI_API_KEY:"openai-secret"}).json();
  assert.equal(result.provider,"Gemini");
  assert.equal(result.model,"gemini-3.1-flash-lite");
  assert.ok(!JSON.stringify(result).includes("secret"));
});
