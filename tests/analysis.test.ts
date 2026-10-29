
import test from "node:test";
import assert from "node:assert/strict";

import { analyze, status } from "../lib/analysis-server";
import { demoDiagnosis } from "../lib/demo";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const request = (
  body: unknown,
  extra: Record<string, string> = {},
) =>
  new Request("https://agro.test/api/analyze-crop", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });

const image =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2Q==";

test("status exposes configuration without revealing secrets", async () => {
  const result = await status({
    OPENAI_API_KEY: "secret",
    ANALYSIS_ACCESS_TOKEN: "private",
  }).json();

  assert.equal(result.configured, true);
  assert.equal(result.requiresToken, true);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("unconfigured engine fails instead of returning demo data", async () => {
  const response = await analyze(request({ image }), {});

  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
});

test("rejects cross-origin requests and invalid access tokens", async () => {
  const crossOrigin = await analyze(
    request(
      { image },
      { origin: "https://other.test" },
    ),
    { OPENAI_API_KEY: "test" },
  );

  assert.equal(crossOrigin.status, 403);

  const unauthorized = await analyze(
    request({ image }),
    {
      OPENAI_API_KEY: "test",
      ANALYSIS_ACCESS_TOKEN: "required",
    },
  );

  assert.equal(unauthorized.status, 401);
});

test("rejects invalid image signatures before calling the provider", async () => {
  const response = await analyze(
    request({
      image: "data:image/jpeg;base64,aGVsbG8=",
    }),
    { OPENAI_API_KEY: "test" },
  );

  assert.equal(response.status, 400);
});

test("OpenAI result preserves observations and removes unscaled diameter", async () => {
  const original = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (_url, options) => {
    called = true;

    const body = JSON.parse(String(options?.body));

    assert.equal(body.model, "gpt-4o");
    assert.equal(
      body.response_format.json_schema.strict,
      true,
    );

    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify(demoDiagnosis),
          },
        },
      ],
    });
  };

  try {
    const response = await analyze(
      request({ image, crop: "Rábano" }),
      { OPENAI_API_KEY: "test" },
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.source, "openai");
    assert.equal(body.model, "gpt-4o");
    assert.equal(body.diagnosis.diameterCm, null);

    assert.deepEqual(
      body.diagnosis.observations,
      demoDiagnosis.observations,
    );

    assert.equal(called, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("malformed provider output is not published as a diagnosis", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: '{"confidence":900}',
          },
        },
      ],
    });

  try {
    const response = await analyze(
      request({ image }),
      { OPENAI_API_KEY: "test" },
    );

    assert.equal(response.status, 502);
  } finally {
    globalThis.fetch = original;
  }
});

test("provider quota failure returns a useful error", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response("", { status: 429 });

  try {
    const response = await analyze(
      request({ image }),
      { OPENAI_API_KEY: "test" },
    );

    assert.equal(response.status, 429);
  } finally {
    globalThis.fetch = original;
  }
});

