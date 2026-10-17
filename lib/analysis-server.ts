      const parsed = parseDiagnosisMessage(message);
      if (!parsed.diagnosis) {
        console.error("[AGROVISION] Respuesta del motor no válida", {
          provider,
          model,
          code: parsed.issue,
          detail: parsed.detail,
          responseLength: message.length,
        });
        return fail(
          provider === "gemini"
            ? "Gemini devolvió una respuesta con formato incorrecto. Vuelve a intentarlo."
            : "El motor de IA devolvió datos con formato incorrecto. Vuelve a intentarlo.",
          502,
          parsed.issue,
        );
      }
      diagnosis = parsed.diagnosis;
    }

    if (!input.scaleReference?.trim()) {
      diagnosis.diameterCm = null;
    }

    return Response.json(
      {
        diagnosis,
        source: provider,
        model,
        analyzedAt: new Date().toISOString(),
      },
      { headers },
    );
  } catch (error) {
    const providerName =
      provider === "gemini" ? "Gemini" : "OpenAI";

    const upstreamStatus =
      typeof error === "object" &&
      error !== null &&
      "status" in error
        ? Number(error.status)
        : null;

    const rawErrorMessage = error instanceof Error ? error.message : String(error);
    const redactedErrorMessage = [env.GEMINI_API_KEY, env.OPENAI_API_KEY]
      .filter((key): key is string => Boolean(key))
      .reduce((message, key) => message.split(key).join("[REDACTED]"), rawErrorMessage)
      .slice(0, 500);

    // Deliberately omit image data, prompt contents, and credentials from logs.
    console.error("[AGROVISION] Error al consultar el motor de IA", {
      provider,
      model,
      status: upstreamStatus,
      name: error instanceof Error ? error.name : typeof error,
      message: redactedErrorMessage,
    });

    if (upstreamStatus === 429) {
      return fail(
        "El motor alcanzó su cuota o límite temporal. Inténtalo más tarde.",
        429,
        "QUOTA_OR_RATE_LIMIT",
      );
    }

    if (
      upstreamStatus === 401 ||
      upstreamStatus === 403
    ) {
      return fail(
        "La clave del motor no es válida o no tiene permisos. Revisa su configuración en el servidor.",
        401,
        "INVALID_API_KEY",
      );
    }

    if (upstreamStatus === 404) {
      return fail(
        "El modelo configurado no está disponible para esta cuenta.",
        502,
        "MODEL_ACCESS_DENIED",
      );
    }

    if (
      error instanceof Error &&
      (
        error.name === "TimeoutError" ||
        error.name === "AbortError"
      )
    ) {
      return fail(
        "El análisis tardó demasiado. Inténtalo nuevamente.",
        504,
        "ANALYSIS_TIMEOUT",
      );
    }

    return fail(
      `No se recibió un resultado válido de ${providerName}. Revisa la configuración del motor o prueba otra fotografía.`,
      502,
    );
  }
}
