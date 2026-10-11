"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { FieldRecord } from "@/lib/types";
import { readImage } from "@/lib/storage";
import {
  daysBetween,
  eligible,
  validateRecord,
} from "@/lib/tracking";

type Props = {
  records: FieldRecord[];
  onRestored: (records: FieldRecord[]) => void;
  notify: (message: string, error?: boolean) => void;
};

function isObject(
  input: unknown,
): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input)
  );
}

function isRecord(input: unknown): input is FieldRecord {
  if (!isObject(input)) return false;

  const strings = [
    "id",
    "date",
    "collaborator",
    "zone",
    "fertilizer",
    "crop",
    "bulbColor",
    "leafColor",
    "image",
    "createdAt",
  ];

  if (strings.some((key) => typeof input[key] !== "string")) {
    return false;
  }

  if (!(input.id as string).trim()) return false;

  if (
    !Number.isFinite(
      daysBetween(input.date as string, input.date as string),
    )
  ) {
    return false;
  }

  if (!Number.isFinite(Date.parse(input.createdAt as string))) {
    return false;
  }

  if (
    !["Sano", "Enfermo", "Indeterminado"].includes(
      String(input.health),
    )
  ) {
    return false;
  }

  if (
    !["manual", "gemini", "openai", "demo"].includes(
      String(input.source),
    )
  ) {
    return false;
  }

  if (
    typeof input.confidence !== "number" ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 100
  ) {
    return false;
  }

  for (const key of [
    "observations",
    "recommendations",
    "limitations",
  ]) {
    const list = input[key];

    if (
      !Array.isArray(list) ||
      list.some((item) => typeof item !== "string")
    ) {
      return false;
    }
  }

  for (const key of ["plantId", "sowingDate", "dose"]) {
    if (
      input[key] !== undefined &&
      typeof input[key] !== "string"
    ) {
      return false;
    }
  }

  for (const key of [
    "heightCm",
    "leafCount",
    "diameterCm",
    "estimatedDiameterCm",
    "estimatedLeafCount",
  ]) {
    const measure = input[key];

    if (measure == null) continue;

    if (
      typeof measure !== "number" ||
      !Number.isFinite(measure) ||
      measure < 0
    ) {
      return false;
    }

    if (
      (key === "leafCount" || key === "estimatedLeafCount") &&
      !Number.isInteger(measure)
    ) {
      return false;
    }
  }

  if (input.measurementSources !== undefined) {
    if (!isObject(input.measurementSources)) return false;

    for (const [key, source] of Object.entries(
      input.measurementSources,
    )) {
      if (
        !["heightCm", "leafCount", "diameterCm"].includes(key) ||
        !["manual", "ia", "unknown"].includes(String(source))
      ) {
        return false;
      }
    }
  }

  if (
    input.aiObservations !== undefined &&
    (
      !Array.isArray(input.aiObservations) ||
      input.aiObservations.some(
        (item) => typeof item !== "string",
      )
    )
  ) {
    return false;
  }

  const photo = input.image as string;

  if (
    photo &&
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(
      photo,
    )
  ) {
    return false;
  }

  return true;
}

async function restoreIntoStorage(incoming: FieldRecord[]) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("agrovision", 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("data")) {
        request.result.createObjectStore("data");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return new Promise<{
    records: FieldRecord[];
    added: number;
  }>((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");
    const store = transaction.objectStore("data");
    const request = store.get("records");

    let next: FieldRecord[] = [];
    let added = 0;
    let failure: unknown;

    request.onsuccess = () => {
      try {
        const current = request.result ?? [];

        if (!Array.isArray(current)) {
          throw new Error("No se pudo leer la bitácora actual.");
        }

        next = [...current];

        const existingIds = new Set(
          next.map((record) => record.id),
        );

        for (const record of incoming) {
          if (existingIds.has(record.id)) continue;

          if (eligible(record)) {
            validateRecord(record, next);
          }

          next.push(record);
          existingIds.add(record.id);
          added++;
        }

        next.sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.createdAt.localeCompare(a.createdAt),
        );

        store.put(next, "records");
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };

    transaction.oncomplete = () => {
      db.close();
      resolve({ records: next, added });
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        failure ??
          transaction.error ??
          new Error("No se pudo restaurar el respaldo."),
      );
    };
  });
}

