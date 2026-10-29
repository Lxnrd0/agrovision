import { MAX_IMAGE_DATA_URL_CHARS } from "./limits";
import type { FieldRecord } from "./types";
import { eligible, validateRecord } from "./tracking";

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
          if (!previousIds.has(record.id) && eligible(record)) {
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
    "image/heic",
    "image/heif",
  ];

  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferredType =
    file.type ||
    (extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : extension === "heic"
            ? "image/heic"
            : extension === "heif"
              ? "image/heif"
              : "");

  if (!allowedTypes.includes(inferredType)) {
    throw new Error("Selecciona una imagen JPG, PNG, WEBP o HEIC.");
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error("La imagen no debe superar los 12 MB.");
  }

  // Usamos HTMLImageElement en lugar de depender exclusivamente de
  // createImageBitmap: es más tolerante con navegadores móviles y con
  // fotografías provenientes directamente de la cámara.
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "El navegador no pudo leer la fotografía. Prueba con JPG o PNG.",
          ),
        );
      image.src = objectUrl;
    });

    const ratio = Math.min(
      1,
      1280 / Math.max(image.naturalWidth, image.naturalHeight),
    );

    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("No se pudo preparar la fotografía.");
    }

    context.drawImage(image, 0, 0, width, height);

    const toDataUrl = (quality: number) =>
      new Promise<string>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error("No se pudo comprimir la fotografía."),
              );
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") {
                reject(
                  new Error("No se pudo preparar la fotografía."),
                );
                return;
              }

              resolve(reader.result);
            };
            reader.onerror = () =>
              reject(
                new Error("No se pudo preparar la fotografía."),
              );
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality,
        );
      });

    let dataUrl = await toDataUrl(0.82);

    // El servidor limita el cuerpo de la petición. En teléfonos con
    // fotografías muy complejas reducimos la calidad antes de enviarla.
    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      dataUrl = await toDataUrl(0.68);
    }

    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      dataUrl = await toDataUrl(0.5);
    }

    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      throw new Error(
        "La fotografía sigue siendo demasiado pesada. Intenta otra imagen.",
      );
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


/** Atomic first-use initialization: a second tab cannot overwrite new observations. */
export function initialiseRecords(): Promise<FieldRecord[]> {
  return mutateRecords((current) => current.length ? current : []);
}

export function mergeRecords(current: FieldRecord[], incoming: FieldRecord[]) {
  const next = [...current];
  const ids = new Set(current.map((record) => record.id));
  let added = 0;
  for (const record of incoming) {
    if (ids.has(record.id)) continue;
    if (eligible(record)) validateRecord(record, next);
    next.push(record);
    ids.add(record.id);
    added++;
  }
  next.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { records: next, added };
}

export async function restoreRecords(incoming: FieldRecord[]) {
  let added = 0;
  const records = await mutateRecords((current) => {
    const merged = mergeRecords(current, incoming);
    added = merged.added;
    return merged.records;
  });
  return { records, added };
}
