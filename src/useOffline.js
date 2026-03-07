// ─── HOOKS OFFLINE ───────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { contarPendientes, sincronizar, saveCache, loadCache } from './offlineEngine';

// ── useConectividad: detecta si hay internet ─────────────────────────────────
export function useConectividad() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}

// ── useSync: maneja la cola de pendientes y sincronización ───────────────────
export function useSync(online, onSyncComplete) {
  const [pendientes, setPendientes]   = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync]   = useState(null);
  const [resultadoSync, setResultadoSync] = useState(null); // { sincronizados, omitidos, errores }

  // Actualizar contador de pendientes
  const actualizarContador = useCallback(async () => {
    const n = await contarPendientes();
    setPendientes(n);
  }, []);

  // Ejecutar sync
  const ejecutarSync = useCallback(async () => {
    if (!online || sincronizando) return;
    setSincronizando(true);
    setResultadoSync(null);

    await sincronizar({
      onComplete: async (resultado) => {
        setSincronizando(false);
        setUltimaSync(new Date());
        setResultadoSync(resultado);
        await actualizarContador();
        if (resultado.sincronizados > 0) {
          onSyncComplete?.(); // recargar datos frescos desde Supabase
        }
        // Limpiar mensaje después de 6 segundos
        setTimeout(() => setResultadoSync(null), 6000);
      },
      onError: () => {
        setSincronizando(false);
      }
    });
  }, [online, sincronizando, actualizarContador, onSyncComplete]);

  // Auto-sync cuando vuelve la conexión
  useEffect(() => {
    if (online && pendientes > 0) {
      ejecutarSync();
    }
  }, [online]); // eslint-disable-line

  // Verificar pendientes al montar
  useEffect(() => {
    actualizarContador();
  }, [actualizarContador]);

  return { pendientes, sincronizando, ultimaSync, resultadoSync, ejecutarSync, actualizarContador };
}

// ── useCacheDatos: guarda y recupera datos para lectura offline ──────────────
export function useCacheDatos() {
  const guardar = useCallback(async (key, data) => {
    await saveCache(key, data);
  }, []);

  const recuperar = useCallback(async (key) => {
    const entry = await loadCache(key);
    return entry ? { data: entry.data, timestamp: entry.timestamp } : null;
  }, []);

  return { guardar, recuperar };
}
