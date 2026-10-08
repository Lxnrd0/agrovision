import { FieldRecord } from "./types";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("agrovision", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readRecords(): Promise<FieldRecord[] | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readonly");
    const req = tx.objectStore("data").get("records");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeRecords(records: FieldRecord[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    tx.objectStore("data").put(records, "records");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function readImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Selecciona una imagen JPG, PNG o WEBP.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("La imagen no debe superar los 8 MB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * ratio;
  canvas.height = bitmap.height * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la fotografía.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
// Read-modify-write inside one transaction avoids lost updates between tabs.
export async function mutateRecords(
  update: (records: FieldRecord[]) => FieldRecord[],
): Promise<FieldRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    const store = tx.objectStore("data");
    const request = store.get("records");
    let next: FieldRecord[] = [];
    request.onsuccess = () => {
      next = update(request.result || []);
      store.put(next, "records");
    };
    tx.oncomplete = () => {
      db.close();
      resolve(next);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