export default function BackupControls({
  records,
  onRestored,
  notify,
}: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function saveBackup() {
    if (busy) return;

    setBusy(true);

    try {
      if (!records.length) {
        throw new Error("No hay observaciones para respaldar.");
      }

      const copies: FieldRecord[] = [];

      for (const record of records) {
        let image = record.image;

        if (image && !image.startsWith("data:")) {
          const url = new URL(image, window.location.origin);

          if (url.origin !== window.location.origin) {
            throw new Error(
              "Una fotografía externa debe adjuntarse de nuevo antes del respaldo.",
            );
          }

          const response = await fetch(url.href);

          if (!response.ok) {
            throw new Error(
              "No se pudo incluir una fotografía. El respaldo no se generó.",
            );
          }

          const blob = await response.blob();

          image = await readImage(
            new File([blob], "fotografia.jpg", {
              type: blob.type,
            }),
          );
        }

        copies.push({ ...record, image });
      }

      if (!copies.every(isRecord)) {
        throw new Error(
          "Hay registros con datos inválidos. Revísalos antes de respaldar.",
        );
      }

      const backup = {
        app: "AgroVision",
        version: 1,
        exportedAt: new Date().toISOString(),
        records: copies,
      };

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" },
      );

      if (blob.size > 100 * 1024 * 1024) {
        throw new Error(
          "El respaldo supera el límite de 100 MB.",
        );
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        `AgroVision_respaldo_${new Date()
          .toISOString()
          .slice(0, 10)}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      notify(
        `Respaldo generado: ${copies.length} observaciones con sus fotografías adjuntas.`,
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo generar el respaldo.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    if (busy) return;

    setBusy(true);

    try {
      if (file.size > 100 * 1024 * 1024) {
        throw new Error(
          "El respaldo supera el límite de 100 MB.",
        );
      }

      const backup: unknown = JSON.parse(await file.text());

      if (
        !isObject(backup) ||
        backup.app !== "AgroVision" ||
        backup.version !== 1 ||
        !Array.isArray(backup.records)
      ) {
        throw new Error(
          "Selecciona un respaldo JSON de AgroVision versión 1.",
        );
      }

      const incoming: FieldRecord[] = [];
      const ids = new Set<string>();

      for (const item of backup.records) {
        if (!isRecord(item)) {
          throw new Error(
            "El respaldo contiene un registro inválido. No se importó ningún dato.",
          );
        }

        if (ids.has(item.id)) {
          throw new Error(
            "El respaldo contiene identificadores de registro repetidos.",
          );
        }

        ids.add(item.id);
        incoming.push(item);
      }

      const { records: next, added } =
        await restoreIntoStorage(incoming);

      onRestored(next);

      notify(
        `${added} observaciones añadidas. ${
          incoming.length - added
        } ya existían y se conservaron sin cambios.`,
      );
    } catch (error) {
      notify(
        error instanceof SyntaxError
          ? "El archivo no contiene un JSON válido."
          : error instanceof Error
            ? error.message
            : "No se pudo restaurar el respaldo.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel"
      style={{ padding: 16, marginBottom: 22 }}
    >
      <h2 style={{ fontSize: 17 }}>
        Respaldo de mi seguimiento
      </h2>

      <p className="detail-copy">
        Guarda una copia con tus observaciones, fotografías
        y análisis de IA. Al restaurar, se añaden registros
        que falten; los que ya existen conservan su versión actual.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <button
          type="button"
          className="button secondary"
          disabled={busy || !records.length}
          onClick={() => void saveBackup()}
        >
          <Download size={17} />
          {busy ? "Procesando…" : "Guardar respaldo"}
        </button>

        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <Upload size={17} />
          Restaurar respaldo
        </button>
      </div>

      <input
        ref={picker}
        type="file"
        accept=".json,application/json"
        hidden
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";

          if (file) void restore(file);
        }}
      />
    </section>
  );
}
