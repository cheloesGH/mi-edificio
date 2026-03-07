import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useConectividad, useSync, useCacheDatos } from "./useOffline";
import { encolarOperacion, guardarImagenOffline, genLocalId, comprimirImagen } from "./offlineEngine";

// ── Edge Function helper para operaciones admin seguras
const adminUsers = async (action, params) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    "https://sunavnqxgaofszbnqrmg.supabase.co/functions/v1/hyper-responder",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ action, ...params })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error en operación admin");
  return data;
};
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#0ea5e9"];
const fmt = n => `$${Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = n => `${Number(n).toFixed(4)}%`;
const today = { d: 28, m: 1, y: 2026 };
const todayStr = () => `${String(today.d).padStart(2, "0")}/${String(today.m + 1).padStart(2, "0")}/${today.y}`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function exportCSV(rows, cols, filename) {
  const head = cols.map(c => c.label).join(",");
  const body = rows.map(r => cols.map(c => `"${r[c.key] ?? ''}"`).join(",")).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, config, onClear }) {
  const active = Object.values(filters).filter(v => v && v !== "todos" && v !== "").length;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">🔍 Filtros</span>
          {active > 0 && <span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">{active} activo{active > 1 ? "s" : ""}</span>}
        </div>
        {active > 0 && <button onClick={onClear} className="text-xs text-rose-500 hover:text-rose-700 font-medium">✕ Limpiar filtros</button>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {config.map(f => (
          <div key={f.key}>
            <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
            {f.type === "text" ? (
              <input value={filters[f.key] || ""} onChange={e => setFilters({ ...filters, [f.key]: e.target.value })}
                placeholder={f.placeholder || "Buscar..."}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            ) : (
              <select value={filters[f.key] || "todos"} onChange={e => setFilters({ ...filters, [f.key]: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400">
                <option value="todos">{f.placeholder || "Todos"}</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RESULT COUNT ─────────────────────────────────────────────────────────────
function ResultCount({ total, filtered, onExport }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">
        Mostrando <strong className="text-slate-700">{filtered}</strong> de <strong className="text-slate-700">{total}</strong> registros
      </span>
      {onExport && <button onClick={onExport} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-200 font-medium">⬇️ Exportar CSV</button>}
    </div>
  );
}

// ─── MODAL CONFIRM ────────────────────────────────────────────────────────────
function Confirm({ msg, onYes, onNo }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-3xl text-center mb-3">⚠️</div>
        <p className="text-slate-700 text-center text-sm mb-5">{msg}</p>
        <div className="flex gap-3">
          <button onClick={onNo} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
          <button onClick={onYes} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">Confirmar</button>
        </div>
      </div>
    </div>
  );
}


// ─── MODAL CONFIRMACIÓN (reemplaza confirm() nativo que falla en móvil PWA) ──
// ─── TOAST OFFLINE ───────────────────────────────────────────────────────────
function ToastOffline({ mensaje, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] bg-amber-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 whitespace-nowrap">
      <span>📶</span>
      <span>{mensaje}</span>
    </div>
  );
}

function ModalConfirm({ mensaje, onOk, onCancel, okLabel = "Eliminar", okColor = "bg-rose-600 hover:bg-rose-700" }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-slate-700 text-sm leading-relaxed">{mensaje}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 border border-slate-300 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button onClick={onOk}
            className={`flex-1 ${okColor} text-white py-2.5 rounded-xl text-sm font-semibold transition`}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPROBANTE ──────────────────────────────────────────────────────────────
function Comprobante({ cuota, abono, depto, onClose, appName = "Mi Edificio" }) {
  const nro = `#${String(abono?.id || 1).padStart(6, "0")}`;
  const saldo = Math.max(0, cuota.montoTotal - cuota.montoPagado);
  const filas = [
    ["N° Comprobante", nro],
    ["Tipo", cuota.tipo === "ordinario" ? "Alícuota Ordinaria" : "Derrama Extraordinaria"],
    ["Propiedad", cuota.depto],
    ["Propietario", depto?.nombre || "-"],
    ["Período", cuota.periodoNombre],
    cuota.concepto && ["Concepto", cuota.concepto],
    ["Fecha", abono?.fecha || "-"],
    ["Método de pago", abono?.metodo || "-"],
  ].filter(Boolean);

  const htmlComprobante = () => `
    <html><head><title>Comprobante ${nro}</title>
    <style>
      body{font-family:sans-serif;padding:32px;color:#1e293b;max-width:480px;margin:auto}
      h2{text-align:center;color:#4f46e5;margin-bottom:4px}
      .sub{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:20px}
      .box{border:2px dashed #a5b4fc;border-radius:12px;padding:16px;background:#eef2ff}
      .fila{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #e0e7ff}
      .fila span:first-child{color:#64748b}
      .fila span:last-child{font-weight:600}
      .total{display:flex;justify-content:space-between;padding-top:10px;font-size:15px;font-weight:bold}
      .total span:last-child{color:#059669}
      .saldo{display:flex;justify-content:space-between;font-size:12px;color:#d97706;margin-top:4px}
      .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px}
      @media print{body{padding:8px}}
    </style></head><body>
    <h2>🏢 ${appName}</h2>
    <p class="sub">Comprobante Oficial de Pago</p>
    <div class="box">
      ${filas.map(([l,v])=>`<div class="fila"><span>${l}</span><span>${v}</span></div>`).join("")}
      <div class="total"><span>Este abono</span><span>${fmt(abono?.monto||0)}</span></div>
      <div class="saldo"><span>Total cuota: ${fmt(cuota.montoTotal)}</span><span>Saldo: ${fmt(saldo)}</span></div>
    </div>
    <p class="footer">✅ Verificado · ${todayStr()}</p>
    </body></html>`;

  const imprimir = () => {
    const blob = new Blob([htmlComprobante()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000);
    };
  };

  const descargarPDF = async () => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:480px;height:auto;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlComprobante());
      iframe.contentDocument.close();
      await new Promise(r => setTimeout(r, 600));
      const canvas = await html2canvas(iframe.contentDocument.body, {
        scale: 2,
        useCORS: true,
        width: 480,
        height: iframe.contentDocument.body.scrollHeight,
        windowWidth: 480,
        windowHeight: iframe.contentDocument.body.scrollHeight,
      });
      document.body.removeChild(iframe);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      pdf.save(`comprobante-${cuota.depto}-${nro}.pdf`);
    } catch (err) {
      alert("Error al generar PDF: " + err.message);
    }
  };

  const enviarCorreo = () => {
    const cuerpo = [
      `Comprobante de Pago - ${appName}`,
      "─────────────────────────────",
      ...filas.map(([l, v]) => `${l}: ${v}`),
      "─────────────────────────────",
      `Este abono: ${fmt(abono?.monto || 0)}`,
      `Total cuota: ${fmt(cuota.montoTotal)}`,
      `Saldo pendiente: ${fmt(saldo)}`,
      "",
      `Verificado: ${todayStr()}`,
    ].join("%0D%0A");
    const email = depto?.email || "";
    window.open(`mailto:${email}?subject=Comprobante de Pago ${nro} - ${appName}&body=${cuerpo}`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div id="comprobante-print">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">🏢</div>
            <h2 className="text-xl font-bold text-slate-800">{appName}</h2>
            <p className="text-slate-400 text-sm">Comprobante Oficial de Pago</p>
          </div>
          <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 mb-4 space-y-2.5 text-sm bg-indigo-50">
            {filas.map(([l, v, b]) => (
              <div key={l} className="flex justify-between">
                <span className="text-slate-500">{l}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            {abono?.imagen && <img src={abono.imagen} alt="Comprobante" className="rounded-lg w-full max-h-40 object-contain border border-indigo-200 mt-1" />}
            <div className="border-t-2 border-indigo-300 pt-2.5 flex justify-between">
              <span className="font-bold text-slate-700">Este abono</span>
              <span className="font-bold text-emerald-600 text-lg">{fmt(abono?.monto || 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500"><span>Total cuota</span><span>{fmt(cuota.montoTotal)}</span></div>
            <div className="flex justify-between text-xs font-semibold text-amber-600"><span>Saldo pendiente</span><span>{fmt(saldo)}</span></div>
          </div>
          <div className="text-center text-xs text-slate-400 mb-4">✅ Verificado · {todayStr()}</div>
        </div>
        {/* Acciones */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button onClick={imprimir} className="flex flex-col items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-2.5 rounded-xl text-xs font-semibold text-slate-600 transition">
            <span className="text-lg">🖨️</span>Imprimir
          </button>
          <button onClick={descargarPDF} className="flex flex-col items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2.5 rounded-xl text-xs font-semibold text-rose-600 transition">
            <span className="text-lg">📄</span>Guardar PDF
          </button>
          <button onClick={enviarCorreo} className="flex flex-col items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2.5 rounded-xl text-xs font-semibold text-indigo-600 transition">
            <span className="text-lg">📧</span>Enviar correo
          </button>
        </div>
        <button onClick={onClose} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 text-sm">Cerrar</button>
      </div>
    </div>
  );
}

// ─── MODAL PAGO ───────────────────────────────────────────────────────────────
function ModalPago({ cuota, onClose, onConfirm, pagosDeuda = [] }) {
  const saldo = parseFloat((cuota.montoTotal - cuota.montoPagado).toFixed(2));
  const [monto, setMonto] = useState(String(saldo));
  const [metodo, setMetodo] = useState("Transferencia");
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [distribuirModal, setDistribuirModal] = useState(false);
  const [distribucion, setDistribucion] = useState([]);
  const fileRef = useRef();
  const montoN = parseFloat(monto || 0);
  const excedente = parseFloat((montoN - saldo).toFixed(2));
  const hayExcedente = excedente > 0 && pagosDeuda.length > 0;
  const err = montoN <= 0;

  const handleImg = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { setImagen(ev.target.result); setPreview(ev.target.result); }; r.readAsDataURL(f); };

  const calcularDistribucion = () => {
    let restante = parseFloat(excedente.toFixed(2));
    const dist = [];
    for (const p of pagosDeuda) {
      if (restante <= 0) break;
      const saldoP = parseFloat((p.montoTotal - p.montoPagado).toFixed(2));
      const asignar = parseFloat(Math.min(saldoP, restante).toFixed(2));
      dist.push({ ...p, asignar });
      restante = parseFloat((restante - asignar).toFixed(2));
    }
    setDistribucion(dist);
    setDistribuirModal(true);
  };

  const submit = () => { onConfirm({ monto: Math.min(montoN, saldo), metodo, imagen, distribucion: distribuirModal ? distribucion : [] }); onClose(); };

  if (distribuirModal) return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-lg text-slate-800">💰 Distribuir excedente</h3>
        <p className="text-sm text-slate-500">El pago de <strong>{fmt(montoN)}</strong> cubre esta cuota y sobran <strong className="text-indigo-600">{fmt(excedente)}</strong>. Se distribuirá así:</p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs bg-emerald-50 rounded-xl px-3 py-2">
            <span className="text-slate-600">📅 {cuota.periodoNombre} (esta cuota)</span>
            <span className="font-bold text-emerald-700">{fmt(saldo)}</span>
          </div>
          {distribucion.map((d, i) => (
            <div key={i} className="flex justify-between text-xs bg-indigo-50 rounded-xl px-3 py-2">
              <span className="text-slate-600">📅 {d.periodoNombre}</span>
              <span className="font-bold text-indigo-700">{fmt(d.asignar)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDistribuirModal(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Volver</button>
          <button onClick={submit} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">✅ Confirmar distribución</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {confirm && <Confirm msg={`¿Confirmar abono de ${fmt(Math.min(montoN, saldo))} para Propiedad ${cuota.depto}?`} onYes={submit} onNo={() => setConfirm(false)} />}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-lg text-slate-800">Registrar Abono</h3>
        <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Propiedad</span><span className="font-bold text-indigo-700">{cuota.depto}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Período</span><span>{cuota.periodoNombre}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total cuota</span><span>{fmt(cuota.montoTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Ya pagado</span><span className="text-emerald-600 font-semibold">{fmt(cuota.montoPagado)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-semibold">Saldo</span><span className="font-bold text-amber-600">{fmt(saldo)}</span></div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-slate-500">Monto a abonar ($)</label>
            <button onClick={() => setMonto(String(saldo))} className="text-xs text-indigo-500 hover:underline font-semibold">Usar saldo completo {fmt(saldo)}</button>
          </div>
          <input type="number" value={monto} min="0.01" step="0.01" onChange={e => setMonto(e.target.value)}
            className={`w-full border rounded-xl px-3 py-2 text-sm ${err && monto ? "border-rose-400" : ""}`} />
          {err && monto && <p className="text-rose-500 text-xs mt-1">Monto inválido</p>}
          {hayExcedente && (
            <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-700">
              💡 Excedente de <strong>{fmt(excedente)}</strong> — hay {pagosDeuda.length} cuota(s) pendiente(s) de este propietario
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Método</label>
          <select value={metodo} onChange={e => setMetodo(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm">
            {["Transferencia", "Efectivo", "Tarjeta", "Cheque"].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Imagen comprobante (opcional)</label>
          <label htmlFor="modal-pago-img" className="block border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-indigo-300">
            {preview ? <img src={preview} alt="" className="max-h-24 mx-auto rounded-lg object-contain" /> : <div className="text-slate-400 text-sm py-2">📎 Subir imagen o tomar foto</div>}
          </label>
          <input id="modal-pago-img" ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
        </div>
        {cuota.abonos?.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1">Abonos anteriores</p>
            {cuota.abonos.map((a, i) => (
              <div key={i} className="text-xs flex justify-between bg-emerald-50 rounded-lg px-2 py-1 mb-1">
                <span>{a.fecha} · {a.metodo}</span><span className="font-semibold text-emerald-700">{fmt(a.monto)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
          {hayExcedente
            ? <button onClick={() => montoN > 0 && calcularDistribucion()} disabled={!monto || montoN <= 0} className="flex-1 bg-indigo-600 disabled:bg-slate-300 text-white py-2 rounded-xl text-sm font-semibold">Distribuir →</button>
            : <button onClick={() => !err && monto && setConfirm(true)} disabled={err || !monto} className="flex-1 bg-indigo-600 disabled:bg-slate-300 text-white py-2 rounded-xl text-sm font-semibold">Registrar</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ onLogin, appName = "Mi Edificio" }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (!email || !pass) return setErr("Ingresa tu email y contraseña");
    setLoading(true); setErr("");
    try {
      // 1. Autenticar con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass.trim() });
      if (authError) { setErr("Email o contraseña incorrectos"); setLoading(false); return; }

      // 2. Buscar datos del usuario en tabla usuarios
      const { data: usr, error: usrError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', authData.user.id)
        .eq('activo', true)
        .single();
      if (usrError || !usr) { await supabase.auth.signOut(); setErr("Usuario no encontrado o inactivo"); setLoading(false); return; }

      onLogin({ ...usr, user: usr.usuario, deptos: usr.deptos || [], modulos: usr.modulos || [], permisos: usr.permisos || {} });
    } catch (e) {
      setErr("Error de conexión");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-7">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🏢</div>
          <h1 className="text-2xl font-bold text-slate-800">{appName}</h1>
          <p className="text-slate-400 text-sm">Sistema de Administración v3.1</p>
        </div>
        <div className="space-y-3">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" onKeyDown={e => e.key === "Enter" && go()} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" onKeyDown={e => e.key === "Enter" && go()} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          {err && <p className="text-rose-500 text-sm text-center">{err}</p>}
          <button onClick={go} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">Contacta al administrador si olvidaste tu contraseña</p>
      </div>
    </div>
  );
}


// ─── INFORME FINANCIERO ──────────────────────────────────────────────────────
function InformeFinanciero({ per, perAnterior, egresos, pagos, usuarios, deptos, onClose, otrosIngresos = [], appName = "Mi Edificio" }) {
  const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // ── Egresos del período
  const egresosMes = egresos.filter(e => e.mes === per?.mes && e.anio === per?.anio);
  const totalEgresos = egresosMes.reduce((a, e) => a + e.monto, 0);

  // ── Ingresos del período (pagos pagados o parciales)
  const pagosMes = pagos.filter(p => p.periodoId === per?.id && p.montoPagado > 0);
  const totalCuotas = pagosMes.reduce((a, p) => a + p.montoPagado, 0);

  // ── Otros ingresos del período
  const otrosMes = otrosIngresos.filter(o => o.mes === per?.mes && o.anio === per?.anio);
  const totalOtros = otrosMes.reduce((a, o) => a + o.monto, 0);
  const totalIngresos = totalCuotas + totalOtros;

  // ── Flujo mes anterior
  const egresosMesAnt = perAnterior ? egresos.filter(e => e.mes === perAnterior.mes && e.anio === perAnterior.anio).reduce((a, e) => a + e.monto, 0) : 0;
  const ingresosMesAnt = perAnterior ? pagos.filter(p => p.periodoId === perAnterior.id && p.montoPagado > 0).reduce((a, p) => a + p.montoPagado, 0) : 0;
  const otrosAnt = perAnterior ? otrosIngresos.filter(o => o.mes === perAnterior.mes && o.anio === perAnterior.anio).reduce((a, o) => a + o.monto, 0) : 0;
  const flujoAnt = (ingresosMesAnt + otrosAnt) - egresosMesAnt;
  const flujoAct = totalIngresos - totalEgresos;

  const getNombre = id => usuarios.find(u => u.deptos?.includes(id))?.nombre || "-";
  const getDepto = id => deptos.find(d => d.id === id)?.depto || "-";

  // ── Construir fila de ingreso con adeudos concatenados
  const filasIngresos = pagosMes.map(p => {
    const propietario = getNombre(p.deptoId);
    const depto = getDepto(p.deptoId);
    const tipoLabel = p.tipo === "ordinario" ? "Ordinaria" : "Derrama";
    const concepto = `${tipoLabel} · ${MESES_FULL[p.mes] || ""} ${p.anio} · Depto ${depto}`;
    // Períodos adeudados del mismo propietario
    const adeudados = pagos
      .filter(x => x.deptoId === p.deptoId && x.estado !== "pagado" && x.periodoId !== per?.id)
      .map(x => `${MESES_FULL[x.mes] || ""} ${x.anio}`)
      .filter((v, i, a) => a.indexOf(v) === i);
    const adeudaStr = adeudados.length > 0 ? ` | Adeuda: ${adeudados.join(", ")}` : "";
    return { propietario, monto: p.montoPagado, concepto: concepto + adeudaStr };
  });

  // ── HTML del informe para imprimir/descargar
  const htmlInforme = () => {
    const flujoColor = (v) => v >= 0 ? "#059669" : "#e11d48";

    const filaEgr = egresosMes.length > 0
      ? egresosMes.map(e => `
        <tr class="data-row">
          <td class="c1">${e.concepto}</td>
          <td class="c2 valor" style="color:#e11d48">${fmt(e.monto)}</td>
          <td class="c3 detalle">${e.detalle || "-"}</td>
        </tr>`).join("")
      : `<tr class="data-row"><td class="c1" style="color:#94a3b8;font-style:italic">Sin egresos registrados</td><td class="c2 valor">-</td><td class="c3 detalle">-</td></tr>`;

    const filaIng = filasIngresos.length > 0
      ? filasIngresos.map(r => `
        <tr class="data-row">
          <td class="c1">${r.propietario}</td>
          <td class="c2 valor" style="color:#059669">${fmt(r.monto)}</td>
          <td class="c3 detalle">${r.concepto}</td>
        </tr>`).join("")
      : `<tr class="data-row"><td class="c1" style="color:#94a3b8;font-style:italic">Sin ingresos registrados</td><td class="c2 valor">-</td><td class="c3 detalle">-</td></tr>`;

    const filaOtros = otrosMes.length > 0
      ? otrosMes.map(o => `
        <tr class="data-row">
          <td class="c1">${o.pagador_nombre} <span style="color:#94a3b8;font-size:10px">(${o.pagador_tipo === "propietario" ? "prop." : "externo"})</span></td>
          <td class="c2 valor" style="color:#059669">${fmt(o.monto)}</td>
          <td class="c3 detalle">${o.concepto}${o.detalle ? " · " + o.detalle : ""}</td>
        </tr>`).join("")
      : `<tr class="data-row"><td class="c1" style="color:#94a3b8;font-style:italic">Sin otros ingresos</td><td class="c2 valor">-</td><td class="c3 detalle">-</td></tr>`;

    return `<html><head><title>Informe Financiero - ${per?.nombre}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:28px;color:#1e293b;max-width:960px;margin:auto;font-size:12px}
      h1{color:#4f46e5;font-size:18px;margin-bottom:2px}
      .sub{color:#94a3b8;font-size:11px;margin-bottom:20px;margin-top:2px}

      /* Una sola tabla para todo el informe */
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      col.c1{width:30%}
      col.c2{width:18%}
      col.c3{width:52%}

      /* Celdas con clases de columna para garantizar alineación */
      td,th{padding:9px 12px;vertical-align:middle;word-wrap:break-word}
      td.c1,th.c1{width:30%}
      td.c2,th.c2{width:18%;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      td.c3,th.c3{width:52%}

      /* Encabezado de sección */
      tr.section-header td{
        background:#4f46e5;color:#fff;font-weight:700;
        font-size:12px;padding:8px 12px;
        border-top:4px solid #4f46e5;
      }
      tr.section-header td.c2{text-align:right}

      /* Encabezado de columnas */
      tr.col-header th{
        background:#f1f5f9;color:#64748b;font-weight:600;
        border-bottom:2px solid #e2e8f0;font-size:11px;
      }
      tr.col-header th.c2{text-align:right}

      /* Filas de datos */
      tr.data-row td{border-bottom:1px solid #f1f5f9;height:34px}
      tr.data-row:nth-child(even) td{background:#f8fafc}
      td.valor{text-align:right;white-space:nowrap;font-weight:600}
      td.detalle{color:#64748b;font-size:11px}

      /* Fila de subtotal */
      tr.subtotal-row td{
        font-weight:700;height:36px;
        border-top:2px solid #e2e8f0;
        border-bottom:3px solid #e2e8f0;
        background:#f8fafc;
      }
      tr.subtotal-row td.c2{text-align:right;font-size:13px}

      /* Sección resumen */
      tr.resumen-header td{
        background:#0f172a;color:#fff;font-weight:700;
        font-size:12px;padding:8px 12px;
        border-top:6px solid #0f172a;
      }
      tr.resumen-row td{
        border-bottom:1px solid #f1f5f9;
        height:34px;color:#475569;
      }
      tr.resumen-row td.c2{text-align:right;font-weight:700}
      tr.resumen-total td{
        font-weight:800;font-size:14px;
        border-top:3px solid #0f172a;
        background:#f1f5f9;height:40px;
      }
      tr.resumen-total td.c2{text-align:right}

      .footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:20px;padding-top:12px;border-top:1px solid #f1f5f9}
      @media print{body{padding:12px}}
    </style></head><body>

    <h1>🏢 ${appName} — Informe Financiero</h1>
    <p class="sub">Período: <strong>${per?.nombre}</strong> &nbsp;·&nbsp; Generado: ${todayStr()}</p>

    <table>
      <colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>

      <!-- ── SECCIÓN EGRESOS ── -->
      <tr class="section-header">
        <td class="c1">📉 EGRESOS — ${per?.nombre}</td>
        <td class="c2">Valor</td>
        <td class="c3">Detalle</td>
      </tr>
      ${filaEgr}
      <tr class="subtotal-row">
        <td class="c1">TOTAL EGRESOS</td>
        <td class="c2" style="color:#e11d48">${fmt(totalEgresos)}</td>
        <td class="c3"></td>
      </tr>

      <!-- ── ESPACIADOR ── -->
      <tr><td colspan="3" style="height:12px;border:none;background:#fff"></td></tr>

      <!-- ── SECCIÓN INGRESOS CUOTAS ── -->
      <tr class="section-header">
        <td class="c1">📈 INGRESOS CUOTAS — ${per?.nombre}</td>
        <td class="c2">Monto Pagado</td>
        <td class="c3">Concepto / Adeudos</td>
      </tr>
      ${filaIng}
      <tr class="subtotal-row">
        <td class="c1">SUBTOTAL CUOTAS</td>
        <td class="c2" style="color:#059669">${fmt(totalCuotas)}</td>
        <td class="c3"></td>
      </tr>

      <!-- ── ESPACIADOR ── -->
      <tr><td colspan="3" style="height:12px;border:none;background:#fff"></td></tr>

      <!-- ── SECCIÓN OTROS INGRESOS ── -->
      <tr class="section-header">
        <td class="c1">💰 OTROS INGRESOS — ${per?.nombre}</td>
        <td class="c2">Monto</td>
        <td class="c3">Concepto / Detalle</td>
      </tr>
      ${filaOtros}
      <tr class="subtotal-row">
        <td class="c1">SUBTOTAL OTROS INGRESOS</td>
        <td class="c2" style="color:#059669">${fmt(totalOtros)}</td>
        <td class="c3"></td>
      </tr>

      <!-- ── ESPACIADOR ── -->
      <tr><td colspan="3" style="height:12px;border:none;background:#fff"></td></tr>

      <!-- ── RESUMEN FINANCIERO ── -->
      <tr class="resumen-header">
        <td class="c1">📊 RESUMEN FINANCIERO</td>
        <td class="c2"></td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-row">
        <td class="c1">Total Egresos ${per?.nombre}</td>
        <td class="c2" style="color:#e11d48">${fmt(totalEgresos)}</td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-row">
        <td class="c1">Ingresos cuotas ${per?.nombre}</td>
        <td class="c2" style="color:#059669">${fmt(totalCuotas)}</td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-row">
        <td class="c1">Otros ingresos ${per?.nombre}</td>
        <td class="c2" style="color:#059669">${fmt(totalOtros)}</td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-row" style="font-weight:700">
        <td class="c1">TOTAL INGRESOS ${per?.nombre}</td>
        <td class="c2" style="color:#059669">${fmt(totalIngresos)}</td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-row">
        <td class="c1">Flujo neto mes anterior ${perAnterior ? "("+perAnterior.nombre+")" : ""}</td>
        <td class="c2" style="color:${flujoColor(flujoAnt)}">${flujoAnt >= 0 ? "+" : ""}${fmt(flujoAnt)}</td>
        <td class="c3"></td>
      </tr>
      <tr class="resumen-total">
        <td class="c1">FLUJO NETO ${per?.nombre?.toUpperCase()}</td>
        <td class="c2" style="color:${flujoColor(flujoAct)}">${flujoAct >= 0 ? "+" : ""}${fmt(flujoAct)}</td>
        <td class="c3"></td>
      </tr>

    </table>

    <p class="footer">Informe generado automáticamente · ${appName} · ${todayStr()}</p>
    </body></html>`;
  };

  const imprimir = () => {
    const blob = new Blob([htmlInforme()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000);
    };
  };

  const descargar = async () => {
    try {
      // Renderizar el HTML puro del informe en un iframe aislado (sin Tailwind/oklch)
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:960px;height:auto;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlInforme());
      iframe.contentDocument.close();
      await new Promise(r => setTimeout(r, 800));
      const canvas = await html2canvas(iframe.contentDocument.body, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 960,
        height: iframe.contentDocument.body.scrollHeight,
        windowWidth: 960,
        windowHeight: iframe.contentDocument.body.scrollHeight,
      });
      document.body.removeChild(iframe);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let yPos = margin;
      pdf.addImage(imgData, "PNG", margin, yPos, imgW, imgH);
      heightLeft -= pageH - margin * 2;
      while (heightLeft > 0) {
        yPos = heightLeft - imgH + margin;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, yPos, imgW, imgH);
        heightLeft -= pageH - margin * 2;
      }
      pdf.save(`informe-${per?.nombre?.replace(" ", "-") || "financiero"}.pdf`);
    } catch (err) {
      alert("Error al generar PDF: " + err.message);
    }
  };

  const enviarCorreo = () => {
    const lineas = [
      `Informe Financiero - ${appName}`,
      `Período: ${per?.nombre}`,
      ``,
      `── EGRESOS ──`,
      ...egresosMes.map(e => `${e.concepto}: ${fmt(e.monto)}${e.detalle ? " | " + e.detalle : ""}`),
      `TOTAL EGRESOS: ${fmt(totalEgresos)}`,
      ``,
      `── INGRESOS ──`,
      ...filasIngresos.map(r => `${r.propietario}: ${fmt(r.monto)} | ${r.concepto}`),
      `TOTAL INGRESOS: ${fmt(totalIngresos)}`,
      ``,
      `── RESUMEN ──`,
      `Flujo mes anterior (${perAnterior?.nombre || "-"}): ${flujoAnt >= 0 ? "+" : ""}${fmt(flujoAnt)}`,
      `Flujo mes actual (${per?.nombre}): ${flujoAct >= 0 ? "+" : ""}${fmt(flujoAct)}`,
    ].join("%0D%0A");
    window.open(`mailto:?subject=Informe Financiero ${per?.nombre} - ${appName}&body=${lineas}`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">📋 Informe Financiero</h2>
            <p className="text-sm text-slate-400 mt-0.5">Período: <span className="font-semibold text-indigo-600">{per?.nombre}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-2xl leading-none">✕</button>
        </div>

        {/* Body scrollable */}
        <div id="informe-content" className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* ── Egresos ── */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-lg">📉 Egresos</span>
              <span className="text-slate-400 font-normal">{per?.nombre}</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Concepto</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {egresosMes.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Sin egresos registrados</td></tr>}
                  {egresosMes.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{e.concepto}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-rose-600">{fmt(e.monto)}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs hidden md:table-cell">{e.detalle || "-"}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-slate-700">TOTAL EGRESOS</td>
                    <td className="px-3 py-2.5 text-right font-bold text-rose-600 text-base">{fmt(totalEgresos)}</td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Ingresos Cuotas ── */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-lg">📈 Ingresos Cuotas</span>
              <span className="text-slate-400 font-normal">{per?.nombre}</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Propietario</th>
                    <th className="px-3 py-2.5 text-right">Monto Pagado</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Concepto / Adeudos</th>
                  </tr>
                </thead>
                <tbody>
                  {filasIngresos.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Sin ingresos registrados</td></tr>}
                  {filasIngresos.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{r.propietario}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmt(r.monto)}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs hidden md:table-cell">{r.concepto}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-slate-700">SUBTOTAL CUOTAS</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 text-base">{fmt(totalCuotas)}</td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Otros Ingresos ── */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <span className="bg-teal-100 text-teal-600 px-2 py-0.5 rounded-lg">💰 Otros Ingresos</span>
              <span className="text-slate-400 font-normal">{per?.nombre}</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Pagador</th>
                    <th className="px-3 py-2.5 text-right">Monto</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Concepto / Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {otrosMes.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Sin otros ingresos registrados</td></tr>}
                  {otrosMes.map((o, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{o.pagador_nombre}<span className="text-xs text-slate-400 ml-1">({o.pagador_tipo === "propietario" ? "prop." : "ext."})</span></td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmt(o.monto)}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs hidden md:table-cell">{o.concepto}{o.detalle ? ` · ${o.detalle}` : ""}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-slate-700">SUBTOTAL OTROS</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 text-base">{fmt(totalOtros)}</td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Resumen flujo ── */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 mb-1">📊 Resumen Financiero</h3>
            <div className="flex justify-between text-sm py-2 border-b border-slate-200">
              <span className="text-slate-500">Total Egresos {per?.nombre}</span>
              <span className="font-bold text-rose-600">{fmt(totalEgresos)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-b border-slate-200">
              <span className="text-slate-500">Ingresos cuotas {per?.nombre}</span>
              <span className="font-bold text-emerald-600">{fmt(totalCuotas)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-b border-slate-200">
              <span className="text-slate-500">Otros ingresos {per?.nombre}</span>
              <span className="font-bold text-emerald-600">{fmt(totalOtros)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-b border-slate-200 font-semibold">
              <span className="text-slate-700">Total Ingresos {per?.nombre}</span>
              <span className="text-emerald-600">{fmt(totalIngresos)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-b border-slate-200">
              <span className="text-slate-500">Flujo neto mes anterior {perAnterior ? `(${perAnterior.nombre})` : ""}</span>
              <span className={`font-bold ${flujoAnt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{flujoAnt >= 0 ? "+" : ""}{fmt(flujoAnt)}</span>
            </div>
            <div className="flex justify-between text-base py-2 font-bold border-t-2 border-slate-300">
              <span className="text-slate-700">Flujo Neto {per?.nombre}</span>
              <span className={flujoAct >= 0 ? "text-emerald-600" : "text-rose-600"}>{flujoAct >= 0 ? "+" : ""}{fmt(flujoAct)}</span>
            </div>
          </div>
        </div>

        {/* Footer con botones */}
        <div className="p-6 border-t border-slate-100 grid grid-cols-3 gap-2">
          <button onClick={imprimir} className="flex flex-col items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-2.5 rounded-xl text-xs font-semibold text-slate-600 transition">
            <span className="text-lg">🖨️</span>Imprimir
          </button>
          <button onClick={descargar} className="flex flex-col items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2.5 rounded-xl text-xs font-semibold text-rose-600 transition" title="Se abrirá el diálogo de impresión. Selecciona Guardar como PDF">
            <span className="text-lg">📄</span>Guardar PDF
          </button>
          <button onClick={enviarCorreo} className="flex flex-col items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2.5 rounded-xl text-xs font-semibold text-indigo-600 transition">
            <span className="text-lg">📧</span>Enviar correo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ pagos, periodos, egresos, derramas, deptos, usuarios, setTab, otrosIngresos = [], appName = "Mi Edificio" }) {
  const [periodoId, setPeriodoId] = useState(periodos[periodos.length - 1]?.id);
  const [modal, setModal] = useState(null); // "ingresos" | "pendientes" | "morosos" | null
  const [morDetalle, setMorDetalle] = useState(null); // moroso seleccionado para ver desglose
  const [showInforme, setShowInforme] = useState(false);

    const ult3 = [...periodos].sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes).slice(-3).reverse();
const per = periodos.find(p => p.id === Number(periodoId)) || periodos[periodos.length - 1];
  const cuotas = pagos.filter(p => p.periodoId === per?.id && p.tipo === "ordinario");

  const ingMes = cuotas.filter(p => p.estado === "pagado").reduce((a, p) => a + p.montoPagado, 0);
  const pendMes = cuotas.filter(p => p.estado !== "pagado").reduce((a, p) => a + Math.max(0, p.montoTotal - p.montoPagado), 0);
  const egrMes = egresos.filter(e => e.mes === per?.mes && e.anio === per?.anio).reduce((a, e) => a + e.monto, 0);
  const otrosMes = otrosIngresos.filter(o => o.mes === per?.mes && o.anio === per?.anio).reduce((a, o) => a + o.monto, 0);
  const ingTotal = ingMes + otrosMes;
  const getNombre = id => usuarios.find(u => u.deptos?.includes(id))?.nombre || "-";
  // morososList agrupa TODOS los pagos pendientes por deptoId (no solo el período actual)
  const morososMap = {};
  pagos.filter(p => p.estado !== "pagado").forEach(p => {
    if (!morososMap[p.deptoId]) morososMap[p.deptoId] = { deptoId: p.deptoId, depto: p.depto, propietario: getNombre(p.deptoId), periodoId: p.periodoId, periodoNombre: p.periodoNombre, saldo: 0 };
    morososMap[p.deptoId].saldo = parseFloat((morososMap[p.deptoId].saldo + (p.montoTotal - p.montoPagado)).toFixed(2));
  });
  const morososList = Object.values(morososMap).sort((a, b) => b.saldo - a.saldo);
  const pagosCobrados = cuotas.filter(p => p.estado === "pagado");
  const pagosPendientes = cuotas.filter(p => p.estado !== "pagado");

  // Calcular remanente acumulado por período
  const periodosSorted = [...periodos].sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
  let acum = 0;
  const periodosConAcumulado = periodosSorted.map(pr => {
    const ing = pagos.filter(p => p.periodoId === pr.id && p.estado === "pagado").reduce((a, p) => a + p.montoPagado, 0);
    const otrosIng = otrosIngresos.filter(o => o.mes === pr.mes && o.anio === pr.anio).reduce((a, o) => a + o.monto, 0);
    const egr = egresos.filter(e => e.mes === pr.mes && e.anio === pr.anio).reduce((a, e) => a + e.monto, 0);
    const remanente = parseFloat((ing + otrosIng - egr).toFixed(2));
    acum = parseFloat((acum + remanente).toFixed(2));
    return { ...pr, ingCobrado: ing, otrosIng, egr, remanente, acumulado: acum };
  });
  const fondoAcumulado = periodosConAcumulado.length > 0 ? periodosConAcumulado[periodosConAcumulado.length - 1].acumulado : 0;

  const barData = periodos.map(pr => {
    const ing = pagos.filter(p => p.periodoId === pr.id && p.estado === "pagado").reduce((a, p) => a + p.montoPagado, 0);
    const egr = egresos.filter(e => e.mes === pr.mes && e.anio === pr.anio).reduce((a, e) => a + e.monto, 0);
    return { mes: `${MESES[pr.mes]} ${pr.anio}`, ingresos: parseFloat(ing.toFixed(2)), egresos: parseFloat(egr.toFixed(2)), flujo: parseFloat((ing - egr).toFixed(2)) };
  });

  const pieData = [
    { name: "Cobrado", value: parseFloat(ingMes.toFixed(2)), color: "#6366f1" },
    { name: "Pendiente", value: parseFloat(pendMes.toFixed(2)), color: "#f59e0b" }
  ];

  const pct = ingMes + pendMes > 0 ? ((ingMes / (ingMes + pendMes)) * 100).toFixed(1) : 0;

  const cards = [
    { l: "Ingresos", v: fmt(ingTotal), icon: "📈", iconBg: "bg-emerald-500", key: "ingresos", sub1: ingMes > 0 ? `Cuotas ${fmt(ingMes)}` : null, sub2: otrosMes > 0 ? `Otros ${fmt(otrosMes)}` : null },
    { l: "Egresos", v: fmt(egrMes), icon: "📉", iconBg: "bg-rose-500", key: "egresos" },
    { l: "Pendientes", v: fmt(pendMes), icon: "⏳", iconBg: "bg-amber-500", key: "pendientes" },
    { l: "En Mora", v: `${morososList.length}`, icon: "⚠️", iconBg: "bg-rose-600", key: "morosos" },
    { l: "Flujo Neto", v: fmt(ingTotal - egrMes), icon: "↕️", iconBg: "bg-indigo-600", key: "flujo", informe: true },
    { l: "Fondo Acumulado", v: fmt(fondoAcumulado), icon: "🏦", iconBg: fondoAcumulado >= 0 ? "bg-teal-600" : "bg-rose-700", key: "fondo_nav" },
    { l: "Derramas Activas", v: `${derramas.filter(d => d.estado === "activa").length}`, icon: "🔔", iconBg: "bg-purple-600", key: "derramas_nav" },
  ];

  const egresosMes = egresos.filter(e => e.mes === per?.mes && e.anio === per?.anio);
  const otrosMesRows = otrosIngresos.filter(o => o.mes === per?.mes && o.anio === per?.anio);
  const flujoRows = [
    ...pagosCobrados.map(r => ({ concepto: `Cuota ${r.depto}`, tipo: "Ingreso cuota", monto: r.montoPagado, _color: "text-emerald-600" })),
    ...otrosMesRows.map(o => ({ concepto: o.concepto, tipo: "Otro ingreso", monto: o.monto, _color: "text-emerald-500" })),
    ...egresosMes.map(e => ({ concepto: e.concepto, tipo: "Egreso", monto: e.monto, _color: "text-rose-600" })),
  ];
  const modalData = {
    ingresos: { title: "Detalle de Ingresos", desc: `Pagos cobrados en ${per?.nombre}`, rows: pagosCobrados, totalLabel: "Total cobrado", total: ingMes, totalColor: "text-emerald-600", rowColor: "bg-emerald-50", amountColor: "text-emerald-600", amount: r => r.montoPagado },
    egresos: { title: "Detalle de Egresos", desc: `Gastos registrados en ${per?.nombre}`, rows: egresosMes, totalLabel: "Total egresado", total: egrMes, totalColor: "text-rose-600", rowColor: "bg-rose-50", amountColor: "text-rose-600", amount: r => r.monto, labelKey: "concepto" },
    pendientes: { title: "Pagos Pendientes", desc: `Saldos por cobrar en ${per?.nombre}`, rows: pagosPendientes, totalLabel: "Total pendiente", total: pendMes, totalColor: "text-amber-600", rowColor: "bg-amber-50", amountColor: "text-amber-600", amount: r => r.montoTotal - r.montoPagado },
    morosos: { title: "Propietarios en Mora", desc: "Departamentos con saldo pendiente", rows: morososList, totalLabel: "Total adeudado", total: morososList.reduce((a, p) => a + p.saldo, 0), totalColor: "text-rose-600", rowColor: "bg-rose-50", amountColor: "text-rose-600", amount: r => r.saldo },
    flujo: { title: "Detalle Flujo Neto", desc: `Composición del flujo en ${per?.nombre}`, rows: flujoRows, totalLabel: `Flujo neto (${ingTotal - egrMes >= 0 ? "+" : ""}${fmt(ingTotal - egrMes)})`, total: ingTotal - egrMes, totalColor: ingTotal - egrMes >= 0 ? "text-emerald-600" : "text-rose-600", rowColor: "bg-slate-50", amountColor: null, amount: r => r.monto, labelKey: "concepto" },
  };

  const fmtK = v => `$${(v / 1000).toFixed(0)}k`;

  return (
    <div className="space-y-5">

      {/* ── Modal detalle moroso (desglose por período) ── */}
      {morDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div>
                  <button onClick={() => setMorDetalle(null)} className="text-xs text-indigo-500 hover:underline mb-1 block">← Volver al listado</button>
                  <h3 className="font-bold text-lg text-slate-800">{morDetalle.depto}</h3>
                  <p className="text-xs text-slate-400">{morDetalle.propietario} · Desglose de deuda pendiente</p>
                </div>
                <button onClick={() => { setMorDetalle(null); setModal(null); }} className="text-slate-300 hover:text-slate-500 text-xl leading-none">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-2">
              {pagos.filter(p => p.deptoId === morDetalle.deptoId && p.estado !== "pagado").length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin deudas pendientes.</p>
              )}
              {pagos.filter(p => p.deptoId === morDetalle.deptoId && p.estado !== "pagado")
                .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
                .map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-rose-50">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{p.periodoNombre}</p>
                    <div className="flex gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.tipo === "ordinario" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>{p.tipo === "ordinario" ? "Ordinaria" : "Derrama"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.estado === "parcial" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{p.estado}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-600">{fmt(p.montoTotal - p.montoPagado)}</p>
                    <p className="text-xs text-slate-400">de {fmt(p.montoTotal)}</p>
                    {p.montoPagado > 0 && <p className="text-xs text-emerald-600">pagado: {fmt(p.montoPagado)}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-4 border-t border-slate-100 pt-4 space-y-2">
              {(() => {
                const pendientes = pagos.filter(p => p.deptoId === morDetalle.deptoId && p.estado !== "pagado");
                const totalOrdinario = pendientes.filter(p => p.tipo === "ordinario").reduce((a, p) => a + (p.montoTotal - p.montoPagado), 0);
                const totalDerrama = pendientes.filter(p => p.tipo === "derrama").reduce((a, p) => a + (p.montoTotal - p.montoPagado), 0);
                const totalDeuda = totalOrdinario + totalDerrama;
                return (<>
                  {totalOrdinario > 0 && <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Cuotas ordinarias pendientes</span>
                    <span className="text-sm font-bold text-amber-600">{fmt(totalOrdinario)}</span>
                  </div>}
                  {totalDerrama > 0 && <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Derramas pendientes</span>
                    <span className="text-sm font-bold text-purple-600">{fmt(totalDerrama)}</span>
                  </div>}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-sm font-bold text-slate-700">Total adeudado</span>
                    <span className="text-base font-bold text-rose-600">{fmt(totalDeuda)}</span>
                  </div>
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal detalle ── */}
      {modal && modalData[modal] && !morDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{modalData[modal].title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{modalData[modal].desc}</p>
                </div>
                <button onClick={() => setModal(null)} className="text-slate-300 hover:text-slate-500 text-xl leading-none">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-2">
              {modalData[modal].rows.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sin registros.</p>}
              {modalData[modal].rows.slice(0, 30).map((r, i) => (
                <div key={i}
                  onClick={() => modal === "morosos" ? setMorDetalle(r) : null}
                  className={`flex items-center justify-between p-3 rounded-xl ${modalData[modal].rowColor} ${modal === "morosos" ? "cursor-pointer hover:bg-rose-200 transition" : ""}`}>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{modalData[modal].labelKey ? r[modalData[modal].labelKey] : r.depto}</p>
                    <p className="text-xs text-slate-400">{r.tipo || r.propietario || r.periodoNombre || r.cat || ""}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${r._color || modalData[modal].amountColor}`}>{fmt(modalData[modal].amount(r))}</span>
                    {modal === "morosos" && (
                      <p className="text-xs text-indigo-500 mt-0.5">Ver desglose →</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 border-t border-slate-100 pt-4 flex items-center justify-between">
              <span className="text-sm text-slate-500 font-medium">{modalData[modal].totalLabel}</span>
              <span className={`text-base font-bold ${modalData[modal].totalColor}`}>{fmt(modalData[modal].total)}</span>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => exportCSV(modalData[modal].rows, [{ key: "depto", label: "Propiedad" }, { key: "estado", label: "Estado" }], `${modal}.csv`)} className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold">⬇️ Exportar CSV</button>
              <button onClick={() => setModal(null)} className="px-4 border border-slate-200 py-2 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-xs text-slate-400">Resumen general del edificio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <select value={periodoId} onChange={e => setPeriodoId(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white shadow-sm">
            {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="flex gap-2">
            {ult3.map(p => (
              <button key={p.id} onClick={() => setPeriodoId(p.id)}
                className={`px-3 py-2 rounded-xl text-sm border shadow-sm ${Number(periodoId) === p.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Informe Financiero ── */}
      {showInforme && (
        <InformeFinanciero
          per={per}
          perAnterior={periodos[periodos.findIndex(p => p.id === per?.id) - 1] || null}
          egresos={egresos}
          pagos={pagos}
          usuarios={usuarios}
          deptos={deptos}
          onClose={() => setShowInforme(false)}
          otrosIngresos={otrosIngresos}
          appName={appName}
        />
      )}
      {/* ── Tarjetas métricas ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.l}
            onClick={() => { if (c.key === "derramas_nav") setTab("derramas"); else if (c.key === "fondo_nav") setTab("periodos"); else if (c.key) setModal(c.key); }}
            className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5 flex items-start justify-between transition-all duration-200 ${c.key ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{c.l}</p>
              <p className="text-xl lg:text-2xl font-bold text-slate-800 mt-1.5 truncate">{c.v}</p>
              {c.sub1 && <p className="text-xs text-slate-400 mt-1 leading-tight">{c.sub1}</p>}
              {c.sub2 && <p className="text-xs text-emerald-500 font-semibold leading-tight">{c.sub2}</p>}
              {c.key && !c.sub1 && !c.key.endsWith("_nav") && <p className="text-xs text-indigo-500 mt-1.5 font-medium hidden sm:block">Clic para ver detalle</p>}
              {c.key === "fondo_nav" && <p className="text-xs text-teal-600 mt-1.5 font-medium hidden sm:block">Ver detalle en Períodos →</p>}
              {c.informe && <button onClick={e => { e.stopPropagation(); setShowInforme(true); }} className="text-xs text-indigo-500 hover:underline mt-1 font-semibold">📋 Ver informe →</button>}
            </div>
            <div className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow-lg ${c.iconBg}`}>
              {c.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── Gráficos fila 1 ── */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm">Ingresos vs Egresos</h3>
          <p className="text-xs text-slate-400 mb-4">Comparativo mensual de los últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData.slice(-6)} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ingresos" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={40} />
              <Bar dataKey="egresos" fill="#e11d48" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm">Flujo de Caja</h3>
          <p className="text-xs text-slate-400 mb-4">Ingresos menos egresos por mes</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={barData.slice(-6)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Line type="monotone" dataKey="flujo" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: "#6366f1" }} name="Flujo Neto" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Gráficos fila 2 ── */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm">Cobrado vs Pendiente</h3>
          <p className="text-xs text-slate-400 mb-2">Estado de cobranza del período actual</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-1">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-500">{d.name}</span>
                <span className="font-bold text-slate-700">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Tasa de cobranza</span><span className="font-bold text-slate-700">{pct}%</span>
            </div>
            <div className="bg-slate-100 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-slate-700 text-sm">Top en Mora</h3>
              <p className="text-xs text-slate-400">Residentes con mayor deuda</p>
            </div>
            <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-2.5 py-1 rounded-full">{morososList.length} en mora</span>
          </div>
          <div className="space-y-2">
            {morososList.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">{p.depto}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{p.propietario.split(" ")[0]} {p.propietario.split(" ")[1] || ""}</p>
                  <p className="text-xs text-slate-400">{p.periodoNombre}</p>
                </div>
                <span className="text-sm font-bold text-rose-600 flex-shrink-0">{fmt(p.saldo)}</span>
              </div>
            ))}
            {morososList.length === 0 && <p className="text-sm text-slate-400 text-center py-6">🎉 Sin propietarios en mora este período</p>}
          </div>
          {morososList.length > 5 && (
            <button onClick={() => setModal("morosos")} className="w-full mt-3 text-xs text-indigo-600 font-semibold hover:underline">Ver todos ({morososList.length}) →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PERIODOS ────────────────────────────────────────────────────────────────
function Periodos({ periodos, setPeriodos, deptos, pagos, setPagos, egresos }) {
  // Calcular acumulado por período
  const periodosSorted = useMemo(() => [...periodos].sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes), [periodos]);
  const periodosConAcumulado = useMemo(() => {
    let acum = 0;
    return periodosSorted.map(pr => {
      const ing = pagos.filter(p => p.periodoId === pr.id && p.estado === "pagado").reduce((a, p) => a + p.montoPagado, 0);
      const egr = egresos.filter(e => e.mes === pr.mes && e.anio === pr.anio).reduce((a, e) => a + e.monto, 0);
      const remanente = parseFloat((ing - egr).toFixed(2));
      acum = parseFloat((acum + remanente).toFixed(2));
      return { id: pr.id, remanente, acumulado: acum };
    });
  }, [periodosSorted, pagos, egresos]);

  const [showNew, setShowNew] = useState(false);
  const [confirmCierre, setConfirmCierre] = useState(null);
  const [form, setForm] = useState({ mes: today.m, anio: today.y, presupuesto: "", metodoPeriodo: "coeficiente" });
  const totalM2 = deptos.reduce((a, d) => a + d.m2, 0);

  // Presupuesto sugerido = suma de egresos del período anterior
  const presupuestoSugerido = useMemo(() => {
    if (!periodos.length || !egresos.length) return "0";
    const perAnterior = periodos[periodos.length - 1];
    const egresosMes = egresos.filter(e => e.mes === perAnterior.mes && e.anio === perAnterior.anio);
    const total = egresosMes.reduce((a, e) => a + e.monto, 0);
    return total > 0 ? total.toFixed(2) : egresos.reduce((a, e) => a + e.monto, 0) > 0
      ? (egresos.reduce((a, e) => a + e.monto, 0) / [...new Set(egresos.map(e => `${e.mes}-${e.anio}`))].length).toFixed(2)
      : "0";
  }, [periodos, egresos]);

  const toggleEstado = async (p) => {
    if (p.estado === "abierto") {
      setConfirmCierre(p);
    } else {
      const { error } = await supabase.from('periodos').update({ estado: "abierto" }).eq('id', p.id);
      if (error) { alert("Error: " + error.message); return; }
      setPeriodos(periodos.map(x => x.id === p.id ? { ...x, estado: "abierto" } : x));
    }
  };

  const cerrarPeriodo = async () => {
    const { error } = await supabase.from('periodos').update({ estado: "cerrado" }).eq('id', confirmCierre.id);
    if (error) { alert("Error: " + error.message); return; }
    setPeriodos(periodos.map(x => x.id === confirmCierre.id ? { ...x, estado: "cerrado" } : x));
    setConfirmCierre(null);
  };

  const crear = async () => {
    if (periodos.find(p => p.mes === Number(form.mes) && p.anio === Number(form.anio))) return alert("Período ya existe");
    const np = { mes: Number(form.mes), anio: Number(form.anio), nombre: `${MESES[form.mes]} ${form.anio}`, presupuesto: Number(form.presupuesto || presupuestoSugerido), estado: "abierto", metodo_periodo: form.metodoPeriodo };
    const { data, error } = await supabase.from('periodos').insert(np).select().single();
    if (error) { alert("Error al guardar período: " + error.message); return; }
    const perAdap = { ...data, metodoPeriodo: data.metodo_periodo };
    const cuotas = deptos.map(d => {
      const monto = form.metodoPeriodo === "coeficiente" ? parseFloat((d.m2 / totalM2 * Number(form.presupuesto)).toFixed(2)) : d.alicuotaFija;
      return { tipo: "ordinario", depto_id: d.id, depto: d.depto, periodo_id: data.id, periodo_nombre: data.nombre, mes: data.mes, anio: data.anio, monto_total: monto, monto_pagado: 0, estado: "pendiente", abonos: [] };
    });
    const { data: dataCuotas } = await supabase.from('pagos').insert(cuotas).select();
    const cuotasAdap = (dataCuotas || []).map(p => ({ ...p, deptoId: p.depto_id, periodoId: p.periodo_id, periodoNombre: p.periodo_nombre, montoTotal: parseFloat(p.monto_total), montoPagado: parseFloat(p.monto_pagado), abonos: p.abonos || [] }));
    setPeriodos([...periodos, perAdap]);
    setPagos([...pagos, ...cuotasAdap]);
    setShowNew(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Períodos de Cobro</h2>
        <button onClick={() => { setForm(f => ({ ...f, presupuesto: presupuestoSugerido })); setShowNew(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Nuevo Período</button>
      </div>
      {/* Modal confirmación cierre */}
      {confirmCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h3 className="font-bold text-lg text-slate-800">Cerrar Período</h3>
              <p className="text-sm text-slate-500 mt-2">¿Estás seguro de cerrar el período <strong>{confirmCierre.nombre}</strong>? No se podrán registrar más pagos ordinarios en él.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCierre(null)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={cerrarPeriodo} className="flex-1 bg-rose-600 text-white py-2 rounded-xl text-sm font-semibold">Sí, cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Crear Período</h3>
            <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700">
              <p className="font-semibold">Total m² edificio: {totalM2} m²</p>
              <p>Ej. Depto 1A ({deptos[0]?.m2}m²): coef. {fmtPct(deptos[0]?.m2 / totalM2 * 100)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 mb-1 block">Mes</label>
                <select value={form.mes} onChange={e => setForm({ ...form, mes: Number(e.target.value) })} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Año</label>
                <input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-slate-500">Presupuesto Total ($)</label>
                <button type="button" onClick={() => setForm({ ...form, presupuesto: presupuestoSugerido })} className="text-xs text-indigo-500 hover:underline">↺ Usar sugerido ({fmt(Number(presupuestoSugerido))})</button>
              </div>
              <input type="number" value={form.presupuesto} onChange={e => setForm({ ...form, presupuesto: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder={`Sugerido: ${fmt(Number(presupuestoSugerido))}`} />
              <p className="text-xs text-slate-400 mt-1">Basado en egresos del período anterior</p>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Método</label>
              <select value={form.metodoPeriodo} onChange={e => setForm({ ...form, metodoPeriodo: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="coeficiente">Por coeficiente m²</option>
                <option value="fijo">Monto fijo</option>
              </select>
            </div>
            {form.metodoPeriodo === "coeficiente" && form.presupuesto && (
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold">Vista previa (primeras 3):</p>
                {deptos.slice(0, 3).map(d => <p key={d.id}>Depto {d.depto}: <strong>{fmt(d.m2 / totalM2 * Number(form.presupuesto))}</strong></p>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={crear} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">Crear</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {[...periodosSorted].reverse().map(p => {
          const cuotas = pagos.filter(x => x.periodoId === p.id);
          const cobrado = cuotas.filter(x => x.estado === "pagado").reduce((a, x) => a + x.montoPagado, 0);
          const total = cuotas.reduce((a, x) => a + x.montoTotal, 0);
          const pct = total > 0 ? Math.min(100, (cobrado / total * 100)).toFixed(0) : 0;
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{p.nombre}</h3>
                  <p className="text-xs text-slate-500">Presupuesto: {fmt(p.presupuesto)} · {p.metodoPeriodo === "coeficiente" ? "Por coeficiente m²" : "Monto fijo"}</p>
                </div>
                <button
                  onClick={() => toggleEstado(p)}
                  className={`self-start px-3 py-1 rounded-full text-xs font-semibold transition hover:opacity-80 ${p.estado === "abierto" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {p.estado === "abierto" ? "🟢 Abierto — clic para cerrar" : "🔒 Cerrado — clic para abrir"}
                </button>
              </div>
              {(() => {
                const egr = egresos.filter(e => e.mes === p.mes && e.anio === p.anio).reduce((a, e) => a + e.monto, 0);
                const remanente = parseFloat((cobrado - egr).toFixed(2));
                // Acumulado hasta este período
                const idx = periodosSorted.findIndex(x => x.id === p.id);
                const acumHasta = idx >= 0 && periodosConAcumulado[idx] ? periodosConAcumulado[idx].acumulado : 0;
                return (
                  <>
                    <div className="flex gap-4 text-sm flex-wrap mb-2">
                      <span className="text-emerald-600 font-semibold">Cobrado: {fmt(cobrado)}</span>
                      <span className="text-rose-500">Egresos: {fmt(egr)}</span>
                      <span className={`font-semibold ${remanente >= 0 ? "text-teal-600" : "text-rose-600"}`}>Remanente: {fmt(remanente)}</span>
                      <span className={`font-bold ${acumHasta >= 0 ? "text-teal-700" : "text-rose-700"}`}>Acumulado: {fmt(acumHasta)}</span>
                      <span className="text-amber-600">Pendiente: {fmt(total - cobrado)}</span>
                      <span className="text-slate-400">{cuotas.filter(x => x.estado === "pagado").length}/{cuotas.length} propiedades</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${pct}%` }} /></div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% cobrado</p>
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PAGOS ────────────────────────────────────────────────────────────────────
function Pagos({ pagos, setPagos, periodos, deptos, derramas, usuarios, rol, actualizarContador }) {
  const online = useConectividad();
  const [tabP, setTabP] = useState("ordinarios");
  const [modal, setModal] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [imgView, setImgView] = useState(null);
  const [editImagen, setEditImagen] = useState(null); // { id, tipo } para editar imagen de pago
  const [revertir, setRevertir] = useState(null);
  const [fOrd, setFOrd] = useState({ periodo: periodos[periodos.length - 1]?.id || 1, estado: "todos", propietario: "", propiedad: "", piso: "todos", metodo: "todos" });
  const [fDer, setFDer] = useState({ derrama: derramas[0]?.id || 1, estado: "todos", propietario: "", propiedad: "", piso: "todos", metodo: "todos" });
  const ult3Periodos = useMemo(() => {
    const arr = Array.isArray(periodos) ? [...periodos] : [];
    arr.sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
    return arr.slice(-3).reverse();
  }, [periodos]);

  const ult3Derramas = useMemo(() => {
    const arr = Array.isArray(derramas) ? [...derramas] : [];
    // Ordenar por id descendente y tomar las 3 más recientes
    arr.sort((a, b) => (b?.id || 0) - (a?.id || 0));
    return arr.slice(0, 3);
  }, [derramas]);

  const getNombre = id => usuarios.find(u => u.deptos?.includes(id))?.nombre || "-";
  const getPiso = depto => depto ? depto[0] : "";
  const ordBase = pagos.filter(p => p.periodoId === Number(fOrd.periodo) && p.tipo === "ordinario");
  const ordFiltradas = useMemo(() => ordBase.filter(p => {
    const nombre = getNombre(p.deptoId).toLowerCase();
    if (fOrd.estado !== "todos" && p.estado !== fOrd.estado) return false;
    if (fOrd.propietario && !nombre.includes(fOrd.propietario.toLowerCase())) return false;
    if (fOrd.propiedad && !p.depto.toLowerCase().includes(fOrd.propiedad.toLowerCase())) return false;
    if (fOrd.piso !== "todos" && getPiso(p.depto) !== fOrd.piso) return false;
    if (fOrd.metodo !== "todos") { const lastMetodo = p.abonos?.[p.abonos.length - 1]?.metodo; if (lastMetodo !== fOrd.metodo) return false; }
    return true;
  }), [pagos, fOrd]);
  const derActual = derramas.find(d => d.id === Number(fDer.derrama));
  const derBase = derActual ? (() => {
    // Si es individual, solo mostrar el depto específico
    const deptosTarget = derActual.distribucion === "individual" && derActual.depto_id
      ? deptos.filter(d => d.id === derActual.depto_id)
      : deptos;
    return deptosTarget.map(d => {
      const monto = derActual.distribucion === "coeficiente"
        ? parseFloat((d.coef / 100 * derActual.montoTotal).toFixed(2))
        : derActual.distribucion === "individual"
          ? derActual.montoTotal
          : parseFloat((derActual.montoTotal / deptosTarget.length).toFixed(2));
      const ex = pagos.find(p => p.tipo === "derrama" && p.deptoId === d.id && p.periodoNombre === derActual.titulo);
      if (ex) return { ...ex, montoTotal: ex.montoTotal || monto };
      return { id: `v-${d.id}-${derActual.id}`, tipo: "derrama", deptoId: d.id, depto: d.depto, periodoNombre: derActual.titulo, periodoId: periodos[periodos.length - 1]?.id, mes: derActual.mes, anio: derActual.anio, montoTotal: monto, abonos: [], montoPagado: 0, estado: "pendiente", concepto: derActual.titulo };
    });
  })() : [];
  const derFiltradas = useMemo(() => derBase.filter(p => {
    const nombre = getNombre(p.deptoId).toLowerCase();
    if (fDer.estado !== "todos" && p.estado !== fDer.estado) return false;
    if (fDer.propietario && !nombre.includes(fDer.propietario.toLowerCase())) return false;
    if (fDer.propiedad && !p.depto.toLowerCase().includes(fDer.propiedad.toLowerCase())) return false;
    if (fDer.piso !== "todos" && getPiso(p.depto) !== fDer.piso) return false;
    if (fDer.metodo !== "todos") { const lastMetodo = p.abonos?.[p.abonos.length - 1]?.metodo; if (lastMetodo !== fDer.metodo) return false; }
    return true;
  }), [pagos, fDer, derramas]);

  const registrarAbono = async (cuotaId, { monto, metodo, imagen, distribucion = [] }, isDerrama = false, cuotaVirtual = null) => {
    // Comprimir imagen siempre
    if (imagen) imagen = await comprimirImagen(imagen);
    let pagosActualizados = [...pagos];

    if (isDerrama) {
      const ex = pagosActualizados.find(p => p.tipo === "derrama" && p.deptoId === cuotaVirtual.deptoId && p.periodoNombre === cuotaVirtual.periodoNombre);
      if (ex) {
        const abonos = [...(ex.abonos || []), { id: (ex.abonos || []).length + 1, monto, fecha: todayStr(), metodo, imagen }];
        const montoPagado = parseFloat((ex.montoPagado + monto).toFixed(2));
        const estado = montoPagado >= ex.montoTotal ? "pagado" : montoPagado > 0 ? "parcial" : "pendiente";
        if (!online) {
          const lid = genLocalId();
          await guardarImagenOffline(lid, imagen);
          await encolarOperacion({ modulo:'pagos', operacion:'update', payload:{ id: ex.id, monto_pagado: montoPagado, estado, abonos }, imagenKey: imagen ? lid : null });
          await actualizarContador();
        } else {
          await supabase.from('pagos').update({ monto_pagado: montoPagado, estado, abonos }).eq('id', ex.id);
        }
        const upd = { ...ex, abonos, montoPagado, estado };
        pagosActualizados = pagosActualizados.map(p => p.id === ex.id ? upd : p);
        setPagos(pagosActualizados);
        setTimeout(() => setComprobante({ cuota: upd, abono: abonos[abonos.length - 1] }), 100);
      } else {
        const abonos = [{ id: 1, monto, fecha: todayStr(), metodo, imagen }];
        const montoPagado = monto;
        const estado = montoPagado >= cuotaVirtual.montoTotal ? "pagado" : "parcial";
        const nuevo = { tipo: "derrama", depto_id: cuotaVirtual.deptoId, depto: cuotaVirtual.depto, periodo_id: cuotaVirtual.periodoId, periodo_nombre: cuotaVirtual.periodoNombre, mes: cuotaVirtual.mes, anio: cuotaVirtual.anio, monto_total: cuotaVirtual.montoTotal, monto_pagado: montoPagado, estado, abonos, concepto: cuotaVirtual.concepto };
        let nw;
        if (!online) {
          const lid = genLocalId();
          await guardarImagenOffline(lid, imagen);
          await encolarOperacion({ modulo:'pagos', operacion:'insert', payload: nuevo, imagenKey: imagen ? lid : null });
          await actualizarContador();
          nw = { ...nuevo, id: lid, deptoId: nuevo.depto_id, periodoId: nuevo.periodo_id, periodoNombre: nuevo.periodo_nombre, montoTotal: nuevo.monto_total, montoPagado: nuevo.monto_pagado, abonos: nuevo.abonos || [] };
        } else {
          const { data } = await supabase.from('pagos').insert(nuevo).select().single();
          nw = { ...data, deptoId: data.depto_id, periodoId: data.periodo_id, periodoNombre: data.periodo_nombre, montoTotal: parseFloat(data.monto_total), montoPagado: parseFloat(data.monto_pagado), abonos: data.abonos || [] };
        }
        pagosActualizados = [...pagosActualizados, nw];
        setPagos(pagosActualizados);
        setTimeout(() => setComprobante({ cuota: nw, abono: abonos[0] }), 100);
      }
    } else {
      const pago = pagosActualizados.find(p => p.id === cuotaId);
      const abonos = [...(pago.abonos || []), { id: (pago.abonos || []).length + 1, monto, fecha: todayStr(), metodo, imagen }];
      const montoPagado = parseFloat((pago.montoPagado + monto).toFixed(2));
      const estado = montoPagado >= pago.montoTotal ? "pagado" : montoPagado > 0 ? "parcial" : "pendiente";
      if (!online) {
        const lid = genLocalId();
        await guardarImagenOffline(lid, imagen);
        await encolarOperacion({ modulo:'pagos', operacion:'update', payload:{ id: cuotaId, monto_pagado: montoPagado, estado, abonos }, imagenKey: imagen ? lid : null });
        await actualizarContador();
      } else {
        await supabase.from('pagos').update({ monto_pagado: montoPagado, estado, abonos }).eq('id', cuotaId);
      }
      const upd = { ...pago, abonos, montoPagado, estado };
      pagosActualizados = pagosActualizados.map(p => p.id === cuotaId ? upd : p);
      setTimeout(() => setComprobante({ cuota: upd, abono: abonos[abonos.length - 1] }), 100);
    }

    // ── Distribuir excedente a cuotas pendientes del mismo propietario
    if (distribucion.length > 0) {
      for (const d of distribucion) {
        const p = pagosActualizados.find(x => x.id === d.id);
        if (!p) continue;
        const abonos = [...(p.abonos || []), { id: (p.abonos || []).length + 1, monto: d.asignar, fecha: todayStr(), metodo, imagen: null }];
        const montoPagado = parseFloat((p.montoPagado + d.asignar).toFixed(2));
        const estado = montoPagado >= p.montoTotal ? "pagado" : "parcial";
        await supabase.from('pagos').update({ monto_pagado: montoPagado, estado, abonos }).eq('id', p.id);
        pagosActualizados = pagosActualizados.map(x => x.id === p.id ? { ...p, abonos, montoPagado, estado } : x);
      }
    }
    setPagos(pagosActualizados);
  };

  const [editMonto, setEditMonto] = useState(null);
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoMontoPagado, setNuevoMontoPagado] = useState("");

  const doRevertir = async id => {
    await supabase.from('pagos').update({ monto_pagado: 0, estado: "pendiente", abonos: [] }).eq('id', id);
    setPagos(pagos.map(p => p.id === id ? { ...p, abonos: [], montoPagado: 0, estado: "pendiente" } : p));
    setRevertir(null);
  };

  const guardarMonto = async () => {
    if (!nuevoMonto || isNaN(nuevoMonto)) return;
    const p = editMonto;
    if (String(p.id).startsWith('v-')) { alert("Registra primero un abono para poder editar el monto"); return; }
    const monto = parseFloat(nuevoMonto);
    const montoPag = nuevoMontoPagado !== "" && !isNaN(nuevoMontoPagado) ? parseFloat(nuevoMontoPagado) : p.montoPagado;
    const estado = montoPag >= monto ? "pagado" : montoPag > 0 ? "parcial" : "pendiente";
    await supabase.from('pagos').update({ monto_total: monto, monto_pagado: montoPag, estado }).eq('id', p.id);
    setPagos(pagos.map(x => x.id === p.id ? { ...x, montoTotal: monto, montoPagado: montoPag, estado } : x));
    setEditMonto(null);
    setNuevoMonto("");
    setNuevoMontoPagado("");
  };
  const estadoBadge = p => {
    const saldo = parseFloat((p.montoTotal - p.montoPagado).toFixed(2));
    if (p.estado === "pagado") return <button onClick={() => rol !== "lectura" && setRevertir(p.id)} className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ${rol !== "lectura" ? "hover:bg-rose-100 hover:text-rose-700 transition" : ""}`}>✅ Pagado{rol !== "lectura" ? " ✎" : ""}</button>;
    if (p.estado === "parcial") return <button onClick={() => setModal(p)} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition">💧 Parcial · {fmt(saldo)}</button>;
    return <button onClick={() => setModal(p)} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition">⏳ Pendiente →</button>;
  };

  // Modal editar monto
  const modalEditMonto = editMonto && (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="font-bold text-lg">✏️ Editar montos</h3>
        <p className="text-sm text-slate-500">Propiedad <strong>{editMonto.depto}</strong> — {getNombre(editMonto.deptoId)}</p>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Monto total (cuota)</label>
          <input type="number" value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)}
            placeholder="Monto total..." className="w-full border rounded-xl px-3 py-2 text-sm" autoFocus />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Monto pagado</label>
          <input type="number" value={nuevoMontoPagado} onChange={e => setNuevoMontoPagado(e.target.value)}
            placeholder={`Actual: ${fmt(editMonto.montoPagado)}`} className="w-full border rounded-xl px-3 py-2 text-sm" />
          <p className="text-xs text-slate-400 mt-1">Deja vacío para mantener el valor actual</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditMonto(null); setNuevoMonto(""); setNuevoMontoPagado(""); }} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
          <button onClick={guardarMonto} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">💾 Guardar</button>
        </div>
      </div>
    </div>
  );
  const pisos = [...new Set(deptos.map(d => d.piso))].sort();
  const ordFilterConfig = [
    { key: "estado", label: "Estado", type: "select", options: [{ value: "pagado", label: "✅ Pagado" }, { value: "parcial", label: "💧 Parcial" }, { value: "pendiente", label: "⏳ Pendiente" }] },
    { key: "propietario", label: "Propietario", type: "text", placeholder: "Buscar nombre..." },
    { key: "propiedad", label: "Propiedad", type: "text", placeholder: "Ej: 2A, 3B..." },
    { key: "piso", label: "Piso", type: "select", options: pisos.map(p => ({ value: String(p), label: `Piso ${p}` })) },
    { key: "metodo", label: "Último método", type: "select", options: [{ value: "Transferencia", label: "Transferencia" }, { value: "Efectivo", label: "Efectivo" }, { value: "Tarjeta", label: "Tarjeta" }, { value: "Cheque", label: "Cheque" }] },
  ];
  const derFilterConfig = [...ordFilterConfig];
  const clearOrd = () => setFOrd({ periodo: fOrd.periodo, estado: "todos", propietario: "", propiedad: "", piso: "todos", metodo: "todos" });
  const clearDer = () => setFDer({ derrama: fDer.derrama, estado: "todos", propietario: "", propiedad: "", piso: "todos", metodo: "todos" });
  const lista = tabP === "ordinarios" ? ordFiltradas : derFiltradas;
  const listaBase = tabP === "ordinarios" ? ordBase : derBase;
  return (
    <div className="space-y-4">
      {modalEditMonto}
      {comprobante && <Comprobante cuota={comprobante.cuota} abono={comprobante.abono} depto={usuarios.find(u => u.deptos?.includes(comprobante.cuota.deptoId))} onClose={() => setComprobante(null)} />}
      {/* ── Modal ver imagen ── */}
      {imgView && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[999] p-4" onClick={() => setImgView(null)}>
          <div className="relative max-w-lg w-full">
            <button onClick={() => setImgView(null)} className="absolute -top-8 right-0 text-white text-2xl hover:text-slate-300">✕</button>
            <img src={imgView} alt="soporte" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}
      {/* ── Modal editar imagen pago ── */}
      {editImagen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">📷 Editar imagen soporte</h3>
            <label htmlFor="edit-img-input" className="block border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-indigo-300 transition-colors">
              {editImagen.preview
                ? <img src={editImagen.preview} alt="soporte" className="max-h-32 mx-auto rounded-lg object-contain" />
                : <div className="text-slate-400 text-sm py-4">📎 Seleccionar nueva imagen</div>}
            </label>
            <input id="edit-img-input" type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files[0]; if (!f) return;
              const r = new FileReader(); r.onload = ev => setEditImagen({ ...editImagen, preview: ev.target.result }); r.readAsDataURL(f);
            }} />
            {editImagen.preview && <button onClick={() => setEditImagen({ ...editImagen, preview: null })} className="text-xs text-rose-500 hover:underline">✕ Quitar imagen</button>}
            <div className="flex gap-2">
              <button onClick={() => setEditImagen(null)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={async () => {
                const pago = pagos.find(p => p.id === editImagen.id);
                if (!pago) return;
                const abonos = (pago.abonos || []).map((a, i) => i === pago.abonos.length - 1 ? { ...a, imagen: editImagen.preview } : a);
                await supabase.from('pagos').update({ abonos }).eq('id', editImagen.id);
                setPagos(pagos.map(p => p.id === editImagen.id ? { ...p, abonos } : p));
                setEditImagen(null);
              }} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">💾 Guardar</button>
            </div>
          </div>
        </div>
      )}
      {modal && <ModalPago cuota={modal} onClose={() => setModal(null)}
        pagosDeuda={modal.deptoId ? pagos.filter(p => p.deptoId === modal.deptoId && p.id !== modal.id && p.estado !== "pagado").sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes)) : []}
        onConfirm={data => { if (modal.tipo === "derrama") registrarAbono(null, data, true, modal); else registrarAbono(modal.id, data); }} />}
      {revertir && <Confirm msg="¿Revertir este pago? Se eliminarán todos los abonos." onYes={() => doRevertir(revertir)} onNo={() => setRevertir(null)} />}
      <h2 className="text-2xl font-bold text-slate-800">Gestión de Pagos</h2>
      <div className="flex gap-2 border-b border-slate-200">
        {[["ordinarios", "Alícuotas Ordinarias"], ["derramas", "Derramas"]].map(([k, l]) => (
          <button key={k} onClick={() => setTabP(k)} className={`pb-2 px-1 text-sm font-semibold border-b-2 transition ${tabP === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-3">
        {tabP === "ordinarios" ? (
          <div className="flex flex-wrap items-center gap-2">
            <select value={fOrd.periodo} onChange={e => setFOrd({ ...fOrd, periodo: Number(e.target.value) })} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
              {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {ult3Periodos.map(p => (
              <button key={p.id} onClick={() => setFOrd({ ...fOrd, periodo: p.id })}
                className={`px-3 py-2 rounded-xl text-sm border shadow-sm ${Number(fOrd.periodo) === p.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
                {p.nombre}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={fDer.derrama} onChange={e => setFDer({ ...fDer, derrama: Number(e.target.value) })} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
              {derramas.map(d => <option key={d.id} value={d.id}>{d.titulo}</option>)}
            </select>
            {ult3Derramas.map(d => (
              <button key={d.id} onClick={() => setFDer({ ...fDer, derrama: d.id })}
                className={`px-3 py-2 rounded-xl text-sm border shadow-sm ${Number(fDer.derrama) === d.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
                {d.titulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <FilterBar filters={tabP === "ordinarios" ? fOrd : fDer} setFilters={tabP === "ordinarios" ? setFOrd : setFDer} config={tabP === "ordinarios" ? ordFilterConfig : derFilterConfig} onClear={tabP === "ordinarios" ? clearOrd : clearDer} />
      <ResultCount total={listaBase.length} filtered={lista.length} onExport={() => exportCSV(lista, [{ key: "depto", label: "Propiedad" }, { key: "estado", label: "Estado" }, { key: "montoTotal", label: "Total" }, { key: "montoPagado", label: "Pagado" }], "pagos.csv")} />
      <div className="grid grid-cols-3 gap-3">
        {[["✅ Pagados", lista.filter(p => p.estado === "pagado").length, "text-emerald-600 bg-emerald-50"],
          ["💧 Parciales", lista.filter(p => p.estado === "parcial").length, "text-blue-600 bg-blue-50"],
          ["⏳ Pendientes", lista.filter(p => p.estado === "pendiente").length, "text-amber-600 bg-amber-50"]
        ].map(([l, v, cls]) => (
          <div key={l} className={`rounded-xl p-3 text-center text-sm font-semibold ${cls}`}>{l}<div className="text-2xl font-bold">{v}</div></div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 text-left">Propiedad</th>
              <th className="px-3 py-3 text-left hidden md:table-cell">Propietario</th>
              <th className="px-3 py-3 text-left hidden lg:table-cell">Piso</th>
              <th className="px-3 py-3 text-right hidden md:table-cell">Total</th>
              <th className="px-3 py-3 text-right hidden md:table-cell">Pagado</th>
              <th className="px-3 py-3 text-right hidden md:table-cell text-amber-600">Saldo</th>
              <th className="px-3 py-3 text-center">Estado</th>
              <th className="px-3 py-3 text-center">📷</th>
              <th className="px-3 py-3 text-center">🧾</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(p => {
              const lastAbono = p.abonos?.[p.abonos.length - 1] || (p.estado === "pagado" || p.estado === "parcial" ? { id: p.id, monto: p.montoPagado, fecha: "-", metodo: "-" } : null);
              return (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-bold text-indigo-700">{p.depto}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-slate-500 text-xs">{getNombre(p.deptoId)}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-slate-400 text-xs">Piso {p.depto?.[0]}</td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell font-semibold">
                    {fmt(p.montoTotal)}
                    {rol !== "lectura" && <button onClick={() => { setEditMonto(p); setNuevoMonto(String(p.montoTotal)); setNuevoMontoPagado(String(p.montoPagado)); }} className="ml-1 text-slate-300 hover:text-indigo-500 transition-colors text-xs" title="Editar montos">✏️</button>}
                  </td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell text-emerald-600">
                    {fmt(p.montoPagado)}
                    {rol !== "lectura" && <button onClick={() => { setEditMonto(p); setNuevoMonto(String(p.montoTotal)); setNuevoMontoPagado(String(p.montoPagado)); }} className="ml-1 text-slate-300 hover:text-emerald-500 transition-colors text-xs" title="Editar monto pagado">✏️</button>}
                  </td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell text-amber-600 font-semibold">{p.estado !== "pagado" ? fmt(p.montoTotal - p.montoPagado) : "-"}</td>
                  <td className="px-3 py-2.5 text-center">{estadoBadge(p)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {lastAbono?.imagen && (
                      <span className="flex items-center justify-center gap-1">
                        <button onClick={() => setImgView(lastAbono.imagen)} title="Ver soporte" className="text-slate-500 hover:text-slate-800 hover:scale-125 transition-transform cursor-pointer text-lg">📷</button>
                        {rol !== "lectura" && <button onClick={() => setEditImagen({ id: p.id, preview: lastAbono.imagen })} title="Editar imagen" className="text-xs text-slate-300 hover:text-indigo-500 transition">✏️</button>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">{lastAbono ? <button onClick={() => setComprobante({ cuota: p, abono: lastAbono })} title="Ver comprobante" className="text-indigo-400 hover:text-indigo-600 hover:scale-125 transition-transform cursor-pointer text-lg">🧾</button> : <span className="text-slate-300 text-lg cursor-not-allowed" title="Sin pagos registrados">🧾</span>}</td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No se encontraron registros con los filtros aplicados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ImageViewer({ src, onClose }) {
  const [zoom, setZoom] = useState(1);
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full p-3" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-slate-700">Soporte</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="px-3 py-1 rounded-lg border border-slate-200 text-sm">−</button>
            <button onClick={() => setZoom(1)} className="px-3 py-1 rounded-lg border border-slate-200 text-sm">Reset</button>
            <button onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} className="px-3 py-1 rounded-lg border border-slate-200 text-sm">+</button>
            <button onClick={onClose} className="px-3 py-1 rounded-lg bg-slate-900 text-white text-sm">Cerrar</button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
          <img src={src} alt="Soporte" style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }} className="max-w-full h-auto block" />
        </div>
      </div>
    </div>
  );
}

// ─── PROPIEDADES ──────────────────────────────────────────────────────────────
function Propiedades({ deptos, setDeptos, pagos, periodos, usuarios, rol }) {
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(false);
  const [ed, setEd] = useState({});
  const [filters, setFilters] = useState({ propietario: "", propiedad: "", piso: "todos", estado: "todos", tipo: "todos" });
    const [showNew, setShowNew] = useState(false);
  const [nuevo, setNuevo] = useState({ depto: "", piso: "", m2: "", tipo: "departamento", alicuotaFija: "", metodoCalculo: "coeficiente" });
const perActual = periodos[periodos.length - 1];
  const getEst = d => { const c = pagos.find(p => p.deptoId === d.id && p.periodoId === perActual?.id && p.tipo === "ordinario"); return c?.estado === "pagado" ? "pagado" : c?.estado === "parcial" ? "parcial" : "pendiente"; };
  const getOwner = id => usuarios.find(u => u.rol === "prop" && u.deptos?.includes(id));
  const pisos = [...new Set(deptos.map(d => d.piso))].sort();
  const filtradas = useMemo(() => deptos.filter(d => {
    const owner = getOwner(d.id); const nombre = owner?.nombre || "";
    if (filters.propietario && !nombre.toLowerCase().includes(filters.propietario.toLowerCase())) return false;
    if (filters.propiedad && !d.depto.toLowerCase().includes(filters.propiedad.toLowerCase())) return false;
    if (filters.piso !== "todos" && String(d.piso) !== filters.piso) return false;
    if (filters.estado !== "todos" && getEst(d) !== filters.estado) return false;
    if (filters.tipo !== "todos" && (d.tipo || "departamento") !== filters.tipo) return false;
    return true;
  }), [deptos, filters, pagos]);
  const filterConfig = [
    { key: "propietario", label: "Propietario", type: "text", placeholder: "Buscar nombre..." },
    { key: "propiedad", label: "Propiedad", type: "text", placeholder: "Ej: 2A, 3B..." },
    { key: "piso", label: "Piso", type: "select", options: pisos.map(p => ({ value: String(p), label: `Piso ${p}` })) },
    { key: "estado", label: "Estado", type: "select", options: [{ value: "pagado", label: "✅ Al día" }, { value: "parcial", label: "💧 Parcial" }, { value: "pendiente", label: "⚠️ En mora" }] },
    { key: "tipo", label: "Tipo", type: "select", options: [{ value: "departamento", label: "🏢 Departamento" }, { value: "casa", label: "🏠 Casa" }, { value: "local", label: "🏪 Local" }] },
  ];
  
  const crearNuevo = async () => {
    if (rol !== "admin") return;
    if (!nuevo.depto || !nuevo.m2) { alert("Completa al menos Departamento y m²."); return; }
    const nuevoM2 = Number(nuevo.m2);
    if (!Number.isFinite(nuevoM2) || nuevoM2 <= 0) { alert("m² inválidos."); return; }

    // 1) Insertar primero con coef provisional; luego recalculamos todos.
    const provisional = {
      depto: nuevo.depto,
      piso: Number(nuevo.piso || 0),
      m2: nuevoM2,
      coef: 0,
      tipo: nuevo.tipo || "departamento",
      alicuota_fija: Number(nuevo.alicuotaFija || 0),
      metodo_calculo: nuevo.metodoCalculo || "coeficiente",
    };
    const { data: inserted, error: insErr } = await supabase.from('deptos').insert(provisional).select().single();
    if (insErr) { alert("Error al crear propiedad: " + insErr.message); return; }

    const all = [...deptos, { ...inserted, alicuotaFija: inserted.alicuota_fija, metodoCalculo: inserted.metodo_calculo }];
    const totalM2 = all.reduce((a, d) => a + Number(d.m2 || 0), 0);
    const withCoef = all.map(d => {
      const coef = totalM2 > 0 ? parseFloat(((Number(d.m2) / totalM2) * 100).toFixed(4)) : 0;
      return { ...d, coef };
    });

    // Persistir coeficientes recalculados
    await Promise.all(withCoef.map(d => supabase.from('deptos').update({ coef: d.coef }).eq('id', d.id)));

    setDeptos(withCoef.map(d => ({ ...d, alicuotaFija: d.alicuotaFija ?? d.alicuota_fija, metodoCalculo: d.metodoCalculo ?? d.metodo_calculo })));
    setShowNew(false);
    setNuevo({ depto: "", piso: "", m2: "", tipo: "departamento", alicuotaFija: "", metodoCalculo: "coeficiente" });
  };
const guardar = async () => {
    const totalM2 = deptos.reduce((a, d) => d.id === sel.id ? a + Number(ed.m2) : a + d.m2, 0);
    const coef = parseFloat((Number(ed.m2) / totalM2 * 100).toFixed(4));
    const payload = {
      depto: ed.depto,
      piso: Number(ed.piso),
      m2: Number(ed.m2),
      coef,
      tipo: ed.tipo || "departamento",
      alicuota_fija: Number(ed.alicuotaFija),
      metodo_calculo: ed.metodoCalculo,
    };
    const { error } = await supabase.from('deptos').update(payload).eq('id', sel.id);
    if (error) { alert("Error al guardar: " + error.message); return; }
    const updated = { ...sel, ...ed, m2: Number(ed.m2), coef };
    setDeptos(deptos.map(d => d.id === sel.id ? updated : d));
    setSel(updated);
    setEdit(false);
  };
  const estColor = e => e === "pagado" ? "text-emerald-600" : e === "parcial" ? "text-blue-500" : "text-rose-500";
  const estIcon = e => e === "pagado" ? "✅" : e === "parcial" ? "💧" : "⚠️";
  const estLabel = e => e === "pagado" ? "Al día" : e === "parcial" ? "Parcial" : "En mora";
  if (sel) return (
    <div className="space-y-4">
      <button onClick={() => { setSel(null); setEdit(false); }} className="text-indigo-600 text-sm font-semibold hover:underline">← Volver</button>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex justify-between flex-wrap gap-2">
          <div className="flex gap-3 items-center">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-2xl font-bold text-indigo-700">{sel.depto}</div>
            <div><h3 className="text-xl font-bold text-slate-800">Propiedad {sel.depto}</h3><p className="text-slate-500 text-sm">Piso {sel.piso} · {sel.m2} m² · Coef. {fmtPct(sel.coef)}</p></div>
          </div>
          {rol !== "lectura" && <button onClick={() => { setEdit(!edit); setEd({ depto: sel.depto, piso: sel.piso, m2: sel.m2, tipo: sel.tipo || "departamento", alicuotaFija: sel.alicuotaFija, metodoCalculo: sel.metodoCalculo }); }} className="self-start text-sm border border-indigo-200 px-3 py-1.5 rounded-xl text-indigo-600 hover:bg-indigo-50">✏️ Editar</button>}
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1 font-semibold">Propietario(s):</p>
          {usuarios.filter(u => u.rol === "prop" && u.deptos?.includes(sel.id)).map(u => (
            <div key={u.id} className="flex gap-3 items-center bg-slate-50 rounded-xl px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">{u.nombre}</span>
              <span className="text-slate-400 text-xs">{u.email}</span>
              {u.deptos.length > 1 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{u.deptos.length} propiedades</span>}
            </div>
          ))}
        </div>
        {edit && (
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-xs text-slate-500 mb-1 block">Nombre / Código</label>
              <input value={ed.depto} onChange={e => setEd({ ...ed, depto: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Ej: 1A, 2B..." />
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Piso</label>
              <input type="number" value={ed.piso} onChange={e => setEd({ ...ed, piso: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Tipo</label>
              <select value={ed.tipo || "departamento"} onChange={e => setEd({ ...ed, tipo: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="departamento">🏢 Departamento</option>
                <option value="casa">🏠 Casa</option>
                <option value="local">🏪 Local</option>
              </select>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">m²</label>
              <input type="number" value={ed.m2} onChange={e => setEd({ ...ed, m2: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Alícuota fija ($)</label>
              <input type="number" value={ed.alicuotaFija} onChange={e => setEd({ ...ed, alicuotaFija: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Método de cálculo</label>
              <select value={ed.metodoCalculo} onChange={e => setEd({ ...ed, metodoCalculo: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="coeficiente">Por coeficiente</option>
                <option value="fijo">Monto fijo</option>
              </select>
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button onClick={() => setEdit(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={guardar} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">💾 Guardar cambios</button>
            </div>
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-left">Período</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Pagado</th><th className="px-3 py-2 text-center">Estado</th></tr></thead>
          <tbody>{pagos.filter(p => p.deptoId === sel.id).sort((a, b) => b.anio - a.anio || b.mes - a.mes).map(p => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{p.periodoNombre}</td>
              <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${p.tipo === "ordinario" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>{p.tipo === "ordinario" ? "Ordinaria" : "Derrama"}</span></td>
              <td className="px-3 py-2 text-right">{fmt(p.montoTotal)}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{fmt(p.montoPagado)}</td>
              <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${p.estado === "pagado" ? "bg-emerald-100 text-emerald-700" : p.estado === "parcial" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{p.estado}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold text-slate-800">Propiedades</h2>{rol !== "lectura" && <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm shadow-sm hover:bg-indigo-700">+ Nueva Propiedad</button>}</div>
      
      {showNew && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Nueva Propiedad</h3>
        <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-700">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Propiedad (depto)</label>
          <input value={nuevo.depto} onChange={e => setNuevo({ ...nuevo, depto: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Ej: 2A, 3B, Local 1" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Piso</label>
          <input value={nuevo.piso} onChange={e => setNuevo({ ...nuevo, piso: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Ej: 2" />
        </div>
        <div>
          <label className="text-xs text-slate-500">m²</label>
          <input value={nuevo.m2} onChange={e => setNuevo({ ...nuevo, m2: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Ej: 85" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Tipo</label>
          <select value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="departamento">🏢 Departamento</option>
            <option value="casa">🏠 Casa</option>
            <option value="local">🏪 Local</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Método cálculo</label>
          <select value={nuevo.metodoCalculo} onChange={e => setNuevo({ ...nuevo, metodoCalculo: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="coeficiente">Coeficiente</option>
            <option value="fijo">Fijo</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Alícuota fija (si aplica)</label>
          <input value={nuevo.alicuotaFija} onChange={e => setNuevo({ ...nuevo, alicuotaFija: e.target.value })}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Ej: 45.00" />
          <p className="text-[11px] text-slate-400 mt-1">Si el método es “Fijo”, este valor se usa para cuotas ordinarias.</p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
        <button onClick={crearNuevo} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">Guardar</button>
      </div>
    </div>
  </div>
)}

<FilterBar filters={filters} setFilters={setFilters} config={filterConfig} onClear={() => setFilters({ propietario: "", propiedad: "", piso: "todos", estado: "todos", tipo: "todos" })} />
      <ResultCount total={deptos.length} filtered={filtradas.length} onExport={() => exportCSV(filtradas.map(d => ({ ...d, propietario: getOwner(d.id)?.nombre || "-", estado: estLabel(getEst(d)) })), [{ key: "depto", label: "Propiedad" }, { key: "piso", label: "Piso" }, { key: "m2", label: "m²" }, { key: "coef", label: "Coef%" }, { key: "propietario", label: "Propietario" }, { key: "estado", label: "Estado" }], "propiedades.csv")} />
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {filtradas.map(d => {
          const est = getEst(d); const owner = getOwner(d.id);
          return (
            <div key={d.id} onClick={() => setSel(d)} className="bg-white border border-slate-200 rounded-2xl p-3 cursor-pointer hover:border-indigo-300 hover:shadow-md transition">
              <div className="text-xl font-bold text-indigo-600">{d.depto}</div>
              <div className="text-xs text-slate-400">{d.tipo === "casa" ? "🏠" : d.tipo === "local" ? "🏪" : "🏢"} {d.m2}m²</div>
              <div className="text-xs text-slate-500 truncate">{owner?.nombre?.split(" ")[0] || "—"}</div>
              <div className={`text-xs mt-1 font-semibold ${estColor(est)}`}>{estIcon(est)} {estLabel(est)}</div>
            </div>
          );
        })}
        {filtradas.length === 0 && <div className="col-span-6 text-center text-slate-400 py-10">No se encontraron propiedades con los filtros aplicados</div>}
      </div>
    </div>
  );
}

// ─── DERRAMAS ────────────────────────────────────────────────────────────────
function Derramas({ derramas, setDerramas, deptos, rol, canDelete = false, usuarios = [], periodos = [], pagos = [], setPagos, actualizarContador }) {
  const online = useConectividad();
  const [confirmDerrama, setConfirmDerrama] = useState(null);
  const [toast, setToast] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ titulo: "", descripcion: "", montoTotal: "", distribucion: "igual", mes: today.m, anio: today.y, deptoId: "" });

  const abrir = (d = null) => {
    if (d) {
      setEditId(d.id);
      setForm({ titulo: d.titulo, descripcion: d.descripcion || "", montoTotal: String(d.montoTotal), distribucion: d.distribucion, mes: d.mes, anio: d.anio, deptoId: d.depto_id ? String(d.depto_id) : "" });
    } else {
      setEditId(null);
      setForm({ titulo: "", descripcion: "", montoTotal: "", distribucion: "igual", mes: today.m, anio: today.y, deptoId: "" });
    }
    setShowNew(true);
  };

  const guardar = async () => {
    if (!form.titulo || !form.montoTotal) return;
    if (form.distribucion === "individual" && !form.deptoId) return alert("Selecciona una propiedad");
    const payload = { titulo: form.titulo, descripcion: form.descripcion, monto_total: Number(form.montoTotal), mes: Number(form.mes), anio: Number(form.anio), distribucion: form.distribucion, depto_id: form.distribucion === "individual" ? Number(form.deptoId) : null };

    if (editId) {
      if (!online) {
        await encolarOperacion({ modulo:'derramas', operacion:'update', payload:{ id: editId, ...payload }, imagenKey: null });
        await actualizarContador();
        setDerramas(derramas.map(d => d.id === editId ? { ...d, ...payload, montoTotal: Number(form.montoTotal) } : d));
        setShowNew(false); return;
      }
      const { error } = await supabase.from('derramas').update(payload).eq('id', editId);
      if (error) { alert("Error al actualizar: " + error.message); return; }
      // Recalcular pagos asociados a esta derrama
      const totalM2 = deptos.reduce((a, d) => a + (Number(d.m2) || 0), 0);
      const { data: pagosDerramas } = await supabase.from('pagos').select('*').eq('periodo_id', editId).not('periodo_id', 'is', null);
      if (pagosDerramas?.length) {
        for (const p of pagosDerramas) {
          const depto = deptos.find(d => d.id === p.depto_id);
          if (!depto) continue;
          let nuevoMonto = Number(form.montoTotal);
          if (form.distribucion === "igual") nuevoMonto = parseFloat((Number(form.montoTotal) / deptos.length).toFixed(2));
          else if (form.distribucion === "coeficiente") nuevoMonto = parseFloat((Number(depto.m2) / totalM2 * Number(form.montoTotal)).toFixed(2));
          await supabase.from('pagos').update({ monto_total: nuevoMonto }).eq('id', p.id);
        }
      }
      setDerramas(derramas.map(d => d.id === editId ? { ...d, ...payload, montoTotal: Number(form.montoTotal) } : d));
    } else {
      const nueva = { ...payload, fecha: todayStr(), estado: "activa" };
      if (!online) {
        const lid = genLocalId();
        await encolarOperacion({ modulo:'derramas', operacion:'insert', payload: nueva, imagenKey: null });
        await actualizarContador();
        setDerramas([...derramas, { ...nueva, id: lid, montoTotal: Number(form.montoTotal) }]);
        setShowNew(false); return;
      }
      const { data, error } = await supabase.from('derramas').insert(nueva).select().single();
      if (error) { alert("Error al guardar derrama: " + error.message); return; }
      setDerramas([...derramas, { ...data, montoTotal: parseFloat(data.monto_total) }]);

      // ── Opción A: generar pagos automáticamente al crear derrama
      const totalM2 = deptos.reduce((a, d) => a + (Number(d.m2) || 0), 0);
      const ultimoPeriodo = periodos[periodos.length - 1];
      const deptosTarget = payload.distribucion === "individual" && payload.depto_id
        ? deptos.filter(d => d.id === payload.depto_id)
        : deptos;

      const nuevosPagos = [];
      for (const d of deptosTarget) {
        let monto = Number(payload.monto_total);
        if (payload.distribucion === "igual") monto = parseFloat((Number(payload.monto_total) / deptos.length).toFixed(2));
        else if (payload.distribucion === "coeficiente") monto = parseFloat((Number(d.m2) / totalM2 * Number(payload.monto_total)).toFixed(2));
        const nuevoPago = {
          tipo: "derrama",
          depto_id: d.id,
          depto: d.depto,
          periodo_id: ultimoPeriodo?.id || null,
          periodo_nombre: data.titulo,
          mes: Number(payload.mes),
          anio: Number(payload.anio),
          monto_total: monto,
          monto_pagado: 0,
          estado: "pendiente",
          abonos: []
        };
        nuevosPagos.push(nuevoPago);
      }
      if (nuevosPagos.length > 0) {
        const pagosNullPeriodo = nuevosPagos.map(p => ({ ...p, periodo_id: null }));
        const { data: pagosCreados, error: errorPagos } = await supabase.from('pagos').insert(pagosNullPeriodo).select();
        if (errorPagos) { alert("Error al crear pagos de derrama: " + errorPagos.message); return; }
        const adaptados = pagosCreados.map(p => ({ ...p, deptoId: p.depto_id, periodoId: null, periodoNombre: p.periodo_nombre, montoTotal: parseFloat(p.monto_total), montoPagado: parseFloat(p.monto_pagado), abonos: p.abonos || [] }));
        setPagos(prev => [...prev, ...adaptados]);
      }
    }
    setShowNew(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Derramas Extraordinarias</h2>
        {rol !== "lectura" && <button onClick={() => abrir()} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700">+ Nueva Derrama</button>}
      </div>
      {showNew && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">{editId ? "✏️ Editar Derrama" : "Nueva Derrama"}</h3>
            <div><label className="text-xs text-slate-500 mb-1 block">Título</label><input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Descripción</label><input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Monto Total ($)</label><input type="number" value={form.montoTotal} onChange={e => setForm({ ...form, montoTotal: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 mb-1 block">Mes</label>
                <select value={form.mes} onChange={e => setForm({ ...form, mes: Number(e.target.value) })} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Año</label><input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Distribución</label>
              <select value={form.distribucion} onChange={e => setForm({ ...form, distribucion: e.target.value, deptoId: "" })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="igual">Partes iguales</option>
                <option value="coeficiente">Por coeficiente m²</option>
                <option value="individual">Propietario específico</option>
              </select>
            </div>
            {form.distribucion === "individual" && (
              <div><label className="text-xs text-slate-500 mb-1 block">Propietario / Propiedad</label>
                <select value={form.deptoId} onChange={e => setForm({ ...form, deptoId: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                  <option value="">— Seleccionar —</option>
                  {deptos.map(d => {
                    const owner = usuarios?.find(u => u.rol === "prop" && u.deptos?.includes(d.id));
                    return <option key={d.id} value={d.id}>{d.depto}{owner ? ` — ${owner.nombre}` : ""}</option>;
                  })}
                </select>
              </div>
            )}
            {editId && <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">⚠️ Al guardar se recalcularán los montos de los pagos asociados según la distribución.</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={guardar} className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-semibold">{editId ? "💾 Guardar" : "Crear"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <ToastOffline mensaje={toast} onClose={() => setToast(null)} />}
      {confirmDerrama && (
        <ModalConfirm
          mensaje={`¿Eliminar la derrama "${confirmDerrama.titulo}"? También se eliminarán los pagos asociados.`}
          onCancel={() => setConfirmDerrama(null)}
          onOk={async () => {
            const { id, titulo } = confirmDerrama;
            setConfirmDerrama(null);
            // Optimistic: remove from UI immediately
            setDerramas(prev => prev.filter(x => x.id !== id));
            setPagos(prev => prev.filter(p => !(p.tipo === 'derrama' && p.periodoNombre === titulo)));
            if (!online) {
              await encolarOperacion({ modulo: 'derramas', operacion: 'delete', payload: { id, titulo }, imagenKey: null });
              await actualizarContador();
              setToast("Eliminado — se aplicará al restablecer la conexión");
              return;
            }
            await supabase.from('pagos').delete().eq('periodo_nombre', titulo).eq('tipo', 'derrama');
            const { error } = await supabase.from('derramas').delete().eq('id', id);
            if (error) { alert("Error al eliminar: " + error.message); }
          }}
        />
      )}
      <div className="space-y-3">
        {derramas.map(d => (
          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800">{d.titulo}</h3>
                <p className="text-xs text-slate-500">{d.descripcion} · {d.fecha}</p>
                <p className="text-xs text-slate-500 mt-0.5">Distribución: <strong>{d.distribucion === "igual" ? "Partes iguales" : d.distribucion === "individual" ? "🏠 Propietario específico" : "Por m²"}</strong></p>
              </div>
              <div className="flex flex-col items-end gap-1 min-w-[100px]">
                <p className="text-xl font-bold text-rose-600">{fmt(d.montoTotal)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.estado === "activa" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{d.estado === "activa" ? "🔔 Activa" : "✅ Cerrada"}</span>
                <div className="flex gap-3 mt-1">
                  {rol !== "lectura" && <button onClick={() => abrir(d)} className="text-xs text-slate-400 hover:text-purple-600 transition">✏️ Editar</button>}
                  {canDelete && <button onClick={() => setConfirmDerrama({ id: d.id, titulo: d.titulo })} className="text-xs text-slate-400 hover:text-rose-600 transition">🗑 Eliminar</button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── OTROS INGRESOS ──────────────────────────────────────────────────────────
function OtrosIngresos({ otrosIngresos, setOtrosIngresos, usuarios, rol, periodos = [], canDelete = false, actualizarContador }) {
  const online = useConectividad();
  const [confirmEl, setConfirmEl] = useState(null);
  const [toast, setToast] = useState(null);
  const CATS_OI = ["Arriendo Local", "Arriendo Parqueadero", "Otro"];
  const lastPer = periodos[periodos.length - 1];
  const [filters, setFilters] = useState({ mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y, cat: "todos", pagador: "" });
  const [perSelected, setPerSelected] = useState(lastPer?.id ?? null);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [imgView, setImgView] = useState(null);
  const emptyForm = { concepto: "", cat: "Arriendo Local", monto: "", pagador_nombre: "", pagador_tipo: "externo", pagador_id: null, detalle: "", periodoId: lastPer?.id ?? null, mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y, soporte: null };
  const [form, setForm] = useState(emptyForm);
  const ult3Periodos = useMemo(() => [...periodos].sort((a,b) => a.anio !== b.anio ? a.anio-b.anio : a.mes-b.mes).slice(-3).reverse(), [periodos]);

  const filterConfig = [
    { key: "mes", label: "Mes", type: "select", options: MESES.map((m, i) => ({ value: String(i), label: m })) },
    { key: "anio", label: "Año", type: "select", options: [{ value: "2025", label: "2025" }, { value: "2026", label: "2026" }] },
    { key: "cat", label: "Categoría", type: "select", options: CATS_OI.map(c => ({ value: c, label: c })) },
    { key: "pagador", label: "Pagador", type: "text", placeholder: "Buscar nombre..." },
  ];

  const filtrados = useMemo(() => otrosIngresos.filter(i => {
    if (filters.mes !== "todos" && i.mes !== Number(filters.mes)) return false;
    if (filters.anio !== "todos" && i.anio !== Number(filters.anio)) return false;
    if (filters.cat !== "todos" && i.cat !== filters.cat) return false;
    if (filters.pagador && !i.pagador_nombre?.toLowerCase().includes(filters.pagador.toLowerCase())) return false;
    return true;
  }), [otrosIngresos, filters]);

  const total = filtrados.reduce((a, i) => a + i.monto, 0);

  const abrirOI = (i = null) => {
    if (i) {
      setEditId(i.id);
      const per = periodos.find(p => p.mes === i.mes && p.anio === i.anio);
      setForm({ concepto: i.concepto, cat: i.cat || i.categoria, monto: String(i.monto), pagador_nombre: i.pagador_nombre, pagador_tipo: i.pagador_tipo || "externo", pagador_id: i.pagador_id || null, detalle: i.detalle || "", periodoId: per?.id ?? null, mes: i.mes, anio: i.anio, soporte: i.soporte || null });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setShowNew(true);
  };

  const agregar = async () => {
    if (!form.concepto || !form.monto || !form.pagador_nombre) return alert("Completa concepto, monto y pagador");
    const mes = form.mes;
    const anio = form.anio;
    const fecha = `${String(today.d).padStart(2,"0")}/${String(mes+1).padStart(2,"0")}/${anio}`;
    const payload = {
      concepto: form.concepto, categoria: form.cat, monto: Number(form.monto),
      mes, anio, fecha, pagador_nombre: form.pagador_nombre,
      pagador_tipo: form.pagador_tipo, pagador_id: form.pagador_id || null,
      detalle: form.detalle || null, soporte: form.soporte || null
    };
    // Comprimir imagen siempre
    if (payload.soporte) payload.soporte = await comprimirImagen(payload.soporte);
    if (editId) {
      if (!online) {
        await encolarOperacion({ modulo:'otros_ingresos', operacion:'update', payload:{ id: editId, ...payload }, imagenKey: null });
        await actualizarContador();
        setOtrosIngresos(otrosIngresos.map(i => i.id === editId ? { ...i, ...payload, cat: payload.categoria } : i));
      } else {
        const { error } = await supabase.from('otros_ingresos').update(payload).eq('id', editId);
        if (error) { alert("Error al actualizar: " + error.message); return; }
        setOtrosIngresos(otrosIngresos.map(i => i.id === editId ? { ...i, ...payload, cat: payload.categoria } : i));
      }
    } else {
      if (!online) {
        const lid = genLocalId();
        await encolarOperacion({ modulo:'otros_ingresos', operacion:'insert', payload, imagenKey: null });
        await actualizarContador();
        setOtrosIngresos([...otrosIngresos, { ...payload, id: lid, cat: payload.categoria }]);
      } else {
        const { data, error } = await supabase.from('otros_ingresos').insert(payload).select().single();
        if (error) { alert("Error al guardar: " + error.message); return; }
        setOtrosIngresos([...otrosIngresos, { ...data, cat: data.categoria }]);
      }
    }
    setShowNew(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const eliminar = async (id) => {
    // Optimistic: remove from UI immediately
    setOtrosIngresos(prev => prev.filter(i => i.id !== id));
    if (!online) {
      await encolarOperacion({ modulo: 'otros_ingresos', operacion: 'delete', payload: { id }, imagenKey: null });
      await actualizarContador();
      setToast("Eliminado — se aplicará al restablecer la conexión");
      return;
    }
    const { error } = await supabase.from("otros_ingresos").delete().eq("id", id);
    if (error) { alert("Error al eliminar: " + error.message); }
  };

  const catIcon = c => c === "Arriendo Local" ? "🏪" : c === "Arriendo Parqueadero" ? "🚗" : "📦";
  const catColor = c => c === "Arriendo Local" ? "bg-blue-100 text-blue-700" : c === "Arriendo Parqueadero" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700";

  return (
    <div className="space-y-4">
      {toast && <ToastOffline mensaje={toast} onClose={() => setToast(null)} />}
      {confirmEl && (
        <ModalConfirm
          mensaje="¿Eliminar este ingreso? Esta acción no se puede deshacer."
          onCancel={() => setConfirmEl(null)}
          onOk={async () => { await eliminar(confirmEl.id); setConfirmEl(null); }}
        />
      )}
      {comprobante && <ComprobanteOI ingreso={comprobante} onClose={() => setComprobante(null)} />}
      {imgView && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[999] p-4" onClick={() => setImgView(null)}>
          <div className="relative max-w-lg w-full">
            <button onClick={() => setImgView(null)} className="absolute -top-8 right-0 text-white text-2xl hover:text-slate-300">✕</button>
            <img src={imgView} alt="soporte" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Otros Ingresos</h2>
        {rol !== "lectura" && <button onClick={() => abrirOI()} className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600">+ Registrar</button>}
      </div>
      {/* Selector de períodos */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={perSelected ?? ""} onChange={e => {
          const p = periodos.find(x => x.id === Number(e.target.value));
          if (p) { setPerSelected(p.id); setFilters(f => ({ ...f, mes: p.mes, anio: p.anio })); }
        }} className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 bg-white">
          {[...periodos].sort((a,b) => a.anio!==b.anio?a.anio-b.anio:a.mes-b.mes).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {ult3Periodos.map(p => (
          <button key={p.id} onClick={() => { setPerSelected(p.id); setFilters(f => ({ ...f, mes: p.mes, anio: p.anio })); }}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition ${perSelected === p.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
            {p.nombre}
          </button>
        ))}
      </div>

      <FilterBar filters={filters} setFilters={setFilters} config={filterConfig} onClear={() => setFilters({ mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y, cat: "todos", pagador: "" })} />
      <ResultCount total={otrosIngresos.length} filtered={filtrados.length} onExport={() => exportCSV(filtrados, [{ key: "concepto", label: "Concepto" }, { key: "categoria", label: "Categoría" }, { key: "monto", label: "Monto" }, { key: "pagador_nombre", label: "Pagador" }, { key: "fecha", label: "Fecha" }], "otros-ingresos.csv")} />

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        {CATS_OI.map(c => {
          const subtotal = filtrados.filter(i => i.cat === c || i.categoria === c).reduce((a, i) => a + i.monto, 0);
          return (
            <div key={c} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{catIcon(c)} {c}</p>
              <p className="text-lg font-bold text-emerald-600">{fmt(subtotal)}</p>
            </div>
          );
        })}
      </div>

      {/* Modal nuevo */}
      {showNew && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg">{editId ? "✏️ Editar Ingreso" : "Registrar Ingreso"}</h3>
            <div><label className="text-xs text-slate-500 mb-1 block">Período</label>
              <select value={form.periodoId ?? ""} onChange={e => {
                const p = periodos.find(x => x.id === Number(e.target.value));
                if (p) setForm({ ...form, periodoId: p.id, mes: p.mes, anio: p.anio });
              }} className="w-full border rounded-xl px-3 py-2 text-sm">
                {[...periodos].sort((a,b) => a.anio!==b.anio?a.anio-b.anio:a.mes-b.mes).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Categoría</label>
              <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                {CATS_OI.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Concepto</label>
              <input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} placeholder="Ej: Arriendo local 1, Parqueadero 3..." className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            {form.cat === "Otro" && (
              <div><label className="text-xs text-slate-500 mb-1 block">Detalle <span className="text-slate-300">(opcional)</span></label>
                <input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })} placeholder="Describe el ingreso adicional..." className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            )}
            <div><label className="text-xs text-slate-500 mb-1 block">Monto ($)</label>
              <input type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Tipo de pagador</label>
              <select value={form.pagador_tipo} onChange={e => setForm({ ...form, pagador_tipo: e.target.value, pagador_nombre: "", pagador_id: null })} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="externo">Persona externa</option>
                <option value="propietario">Propietario del edificio</option>
              </select>
            </div>
            {form.pagador_tipo === "propietario" ? (
              <div><label className="text-xs text-slate-500 mb-1 block">Seleccionar propietario</label>
                <select value={form.pagador_id || ""} onChange={e => {
                  const u = usuarios.find(u => u.id === Number(e.target.value));
                  setForm({ ...form, pagador_id: Number(e.target.value), pagador_nombre: u?.nombre || "" });
                }} className="w-full border rounded-xl px-3 py-2 text-sm">
                  <option value="">— Seleccionar —</option>
                  {usuarios.filter(u => u.rol === "prop").map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div><label className="text-xs text-slate-500 mb-1 block">Nombre del pagador</label>
                <input value={form.pagador_nombre} onChange={e => setForm({ ...form, pagador_nombre: e.target.value })} placeholder="Nombre completo..." className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Soporte (foto/imagen)</label>
              <label htmlFor="oi-file-input" className="block border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-emerald-300 transition-colors">
                {form.soporte
                  ? <img src={form.soporte} alt="soporte" className="max-h-24 mx-auto rounded-lg object-contain" />
                  : <div className="text-slate-400 text-sm py-2">📎 Subir imagen o tomar foto</div>}
              </label>
              <input id="oi-file-input" type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader(); r.onload = ev => setForm(fm => ({ ...fm, soporte: ev.target.result })); r.readAsDataURL(f);
              }} />
              {form.soporte && <button onClick={() => setForm(fm => ({ ...fm, soporte: null }))} className="text-xs text-rose-500 hover:underline mt-1">✕ Quitar imagen</button>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={agregar} className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-sm font-semibold">💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 text-left">Concepto</th>
              <th className="px-3 py-3 text-left hidden md:table-cell">Categoría</th>
              <th className="px-3 py-3 text-left hidden md:table-cell">Pagador</th>
              <th className="px-3 py-3 text-left hidden lg:table-cell">Fecha</th>
              <th className="px-3 py-3 text-right">Monto</th>
              <th className="px-3 py-3 text-center">📷</th>
              <th className="px-3 py-3 text-center">🧾</th>
              <th className="px-3 py-3 text-center">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Sin ingresos registrados</td></tr>}
            {filtrados.map(i => (
              <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2.5 font-medium text-slate-700">
                  {i.concepto}
                  {i.detalle && <p className="text-xs text-slate-400">{i.detalle}</p>}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor(i.cat || i.categoria)}`}>{catIcon(i.cat || i.categoria)} {i.cat || i.categoria}</span>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-slate-500 text-xs">
                  {i.pagador_nombre}
                  {i.pagador_tipo === "propietario" && <span className="ml-1 text-indigo-500">(prop.)</span>}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-slate-400 text-xs">{i.fecha}</td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmt(i.monto)}</td>
                <td className="px-3 py-2.5 text-center">
                  {i.soporte && <button onClick={() => setImgView(i.soporte)} title="Ver soporte" className="text-slate-500 hover:text-slate-800 hover:scale-125 transition-transform cursor-pointer text-lg">📷</button>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => setComprobante(i)} title="Ver comprobante" className="text-indigo-400 hover:text-indigo-600 hover:scale-125 transition-transform cursor-pointer text-lg">🧾</button>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {rol !== "lectura" && <button onClick={() => abrirOI(i)} className="text-slate-300 hover:text-indigo-500 hover:scale-125 transition-all cursor-pointer text-lg mr-1" title="Editar">✏️</button>}
                  {canDelete && <button onClick={() => setConfirmEl({ id: i.id })} className="text-slate-300 hover:text-rose-600 hover:scale-125 transition-all cursor-pointer text-lg" title="Eliminar">🗑</button>}
                </td>
              </tr>
            ))}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2.5 font-bold text-slate-700">Total</td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-600 text-base">{fmt(total)}</td>
                <td colSpan={rol === "admin" ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── COMPROBANTE OTROS INGRESOS ───────────────────────────────────────────────
function ComprobanteOI({ ingreso, onClose, appName = "Mi Edificio" }) {
  const nro = String(ingreso.id).padStart(6, "0");
  const catIcon = c => c === "Arriendo Local" ? "🏪" : c === "Arriendo Parqueadero" ? "🚗" : "📦";
  const cat = ingreso.cat || ingreso.categoria;

  const htmlComprobante = () => `<html><head><title>Comprobante Ingreso #${nro}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;max-width:480px;margin:auto}
    h2{text-align:center;color:#4f46e5;margin-bottom:4px;font-size:18px}
    .sub{text-align:center;color:#94a3b8;font-size:12px;margin-bottom:20px}
    .box{border:2px dashed #c7d2fe;border-radius:12px;padding:16px;background:#eef2ff;margin-bottom:16px}
    .fila{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #e0e7ff}
    .fila:last-child{border:none}
    .label{color:#64748b}.value{font-weight:600;color:#1e293b}
    .total{display:flex;justify-content:space-between;padding:12px 0 0;border-top:2px solid #c7d2fe;margin-top:8px}
    .total .label{font-weight:700;font-size:15px;color:#1e293b}
    .total .value{font-weight:800;font-size:18px;color:#059669}
    .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px}
  </style></head><body>
  <div style="text-align:center;font-size:36px;margin-bottom:8px">🏢</div>
  <h2>${appName}</h2>
  <p class="sub">Comprobante de Ingreso Oficial</p>
  <div class="box">
    <div class="fila"><span class="label">N° Comprobante</span><span class="value">#${nro}</span></div>
    <div class="fila"><span class="label">Fecha</span><span class="value">${ingreso.fecha || todayStr()}</span></div>
    <div class="fila"><span class="label">Categoría</span><span class="value">${catIcon(cat)} ${cat}</span></div>
    <div class="fila"><span class="label">Concepto</span><span class="value">${ingreso.concepto}</span></div>
    ${ingreso.detalle ? `<div class="fila"><span class="label">Detalle</span><span class="value">${ingreso.detalle}</span></div>` : ""}
    <div class="fila"><span class="label">Pagador</span><span class="value">${ingreso.pagador_nombre}</span></div>
    <div class="fila"><span class="label">Tipo</span><span class="value">${ingreso.pagador_tipo === "propietario" ? "Propietario" : "Externo"}</span></div>
    <div class="total"><span class="label">Monto Recibido</span><span class="value">${fmt(ingreso.monto)}</span></div>
  </div>
  <p class="footer">✅ Verificado · ${todayStr()} · ${appName}</p>
  </body></html>`;

  const imprimir = () => {
    const blob = new Blob([htmlComprobante()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000); };
  };

  const descargarPDF = async () => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:480px;height:auto;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlComprobante());
      iframe.contentDocument.close();
      await new Promise(r => setTimeout(r, 600));
      const canvas = await html2canvas(iframe.contentDocument.body, { scale: 2, useCORS: true, width: 480, height: iframe.contentDocument.body.scrollHeight, windowWidth: 480, windowHeight: iframe.contentDocument.body.scrollHeight });
      document.body.removeChild(iframe);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      pdf.save(`ingreso-${nro}.pdf`);
    } catch (err) { alert("Error al generar PDF: " + err.message); }
  };

  const enviarCorreo = () => {
    const cuerpo = [
      `Comprobante de Ingreso #${nro} - ${appName}`,
      "─────────────────────────────",
      `Fecha: ${ingreso.fecha || todayStr()}`,
      `Categoría: ${cat}`,
      `Concepto: ${ingreso.concepto}`,
      ingreso.detalle ? `Detalle: ${ingreso.detalle}` : "",
      `Pagador: ${ingreso.pagador_nombre}`,
      `Monto: ${fmt(ingreso.monto)}`,
      "─────────────────────────────",
      `Verificado: ${todayStr()}`,
    ].filter(Boolean).join("%0D%0A");
    window.open(`mailto:?subject=Comprobante Ingreso #${nro} - ${appName}&body=${cuerpo}`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🏢</div>
          <h2 className="text-xl font-bold text-slate-800">{appName}</h2>
          <p className="text-slate-400 text-sm">Comprobante de Ingreso #{nro}</p>
        </div>
        <div className="border-2 border-dashed border-emerald-200 rounded-xl p-4 mb-4 space-y-2.5 text-sm bg-emerald-50">
          {[["Fecha", ingreso.fecha || todayStr()], ["Categoría", `${catIcon(cat)} ${cat}`], ["Concepto", ingreso.concepto], ingreso.detalle ? ["Detalle", ingreso.detalle] : null, ["Pagador", ingreso.pagador_nombre], ["Tipo", ingreso.pagador_tipo === "propietario" ? "Propietario" : "Externo"]].filter(Boolean).map(([l, v]) => (
            <div key={l} className="flex justify-between"><span className="text-slate-500">{l}</span><span className="font-semibold">{v}</span></div>
          ))}
          <div className="border-t-2 border-emerald-300 pt-2.5 flex justify-between">
            <span className="font-bold text-slate-700">Monto recibido</span>
            <span className="font-bold text-emerald-600 text-lg">{fmt(ingreso.monto)}</span>
          </div>
        </div>
        <div className="text-center text-xs text-slate-400 mb-4">✅ Verificado · {todayStr()}</div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button onClick={imprimir} className="flex flex-col items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-2.5 rounded-xl text-xs font-semibold text-slate-600 transition"><span className="text-lg">🖨️</span>Imprimir</button>
          <button onClick={descargarPDF} className="flex flex-col items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2.5 rounded-xl text-xs font-semibold text-rose-600 transition"><span className="text-lg">📄</span>Guardar PDF</button>
          <button onClick={enviarCorreo} className="flex flex-col items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2.5 rounded-xl text-xs font-semibold text-indigo-600 transition"><span className="text-lg">📧</span>Enviar correo</button>
        </div>
        <button onClick={onClose} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-semibold hover:bg-emerald-700 text-sm">Cerrar</button>
      </div>
    </div>
  );
}

// ─── EGRESOS ──────────────────────────────────────────────────────────────────
function Egresos({ egresos, setEgresos, rol, periodos = [], canDelete = false, actualizarContador }) {
  const online = useConectividad();
  const [confirmEl, setConfirmEl] = useState(null);
  const [toast, setToast] = useState(null);
  const periodosSorted = useMemo(() => [...periodos].sort((a,b) => a.anio !== b.anio ? a.anio-b.anio : a.mes-b.mes), [periodos]);
  const lastPer = periodosSorted[periodosSorted.length - 1];
  const ult3 = useMemo(() => [...periodosSorted].reverse().slice(0, 3), [periodosSorted]);
  const [filters, setFilters] = useState({ mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y, cat: "todos", concepto: "" });
  const [perSelected, setPerSelected] = useState(lastPer?.id ?? null);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const [imgView, setImgView] = useState(null);
  const emptyForm = { concepto: "", cat: "Mantenimiento", monto: "", detalle: "", soporte: null, periodoId: lastPer?.id ?? null, mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y };
  const [form, setForm] = useState(emptyForm);
  const CATS = ["Mantenimiento", "Servicios", "Personal", "Administrativo", "Imprevistos"];

  const abrir = (e = null) => {
    if (e) {
      setEditId(e.id);
      const per = periodosSorted.find(p => p.mes === e.mes && p.anio === e.anio);
      setForm({ concepto: e.concepto, cat: e.cat, monto: String(e.monto), detalle: e.detalle || "", soporte: e.soporte || null, periodoId: per?.id ?? null, mes: e.mes, anio: e.anio });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setShowNew(true);
  };
  const filterConfig = [
    { key: "mes", label: "Mes", type: "select", options: MESES.map((m, i) => ({ value: String(i), label: m })), placeholder: "Todos los meses" },
    { key: "anio", label: "Año", type: "select", options: [{ value: "2025", label: "2025" }, { value: "2026", label: "2026" }] },
    { key: "cat", label: "Categoría", type: "select", options: CATS.map(c => ({ value: c, label: c })) },
    { key: "concepto", label: "Concepto", type: "text", placeholder: "Buscar concepto..." },
  ];
  const filtrados = useMemo(() => egresos.filter(e => {
    if (filters.mes !== "todos" && e.mes !== Number(filters.mes)) return false;
    if (filters.anio !== "todos" && e.anio !== Number(filters.anio)) return false;
    if (filters.cat !== "todos" && e.cat !== filters.cat) return false;
    if (filters.concepto && !e.concepto.toLowerCase().includes(filters.concepto.toLowerCase())) return false;
    return true;
  }), [egresos, filters]);
  const total = filtrados.reduce((a, e) => a + e.monto, 0);
  const cats = {}; filtrados.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + e.monto; });
  const catData = Object.entries(cats).map(([name, value]) => ({ name, value }));
  const agregar = async () => {
    if (!form.concepto || !form.monto) return;
    const mes = form.mes;
    const anio = form.anio;
    const fecha = `${String(today.d).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${anio}`;
    const payload = { concepto: form.concepto, cat: form.cat, monto: Number(form.monto), detalle: form.detalle || null, soporte: form.soporte || null };
    // Comprimir imagen siempre
    if (payload.soporte) payload.soporte = await comprimirImagen(payload.soporte);
    if (editId) {
      const fullPayload = { ...payload, mes, anio, fecha };
      if (!online) {
        await encolarOperacion({ modulo:'egresos', operacion:'update', payload:{ id: editId, ...fullPayload }, imagenKey: null });
        await actualizarContador();
        setEgresos(egresos.map(e => e.id === editId ? { ...e, ...fullPayload } : e));
      } else {
        const { error } = await supabase.from('egresos').update(fullPayload).eq('id', editId);
        if (error) { alert("Error al actualizar: " + error.message); return; }
        setEgresos(egresos.map(e => e.id === editId ? { ...e, ...fullPayload } : e));
      }
    } else {
      const duplicado = egresos.find(e => e.concepto.trim().toLowerCase() === form.concepto.trim().toLowerCase() && e.mes === mes && e.anio === anio);
      if (duplicado) { alert(`Ya existe un egreso con el concepto "${form.concepto}" en este período.`); return; }
      const nuevo = { ...payload, mes, anio, fecha };
      if (!online) {
        const lid = genLocalId();
        await encolarOperacion({ modulo:'egresos', operacion:'insert', payload: nuevo, imagenKey: null });
        await actualizarContador();
        setEgresos([...egresos, { ...nuevo, id: lid }]);
      } else {
        const { data, error } = await supabase.from('egresos').insert(nuevo).select().single();
        if (error) { alert("Error al guardar egreso: " + error.message); return; }
        setEgresos([...egresos, data]);
      }
    }
    setShowNew(false);
    setEditId(null);
    setForm(emptyForm);
  };
  const clearFilters = () => { setFilters({ mes: lastPer?.mes ?? today.m, anio: lastPer?.anio ?? today.y, cat: "todos", concepto: "" }); setPerSelected(lastPer?.id ?? null); };
  return (
    <div className="space-y-4">
      {toast && <ToastOffline mensaje={toast} onClose={() => setToast(null)} />}
      {confirmEl && (
        <ModalConfirm
          mensaje="¿Estás seguro de borrar este egreso? Esta acción no se puede deshacer."
          onCancel={() => setConfirmEl(null)}
          onOk={async () => {
            const id = confirmEl.id;
            setConfirmEl(null);
            // Optimistic: remove from UI immediately
            setEgresos(prev => prev.filter(x => x.id !== id));
            if (!online) {
              await encolarOperacion({ modulo: 'egresos', operacion: 'delete', payload: { id }, imagenKey: null });
              await actualizarContador();
              setToast("Eliminado — se aplicará al restablecer la conexión");
              return;
            }
            const { error } = await supabase.from('egresos').delete().eq('id', id);
            if (error) { alert("No se pudo borrar el egreso."); await actualizarContador(); }
          }}
        />
      )}
      {imgView && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[999] p-4" onClick={() => setImgView(null)}>
          <div className="relative max-w-lg w-full">
            <button onClick={() => setImgView(null)} className="absolute -top-8 right-0 text-white text-2xl hover:text-slate-300">✕</button>
            <img src={imgView} alt="soporte" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Egresos del Edificio</h2>
        {rol !== "lectura" && <button onClick={() => abrir()} className="bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-600">+ Agregar</button>}
      </div>
      {/* Selector de períodos */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={perSelected ?? ""} onChange={e => {
          const p = periodosSorted.find(x => x.id === Number(e.target.value));
          if (p) { setPerSelected(p.id); setFilters(f => ({ ...f, mes: p.mes, anio: p.anio })); }
        }} className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 bg-white">
          {periodosSorted.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {ult3.map(p => (
          <button key={p.id} onClick={() => { setPerSelected(p.id); setFilters(f => ({ ...f, mes: p.mes, anio: p.anio })); }}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition ${perSelected === p.id ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-600 border-slate-200 hover:border-rose-400"}`}>
            {p.nombre}
          </button>
        ))}
      </div>
      <FilterBar filters={filters} setFilters={setFilters} config={filterConfig} onClear={clearFilters} />
      <ResultCount total={egresos.length} filtered={filtrados.length} onExport={() => exportCSV(filtrados, [{ key: "concepto", label: "Concepto" }, { key: "cat", label: "Categoría" }, { key: "monto", label: "Monto" }, { key: "fecha", label: "Fecha" }], "egresos.csv")} />
      {showNew && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">{editId ? "✏️ Editar Egreso" : "Nuevo Egreso"}</h3>
            <div><label className="text-xs text-slate-500 mb-1 block">Período</label>
              <select value={form.periodoId ?? ""} onChange={e => {
                const p = periodosSorted.find(x => x.id === Number(e.target.value));
                if (p) setForm(f => ({ ...f, periodoId: p.id, mes: p.mes, anio: p.anio }));
              }} className="w-full border rounded-xl px-3 py-2 text-sm">
                {periodosSorted.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Concepto</label><input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Monto ($)</label><input type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Detalle adicional <span className="text-slate-300">(opcional)</span></label><input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })} placeholder="Ej: N° factura, proveedor, observaciones..." className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Categoría</label>
              <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm">
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Soporte (foto/imagen)</label>
              <label htmlFor="egresos-file-input" className="block border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-rose-300 transition-colors">
                {form.soporte
                  ? <img src={form.soporte} alt="soporte" className="max-h-24 mx-auto rounded-lg object-contain" />
                  : <div className="text-slate-400 text-sm py-2">📎 Subir imagen o tomar foto</div>
                }
              </label>
              <input id="egresos-file-input" type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = ev => setForm({ ...form, soporte: ev.target.result });
                r.readAsDataURL(f);
              }} />
              {form.soporte && (
                <button onClick={() => setForm({ ...form, soporte: null })} className="mt-1 text-xs text-slate-400 hover:text-rose-500 transition-colors">✕ Quitar imagen</button>
              )}
            </div>
<div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={agregar} className="flex-1 bg-rose-500 text-white py-2 rounded-xl text-sm font-semibold">{editId ? "💾 Guardar" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
      {catData.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-700 mb-3">Por Categoría</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={catData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={v => fmt(v)} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-center space-y-3">
            <div><p className="text-slate-400 text-xs">Total filtrado</p><p className="text-3xl font-bold text-rose-600">{fmt(total)}</p></div>
            {Object.entries(cats).map(([c, v]) => (
              <div key={c} className="flex justify-between text-sm border-b border-slate-100 pb-1"><span className="text-slate-600">{c}</span><span className="font-semibold">{fmt(v)}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Concepto</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Categoría</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-center">📷</th>
              <th className="px-4 py-3 text-center">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(e => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">{e.concepto}</td>
                <td className="px-4 py-3 hidden md:table-cell"><span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{e.cat}</span></td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-400">{e.fecha}</td>
                <td className="px-4 py-3 text-right font-semibold text-rose-600">{fmt(e.monto)}</td>
                <td className="px-4 py-3 text-center">
                  {e.soporte && <button onClick={() => setImgView(e.soporte)} title="Ver soporte" className="text-slate-500 hover:text-slate-800 hover:scale-125 transition-transform cursor-pointer text-lg">📷</button>}
                </td>
                <td className="px-4 py-3 text-center">
                  {rol !== "lectura" && <button onClick={() => abrir(e)} className="text-slate-300 hover:text-indigo-500 hover:scale-125 transition-all duration-150 cursor-pointer text-lg" title="Editar egreso">✏️</button>}
                  {canDelete && <button onClick={() => setConfirmEl({ id: e.id })} className="text-slate-300 hover:text-rose-600 hover:scale-125 hover:drop-shadow-md transition-all duration-150 cursor-pointer text-lg ml-1" title="Eliminar egreso">🗑</button>}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Sin resultados para los filtros aplicados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── USUARIOS ────────────────────────────────────────────────────────────────
function Usuarios({ usuarios, setUsuarios, deptos, rol, usuarioActivo, setUsuario }) {
  const [confirmEl, setConfirmEl] = useState(null); // { usuario } para confirmar eliminación
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const emptyForm = { nombre: "", email: "", rol: "prop", user: "", pass: "", deptos: [], activo: true, modulos: [], permisos: {} };
  const [form, setForm] = useState(emptyForm);
  const [emailSim, setEmailSim] = useState(null);

  const ROL_LABELS = { admin: "Administrador", tesorero: "Tesorero", colaborador: "Colaborador", prop: "Propietario" };
  const ROL_COLORS = { admin: "bg-indigo-100 text-indigo-700", tesorero: "bg-amber-100 text-amber-700", colaborador: "bg-teal-100 text-teal-700", prop: "bg-slate-100 text-slate-600" };

  const esCustom = form.rol === "colaborador" || (form.modulos && form.modulos.length > 0 && form.rol !== "prop");

  const abrir = (u = null) => {
    if (u) setForm({ ...emptyForm, ...u, modulos: u.modulos || [], permisos: u.permisos || {} });
    else setForm(emptyForm);
    setEditId(u?.id || null);
    setShowNew(true);
  };

  const toggleModulo = (modId) => {
    const tiene = form.modulos.includes(modId);
    const nuevos = tiene ? form.modulos.filter(m => m !== modId) : [...form.modulos, modId];
    // Si se quita el módulo, quitar también su permiso
    const nuevosPermisos = { ...form.permisos };
    if (tiene) delete nuevosPermisos[modId];
    else nuevosPermisos[modId] = "lectura"; // default al activar
    setForm({ ...form, modulos: nuevos, permisos: nuevosPermisos });
  };

  const setNivel = (modId, nivel) => setForm({ ...form, permisos: { ...form.permisos, [modId]: nivel } });

  const guardar = async () => {
    if (!form.nombre || !form.email || !form.pass) return alert("Nombre, email y contraseña son obligatorios");
    const payload = {
      nombre: form.nombre, email: form.email, rol: form.rol,
      usuario: form.user || form.email, pass: form.pass,
      deptos: form.deptos, activo: form.activo,
      modulos: form.rol === "colaborador" ? form.modulos : [],
      permisos: form.rol === "colaborador" ? form.permisos : {},
    };
    if (editId) {
      // Actualizar en tabla usuarios
      const { error } = await supabase.from('usuarios').update(payload).eq('id', editId);
      if (error) { alert("Error al actualizar: " + error.message); return; }
      // Si cambió la contraseña, actualizar en Supabase Auth
      const uActual = usuarios.find(u => u.id === editId);
      if (uActual?.auth_id && form.pass !== uActual.pass) {
        try { await adminUsers("update", { auth_id: uActual.auth_id, password: form.pass }); } catch {}
      }
      setUsuarios(usuarios.map(u => u.id === editId ? { ...u, ...payload, user: payload.usuario } : u));
      if (editId === usuarioActivo?.id) setUsuario({ ...usuarioActivo, ...payload, user: payload.usuario });
    } else {
      // 1. Crear en Supabase Auth via Edge Function
      let authId;
      try {
        const authData = await adminUsers("create", { email: form.email, password: form.pass });
        authId = authData.id;
      } catch (e) { alert("Error al crear usuario: " + e.message); return; }
      // 2. Crear en tabla usuarios con auth_id
      const { data, error } = await supabase.from('usuarios').insert({ ...payload, auth_id: authId }).select().single();
      if (error) {
        try { await adminUsers("delete", { auth_id: authId }); } catch {}
        alert("Error al crear usuario: " + error.message); return;
      }
      setUsuarios([...usuarios, { ...data, user: data.usuario, deptos: data.deptos || [], modulos: data.modulos || [], permisos: data.permisos || {} }]);
    }
    setShowNew(false);
  };

  const eliminar = async (u) => {
    // 1. Eliminar de tabla usuarios
    const { error } = await supabase.from('usuarios').delete().eq('id', u.id);
    if (error) { alert("Error al eliminar: " + error.message); return; }
    // 2. Eliminar de Supabase Auth via Edge Function
    if (u.auth_id) {
      try { await adminUsers("delete", { auth_id: u.auth_id }); } catch {}
    }
    setUsuarios(usuarios.filter(x => x.id !== u.id));
  };

  const toggleDepto = id => setForm({ ...form, deptos: form.deptos.includes(id) ? form.deptos.filter(x => x !== id) : [...form.deptos, id] });
  const simEmail = u => { setEmailSim(u); setTimeout(() => setEmailSim(null), 3000); };

  return (
    <div className="space-y-4">
      {confirmEl && (
        <ModalConfirm
          mensaje={`¿Eliminar al usuario ${confirmEl.usuario?.nombre}? Esta acción no se puede deshacer.`}
          onCancel={() => setConfirmEl(null)}
          onOk={async () => { await eliminar(confirmEl.usuario); setConfirmEl(null); }}
        />
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h2>
        {rol === "admin" && <button onClick={() => abrir()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Nuevo Usuario</button>}
      </div>

      {emailSim && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2"><span className="text-xl">📧</span><span>Correo simulado enviado a <strong>{emailSim.email}</strong></span></div>}

      {showNew && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg">{editId ? "Editar Usuario" : "Nuevo Usuario"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Rol</label>
                <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value, deptos: e.target.value !== "prop" ? [] : form.deptos, modulos: [], permisos: {} })} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {rol === "admin" && <option value="admin">Administrador</option>}
                  <option value="tesorero">Tesorero</option>
                  <option value="colaborador">Colaborador</option>
                  <option value="prop">Propietario</option>
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Usuario</label>
                <input value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Contraseña</label>
                <input type="password" value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            {/* ── Permisos por módulo (solo colaborador) ── */}
            {form.rol === "colaborador" && (
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-semibold block">🔐 Acceso a módulos</label>
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  {MODULOS_DISPONIBLES.map(m => {
                    const tiene = form.modulos.includes(m.id);
                    const nivel = form.permisos[m.id] || "lectura";
                    return (
                      <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0 transition ${tiene ? "bg-white" : ""}`}>
                        <input type="checkbox" checked={tiene} onChange={() => toggleModulo(m.id)} className="rounded accent-indigo-600" />
                        <span className="text-sm flex-1">{m.icon} {m.label}</span>
                        {tiene && (
                          <div className="flex gap-1">
                            <button onClick={() => setNivel(m.id, "lectura")} className={`text-xs px-2 py-1 rounded-lg border transition font-medium ${nivel === "lectura" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"}`}>
                              👁 Ver
                            </button>
                            <button onClick={() => setNivel(m.id, "escritura")} className={`text-xs px-2 py-1 rounded-lg border transition font-medium ${nivel === "escritura" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"}`}>
                              ✏️ Editar
                            </button>
                            <button onClick={() => setNivel(m.id, "admin")} className={`text-xs px-2 py-1 rounded-lg border transition font-medium ${nivel === "admin" ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"}`}>
                              🗑 Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400">👁 Ver: solo lectura · ✏️ Editar: crear y modificar · 🗑 Eliminar: acceso total</p>
              </div>
            )}

            {/* ── Propiedades (solo prop) ── */}
            {form.rol === "prop" && (
              <div>
                <label className="text-xs text-slate-500 mb-2 block">Propiedades ({form.deptos.length} selec.)</label>
                <div className="grid grid-cols-6 gap-1.5 max-h-36 overflow-y-auto">
                  {deptos.map(d => <button key={d.id} onClick={() => toggleDepto(d.id)} className={`rounded-lg py-1.5 text-xs font-bold transition ${form.deptos.includes(d.id) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{d.depto}</button>)}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} id="activo" className="rounded" />
              <label htmlFor="activo" className="text-sm text-slate-600">Usuario activo</label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={guardar} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Listado agrupado por rol ── */}
      <div className="space-y-2">
        {[{ r: "admin", l: "Administradores" }, { r: "tesorero", l: "Tesoreros" }, { r: "colaborador", l: "Colaboradores" }, { r: "prop", l: "Propietarios" }].map(({ r, l }) => {
          const list = usuarios.filter(u => u.rol === r); if (!list.length) return null;
          return (
            <div key={r} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-700 text-sm">{l} ({list.length})</h3>
              </div>
              {list.map(u => (
                <div key={u.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0 mt-0.5">{u.nombre.slice(0, 2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm">{u.nombre}</div>
                    <div className="text-xs text-slate-400">{u.email} · @{u.user}</div>
                    {u.deptos?.length > 0 && <div className="text-xs text-indigo-600 mt-0.5">{u.deptos.map(id => deptos.find(d => d.id === id)?.depto).filter(Boolean).join(", ")}</div>}
                    {/* Módulos del colaborador */}
                    {u.rol === "colaborador" && u.modulos?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {u.modulos.map(mid => {
                          const m = MODULOS_DISPONIBLES.find(x => x.id === mid);
                          const nivel = u.permisos?.[mid] || "lectura";
                          return m ? (
                            <span key={mid} className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${nivel === "admin" ? "bg-rose-100 text-rose-700" : nivel === "escritura" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {m.icon} {m.label} {nivel === "admin" ? "🗑" : nivel === "escritura" ? "✏️" : "👁"}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROL_COLORS[u.rol] || "bg-slate-100 text-slate-600"}`}>{ROL_LABELS[u.rol] || u.rol}</span>
                    {!u.activo && <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                    <button onClick={() => simEmail(u)} className="text-slate-300 hover:text-indigo-500 text-lg" title="Simular correo">📧</button>
                    {rol === "admin" && <button onClick={() => abrir(u)} className="text-slate-300 hover:text-indigo-500 hover:scale-125 transition-all text-lg" title="Editar">✏️</button>}
                    {rol === "admin" && u.id !== usuarioActivo?.id && <button onClick={() => setConfirmEl({ usuario: u })} className="text-slate-300 hover:text-rose-500 hover:scale-125 transition-all text-lg" title="Eliminar usuario">🗑</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PORTAL PROPIETARIO ───────────────────────────────────────────────────────
function PortalProp({ usuario, pagos, derramas, deptos, periodos }) {
  const [comprobante, setComprobante] = useState(null);
  const misDeptos = deptos.filter(d => usuario.deptos?.includes(d.id));
  const [deptoSel, setDeptoSel] = useState(misDeptos[0]?.id);
  const dep = deptos.find(d => d.id === deptoSel);
  const perActual = periodos[periodos.length - 1];
  const misPagos = pagos.filter(p => p.deptoId === deptoSel).sort((a, b) => b.anio - a.anio || b.mes - a.mes);
  const cuotaActual = misPagos.find(p => p.periodoId === perActual?.id && p.tipo === "ordinario");
  const totalPagado = misPagos.filter(p => p.estado === "pagado").reduce((a, p) => a + p.montoPagado, 0);
  const totalAdeudado = misPagos.filter(p => p.estado !== "pagado").reduce((a, p) => a + Math.max(0, p.montoTotal - p.montoPagado), 0);
  const dersPend = derramas.filter(d => !pagos.find(p => p.tipo === "derrama" && p.deptoId === deptoSel && p.concepto === d.titulo && p.estado === "pagado"));
  const estColor = cuotaActual?.estado === "pagado" ? "text-emerald-300" : cuotaActual?.estado === "parcial" ? "text-blue-300" : "text-amber-300";
  const estLabel = cuotaActual?.estado === "pagado" ? "✅ Al día" : cuotaActual?.estado === "parcial" ? "💧 Parcial" : "⚠️ Pendiente";
  return (
    <div className="space-y-5">
      {comprobante && <Comprobante cuota={comprobante.cuota} abono={comprobante.abono} depto={usuario} onClose={() => setComprobante(null)} />}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Mi Portal</h2>
        {misDeptos.length > 1 && <select value={deptoSel} onChange={e => setDeptoSel(Number(e.target.value))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          {misDeptos.map(d => <option key={d.id} value={d.id}>Propiedad {d.depto}</option>)}
        </select>}
      </div>
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="text-3xl font-bold">Propiedad {dep?.depto}</div>
        <div className="text-indigo-200 text-sm mt-1">{usuario.nombre} · Piso {dep?.piso} · {dep?.m2} m²</div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="text-indigo-200 text-xs">Cuota actual</div><div className="text-xl font-bold">{cuotaActual ? fmt(cuotaActual.montoTotal) : "-"}</div></div>
          <div><div className="text-indigo-200 text-xs">Total pagado</div><div className="text-xl font-bold">{fmt(totalPagado)}</div></div>
          <div><div className="text-indigo-200 text-xs">Total adeudado</div><div className={`text-xl font-bold ${totalAdeudado > 0 ? "text-amber-300" : "text-emerald-300"}`}>{totalAdeudado > 0 ? fmt(totalAdeudado) : "Al día ✅"}</div></div>
          <div><div className="text-indigo-200 text-xs">Estado</div><div className={`text-xl font-bold ${estColor}`}>{estLabel}</div></div>
        </div>
      </div>
      {dersPend.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h3 className="font-semibold text-amber-800 mb-2 text-sm">🔔 Derramas pendientes</h3>
        {dersPend.map(d => {
          const monto = d.distribucion === "coeficiente" ? parseFloat((dep.coef / 100 * d.montoTotal).toFixed(2)) : parseFloat((d.montoTotal / 30).toFixed(2));
          return <div key={d.id} className="flex justify-between text-sm py-1 border-b border-amber-100 last:border-0"><span>{d.titulo}</span><span className="font-bold text-amber-700">{fmt(monto)}</span></div>;
        })}
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left">Período</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Pagado</th><th className="px-4 py-3 text-center">Estado</th><th className="px-4 py-3 text-center">🧾</th></tr></thead>
          <tbody>{misPagos.map(p => {
            const last = p.abonos?.[p.abonos.length - 1];
            return (<tr key={p.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{p.periodoNombre}</td>
              <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${p.tipo === "ordinario" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>{p.tipo === "ordinario" ? "Ordinaria" : "Derrama"}</span></td>
              <td className="px-4 py-2 text-right">{fmt(p.montoTotal)}</td>
              <td className="px-4 py-2 text-right text-emerald-600">{fmt(p.montoPagado)}</td>
              <td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${p.estado === "pagado" ? "bg-emerald-100 text-emerald-700" : p.estado === "parcial" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{p.estado}</span></td>
              <td className="px-4 py-2 text-center">{(() => { const ab = last || (p.estado === "pagado" || p.estado === "parcial" ? { id: p.id, monto: p.montoPagado, fecha: "-", metodo: "-" } : null); return ab ? <button onClick={() => setComprobante({ cuota: p, abono: ab })} title="Ver comprobante" className="text-indigo-400 hover:text-indigo-600 hover:scale-125 transition-transform cursor-pointer text-lg">🧾</button> : <span className="text-slate-300 text-lg cursor-not-allowed" title="Sin pagos registrados">🧾</span>; })()}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

const MODULOS_DISPONIBLES = [
  { id: "dashboard",      label: "Dashboard",       icon: "📊" },
  { id: "periodos",       label: "Períodos",         icon: "📅" },
  { id: "pagos",          label: "Pagos",            icon: "💳" },
  { id: "propiedades",    label: "Propiedades",      icon: "🏠" },
  { id: "derramas",       label: "Derramas",         icon: "🔔" },
  { id: "egresos",        label: "Egresos",          icon: "📤" },
  { id: "otros_ingresos", label: "Otros Ingresos",   icon: "💰" },
  { id: "usuarios",       label: "Usuarios",         icon: "👥" },
];
const PERMS = {
  admin:       ["dashboard","periodos","pagos","propiedades","derramas","egresos","otros_ingresos","usuarios","configuracion"],
  tesorero:    ["dashboard","pagos","derramas","egresos","otros_ingresos"],
  colaborador: ["dashboard"],
  prop:        ["portal"],
};
// Nivel de acceso por módulo: "escritura" | "lectura"
const PERMS_NIVEL_DEFAULT = {
  admin:       { dashboard:"admin", periodos:"admin", pagos:"admin", propiedades:"admin", derramas:"admin", egresos:"admin", otros_ingresos:"admin", usuarios:"admin", configuracion:"admin" },
  tesorero:    { dashboard:"lectura", pagos:"escritura", derramas:"escritura", egresos:"escritura", otros_ingresos:"escritura" },
  colaborador: { dashboard:"lectura" },
  prop:        { portal:"lectura" },
};
const ALL_TABS = [
  { id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "periodos", icon: "📅", label: "Períodos" },
  { id: "pagos", icon: "💳", label: "Pagos" }, { id: "propiedades", icon: "🏠", label: "Propiedades" },
  { id: "derramas", icon: "🔔", label: "Derramas" }, { id: "egresos", icon: "📤", label: "Egresos" },
  { id: "otros_ingresos", icon: "💰", label: "Otros Ing." },
  { id: "usuarios", icon: "👥", label: "Usuarios" }, { id: "portal", icon: "👤", label: "Mi Portal" },
,
  { id: "configuracion", label: "Configuración", icon: "⚙️" },
];


// ─── HOOK INACTIVIDAD ────────────────────────────────────────────────────────
function useInactividad(onWarning, onLogout, tiempoAviso = 8 * 60 * 1000, tiempoLogout = 2 * 60 * 1000) {
  useEffect(() => {
    let timerAviso, timerLogout;
    const reset = () => {
      clearTimeout(timerAviso);
      clearTimeout(timerLogout);
      timerAviso = setTimeout(() => {
        onWarning();
        timerLogout = setTimeout(onLogout, tiempoLogout);
      }, tiempoAviso);
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    eventos.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timerAviso);
      clearTimeout(timerLogout);
      eventos.forEach(e => window.removeEventListener(e, reset));
    };
  }, []);
}

// ─── MODAL INACTIVIDAD ───────────────────────────────────────────────────────
function ModalInactividad({ onContinuar, onCerrar }) {
  const [seg, setSeg] = useState(120);
  useEffect(() => {
    const iv = setInterval(() => setSeg(s => s <= 1 ? (clearInterval(iv), 0) : s - 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const mins = Math.floor(seg / 60);
  const secs = String(seg % 60).padStart(2, '0');
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
        <div className="text-4xl">⏱️</div>
        <h3 className="font-bold text-lg text-slate-800">¿Sigues ahí?</h3>
        <p className="text-sm text-slate-500">Tu sesión se cerrará por inactividad en</p>
        <div className="text-4xl font-bold text-rose-500">{mins}:{secs}</div>
        <p className="text-xs text-slate-400">Si no respondes, serás redirigido al login</p>
        <div className="flex gap-2">
          <button onClick={onCerrar} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Cerrar sesión</button>
          <button onClick={onContinuar} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">✅ Seguir</button>
        </div>
      </div>
    </div>
  );
}


// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
function Configuracion({ config, setConfig }) {
  const [form, setForm] = useState({ ...config });
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  const guardar = async () => {
    if (!form.nombre_edificio.trim()) return alert("El nombre del edificio es obligatorio");
    setGuardando(true);
    const payload = {
      nombre_edificio: form.nombre_edificio.trim(),
      nombre_corto: form.nombre_corto.trim() || form.nombre_edificio.trim().slice(0, 12),
      logo: form.logo || null,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('configuracion').update(payload).eq('id', 1);
    setGuardando(false);
    if (error) { alert("Error al guardar: " + error.message); return; }
    setConfig({ ...config, ...payload });
    setOk(true);
    setTimeout(() => setOk(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configuración del Edificio</h2>
        <p className="text-sm text-slate-500 mt-1">Personaliza el nombre e identidad visual de tu edificio</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        {/* Logo */}
        <div>
          <label className="text-sm font-semibold text-slate-700 mb-2 block">Logo del Edificio</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg">
              {form.logo
                ? <img src={form.logo} alt="logo" className="w-full h-full object-cover" />
                : <span className="text-3xl">🏢</span>}
            </div>
            <div className="space-y-2 flex-1">
              <label htmlFor="logo-input"
                className="block w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition text-center cursor-pointer">
                📎 Subir logo o foto
              </label>
              <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader();
                r.onload = ev => {
                  // Comprimir imagen
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX = 400;
                    const ratio = Math.min(MAX / img.width, MAX / img.height);
                    canvas.width = img.width * ratio;
                    canvas.height = img.height * ratio;
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    setForm(fm => ({ ...fm, logo: canvas.toDataURL('image/jpeg', 0.85) }));
                  };
                  img.src = ev.target.result;
                };
                r.readAsDataURL(f);
              }} />
              {form.logo && (
                <button onClick={() => setForm(fm => ({ ...fm, logo: null }))}
                  className="text-xs text-rose-500 hover:underline">✕ Quitar logo</button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-4">
          {/* Nombre completo */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">Nombre completo del edificio</label>
            <input
              value={form.nombre_edificio}
              onChange={e => {
                const val = e.target.value;
                setForm(fm => ({
                  ...fm,
                  nombre_edificio: val,
                  nombre_corto: val.slice(0, 12)
                }));
              }}
              placeholder="Ej: Edificio Torre del Sol"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-slate-400 mt-1">Se usará en comprobantes, informes y encabezados</p>
          </div>

          {/* Nombre corto */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">Nombre corto <span className="text-slate-400 font-normal">(aparece en el menú lateral)</span></label>
            <input
              value={form.nombre_corto}
              onChange={e => setForm(fm => ({ ...fm, nombre_corto: e.target.value.slice(0, 12) }))}
              placeholder="Máx. 12 caracteres"
              maxLength={12}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-slate-400 mt-1">{form.nombre_corto.length}/12 caracteres</p>
          </div>
        </div>

        {/* Vista previa */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Vista previa del menú lateral</p>
          <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3 w-fit">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden shadow-lg">
              {form.logo ? <img src={form.logo} alt="logo" className="w-full h-full object-cover" /> : <span className="text-lg">🏢</span>}
            </div>
            <div>
              <div className="text-sm font-bold text-white">{form.nombre_corto || form.nombre_edificio.slice(0, 12) || "Edificio"}</div>
              <div className="text-xs text-white/40">Panel de control</div>
            </div>
          </div>
        </div>

        {/* Guardar */}
        <div className="border-t border-slate-100 pt-4 flex items-center gap-3">
          <button onClick={guardar} disabled={guardando}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition">
            {guardando ? "Guardando..." : "💾 Guardar cambios"}
          </button>
          {ok && <span className="text-sm text-emerald-600 font-semibold">✅ Guardado correctamente</span>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [usuarios, setUsuarios] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [deptos, setDeptos] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [derramas, setDerramas] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [otrosIngresos, setOtrosIngresos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [showInactividad, setShowInactividad] = useState(false);
  const [config, setConfig] = useState({ nombre_edificio: "Mi Edificio", nombre_corto: "Edificio", logo: null, color_primario: "#6366f1" });
  const [bloqueado, setBloqueado] = useState(false); // logout suave offline
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const online = useConectividad();
  const { guardar: guardarCache, recuperar: recuperarCache } = useCacheDatos();

  useEffect(() => {
    // Restaurar sesión activa al recargar la página
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: usr } = await supabase.from('usuarios').select('*').eq('auth_id', session.user.id).eq('activo', true).single();
        if (usr) setUsuario({ ...usr, user: usr.usuario, deptos: usr.deptos || [], modulos: usr.modulos || [], permisos: usr.permisos || {} });
        await cargarDatos();
      } else {
        setCargando(false);
      }
    };
    init();

    // Listener para renovar sesión automáticamente cuando el token expira
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Token renovado automáticamente — no hacer nada, la sesión sigue activa
        console.log('Token renovado');
      }
      if (event === 'SIGNED_OUT') {
        setUsuario(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    // Si no hay internet, cargar desde caché
    if (!navigator.onLine) {
      try {
        const [cd, cu, cp, cpg, cdr, ce, coi, ccfg, cult] = await Promise.all([
          recuperarCache('deptos'), recuperarCache('usuarios'), recuperarCache('periodos'),
          recuperarCache('pagos'), recuperarCache('derramas'), recuperarCache('egresos'),
          recuperarCache('otros_ingresos'), recuperarCache('config'), recuperarCache('ultima_carga')
        ]);
        if (cd) setDeptos(cd.data);
        if (cu) setUsuarios(cu.data);
        if (cp) setPeriodos(cp.data);
        if (cpg) setPagos(cpg.data);
        if (cdr) setDerramas(cdr.data);
        if (ce) setEgresos(ce.data);
        if (coi) setOtrosIngresos(coi.data);
        if (ccfg) setConfig(ccfg.data);
      } catch(e) { console.warn('Cache read error:', e); }
      setCargando(false);
      return;
    }
    const [{ data: dataDeptos }, { data: dataUsuarios }, { data: dataPeriodos }, { data: dataPagos }, { data: dataDerramas }, { data: dataEgresos }, { data: dataOtrosIngresos }, { data: dataConfig }] = await Promise.all([
      supabase.from('deptos').select('*').order('id'),
      supabase.from('usuarios').select('*').order('id'),
      supabase.from('periodos').select('*').order('id'),
      supabase.from('pagos').select('*').order('id'),
      supabase.from('derramas').select('*').order('id'),
      supabase.from('egresos').select('*').order('id'),
      supabase.from('otros_ingresos').select('*').order('id'),
      supabase.from('configuracion').select('*').eq('id', 1).single()
    ]);
    if (dataConfig) setConfig(dataConfig);
    const deptosAdap = (dataDeptos || []).map(d => ({ ...d, alicuotaFija: d.alicuota_fija, metodoCalculo: d.metodo_calculo }));
    const periodosAdap = (dataPeriodos || []).map(p => ({ ...p, metodoPeriodo: p.metodo_periodo })).sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
    const pagosAdap = (dataPagos || []).map(p => ({ ...p, deptoId: p.depto_id, periodoId: p.periodo_id, periodoNombre: p.periodo_nombre, montoTotal: parseFloat(p.monto_total), montoPagado: parseFloat(p.monto_pagado), abonos: p.abonos || [] }));
    const usuariosAdap = (dataUsuarios || []).map(u => ({ ...u, pass: u.pass, user: u.usuario, deptos: u.deptos || [] }));
    setDeptos(deptosAdap);
    setUsuarios(usuariosAdap);
    setPeriodos(periodosAdap);
    setPagos(pagosAdap);
    const derramasAdap = (dataDerramas || []).map(d => ({ ...d, montoTotal: Number(d.monto_total ?? d.montoTotal ?? 0) }));
    const egresosAdap = (dataEgresos || []).map(e => ({ ...e, soporte: e.soporte || null }));
    setDerramas(derramasAdap);
    setEgresos(egresosAdap);
    const oi = (dataOtrosIngresos || []).map(i => ({ ...i, cat: i.categoria }));
    setOtrosIngresos(oi);
    // Guardar en caché para lectura offline
    try {
      await guardarCache('deptos', deptosAdap);
      await guardarCache('usuarios', usuariosAdap);
      await guardarCache('periodos', periodosAdap);
      await guardarCache('pagos', pagosAdap);
      await guardarCache('derramas', derramasAdap);
      await guardarCache('egresos', egresosAdap);
      await guardarCache('otros_ingresos', oi);
      await guardarCache('config', dataConfig || config);
      await guardarCache('ultima_carga', { timestamp: Date.now() });
    } catch(e) { console.warn('Cache write error:', e); }
    setCargando(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { pendientes, sincronizando, ultimaSync, resultadoSync, ejecutarSync, actualizarContador } = useSync(online, cargarDatos);

  const login = async (u) => { setUsuario(u); setTab(PERMS[u.rol]?.[0] || "dashboard"); await cargarDatos(); };
  const logout = async () => {
    if (!navigator.onLine) {
      // Logout suave: bloquear pantalla sin destruir sesión ni token
      setBloqueado(true);
      setShowInactividad(false);
      return;
    }
    await supabase.auth.signOut();
    setUsuario(null);
    setShowInactividad(false);
  };
  const desbloquear = () => {
    if (!usuario) return;
    const passCorrecta = usuarios.find(u => u.id === usuario.id)?.pass;
    if (pinInput === passCorrecta) {
      setBloqueado(false);
      setPinInput("");
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput("");
    }
  };

  // Hook inactividad — solo activo cuando hay sesión
  useInactividad(
    () => { setShowInactividad(true); },
    () => { logout(); },
    8 * 60 * 1000,
    2 * 60 * 1000
  );

  if (cargando) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-5xl mb-4">🏢</div>
        <div className="text-xl font-bold mb-2">{config.nombre_edificio}</div>
        <div className="text-indigo-200 text-sm">Cargando datos...</div>
      </div>
    </div>
  );
  if (!usuario) return <Login onLogin={login} appName={config.nombre_edificio} />;

  // Si el usuario tiene módulos personalizados, usarlos; sino usar PERMS por rol
  const tabsIds = (usuario.modulos && usuario.modulos.length > 0)
    ? usuario.modulos
    : (PERMS[usuario.rol] || []);
  const tabs = ALL_TABS.filter(t => tabsIds.includes(t.id));

  // Helper: nivel de acceso para un módulo
  const nivelAcceso = (modId) => {
    if (usuario.permisos && usuario.permisos[modId]) return usuario.permisos[modId];
    return PERMS_NIVEL_DEFAULT[usuario.rol]?.[modId] || "lectura";
  };
  const puedeEscribir = (modId) => ["escritura","admin"].includes(nivelAcceso(modId));
  const puedeEliminar = (modId) => nivelAcceso(modId) === "admin";
  const rolLabel = usuario.rol === "admin" ? "Administrador" : usuario.rol === "tesorero" ? "Tesorero" : `Prop. ${usuario.deptos?.map(id => deptos.find(d => d.id === id)?.depto).join(", ")}`;
  const initials = usuario.nombre.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const perActual = periodos[periodos.length - 1];

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {showInactividad && (
        <ModalInactividad
          onContinuar={() => setShowInactividad(false)}
          onCerrar={logout}
        />
      )}

      {/* ── Pantalla de bloqueo offline ── */}
      {bloqueado && (
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center z-[9999] p-6">
          <div className="bg-white/10 backdrop-blur rounded-3xl p-8 w-full max-w-sm text-center space-y-5">
            <div className="text-5xl">🔒</div>
            <div>
              <h2 className="text-xl font-bold text-white">{config.nombre_edificio}</h2>
              <p className="text-indigo-200 text-sm mt-1">Sesión bloqueada por inactividad</p>
              <p className="text-white/60 text-xs mt-2">👤 {usuario?.nombre}</p>
            </div>
            <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-2">
              <p className="text-amber-200 text-xs">📶 Sin conexión — tus cambios están guardados</p>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={e => e.key === 'Enter' && desbloquear()}
                placeholder="Ingresa tu contraseña"
                className={`w-full bg-white/10 border ${pinError ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400`}
                autoFocus
              />
              {pinError && <p className="text-rose-300 text-xs">Contraseña incorrecta</p>}
              <button onClick={desbloquear}
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-3 rounded-xl text-sm transition">
                🔓 Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner offline/sync ── */}
      {(!online || pendientes > 0 || sincronizando || resultadoSync) && (
        <div className={`fixed top-0 left-0 right-0 z-50 text-xs text-white px-4 py-2 flex items-center justify-between gap-3 transition-all
          ${!online ? 'bg-amber-600' : sincronizando ? 'bg-indigo-600' : resultadoSync?.errores > 0 ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          <span>
            {!online && pendientes === 0 && '📶 Sin conexión — puedes seguir trabajando con normalidad'}
            {!online && pendientes > 0 && `📶 Sin conexión — ${pendientes} cambio${pendientes !== 1 ? 's' : ''} pendiente${pendientes !== 1 ? 's' : ''} de sincronizar`}
            {online && sincronizando && '🔄 Aplicando cambios pendientes...'}
            {online && !sincronizando && resultadoSync && resultadoSync.errores === 0 &&
              `✅ Sincronización completa — ${resultadoSync.sincronizados} guardado${resultadoSync.sincronizados !== 1 ? 's' : ''}${resultadoSync.omitidos > 0 ? `, ${resultadoSync.omitidos} omitido${resultadoSync.omitidos !== 1 ? 's' : ''} (duplicado${resultadoSync.omitidos !== 1 ? 's' : ''})` : ''}`}
            {online && !sincronizando && resultadoSync && resultadoSync.errores > 0 &&
              `⚠️ ${resultadoSync.errores} cambio${resultadoSync.errores !== 1 ? 's' : ''} no pudieron aplicarse`}
            {online && !sincronizando && !resultadoSync && pendientes > 0 &&
              `⏳ ${pendientes} cambio${pendientes !== 1 ? 's' : ''} pendiente${pendientes !== 1 ? 's' : ''}`}
          </span>
          {online && pendientes > 0 && !sincronizando && (
            <button onClick={ejecutarSync}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-semibold transition flex-shrink-0">
              Sincronizar ahora
            </button>
          )}
          {ultimaSync && !sincronizando && !resultadoSync && online && pendientes === 0 && (
            <span className="text-white/70 flex-shrink-0">
              Última sync: {ultimaSync.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* ── SIDEBAR OSCURO (desktop) ── */}
      <aside className="hidden lg:flex flex-col w-60 bg-gray-900 text-white min-h-screen flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden shadow-lg shadow-indigo-500/30">
            {config.logo ? <img src={config.logo} alt="logo" className="w-full h-full object-cover" /> : <span className="text-lg">🏢</span>}
          </div>
          <div>
            <div className="text-sm font-bold text-white">{config.nombre_corto || config.nombre_edificio}</div>
            <div className="text-xs text-white/40">Panel de control</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4">
          <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">Navegación</p>
          <ul className="flex flex-col gap-1">
            {tabs.map(t => (
              <li key={t.id}>
                <button onClick={() => setTab(t.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${tab === t.id
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30"
                    : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                  <span className="text-base">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Período actual */}
        {perActual && (
          <div className="px-4 py-4 border-t border-white/10">
            <div className="rounded-xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 p-3 border border-indigo-500/20">
              <p className="text-xs font-semibold text-white/60">Período Actual</p>
              <p className="text-sm font-bold text-white mt-0.5">{perActual.nombre}</p>
              <p className="text-xs text-white/40 mt-1">Presupuesto: {fmt(perActual.presupuesto)}</p>
            </div>
          </div>
        )}
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">

        {/* ── HEADER gradiente ── */}
        <header className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white px-4 lg:px-6 py-0 flex items-center justify-between h-16 flex-shrink-0 sticky top-0 z-30">
          {/* Título página */}
          <div>
            <h2 className="text-base font-bold tracking-tight">
              {tabs.find(t => t.id === tab)?.label || "Dashboard"}
            </h2>
            <p className="text-xs text-white/60">Panel de administración</p>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-3">
            {/* Avatar + nombre */}
            <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-white/20">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-xs font-bold ring-2 ring-white/30">
                {initials}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold leading-tight">{usuario.nombre}</p>
                <p className="text-xs text-white/60">{rolLabel}</p>
              </div>
            </div>
            {/* Salir */}
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs text-white/70 hover:text-rose-300 hover:bg-white/10 px-3 py-1.5 rounded-xl transition">
              ↩ Salir
            </button>
          </div>
        </header>

        {/* ── MAIN ── */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto pb-24 lg:pb-6">
          {tab === "dashboard" && <Dashboard pagos={pagos} periodos={periodos} egresos={egresos} derramas={derramas} deptos={deptos} usuarios={usuarios} setTab={setTab} otrosIngresos={otrosIngresos} appName={config.nombre_edificio} />}
          {tab === "periodos" && <Periodos periodos={periodos} setPeriodos={setPeriodos} deptos={deptos} pagos={pagos} setPagos={setPagos} egresos={egresos} />}
          {tab === "pagos" && <Pagos pagos={pagos} setPagos={setPagos} periodos={periodos} deptos={deptos} derramas={derramas} usuarios={usuarios} rol={puedeEscribir("pagos") ? "admin" : "lectura"} canDelete={puedeEliminar("pagos")} actualizarContador={actualizarContador} />}
          {tab === "propiedades" && <Propiedades deptos={deptos} setDeptos={setDeptos} pagos={pagos} periodos={periodos} usuarios={usuarios} rol={puedeEscribir("propiedades") ? "admin" : "lectura"} canDelete={puedeEliminar("propiedades")} />}
          {tab === "derramas" && <Derramas derramas={derramas} setDerramas={setDerramas} deptos={deptos} rol={puedeEscribir("derramas") ? "admin" : "lectura"} canDelete={puedeEliminar("derramas")} usuarios={usuarios} periodos={periodos} pagos={pagos} setPagos={setPagos} actualizarContador={actualizarContador} />}
          {tab === "egresos" && <Egresos egresos={egresos} setEgresos={setEgresos} rol={puedeEscribir("egresos") ? "admin" : "lectura"} canDelete={puedeEliminar("egresos")} periodos={periodos} actualizarContador={actualizarContador} />}
          {tab === "otros_ingresos" && <OtrosIngresos otrosIngresos={otrosIngresos} setOtrosIngresos={setOtrosIngresos} usuarios={usuarios} rol={puedeEscribir("otros_ingresos") ? "admin" : "lectura"} canDelete={puedeEliminar("otros_ingresos")} periodos={periodos} actualizarContador={actualizarContador} />}
          {tab === "usuarios" && <Usuarios usuarios={usuarios} setUsuarios={setUsuarios} deptos={deptos} rol={usuario.rol} usuarioActivo={usuario} setUsuario={setUsuario} />}
          {tab === "portal" && <PortalProp usuario={usuario} pagos={pagos} derramas={derramas} deptos={deptos} periodos={periodos} />}
          {tab === "configuracion" && <Configuracion config={config} setConfig={setConfig} />}
        </main>

        {/* ── NAV MÓVIL inferior fija ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-gray-900 border-t border-white/10 overflow-x-auto" style={{paddingBottom: "env(safe-area-inset-bottom)"}}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex flex-col items-center py-2.5 px-3 text-xs transition ${tab === t.id ? "text-indigo-400" : "text-white/40 hover:text-white/70"}`}>
              <span className="text-lg">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
