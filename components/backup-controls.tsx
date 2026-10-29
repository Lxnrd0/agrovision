"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { FieldRecord } from "@/lib/types";
import { readImage } from "@/lib/storage";
import { isObject, isRecord } from "@/lib/backup";
import { restoreRecords } from "@/lib/storage";
import { isCloudPhotoUrl } from "@/lib/cloud";

type Props = {
  records: FieldRecord[];
  onRestored: (records: FieldRecord[]) => void;
  restoreRecords?: (records: FieldRecord[]) => Promise<{ records: FieldRecord[]; added: number }>;
  notify: (message: string, error?: boolean) => void;
};

export default function BackupControls({
  records,
  onRestored,
  notify,
  restoreRecords: restore = restoreRecords,
}: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function saveBackup() {
    if (busy) return;

    setBusy(true);

    try {
      if (!records.length) {
        throw new Error("No hay observaciones para guardar.");
      }

      const copies: FieldRecord[] = [];

      for (const record of records) {
        let image = record.image;

        if (image && !image.startsWith("data:")) {
          const url = new URL(image, window.location.origin);

          if (url.origin !== window.location.origin && !isCloudPhotoUrl(url.href)) {
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
        `Copia descargada: ${copies.length} observaciones y sus fotografías.`,
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo crear la copia de seguridad.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreFile(file: File) {
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
          "Selecciona una copia JSON válida de AgroVisión (versión 1).",
        );
      }

      const incoming: FieldRecord[] = [];
      const ids = new Set<string>();

      for (const item of backup.records) {
        if (!isRecord(item)) {
          throw new Error(
            "El archivo contiene un registro inválido. No se importaron datos.",
          );
        }

        if (ids.has(item.id)) {
          throw new Error(
            "El archivo contiene identificadores repetidos.",
          );
        }

        ids.add(item.id);
        incoming.push(item);
      }

      const { records: next, added } =
        await restore(incoming);

      onRestored(next);

      notify(
        `${added} observaciones restauradas. ${
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
        Copia de seguridad
      </h2>

      <p className="detail-copy">
        Guarda tus observaciones, fotografías y análisis de IA
        en un archivo JSON. Al restaurarlo, solo se agregan los
        registros que faltan; los existentes no se modifican.
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
          {busy ? "Procesando…" : "Descargar copia"}
        </button>

        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <Upload size={17} />
          Restaurar copia
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

          if (file) void restoreFile(file);
        }}
      />
    </section>
  );
}