test("uploaded photographs reach the OpenAI provider", async () => {
  const original = globalThis.fetch;

  const images = [
    image,
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  ];

  const observations = [
    "Hojas con perforaciones visibles.",
    "Hojas de color verde uniforme.",
  ];

  let index = 0;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));

    assert.equal(
      body.messages[1].content[1].image_url.url,
      images[index],
    );

    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              ...demoDiagnosis,
              observations: [observations[index]],
            }),
          },
        },
      ],
    });
  };

  try {
    for (index = 0; index < images.length; index++) {
      const response = await analyze(
        request(
          { image: images[index] },
          {
            origin: "https://agro.test",
            "cf-connecting-ip": `photo-${index}`,
          },
        ),
        { OPENAI_API_KEY: "test" },
      );

      assert.equal(response.status, 200);

      const result = await response.json();

      assert.equal(result.source, "openai");
      assert.deepEqual(
        result.diagnosis.observations,
        [observations[index]],
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("quota, rate limits and invalid credentials remain distinguishable", async () => {
  const original = globalThis.fetch;

  try {
    const cases = [
      [429, "insufficient_quota", "QUOTA_EXCEEDED"],
      [429, "rate_limit_exceeded", "QUOTA_OR_RATE_LIMIT"],
      [401, "invalid_api_key", "INVALID_API_KEY"],
      [404, "model_not_found", "MODEL_ACCESS_DENIED"],
    ] as const;

    for (const [statusCode, providerCode, expected] of cases) {
      globalThis.fetch = async () =>
        Response.json(
          { error: { code: providerCode } },
          { status: statusCode },
        );

      const response = await analyze(
        request(
          { image },
          { "cf-connecting-ip": expected },
        ),
        { OPENAI_API_KEY: "test" },
      );

      const result = await response.json();

      assert.equal(result.code, expected);
      assert.equal(result.diagnosis, undefined);
      assert.ok(result.error.length > 10);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("Gemini receives the image and returns a validated diagnosis", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    assert.match(
      String(url),
      /gemini-3\.8-flash:generateContent/,
    );

    const headers = new Headers(options?.headers);

    assert.equal(
      headers.get("x-goog-api-key"),
      "gemini-test",
    );

    const body = JSON.parse(
      String(options?.body),
    );

    assert.match(
      body.contents[0].parts[0].text,
      /Devuelve exclusivamente JSON válido/,
    );

    // El SDK puede serializar el nombre de esta propiedad
    // en camelCase o snake_case según la capa utilizada.
    const imagePart = body.contents[0].parts[1];

    const imageData =
      imagePart.inlineData?.data ??
      imagePart.inline_data?.data;

    assert.equal(imageData, image.split(",")[1]);

    const generationConfig =
      body.generationConfig ??
      body.generation_config ??
      body.config;

    assert.equal(
      generationConfig.responseMimeType ??
        generationConfig.response_mime_type,
      "application/json",
    );

    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...demoDiagnosis,
                  observations: [
                    "Imagen observada por Gemini.",
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  };

  try {
    const response = await analyze(
      request({ image }),
      { GEMINI_API_KEY: "gemini-test" },
    );

    assert.equal(response.status, 200);

    const result = await response.json();

    assert.equal(result.source, "gemini");
    assert.equal(result.model, DEFAULT_GEMINI_MODEL);

    assert.deepEqual(
      result.diagnosis.observations,
      ["Imagen observada por Gemini."],
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Gemini is preferred when both API keys exist", async () => {
  const result = await status({
    GEMINI_API_KEY: "gemini-secret",
    OPENAI_API_KEY: "openai-secret",
  }).json();

  assert.equal(result.provider, "Gemini");
  assert.equal(result.model, DEFAULT_GEMINI_MODEL);

  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("an explicit Gemini model overrides the default", async () => {
  const result = await status({
    GEMINI_API_KEY: "gemini-secret",
    GEMINI_MODEL: "gemini-3.8-flash",
  }).json();

  assert.equal(result.model, "gemini-3.8-flash");
});

test("rejects unsupported method, content type and oversized bodies", async () => {
  const env = { OPENAI_API_KEY: "test" };
  assert.equal((await analyze(new Request("https://agro.test/api/analyze-crop"), env)).status, 405);
  assert.equal((await analyze(new Request("https://agro.test/api/analyze-crop", { method: "POST", body: "{}" }), env)).status, 415);
  assert.equal((await analyze(request({ image: "x".repeat(7_100_001) }), env)).status, 400);
});

test("provider timeout is explicit and never returns a demo diagnosis", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
  try {
    const response = await analyze(request({ image }, { "x-client-id": "timeout-test" }), { OPENAI_API_KEY: "test" });
    assert.equal(response.status, 504);
    const body = await response.json();
    assert.equal(body.code, "ANALYSIS_TIMEOUT");
    assert.equal(body.diagnosis, undefined);
  } finally { globalThis.fetch = original; }
});

test("rate limiter rejects the eleventh request and advertises retry time", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: "busy" } }, { status: 503 });
  try {
    for (let i = 0; i < 10; i++) {
      const result = await analyze(request({ image }, { "x-client-id": "rate-test" }), { OPENAI_API_KEY: "test" });
      assert.equal(result.status, 503);
    }
    const response = await analyze(request({ image }, { "x-client-id": "rate-test" }), { OPENAI_API_KEY: "test" });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("Retry-After")) > 0);
  } finally { globalThis.fetch = original; }
});

test("rejects image payloads above the Vercel-safe image limit before contacting AI", async () => {
  const original = globalThis.fetch;
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; throw new Error("must not call provider"); };
  try {
    const response = await analyze(request({ image: "data:image/jpeg;base64,/9j/" + "A".repeat(4_000_000) }), { OPENAI_API_KEY: "test" });
    assert.equal(response.status, 400);
    assert.equal(contacted, false);
  } finally { globalThis.fetch = original; }
});
