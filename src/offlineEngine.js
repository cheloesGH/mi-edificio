// ─── OFFLINE ENGINE — Mi Edificio ────────────────────────────────────────────
// Maneja: detección de conectividad, IndexedDB, cola de sync, anti-duplicados

import { supabase } from './supabaseClient';

const DB_NAME   = 'mi-edificio-offline';
const DB_VERSION = 1;

// ── Abrir / inicializar IndexedDB ─────────────────────────────────────────────
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // Cola de operaciones pendientes de sync
      if (!db.objectStoreNames.contains('pendientes')) {
        const store = db.createObjectStore('pendientes', { keyPath: 'localId' });
        store.createIndex('modulo', 'modulo', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // Caché de datos para lectura offline
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }

      // Imágenes en base64 (separadas para no inflar la cola)
      if (!db.objectStoreNames.contains('imagenes')) {
        db.createObjectStore('imagenes', { keyPath: 'localId' });
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Helpers genéricos IndexedDB ───────────────────────────────────────────────
export async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Detectar conectividad ─────────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine;
}

// ── Guardar datos en caché de lectura ─────────────────────────────────────────
export async function saveCache(key, data) {
  await idbPut('cache', { key, data, timestamp: Date.now() });
}

export async function loadCache(key) {
  const entry = await idbGet('cache', key);
  return entry ? entry : null;
}

// ── Comprimir imagen antes de guardar ────────────────────────────────────────
export function comprimirImagen(base64, maxWidth = 1024, quality = 0.75) {
  return new Promise(resolve => {
    if (!base64) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio  = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64); // si falla, devolver original
    img.src = base64;
  });
}

// ── Generar ID local único ────────────────────────────────────────────────────
export function genLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Encolar operación offline ─────────────────────────────────────────────────
export async function encolarOperacion({ modulo, operacion, payload, imagenKey }) {
  const localId = genLocalId();
  await idbPut('pendientes', {
    localId,
    modulo,        // 'pagos' | 'egresos' | 'otros_ingresos' | 'derramas'
    operacion,     // 'insert' | 'update'
    payload,       // datos sin imagen
    imagenKey,     // key en store 'imagenes' si hay imagen
    synced: false,
    timestamp: Date.now(),
    intentos: 0,
  });
  return localId;
}

// ── Guardar imagen offline separada ──────────────────────────────────────────
export async function guardarImagenOffline(localId, base64) {
  if (!base64) return;
  const comprimida = await comprimirImagen(base64);
  await idbPut('imagenes', { localId, data: comprimida });
}

// ── Obtener cantidad de pendientes ───────────────────────────────────────────
export async function contarPendientes() {
  const todos = await idbGetAll('pendientes');
  return todos.filter(p => !p.synced).length;
}

// ── MOTOR DE SINCRONIZACIÓN ───────────────────────────────────────────────────
export async function sincronizar(callbacks = {}) {
  const { onProgress, onComplete, onError } = callbacks;
  const pendientes = (await idbGetAll('pendientes')).filter(p => !p.synced);

  if (pendientes.length === 0) {
    onComplete?.({ sincronizados: 0, omitidos: 0, errores: 0 });
    return;
  }

  let sincronizados = 0, omitidos = 0, errores = 0;

  for (const op of pendientes) {
    try {
      onProgress?.({ actual: sincronizados + omitidos + errores + 1, total: pendientes.length, op });

      // Recuperar imagen si existe
      let payload = { ...op.payload };
      if (op.imagenKey) {
        const imgEntry = await idbGet('imagenes', op.imagenKey);
        if (imgEntry?.data) {
          // El campo imagen varía por módulo
          if (op.modulo === 'pagos') {
            // La imagen va dentro del último abono
            if (payload.abonos?.length) {
              payload.abonos = payload.abonos.map((a, i) =>
                i === payload.abonos.length - 1 ? { ...a, imagen: imgEntry.data } : a
              );
            }
          } else {
            payload.soporte = imgEntry.data;
          }
        }
      }

      let duplicado = false;

      // ── Validación anti-duplicados por módulo ──
      if (op.operacion === 'insert') {
        duplicado = await verificarDuplicado(op.modulo, payload);
      }

      if (duplicado) {
        omitidos++;
        await idbPut('pendientes', { ...op, synced: true, resultado: 'omitido_duplicado' });
        continue;
      }

      // ── Ejecutar operación en Supabase ──
      let error = null;

      if (op.operacion === 'insert') {
        const tabla = op.modulo;
        const { error: err } = await supabase.from(tabla).insert(payload);
        error = err;
      } else if (op.operacion === 'update') {
        const tabla = op.modulo;
        const { error: err } = await supabase.from(tabla).update(payload).eq('id', payload.id);
        error = err;
      }

      if (error) {
        errores++;
        await idbPut('pendientes', { ...op, intentos: op.intentos + 1, ultimoError: error.message });
        onError?.({ op, error });
      } else {
        sincronizados++;
        await idbPut('pendientes', { ...op, synced: true, resultado: 'ok' });
        // Limpiar imagen
        if (op.imagenKey) await idbDelete('imagenes', op.imagenKey);
      }

    } catch (e) {
      errores++;
      await idbPut('pendientes', { ...op, intentos: op.intentos + 1, ultimoError: e.message });
    }
  }

  onComplete?.({ sincronizados, omitidos, errores });
}

// ── Verificar duplicado por módulo ───────────────────────────────────────────
async function verificarDuplicado(modulo, payload) {
  try {
    if (modulo === 'pagos') {
      // Duplicado: mismo depto_id + periodo_id + tipo
      const { data } = await supabase.from('pagos')
        .select('id')
        .eq('depto_id', payload.depto_id)
        .eq('periodo_id', payload.periodo_id)
        .eq('tipo', payload.tipo || 'ordinario')
        .limit(1);
      return data && data.length > 0;
    }

    if (modulo === 'egresos') {
      // Duplicado: mismo concepto + mes + anio
      const { data } = await supabase.from('egresos')
        .select('id')
        .eq('concepto', payload.concepto)
        .eq('mes', payload.mes)
        .eq('anio', payload.anio)
        .limit(1);
      return data && data.length > 0;
    }

    if (modulo === 'otros_ingresos') {
      // Duplicado: mismo concepto + mes + anio + pagador
      const { data } = await supabase.from('otros_ingresos')
        .select('id')
        .eq('concepto', payload.concepto)
        .eq('mes', payload.mes)
        .eq('anio', payload.anio)
        .eq('pagador_nombre', payload.pagador_nombre)
        .limit(1);
      return data && data.length > 0;
    }

    if (modulo === 'derramas') {
      // Duplicado: mismo título + mes + anio
      const { data } = await supabase.from('derramas')
        .select('id')
        .eq('titulo', payload.titulo)
        .eq('mes', payload.mes)
        .eq('anio', payload.anio)
        .limit(1);
      return data && data.length > 0;
    }

    return false;
  } catch {
    return false; // en caso de error, no bloquear
  }
}
