import type { FieldRecord } from "./types";
import { validateRecord } from "./tracking";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("agrovision", 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("data")) {
        db.createObjectStore("data");
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error ||
          new Error("No se pudo abrir la bitácora."),
      );
    };
  });
}

export async function readRecords(): Promise<
  FieldRecord[] | undefined
> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("data", "readonly");
    const request = transaction.objectStore("data").get("records");

    let records: FieldRecord[] | undefined;

    request.onsuccess = () => {
      records = request.result;
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(records);
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ||
          new Error("No se pudieron leer los registros."),
      );
    };
  });
}

export async function writeRecords(
  records: FieldRecord[],
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");

    transaction.objectStore("data").put(records, "records");

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ||
          new Error("No se pudieron guardar los registros."),
      );
    };
  });
}

// Lee y actualiza dentro de una sola transacción.
// Esto evita perder cambios entre pestañas del navegador.
export async function mutateRecords(
  update: (records: FieldRecord[]) => FieldRecord[],
): Promise<FieldRecord[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");
    const store = transaction.objectStore("data");
    const request = store.get("records");

    let next: FieldRecord[] = [];
    let updateError: unknown;

    request.onsuccess = () => {
      try {
        const previous: FieldRecord[] = request.result || [];
        next = update(previous);

        const previousIds = new Set(
          previous.map((record) => record.id),
        );

        // Valida los registros nuevos contra los datos
        // actuales, incluyendo cambios de otras pestañas.
        for (const record of next) {
          if (!previousIds.has(record.id)) {
            validateRecord(record, next);
          }
        }

        store.put(next, "records");
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(next);
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();

      reject(
        updateError ||
          transaction.error ||
          new Error("No se pudo actualizar la bitácora."),
      );
    };
  });
}

export async function readImage(file: File): Promise<string> {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Selecciona una imagen JPG, PNG o WEBP.");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no debe superar los 8 MB.");
  }

  const bitmap = await createImageBitmap(file);

  try {
    const ratio = Math.min(
      1,
      1600 / Math.max(bitmap.width, bitmap.height),
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(bitmap.width * ratio),
    );

    canvas.height = Math.max(
      1,
      Math.round(bitmap.height * ratio),
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se pudo preparar la fotografía.");
    }

    context.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    bitmap.close();
  }
}
