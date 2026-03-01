

import { useState, useMemo, useRef } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COLORS = ["#6366f1","#f59e0b","#10b981","#f43f5e","#8b5cf6","#0ea5e9"];
const fmt = n => `$${Number(n).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtPct = n => `${Number(n).toFixed(4)}%`;
const today = {d:28,m:1,y:2026};
const todayStr = () => `${String(today.d).padStart(2,"0")}/${String(today.m+1).padStart(2,"0")}/${today.y}`;

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const NOMBRES = ["García","López","Martínez","Rodríguez","González","Pérez","Sánchez","Ramírez","Torres","Flores","Rivera","Gómez","Díaz","Cruz","Morales","Reyes","Herrera","Medina","Castro","Vargas","Romero","Jiménez","Alvarado","Mendoza","Rojas","Ortega","Delgado","Ramos","Vega","Núñez"];
const M2 = [65,72,68,80,75,70,90,85,78,82,65,72,68,80,75,70,90,85,78,82,65,72,68,80,75,70,90,85,78,82];
const TOTAL_M2 = M2.reduce((a,b)=>a+b,0);

const initDeptos = () => Array.from({length:30},(_,i)=>{
  const piso=Math.floor(i/6)+1, letra=["A","B","C","D","E","F"][i%6];
  return { id:i+1, depto:`${piso}${letra}`, piso, letra, m2:M2[i],
    coef:parseFloat((M2[i]/TOTAL_M2*100).toFixed(4)),
    alicuotaFija:100+(i%3)*20, metodoCalculo:"coeficiente", activo:true };
});

const initUsuarios = () => {
  const us = [{id:1,nombre:"Carlos Mendoza",email:"admin@edificio.com",rol:"admin",user:"admin",pass:"admin123",deptos:[],activo:true}];
  const props = NOMBRES.map((n,i)=>({
    id:i+2, nombre:`${n} ${NOMBRES[(i+5)%30]}`, email:`prop${i+1}@edificio.com`,
    rol:"prop", user:`prop${i+1}`, pass:`prop${i+1}`, deptos:[i+1], activo:true
  }));
  props[0].deptos = [1,2];
  us.push(...props);
  us.push({id:33,nombre:"Ana Torres",email:"tesorero@edificio.com",rol:"tesorero",user:"tesorero",pass:"tes123",deptos:[],activo:true});
  return us;
};

const initPeriodos = () => Array.from({length:6},(_,i)=>{
  const m=(today.m-5+i+12)%12, y=today.y-(today.m-5+i<0?1:0);
  return {id:i+1,mes:m,anio:y,nombre:`${MESES[m]} ${y}`,presupuesto:3600+i*80,estado:i<5?"cerrado":"abierto",metodoPeriodo:"coeficiente"};
});

const PERIODOS_INIT = initPeriodos();
const DEPTOS_INIT = initDeptos();

const initPagos = (deptos, periodos) => {
  let pid=1, res=[];
  periodos.forEach(per=>{
    deptos.forEach(d=>{
      const monto=parseFloat((d.coef/100*per.presupuesto).toFixed(2));
      const r=Math.random();
      const estado=per.estado==="cerrado"?(r>0.15?"pagado":r>0.07?"parcial":"pendiente"):(r>0.5?"pagado":r>0.3?"parcial":"pendiente");
      const abonos=[];
      if(estado==="pagado") abonos.push({id:1,monto,fecha:todayStr(),metodo:["Transferencia","Efectivo","Tarjeta","Cheque"][Math.floor(Math.random()*4)],imagen:null});
      else if(estado==="parcial"){ const p=parseFloat((monto*0.5).toFixed(2)); abonos.push({id:1,monto:p,fecha:todayStr(),metodo:["Transferencia","Efectivo"][Math.floor(Math.random()*2)],imagen:null}); }
      const montoPagado=abonos.reduce((a,x)=>a+x.monto,0);
      res.push({id:pid++,tipo:"ordinario",deptoId:d.id,depto:d.depto,periodoId:per.id,
        periodoNombre:per.nombre,mes:per.mes,anio:per.anio,montoTotal:monto,
        abonos,montoPagado,estado});
    });
  });
  return res;
};

const initEgresos = () => [
  {id:1,concepto:"Mantenimiento ascensor",cat:"Mantenimiento",monto:450,mes:1,anio:2026,fecha:"05/02/2026"},
  {id:2,concepto:"Servicio de limpieza",cat:"Servicios",monto:300,mes:1,anio:2026,fecha:"01/02/2026"},
  {id:3,concepto:"Electricidad áreas comunes",cat:"Servicios",monto:180,mes:1,anio:2026,fecha:"10/02/2026"},
  {id:4,concepto:"Portero/Conserje",cat:"Personal",monto:600,mes:1,anio:2026,fecha:"01/02/2026"},
  {id:5,concepto:"Reparación bomba agua",cat:"Mantenimiento",monto:220,mes:0,anio:2026,fecha:"15/01/2026"},
  {id:6,concepto:"Jardines",cat:"Mantenimiento",monto:150,mes:0,anio:2026,fecha:"20/01/2026"},
  {id:7,concepto:"Seguro edificio",cat:"Administrativo",monto:380,mes:0,anio:2026,fecha:"01/01/2026"},
  {id:8,concepto:"Pintura pasillo",cat:"Mantenimiento",monto:200,mes:1,anio:2026,fecha:"22/02/2026"},
];

const initDerramas = () => [
  {id:1,titulo:"Reparación bomba de agua",descripcion:"Rotura inesperada bomba principal",montoTotal:1200,fecha:"15/01/2026",mes:0,anio:2026,distribucion:"igual",estado:"activa"},
  {id:2,titulo:"Pintura fachada exterior",descripcion:"Mantenimiento preventivo fachada",montoTotal:3500,fecha:"01/02/2026",mes:1,anio:2026,distribucion:"coeficiente",estado:"activa"},
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function exportCSV(rows, cols, filename){
  const head=cols.map(c=>c.label).join(",");
  const body=rows.map(r=>cols.map(c=>`"${r[c.key]??''}"`).join(",")).join("\n");
  const blob=new Blob([head+"\n"+body],{type:"text/csv"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
}

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
function FilterBar({filters, setFilters, config, onClear}){
  const active=Object.values(filters).filter(v=>v&&v!=="todos"&&v!=="").length;
  return(
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">🔍 Filtros</span>
          {active>0&&<span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">{active} activo{active>1?"s":""}</span>}
        </div>
        {active>0&&<button onClick={onClear} className="text-xs text-rose-500 hover:text-rose-700 font-medium">✕ Limpiar filtros</button>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {config.map(f=>(
          <div key={f.key}>
            <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
            {f.type==="text"?(
              <input value={filters[f.key]||""} onChange={e=>setFilters({...filters,[f.key]:e.target.value})}
                placeholder={f.placeholder||"Buscar..."}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
            ):(
              <select value={filters[f.key]||"todos"} onChange={e=>setFilters({...filters,[f.key]:e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400">
                <option value="todos">{f.placeholder||"Todos"}</option>
                {f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RESULT COUNT ─────────────────────────────────────────────────────────────
function ResultCount({total, filtered, onExport}){
  return(
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">
        Mostrando <strong className="text-slate-700">{filtered}</strong> de <strong className="text-slate-700">{total}</strong> registros
      </span>
      {onExport&&<button onClick={onExport} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-200 font-medium">⬇️ Exportar CSV</button>}
    </div>
  );
}

// ─── MODAL CONFIRM ────────────────────────────────────────────────────────────
function Confirm({msg,onYes,onNo}){
  return(
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

// ─── COMPROBANTE ──────────────────────────────────────────────────────────────
function Comprobante({cuota,abono,depto,onClose}){
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🏢</div>
          <h2 className="text-xl font-bold text-slate-800">Edificio Central</h2>
          <p className="text-slate-400 text-sm">Comprobante Oficial de Pago</p>
        </div>
        <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 mb-4 space-y-2.5 text-sm bg-indigo-50">
          {[["N° Comprobante",`#${String(abono?.id||1).padStart(6,"0")}`,true],["Tipo",cuota.tipo==="ordinario"?"Alícuota Ordinaria":"Derrama Extraordinaria"],["Propiedad",cuota.depto],["Propietario",depto?.nombre||"-"],["Período",cuota.periodoNombre],cuota.concepto&&["Concepto",cuota.concepto],["Fecha",abono?.fecha||"-"],["Método",abono?.metodo||"-"]].filter(Boolean).map(([l,v,b])=>(
            <div key={l} className="flex justify-between"><span className="text-slate-500">{l}</span><span className={b?"font-bold text-indigo-600":"font-semibold"}>{v}</span></div>
          ))}
          {abono?.imagen&&<img src={abono.imagen} alt="Comprobante" className="rounded-lg w-full max-h-40 object-contain border border-indigo-200 mt-1"/>}
          <div className="border-t-2 border-indigo-300 pt-2.5 flex justify-between">
            <span className="font-bold text-slate-700">Este abono</span>
            <span className="font-bold text-emerald-600 text-lg">{fmt(abono?.monto||0)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500"><span>Total cuota</span><span>{fmt(cuota.montoTotal)}</span></div>
          <div className="flex justify-between text-xs font-semibold text-amber-600"><span>Saldo pendiente</span><span>{fmt(Math.max(0,cuota.montoTotal-cuota.montoPagado))}</span></div>
        </div>
        <div className="text-center text-xs text-slate-400 mb-4">✅ Verificado · {todayStr()}</div>
        <button onClick={onClose} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700">Cerrar</button>
      </div>
    </div>
  );
}

// ─── MODAL PAGO ───────────────────────────────────────────────────────────────
function ModalPago({cuota,onClose,onConfirm}){
  const [monto,setMonto]=useState("");
  const [metodo,setMetodo]=useState("Transferencia");
  const [imagen,setImagen]=useState(null);
  const [preview,setPreview]=useState(null);
  const [confirm,setConfirm]=useState(false);
  const fileRef=useRef();
  const saldo=parseFloat((cuota.montoTotal-cuota.montoPagado).toFixed(2));
  const montoN=parseFloat(monto||0);
  const err=montoN<=0||montoN>saldo;
  const handleImg=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{setImagen(ev.target.result);setPreview(ev.target.result);}; r.readAsDataURL(f); };
  const submit=()=>{ onConfirm({monto:montoN,metodo,imagen}); onClose(); };
  return(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {confirm&&<Confirm msg={`¿Confirmar abono de ${fmt(montoN)} para Propiedad ${cuota.depto}?`} onYes={submit} onNo={()=>setConfirm(false)}/>}
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
          <label className="text-xs text-slate-500 mb-1 block">Monto a abonar ($) — máx. {fmt(saldo)}</label>
          <input type="number" value={monto} min="0.01" max={saldo} step="0.01" onChange={e=>setMonto(e.target.value)}
            className={`w-full border rounded-xl px-3 py-2 text-sm ${err&&monto?"border-rose-400":""}`}/>
          {err&&monto&&<p className="text-rose-500 text-xs mt-1">Monto inválido o supera el saldo</p>}
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Método</label>
          <select value={metodo} onChange={e=>setMetodo(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm">
            {["Transferencia","Efectivo","Tarjeta","Cheque"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Imagen comprobante (opcional)</label>
          <div onClick={()=>fileRef.current.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-indigo-300">
            {preview?<img src={preview} alt="" className="max-h-24 mx-auto rounded-lg object-contain"/>:<div className="text-slate-400 text-sm py-2">📎 Subir imagen o tomar foto</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImg}/>
        </div>
        {cuota.abonos?.length>0&&(
          <div>
            <p className="text-xs text-slate-500 mb-1">Abonos anteriores</p>
            {cuota.abonos.map((a,i)=>(
              <div key={i} className="text-xs flex justify-between bg-emerald-50 rounded-lg px-2 py-1 mb-1">
                <span>{a.fecha} · {a.metodo}</span><span className="font-semibold text-emerald-700">{fmt(a.monto)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
          <button onClick={()=>!err&&monto&&setConfirm(true)} disabled={err||!monto} className="flex-1 bg-indigo-600 disabled:bg-slate-300 text-white py-2 rounded-xl text-sm font-semibold">Registrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({usuarios,onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState("");
  const go=()=>{ const usr=usuarios.find(x=>x.user===u.trim()&&x.pass===p.trim()&&x.activo); if(usr)onLogin(usr); else setErr("Usuario o contraseña incorrectos"); };
  return(
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-7">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🏢</div>
          <h1 className="text-2xl font-bold text-slate-800">Edificio Central</h1>
          <p className="text-slate-400 text-sm">Sistema de Administración v3.1</p>
        </div>
        <div className="space-y-3">
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Usuario" onKeyDown={e=>e.key==="Enter"&&go()} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"/>
          <input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="Contraseña" onKeyDown={e=>e.key==="Enter"&&go()} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"/>
          {err&&<p className="text-rose-500 text-sm text-center">{err}</p>}
          <button onClick={go} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700">Ingresar</button>
        </div>
        <div className="mt-5 p-3 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-600">Accesos demo:</p>
          <p>Admin: <span className="font-mono text-indigo-600">admin / admin123</span></p>
          <p>Tesorero: <span className="font-mono text-indigo-600">tesorero / tes123</span></p>
          <p>Propietario: <span className="font-mono text-indigo-600">prop1 / prop1</span></p>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({pagos,periodos,egresos,derramas,deptos,usuarios}){
  const [periodoId,setPeriodoId]=useState(periodos[periodos.length-1]?.id);
  const [detalle,setDetalle]=useState(null);
  const per=periodos.find(p=>p.id===Number(periodoId))||periodos[periodos.length-1];
  const cuotas=pagos.filter(p=>p.periodoId===per?.id&&p.tipo==="ordinario");
  const ingMes=cuotas.filter(p=>p.estado==="pagado").reduce((a,p)=>a+p.montoPagado,0);
  const pendMes=cuotas.filter(p=>p.estado!=="pagado").reduce((a,p)=>a+Math.max(0,p.montoTotal-p.montoPagado),0);
  const egrMes=egresos.filter(e=>e.mes===per?.mes&&e.anio===per?.anio).reduce((a,e)=>a+e.monto,0);
  const getNombre=id=>usuarios.find(u=>u.deptos?.includes(id))?.nombre||"-";
  const morososList=cuotas.filter(p=>p.estado!=="pagado").map(p=>({...p,propietario:getNombre(p.deptoId),saldo:parseFloat((p.montoTotal-p.montoPagado).toFixed(2))}));
  const barData=periodos.map(pr=>{
    const ing=pagos.filter(p=>p.periodoId===pr.id&&p.estado==="pagado").reduce((a,p)=>a+p.montoPagado,0);
    const egr=egresos.filter(e=>e.mes===pr.mes&&e.anio===pr.anio).reduce((a,e)=>a+e.monto,0);
    return{mes:pr.nombre.slice(0,6),ingresos:parseFloat(ing.toFixed(2)),egresos:parseFloat(egr.toFixed(2)),flujo:parseFloat((ing-egr).toFixed(2))};
  });
  const pieData=[{name:"Cobrado",value:parseFloat(ingMes.toFixed(2)),color:"#6366f1"},{name:"Pendiente",value:parseFloat(pendMes.toFixed(2)),color:"#f59e0b"}];
  const cards=[
    {l:"Ingresos",v:fmt(ingMes),i:"💰",bg:"bg-indigo-50 border-indigo-200",t:"text-indigo-700",key:"ingresos"},
    {l:"Egresos",v:fmt(egrMes),i:"📤",bg:"bg-rose-50 border-rose-200",t:"text-rose-700"},
    {l:"Pendientes",v:fmt(pendMes),i:"⏳",bg:"bg-amber-50 border-amber-200",t:"text-amber-700",key:"pendientes"},
    {l:"Morosos",v:`${morososList.length}/30`,i:"⚠️",bg:"bg-orange-50 border-orange-200",t:"text-orange-700",key:"morosos"},
    {l:"Flujo Neto",v:fmt(ingMes-egrMes),i:"📊",bg:"bg-emerald-50 border-emerald-200",t:"text-emerald-700"},
    {l:"Derramas Activas",v:`${derramas.filter(d=>d.estado==="activa").length}`,i:"🔔",bg:"bg-purple-50 border-purple-200",t:"text-purple-700"},
  ];
  const detalleMap={
    morosos:{title:"Propietarios Morosos",cols:[{key:"depto",label:"Propiedad"},{key:"propietario",label:"Propietario"},{key:"saldo",label:"Saldo"}],rows:morososList,file:"morosos.csv"},
    ingresos:{title:"Ingresos del Período",cols:[{key:"depto",label:"Propiedad"},{key:"montoPagado",label:"Pagado"}],rows:cuotas.filter(p=>p.estado==="pagado"),file:"ingresos.csv"},
    pendientes:{title:"Alícuotas Pendientes",cols:[{key:"depto",label:"Propiedad"},{key:"montoTotal",label:"Total"},{key:"montoPagado",label:"Pagado"}],rows:cuotas.filter(p=>p.estado!=="pagado"),file:"pendientes.csv"},
  };
  return(
    <div className="space-y-5">
      {detalle&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800">{detalleMap[detalle]?.title}</h3>
              <button onClick={()=>setDetalle(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <table className="w-full text-sm mb-4">
              <thead className="bg-slate-50"><tr>{detalleMap[detalle]?.cols.map(c=><th key={c.key} className="px-3 py-2 text-left text-slate-600">{c.label}</th>)}</tr></thead>
              <tbody>{detalleMap[detalle]?.rows.slice(0,20).map((r,i)=>(
                <tr key={i} className="border-t border-slate-100">{detalleMap[detalle].cols.map(c=>(
                  <td key={c.key} className="px-3 py-2">{typeof r[c.key]==="number"?fmt(r[c.key]):r[c.key]}</td>
                ))}</tr>
              ))}</tbody>
            </table>
            <div className="flex gap-2">
              <button onClick={()=>exportCSV(detalleMap[detalle].rows,detalleMap[detalle].cols,detalleMap[detalle].file)} className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold">⬇️ Exportar CSV</button>
              <button onClick={()=>setDetalle(null)} className="px-4 border border-slate-300 py-2 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <select value={periodoId} onChange={e=>setPeriodoId(Number(e.target.value))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          {periodos.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(c=>(
          <div key={c.l} onClick={()=>c.key&&setDetalle(c.key)} className={`rounded-2xl border p-4 ${c.bg} ${c.key?"cursor-pointer hover:shadow-md transition":""}`}>
            <div className="text-2xl mb-1">{c.i}</div>
            <div className={`text-xl font-bold ${c.t}`}>{c.v}</div>
            <div className="text-xs text-slate-500 mt-1">{c.l}</div>
            {c.key&&<div className="text-xs text-indigo-400 mt-1">↗ Ver detalle</div>}
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-700 mb-3">Ingresos vs Egresos</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="mes" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
              <Tooltip formatter={v=>fmt(v)}/><Legend/>
              <Bar dataKey="ingresos" fill="#6366f1" radius={[4,4,0,0]}/>
              <Bar dataKey="egresos" fill="#f43f5e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-700 mb-3">Flujo de Caja</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={barData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="mes" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
              <Tooltip formatter={v=>fmt(v)}/>
              <Line type="monotone" dataKey="flujo" stroke="#10b981" strokeWidth={2} dot={{r:4}} name="Flujo Neto"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-700 mb-3">Alícuotas — {per?.nombre}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
              {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
            </Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-slate-700">Morosos — {per?.nombre}</h3>
            <button onClick={()=>exportCSV(morososList,[{key:"depto",label:"Propiedad"},{key:"propietario",label:"Nombre"},{key:"saldo",label:"Saldo"}],"morosos.csv")} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">⬇️ CSV</button>
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {morososList.slice(0,10).map(p=>(
              <div key={p.id} className="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-bold text-indigo-700">{p.depto}</span>
                <span className="text-slate-600 truncate mx-2">{p.propietario.split(" ")[0]}</span>
                <span className="font-bold text-amber-600">{fmt(p.saldo)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PERIODOS ────────────────────────────────────────────────────────────────
function Periodos({periodos,setPeriodos,deptos,pagos,setPagos}){
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({mes:today.m,anio:today.y,presupuesto:"3800",metodoPeriodo:"coeficiente"});
  const totalM2=deptos.reduce((a,d)=>a+d.m2,0);
  const crear=()=>{
    if(periodos.find(p=>p.mes===Number(form.mes)&&p.anio===Number(form.anio))) return alert("Período ya existe");
    const np={id:periodos.length+1,mes:Number(form.mes),anio:Number(form.anio),nombre:`${MESES[form.mes]} ${form.anio}`,presupuesto:Number(form.presupuesto),estado:"abierto",metodoPeriodo:form.metodoPeriodo};
    const cuotas=deptos.map((d,i)=>{
      const monto=form.metodoPeriodo==="coeficiente"?parseFloat((d.m2/totalM2*np.presupuesto).toFixed(2)):d.alicuotaFija;
      return{id:pagos.length+i+1,tipo:"ordinario",deptoId:d.id,depto:d.depto,periodoId:np.id,periodoNombre:np.nombre,mes:np.mes,anio:np.anio,montoTotal:monto,abonos:[],montoPagado:0,estado:"pendiente"};
    });
    setPeriodos([...periodos,np]); setPagos([...pagos,...cuotas]); setShowNew(false);
  };
  return(
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Períodos de Cobro</h2>
        <button onClick={()=>setShowNew(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Nuevo Período</button>
      </div>
      {showNew&&(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Crear Período</h3>
            <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700">
              <p className="font-semibold">Total m² edificio: {totalM2} m²</p>
              <p>Ej. Depto 1A ({deptos[0]?.m2}m²): coef. {fmtPct(deptos[0]?.m2/totalM2*100)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 mb-1 block">Mes</label>
                <select value={form.mes} onChange={e=>setForm({...form,mes:Number(e.target.value)})} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Año</label>
                <input type="number" value={form.anio} onChange={e=>setForm({...form,anio:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/>
              </div>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Presupuesto Total ($)</label>
              <input type="number" value={form.presupuesto} onChange={e=>setForm({...form,presupuesto:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Método</label>
              <select value={form.metodoPeriodo} onChange={e=>setForm({...form,metodoPeriodo:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="coeficiente">Por coeficiente m²</option>
                <option value="fijo">Monto fijo</option>
              </select>
            </div>
            {form.metodoPeriodo==="coeficiente"&&form.presupuesto&&(
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold">Vista previa (primeras 3):</p>
                {deptos.slice(0,3).map(d=><p key={d.id}>Depto {d.depto}: <strong>{fmt(d.m2/totalM2*Number(form.presupuesto))}</strong></p>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={crear} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">Crear</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {[...periodos].reverse().map(p=>{
          const cuotas=pagos.filter(x=>x.periodoId===p.id);
          const cobrado=cuotas.filter(x=>x.estado==="pagado").reduce((a,x)=>a+x.montoPagado,0);
          const total=cuotas.reduce((a,x)=>a+x.montoTotal,0);
          const pct=total>0?Math.min(100,(cobrado/total*100)).toFixed(0):0;
          return(
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{p.nombre}</h3>
                  <p className="text-xs text-slate-500">Presupuesto: {fmt(p.presupuesto)} · {p.metodoPeriodo==="coeficiente"?"Por coeficiente m²":"Monto fijo"}</p>
                </div>
                <span className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${p.estado==="abierto"?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{p.estado==="abierto"?"🟢 Abierto":"🔒 Cerrado"}</span>
              </div>
              <div className="flex gap-4 text-sm flex-wrap mb-2">
                <span className="text-emerald-600 font-semibold">Cobrado: {fmt(cobrado)}</span>
                <span className="text-amber-600">Pendiente: {fmt(total-cobrado)}</span>
                <span className="text-slate-400">{cuotas.filter(x=>x.estado==="pagado").length}/{cuotas.length} propiedades</span>
              </div>
              <div className="bg-slate-100 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full" style={{width:`${pct}%`}}/></div>
              <p className="text-xs text-slate-400 mt-1">{pct}% cobrado</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PAGOS ────────────────────────────────────────────────────────────────────
function Pagos({pagos,setPagos,periodos,deptos,derramas,usuarios,rol}){
  const [tabP,setTabP]=useState("ordinarios");
  const [modal,setModal]=useState(null);
  const [comprobante,setComprobante]=useState(null);
  const [revertir,setRevertir]=useState(null);

  // Filtros ordinarios
  const [fOrd,setFOrd]=useState({periodo:periodos[periodos.length-1]?.id||1,estado:"todos",propietario:"",propiedad:"",piso:"todos",metodo:"todos"});
  // Filtros derramas
  const [fDer,setFDer]=useState({derrama:derramas[0]?.id||1,estado:"todos",propietario:"",propiedad:"",piso:"todos",metodo:"todos"});

  const getNombre=id=>usuarios.find(u=>u.deptos?.includes(id))?.nombre||"-";
  const getPiso=depto=>depto?depto[0]:"";

  // Cuotas ordinarias filtradas
  const ordBase=pagos.filter(p=>p.periodoId===Number(fOrd.periodo)&&p.tipo==="ordinario");
  const ordFiltradas=useMemo(()=>ordBase.filter(p=>{
    const nombre=getNombre(p.deptoId).toLowerCase();
    if(fOrd.estado!=="todos"&&p.estado!==fOrd.estado) return false;
    if(fOrd.propietario&&!nombre.includes(fOrd.propietario.toLowerCase())) return false;
    if(fOrd.propiedad&&!p.depto.toLowerCase().includes(fOrd.propiedad.toLowerCase())) return false;
    if(fOrd.piso!=="todos"&&getPiso(p.depto)!==fOrd.piso) return false;
    if(fOrd.metodo!=="todos"){
      const lastMetodo=p.abonos?.[p.abonos.length-1]?.metodo;
      if(lastMetodo!==fOrd.metodo) return false;
    }
    return true;
  }),[pagos,fOrd]);

  // Cuotas derrama
  const derActual=derramas.find(d=>d.id===Number(fDer.derrama));
  const derBase=derActual?deptos.map(d=>{
    const monto=derActual.distribucion==="coeficiente"?parseFloat((d.coef/100*derActual.montoTotal).toFixed(2)):parseFloat((derActual.montoTotal/30).toFixed(2));
    const ex=pagos.find(p=>p.tipo==="derrama"&&p.deptoId===d.id&&p.periodoNombre===derActual.titulo);
    return ex||{id:`v-${d.id}-${derActual.id}`,tipo:"derrama",deptoId:d.id,depto:d.depto,periodoNombre:derActual.titulo,periodoId:periodos[periodos.length-1]?.id,mes:derActual.mes,anio:derActual.anio,montoTotal:monto,abonos:[],montoPagado:0,estado:"pendiente",concepto:derActual.titulo};
  }):[];
  const derFiltradas=useMemo(()=>derBase.filter(p=>{
    const nombre=getNombre(p.deptoId).toLowerCase();
    if(fDer.estado!=="todos"&&p.estado!==fDer.estado) return false;
    if(fDer.propietario&&!nombre.includes(fDer.propietario.toLowerCase())) return false;
    if(fDer.propiedad&&!p.depto.toLowerCase().includes(fDer.propiedad.toLowerCase())) return false;
    if(fDer.piso!=="todos"&&getPiso(p.depto)!==fDer.piso) return false;
    if(fDer.metodo!=="todos"){
      const lastMetodo=p.abonos?.[p.abonos.length-1]?.metodo;
      if(lastMetodo!==fDer.metodo) return false;
    }
    return true;
  }),[pagos,fDer,derramas]);

  const registrarAbono=(cuotaId,{monto,metodo,imagen},isDerrama=false,cuotaVirtual=null)=>{
    if(isDerrama){
      const ex=pagos.find(p=>p.tipo==="derrama"&&p.deptoId===cuotaVirtual.deptoId&&p.periodoNombre===cuotaVirtual.periodoNombre);
      if(ex){
        setPagos(pagos.map(p=>{
          if(p.id!==ex.id) return p;
          const abonos=[...p.abonos,{id:p.abonos.length+1,monto,fecha:todayStr(),metodo,imagen}];
          const montoPagado=parseFloat((p.montoPagado+monto).toFixed(2));
          const estado=montoPagado>=p.montoTotal?"pagado":montoPagado>0?"parcial":"pendiente";
          const upd={...p,abonos,montoPagado,estado};
          setTimeout(()=>setComprobante({cuota:upd,abono:abonos[abonos.length-1]}),100);
          return upd;
        }));
      } else {
        const abonos=[{id:1,monto,fecha:todayStr(),metodo,imagen}];
        const montoPagado=monto; const estado=montoPagado>=cuotaVirtual.montoTotal?"pagado":"parcial";
        const nw={...cuotaVirtual,id:Date.now(),abonos,montoPagado,estado};
        setPagos(p=>[...p,nw]);
        setTimeout(()=>setComprobante({cuota:nw,abono:abonos[0]}),100);
      }
    } else {
      setPagos(pagos.map(p=>{
        if(p.id!==cuotaId) return p;
        const abonos=[...p.abonos,{id:p.abonos.length+1,monto,fecha:todayStr(),metodo,imagen}];
        const montoPagado=parseFloat((p.montoPagado+monto).toFixed(2));
        const estado=montoPagado>=p.montoTotal?"pagado":montoPagado>0?"parcial":"pendiente";
        const upd={...p,abonos,montoPagado,estado};
        setTimeout(()=>setComprobante({cuota:upd,abono:abonos[abonos.length-1]}),100);
        return upd;
      }));
    }
  };

  const doRevertir=id=>{
    setPagos(pagos.map(p=>p.id===id?{...p,abonos:[],montoPagado:0,estado:"pendiente"}:p));
    setRevertir(null);
  };

  const estadoBadge=p=>{
    const saldo=parseFloat((p.montoTotal-p.montoPagado).toFixed(2));
    if(p.estado==="pagado") return <button onClick={()=>rol==="admin"&&setRevertir(p.id)} className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ${rol==="admin"?"hover:bg-rose-100 hover:text-rose-700 transition":""}`}>✅ Pagado{rol==="admin"?" ✎":""}</button>;
    if(p.estado==="parcial") return <button onClick={()=>setModal(p)} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition">💧 Parcial · {fmt(saldo)}</button>;
    return <button onClick={()=>setModal(p)} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition">⏳ Pendiente →</button>;
  };

  const pisos=[...new Set(deptos.map(d=>d.piso))].sort();
  const ordFilterConfig=[
    {key:"estado",label:"Estado",type:"select",options:[{value:"pagado",label:"✅ Pagado"},{value:"parcial",label:"💧 Parcial"},{value:"pendiente",label:"⏳ Pendiente"}]},
    {key:"propietario",label:"Propietario",type:"text",placeholder:"Buscar nombre..."},
    {key:"propiedad",label:"Propiedad",type:"text",placeholder:"Ej: 2A, 3B..."},
    {key:"piso",label:"Piso",type:"select",options:pisos.map(p=>({value:String(p),label:`Piso ${p}`}))},
    {key:"metodo",label:"Último método",type:"select",options:[{value:"Transferencia",label:"Transferencia"},{value:"Efectivo",label:"Efectivo"},{value:"Tarjeta",label:"Tarjeta"},{value:"Cheque",label:"Cheque"}]},
  ];
  const derFilterConfig=[
    {key:"estado",label:"Estado",type:"select",options:[{value:"pagado",label:"✅ Pagado"},{value:"parcial",label:"💧 Parcial"},{value:"pendiente",label:"⏳ Pendiente"}]},
    {key:"propietario",label:"Propietario",type:"text",placeholder:"Buscar nombre..."},
    {key:"propiedad",label:"Propiedad",type:"text",placeholder:"Ej: 2A, 3B..."},
    {key:"piso",label:"Piso",type:"select",options:pisos.map(p=>({value:String(p),label:`Piso ${p}`}))},
    {key:"metodo",label:"Último método",type:"select",options:[{value:"Transferencia",label:"Transferencia"},{value:"Efectivo",label:"Efectivo"},{value:"Tarjeta",label:"Tarjeta"},{value:"Cheque",label:"Cheque"}]},
  ];

  const clearOrd=()=>setFOrd({periodo:fOrd.periodo,estado:"todos",propietario:"",propiedad:"",piso:"todos",metodo:"todos"});
  const clearDer=()=>setFDer({derrama:fDer.derrama,estado:"todos",propietario:"",propiedad:"",piso:"todos",metodo:"todos"});

  const lista=tabP==="ordinarios"?ordFiltradas:derFiltradas;
  const listaBase=tabP==="ordinarios"?ordBase:derBase;

  return(
    <div className="space-y-4">
      {comprobante&&<Comprobante cuota={comprobante.cuota} abono={comprobante.abono} depto={usuarios.find(u=>u.deptos?.includes(comprobante.cuota.deptoId))} onClose={()=>setComprobante(null)}/>}
      {modal&&<ModalPago cuota={modal} onClose={()=>setModal(null)} onConfirm={data=>{ if(modal.tipo==="derrama")registrarAbono(null,data,true,modal); else registrarAbono(modal.id,data); }}/>}
      {revertir&&<Confirm msg="¿Revertir este pago? Se eliminarán todos los abonos." onYes={()=>doRevertir(revertir)} onNo={()=>setRevertir(null)}/>}

      <h2 className="text-2xl font-bold text-slate-800">Gestión de Pagos</h2>
      <div className="flex gap-2 border-b border-slate-200">
        {[["ordinarios","Alícuotas Ordinarias"],["derramas","Derramas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTabP(k)} className={`pb-2 px-1 text-sm font-semibold border-b-2 transition ${tabP===k?"border-indigo-600 text-indigo-700":"border-transparent text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {/* Selector de período o derrama */}
      <div className="flex gap-3">
        {tabP==="ordinarios"?(
          <select value={fOrd.periodo} onChange={e=>setFOrd({...fOrd,periodo:Number(e.target.value)})} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            {periodos.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        ):(
          <select value={fDer.derrama} onChange={e=>setFDer({...fDer,derrama:Number(e.target.value)})} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            {derramas.map(d=><option key={d.id} value={d.id}>{d.titulo}</option>)}
          </select>
        )}
      </div>

      {/* Filtros avanzados */}
      <FilterBar
        filters={tabP==="ordinarios"?fOrd:fDer}
        setFilters={tabP==="ordinarios"?setFOrd:setFDer}
        config={tabP==="ordinarios"?ordFilterConfig:derFilterConfig}
        onClear={tabP==="ordinarios"?clearOrd:clearDer}
      />

      <ResultCount total={listaBase.length} filtered={lista.length}
        onExport={()=>exportCSV(lista,[{key:"depto",label:"Propiedad"},{key:"estado",label:"Estado"},{key:"montoTotal",label:"Total"},{key:"montoPagado",label:"Pagado"}],"pagos.csv")}/>

      {/* Resumen rápido */}
      <div className="grid grid-cols-3 gap-3">
        {[["✅ Pagados",lista.filter(p=>p.estado==="pagado").length,"text-emerald-600 bg-emerald-50"],
          ["💧 Parciales",lista.filter(p=>p.estado==="parcial").length,"text-blue-600 bg-blue-50"],
          ["⏳ Pendientes",lista.filter(p=>p.estado==="pendiente").length,"text-amber-600 bg-amber-50"]
        ].map(([l,v,cls])=>(
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
              <th className="px-3 py-3 text-center">Estado</th>
              <th className="px-3 py-3 text-center">🧾</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(p=>{
              const lastAbono=p.abonos?.[p.abonos.length-1];
              return(
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-bold text-indigo-700">{p.depto}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-slate-500 text-xs">{getNombre(p.deptoId)}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-slate-400 text-xs">Piso {p.depto?.[0]}</td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell font-semibold">{fmt(p.montoTotal)}</td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell text-emerald-600">{fmt(p.montoPagado)}</td>
                  <td className="px-3 py-2.5 text-center">{estadoBadge(p)}</td>
                  <td className="px-3 py-2.5 text-center">{lastAbono?<button onClick={()=>setComprobante({cuota:p,abono:lastAbono})} className="text-indigo-400 hover:text-indigo-600 text-lg">🧾</button>:<span className="text-slate-200">🧾</span>}</td>
                </tr>
              );
            })}
            {lista.length===0&&<tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No se encontraron registros con los filtros aplicados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PROPIEDADES ──────────────────────────────────────────────────────────────
function Propiedades({deptos,setDeptos,pagos,periodos,usuarios,rol}){
  const [sel,setSel]=useState(null);
  const [edit,setEdit]=useState(false);
  const [ed,setEd]=useState({});
  const [filters,setFilters]=useState({propietario:"",propiedad:"",piso:"todos",estado:"todos"});
  const perActual=periodos[periodos.length-1];

  const getEst=d=>{ const c=pagos.find(p=>p.deptoId===d.id&&p.periodoId===perActual?.id&&p.tipo==="ordinario"); return c?.estado==="pagado"?"pagado":c?.estado==="parcial"?"parcial":"pendiente"; };
  const getOwner=id=>usuarios.find(u=>u.rol==="prop"&&u.deptos?.includes(id));
  const pisos=[...new Set(deptos.map(d=>d.piso))].sort();

  const filtradas=useMemo(()=>deptos.filter(d=>{
    const owner=getOwner(d.id);
    const nombre=owner?.nombre||"";
    if(filters.propietario&&!nombre.toLowerCase().includes(filters.propietario.toLowerCase())) return false;
    if(filters.propiedad&&!d.depto.toLowerCase().includes(filters.propiedad.toLowerCase())) return false;
    if(filters.piso!=="todos"&&String(d.piso)!==filters.piso) return false;
    if(filters.estado!=="todos"&&getEst(d)!==filters.estado) return false;
    return true;
  }),[deptos,filters,pagos]);

  const filterConfig=[
    {key:"propietario",label:"Propietario",type:"text",placeholder:"Buscar nombre..."},
    {key:"propiedad",label:"Propiedad",type:"text",placeholder:"Ej: 2A, 3B..."},
    {key:"piso",label:"Piso",type:"select",options:pisos.map(p=>({value:String(p),label:`Piso ${p}`}))},
    {key:"estado",label:"Estado",type:"select",options:[{value:"pagado",label:"✅ Al día"},{value:"parcial",label:"💧 Parcial"},{value:"pendiente",label:"⚠️ Moroso"}]},
  ];

  const guardar=()=>{
    const totalM2=deptos.reduce((a,d)=>d.id===sel.id?a+Number(ed.m2):a+d.m2,0);
    setDeptos(deptos.map(d=>d.id===sel.id?{...d,...ed,m2:Number(ed.m2),coef:parseFloat((Number(ed.m2)/totalM2*100).toFixed(4))}:d));
    setSel({...sel,...ed}); setEdit(false);
  };

  const estColor=e=>e==="pagado"?"text-emerald-600":e==="parcial"?"text-blue-500":"text-rose-500";
  const estIcon=e=>e==="pagado"?"✅":e==="parcial"?"💧":"⚠️";
  const estLabel=e=>e==="pagado"?"Al día":e==="parcial"?"Parcial":"Moroso";

  if(sel) return(
    <div className="space-y-4">
      <button onClick={()=>{setSel(null);setEdit(false);}} className="text-indigo-600 text-sm font-semibold hover:underline">← Volver</button>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex justify-between flex-wrap gap-2">
          <div className="flex gap-3 items-center">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-2xl font-bold text-indigo-700">{sel.depto}</div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Propiedad {sel.depto}</h3>
              <p className="text-slate-500 text-sm">Piso {sel.piso} · {sel.m2} m² · Coef. {fmtPct(sel.coef)}</p>
            </div>
          </div>
          {rol==="admin"&&<button onClick={()=>{setEdit(!edit);setEd({m2:sel.m2,alicuotaFija:sel.alicuotaFija,metodoCalculo:sel.metodoCalculo});}} className="self-start text-sm border border-indigo-200 px-3 py-1.5 rounded-xl text-indigo-600 hover:bg-indigo-50">✏️ Editar</button>}
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1 font-semibold">Propietario(s):</p>
          {usuarios.filter(u=>u.rol==="prop"&&u.deptos?.includes(sel.id)).map(u=>(
            <div key={u.id} className="flex gap-3 items-center bg-slate-50 rounded-xl px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">{u.nombre}</span>
              <span className="text-slate-400 text-xs">{u.email}</span>
              {u.deptos.length>1&&<span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{u.deptos.length} propiedades</span>}
            </div>
          ))}
        </div>
        {edit&&(
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-xs text-slate-500 mb-1 block">m²</label><input type="number" value={ed.m2} onChange={e=>setEd({...ed,m2:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Alícuota fija ($)</label><input type="number" value={ed.alicuotaFija} onChange={e=>setEd({...ed,alicuotaFija:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Método</label>
              <select value={ed.metodoCalculo} onChange={e=>setEd({...ed,metodoCalculo:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="coeficiente">Por coeficiente</option><option value="fijo">Monto fijo</option>
              </select>
            </div>
            <button onClick={guardar} className="md:col-span-3 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">Guardar</button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-left">Período</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Pagado</th><th className="px-3 py-2 text-center">Estado</th></tr></thead>
          <tbody>{pagos.filter(p=>p.deptoId===sel.id).sort((a,b)=>b.anio-a.anio||b.mes-a.mes).map(p=>(
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{p.periodoNombre}</td>
              <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${p.tipo==="ordinario"?"bg-indigo-100 text-indigo-700":"bg-purple-100 text-purple-700"}`}>{p.tipo==="ordinario"?"Ordinaria":"Derrama"}</span></td>
              <td className="px-3 py-2 text-right">{fmt(p.montoTotal)}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{fmt(p.montoPagado)}</td>
              <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${p.estado==="pagado"?"bg-emerald-100 text-emerald-700":p.estado==="parcial"?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>{p.estado}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );

  return(
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Propiedades</h2>
      <FilterBar filters={filters} setFilters={setFilters} config={filterConfig} onClear={()=>setFilters({propietario:"",propiedad:"",piso:"todos",estado:"todos"})}/>
      <ResultCount total={deptos.length} filtered={filtradas.length}
        onExport={()=>exportCSV(filtradas.map(d=>({...d,propietario:getOwner(d.id)?.nombre||"-",estado:estLabel(getEst(d))})),[{key:"depto",label:"Propiedad"},{key:"piso",label:"Piso"},{key:"m2",label:"m²"},{key:"coef",label:"Coef%"},{key:"propietario",label:"Propietario"},{key:"estado",label:"Estado"}],"propiedades.csv")}/>
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {filtradas.map(d=>{
          const est=getEst(d); const owner=getOwner(d.id);
          return(
            <div key={d.id} onClick={()=>setSel(d)} className="bg-white border border-slate-200 rounded-2xl p-3 cursor-pointer hover:border-indigo-300 hover:shadow-md transition">
              <div className="text-xl font-bold text-indigo-600">{d.depto}</div>
              <div className="text-xs text-slate-500 truncate">{owner?.nombre?.split(" ")[0]||"—"}</div>
              <div className="text-xs text-slate-400">{d.m2}m²</div>
              <div className={`text-xs mt-1 font-semibold ${estColor(est)}`}>{estIcon(est)} {estLabel(est)}</div>
            </div>
          );
        })}
        {filtradas.length===0&&<div className="col-span-6 text-center text-slate-400 py-10">No se encontraron propiedades con los filtros aplicados</div>}
      </div>
    </div>
  );
}

// ─── DERRAMAS ────────────────────────────────────────────────────────────────
function Derramas({derramas,setDerramas,deptos,rol}){
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({titulo:"",descripcion:"",montoTotal:"",distribucion:"igual",mes:today.m,anio:today.y});
  const crear=()=>{
    if(!form.titulo||!form.montoTotal) return;
    setDerramas([...derramas,{id:derramas.length+1,...form,montoTotal:Number(form.montoTotal),fecha:todayStr(),estado:"activa"}]);
    setShowNew(false);
  };
  return(
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Derramas Extraordinarias</h2>
        {rol==="admin"&&<button onClick={()=>setShowNew(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700">+ Nueva Derrama</button>}
      </div>
      {showNew&&(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Nueva Derrama</h3>
            <div><label className="text-xs text-slate-500 mb-1 block">Título</label><input value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Descripción</label><input value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Monto Total ($)</label><input type="number" value={form.montoTotal} onChange={e=>setForm({...form,montoTotal:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 mb-1 block">Mes</label>
                <select value={form.mes} onChange={e=>setForm({...form,mes:Number(e.target.value)})} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Año</label><input type="number" value={form.anio} onChange={e=>setForm({...form,anio:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            </div>
            <div><label className="text-xs text-slate-500 mb-1 block">Distribución</label>
              <select value={form.distribucion} onChange={e=>setForm({...form,distribucion:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="igual">Partes iguales</option><option value="coeficiente">Por coeficiente m²</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={crear} className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-semibold">Crear</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {derramas.map(d=>(
          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800">{d.titulo}</h3>
                <p className="text-xs text-slate-500">{d.descripcion} · {d.fecha}</p>
                <p className="text-xs text-slate-500 mt-0.5">Distribución: <strong>{d.distribucion==="igual"?"Partes iguales":"Por m²"}</strong></p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-rose-600">{fmt(d.montoTotal)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.estado==="activa"?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-500"}`}>{d.estado==="activa"?"🔔 Activa":"✅ Cerrada"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EGRESOS ──────────────────────────────────────────────────────────────────
function Egresos({egresos,setEgresos,rol}){
  const [filters,setFilters]=useState({mes:today.m,anio:today.y,cat:"todos",concepto:""});
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({concepto:"",cat:"Mantenimiento",monto:""});

  const CATS=["Mantenimiento","Servicios","Personal","Administrativo","Imprevistos"];
  const filterConfig=[
    {key:"mes",label:"Mes",type:"select",options:MESES.map((m,i)=>({value:String(i),label:m})),placeholder:"Todos los meses"},
    {key:"anio",label:"Año",type:"select",options:[{value:"2025",label:"2025"},{value:"2026",label:"2026"}]},
    {key:"cat",label:"Categoría",type:"select",options:CATS.map(c=>({value:c,label:c}))},
    {key:"concepto",label:"Concepto",type:"text",placeholder:"Buscar concepto..."},
  ];

  const filtrados=useMemo(()=>egresos.filter(e=>{
    if(filters.mes!=="todos"&&e.mes!==Number(filters.mes)) return false;
    if(filters.anio!=="todos"&&e.anio!==Number(filters.anio)) return false;
    if(filters.cat!=="todos"&&e.cat!==filters.cat) return false;
    if(filters.concepto&&!e.concepto.toLowerCase().includes(filters.concepto.toLowerCase())) return false;
    return true;
  }),[egresos,filters]);

  const total=filtrados.reduce((a,e)=>a+e.monto,0);
  const cats={}; filtrados.forEach(e=>{ cats[e.cat]=(cats[e.cat]||0)+e.monto; });
  const catData=Object.entries(cats).map(([name,value])=>({name,value}));

  const agregar=()=>{
    if(!form.concepto||!form.monto) return;
    const mes=filters.mes!=="todos"?Number(filters.mes):today.m;
    const anio=filters.anio!=="todos"?Number(filters.anio):today.y;
    setEgresos([...egresos,{id:egresos.length+1,...form,monto:Number(form.monto),mes,anio,fecha:`${String(today.d).padStart(2,"0")}/${String(mes+1).padStart(2,"0")}/${anio}`}]);
    setShowNew(false); setForm({concepto:"",cat:"Mantenimiento",monto:""});
  };
  const clearFilters=()=>setFilters({mes:today.m,anio:today.y,cat:"todos",concepto:""});

  return(
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Egresos del Edificio</h2>
        <button onClick={()=>setShowNew(true)} className="bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-600">+ Agregar</button>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} config={filterConfig} onClear={clearFilters}/>
      <ResultCount total={egresos.length} filtered={filtrados.length}
        onExport={()=>exportCSV(filtrados,[{key:"concepto",label:"Concepto"},{key:"cat",label:"Categoría"},{key:"monto",label:"Monto"},{key:"fecha",label:"Fecha"}],"egresos.csv")}/>

      {showNew&&(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Nuevo Egreso</h3>
            <div><label className="text-xs text-slate-500 mb-1 block">Concepto</label><input value={form.concepto} onChange={e=>setForm({...form,concepto:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Monto ($)</label><input type="number" value={form.monto} onChange={e=>setForm({...form,monto:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Categoría</label>
              <select value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm">
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={agregar} className="flex-1 bg-rose-500 text-white py-2 rounded-xl text-sm font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {catData.length>0&&(
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-700 mb-3">Por Categoría</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={catData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                {catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-center space-y-3">
            <div><p className="text-slate-400 text-xs">Total filtrado</p><p className="text-3xl font-bold text-rose-600">{fmt(total)}</p></div>
            {Object.entries(cats).map(([c,v])=>(
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
              {rol==="admin"&&<th className="px-4 py-3 text-center">Acc.</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(e=>(
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">{e.concepto}</td>
                <td className="px-4 py-3 hidden md:table-cell"><span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{e.cat}</span></td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-400">{e.fecha}</td>
                <td className="px-4 py-3 text-right font-semibold text-rose-600">{fmt(e.monto)}</td>
                {rol==="admin"&&<td className="px-4 py-3 text-center"><button onClick={()=>setEgresos(egresos.filter(x=>x.id!==e.id))} className="text-slate-300 hover:text-rose-500 text-lg">🗑</button></td>}
              </tr>
            ))}
            {filtrados.length===0&&<tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Sin resultados para los filtros aplicados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── USUARIOS ────────────────────────────────────────────────────────────────
function Usuarios({usuarios,setUsuarios,deptos,rol}){
  const [showNew,setShowNew]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({nombre:"",email:"",rol:"prop",user:"",pass:"",deptos:[],activo:true});
  const [emailSim,setEmailSim]=useState(null);
  const ROL_LABELS={admin:"Administrador",tesorero:"Tesorero",prop:"Propietario"};
  const ROL_COLORS={admin:"bg-indigo-100 text-indigo-700",tesorero:"bg-amber-100 text-amber-700",prop:"bg-slate-100 text-slate-600"};
  const abrir=(u=null)=>{ if(u){setForm({...u});setEditId(u.id);}else{setForm({nombre:"",email:"",rol:"prop",user:"",pass:"",deptos:[],activo:true});setEditId(null);} setShowNew(true); };
  const guardar=()=>{ if(!form.nombre||!form.user||!form.pass) return; if(editId) setUsuarios(usuarios.map(u=>u.id===editId?{...u,...form}:u)); else setUsuarios([...usuarios,{...form,id:usuarios.length+1}]); setShowNew(false); };
  const toggleDepto=id=>setForm({...form,deptos:form.deptos.includes(id)?form.deptos.filter(x=>x!==id):[...form.deptos,id]});
  const simEmail=u=>{ setEmailSim(u); setTimeout(()=>setEmailSim(null),3000); };
  return(
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h2>
        {rol==="admin"&&<button onClick={()=>abrir()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Nuevo Usuario</button>}
      </div>
      {emailSim&&<div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2"><span className="text-xl">📧</span><span>Correo simulado enviado a <strong>{emailSim.email}</strong></span></div>}
      {showNew&&(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg">{editId?"Editar Usuario":"Nuevo Usuario"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500 mb-1 block">Rol</label>
                <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value,deptos:e.target.value!=="prop"?[]:form.deptos})} className="w-full border rounded-xl px-3 py-2 text-sm">
                  {rol==="admin"&&<option value="admin">Administrador</option>}
                  <option value="tesorero">Tesorero</option><option value="prop">Propietario</option>
                </select>
              </div>
              <div><label className="text-xs text-slate-500 mb-1 block">Usuario</label><input value={form.user} onChange={e=>setForm({...form,user:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
              <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Contraseña</label><input type="password" value={form.pass} onChange={e=>setForm({...form,pass:e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm"/></div>
            </div>
            {form.rol==="prop"&&(
              <div>
                <label className="text-xs text-slate-500 mb-2 block">Propiedades ({form.deptos.length} selec.)</label>
                <div className="grid grid-cols-6 gap-1.5 max-h-36 overflow-y-auto">
                  {deptos.map(d=><button key={d.id} onClick={()=>toggleDepto(d.id)} className={`rounded-lg py-1.5 text-xs font-bold transition ${form.deptos.includes(d.id)?"bg-indigo-600 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{d.depto}</button>)}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2"><input type="checkbox" checked={form.activo} onChange={e=>setForm({...form,activo:e.target.checked})} id="activo" className="rounded"/><label htmlFor="activo" className="text-sm text-slate-600">Usuario activo</label></div>
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 border border-slate-300 py-2 rounded-xl text-sm">Cancelar</button>
              <button onClick={guardar} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {[{r:"admin",l:"Administradores"},{r:"tesorero",l:"Tesoreros"},{r:"prop",l:"Propietarios"}].map(({r,l})=>{
          const list=usuarios.filter(u=>u.rol===r); if(!list.length) return null;
          return(
            <div key={r} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200"><h3 className="font-semibold text-slate-700 text-sm">{l} ({list.length})</h3></div>
              {list.map(u=>(
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">{u.nombre.slice(0,2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{u.nombre}</div>
                    <div className="text-xs text-slate-400">{u.email} · @{u.user}</div>
                    {u.deptos?.length>0&&<div className="text-xs text-indigo-600">{u.deptos.map(id=>deptos.find(d=>d.id===id)?.depto).join(", ")}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROL_COLORS[u.rol]}`}>{ROL_LABELS[u.rol]}</span>
                    {!u.activo&&<span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                    <button onClick={()=>simEmail(u)} className="text-slate-300 hover:text-indigo-500 text-lg" title="Simular correo">📧</button>
                    {rol==="admin"&&<button onClick={()=>abrir(u)} className="text-slate-300 hover:text-indigo-500 text-lg">✏️</button>}
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
function PortalProp({usuario,pagos,derramas,deptos,periodos}){
  const [comprobante,setComprobante]=useState(null);
  const misDeptos=deptos.filter(d=>usuario.deptos?.includes(d.id));
  const [deptoSel,setDeptoSel]=useState(misDeptos[0]?.id);
  const dep=deptos.find(d=>d.id===deptoSel);
  const perActual=periodos[periodos.length-1];
  const misPagos=pagos.filter(p=>p.deptoId===deptoSel).sort((a,b)=>b.anio-a.anio||b.mes-a.mes);
  const cuotaActual=misPagos.find(p=>p.periodoId===perActual?.id&&p.tipo==="ordinario");
  const totalPagado=misPagos.filter(p=>p.estado==="pagado").reduce((a,p)=>a+p.montoPagado,0);
  const dersPend=derramas.filter(d=>!pagos.find(p=>p.tipo==="derrama"&&p.deptoId===deptoSel&&p.concepto===d.titulo&&p.estado==="pagado"));
  const estColor=cuotaActual?.estado==="pagado"?"text-emerald-300":cuotaActual?.estado==="parcial"?"text-blue-300":"text-amber-300";
  const estLabel=cuotaActual?.estado==="pagado"?"✅ Al día":cuotaActual?.estado==="parcial"?"💧 Parcial":"⚠️ Pendiente";
  return(
    <div className="space-y-5">
      {comprobante&&<Comprobante cuota={comprobante.cuota} abono={comprobante.abono} depto={usuario} onClose={()=>setComprobante(null)}/>}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Mi Portal</h2>
        {misDeptos.length>1&&<select value={deptoSel} onChange={e=>setDeptoSel(Number(e.target.value))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          {misDeptos.map(d=><option key={d.id} value={d.id}>Propiedad {d.depto}</option>)}
        </select>}
      </div>
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="text-3xl font-bold">Propiedad {dep?.depto}</div>
        <div className="text-indigo-200 text-sm mt-1">{usuario.nombre} · Piso {dep?.piso} · {dep?.m2} m²</div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div><div className="text-indigo-200 text-xs">Cuota actual</div><div className="text-xl font-bold">{cuotaActual?fmt(cuotaActual.montoTotal):"-"}</div></div>
          <div><div className="text-indigo-200 text-xs">Total pagado</div><div className="text-xl font-bold">{fmt(totalPagado)}</div></div>
          <div><div className="text-indigo-200 text-xs">Estado</div><div className={`text-xl font-bold ${estColor}`}>{estLabel}</div></div>
        </div>
      </div>
      {dersPend.length>0&&<div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h3 className="font-semibold text-amber-800 mb-2 text-sm">🔔 Derramas pendientes</h3>
        {dersPend.map(d=>{
          const monto=d.distribucion==="coeficiente"?parseFloat((dep.coef/100*d.montoTotal).toFixed(2)):parseFloat((d.montoTotal/30).toFixed(2));
          return <div key={d.id} className="flex justify-between text-sm py-1 border-b border-amber-100 last:border-0"><span>{d.titulo}</span><span className="font-bold text-amber-700">{fmt(monto)}</span></div>;
        })}
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left">Período</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Pagado</th><th className="px-4 py-3 text-center">Estado</th><th className="px-4 py-3 text-center">🧾</th></tr></thead>
          <tbody>{misPagos.map(p=>{
            const last=p.abonos?.[p.abonos.length-1];
            return(<tr key={p.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{p.periodoNombre}</td>
              <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${p.tipo==="ordinario"?"bg-indigo-100 text-indigo-700":"bg-purple-100 text-purple-700"}`}>{p.tipo==="ordinario"?"Ordinaria":"Derrama"}</span></td>
              <td className="px-4 py-2 text-right">{fmt(p.montoTotal)}</td>
              <td className="px-4 py-2 text-right text-emerald-600">{fmt(p.montoPagado)}</td>
              <td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${p.estado==="pagado"?"bg-emerald-100 text-emerald-700":p.estado==="parcial"?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>{p.estado}</span></td>
              <td className="px-4 py-2 text-center">{last?<button onClick={()=>setComprobante({cuota:p,abono:last})} className="text-indigo-400 hover:text-indigo-600 text-lg">🧾</button>:<span className="text-slate-200">🧾</span>}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const PERMS={admin:["dashboard","periodos","pagos","propiedades","derramas","egresos","usuarios"],tesorero:["dashboard","pagos","derramas","egresos"],prop:["portal"]};
const ALL_TABS=[
  {id:"dashboard",icon:"📊",label:"Dashboard"},{id:"periodos",icon:"📅",label:"Períodos"},
  {id:"pagos",icon:"💳",label:"Pagos"},{id:"propiedades",icon:"🏠",label:"Propiedades"},
  {id:"derramas",icon:"🔔",label:"Derramas"},{id:"egresos",icon:"📤",label:"Egresos"},
  {id:"usuarios",icon:"👥",label:"Usuarios"},{id:"portal",icon:"👤",label:"Mi Portal"},
];

export default function App(){
  const [usuarios,setUsuarios]=useState(initUsuarios);
  const [usuario,setUsuario]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [deptos,setDeptos]=useState(DEPTOS_INIT);
  const [periodos,setPeriodos]=useState(PERIODOS_INIT);
  const [pagos,setPagos]=useState(()=>initPagos(DEPTOS_INIT,PERIODOS_INIT));
  const [derramas,setDerramas]=useState(initDerramas);
  const [egresos,setEgresos]=useState(initEgresos);
  const login=u=>{setUsuario(u);setTab(PERMS[u.rol][0]);};
  const logout=()=>setUsuario(null);
  if(!usuario) return <Login usuarios={usuarios} onLogin={login}/>;
  const tabs=ALL_TABS.filter(t=>PERMS[usuario.rol]?.includes(t.id));
  return(
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-xl">🏢</div>
          <div><div className="font-bold text-slate-800 text-sm">Edificio Central</div><div className="text-xs text-slate-400">v3.1</div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold text-slate-700">{usuario.nombre}</div>
            <div className="text-xs text-slate-400">{usuario.rol==="admin"?"Administrador":usuario.rol==="tesorero"?"Tesorero":`Prop. ${usuario.deptos?.map(id=>deptos.find(d=>d.id===id)?.depto).join(", ")}`}</div>
          </div>
          <button onClick={logout} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-slate-600">Salir</button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="hidden md:flex flex-col w-48 bg-white border-r border-slate-200 pt-3 gap-0.5 px-2 overflow-y-auto">
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${tab===t.id?"bg-indigo-50 text-indigo-700":"text-slate-600 hover:bg-slate-50"}`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {tab==="dashboard"&&<Dashboard pagos={pagos} periodos={periodos} egresos={egresos} derramas={derramas} deptos={deptos} usuarios={usuarios}/>}
          {tab==="periodos"&&<Periodos periodos={periodos} setPeriodos={setPeriodos} deptos={deptos} pagos={pagos} setPagos={setPagos}/>}
          {tab==="pagos"&&<Pagos pagos={pagos} setPagos={setPagos} periodos={periodos} deptos={deptos} derramas={derramas} usuarios={usuarios} rol={usuario.rol}/>}
          {tab==="propiedades"&&<Propiedades deptos={deptos} setDeptos={setDeptos} pagos={pagos} periodos={periodos} usuarios={usuarios} rol={usuario.rol}/>}
          {tab==="derramas"&&<Derramas derramas={derramas} setDerramas={setDerramas} deptos={deptos} rol={usuario.rol}/>}
          {tab==="egresos"&&<Egresos egresos={egresos} setEgresos={setEgresos} rol={usuario.rol}/>}
          {tab==="usuarios"&&<Usuarios usuarios={usuarios} setUsuarios={setUsuarios} deptos={deptos} rol={usuario.rol}/>}
          {tab==="portal"&&<PortalProp usuario={usuario} pagos={pagos} derramas={derramas} deptos={deptos} periodos={periodos}/>}
        </main>
      </div>
      <nav className="md:hidden flex bg-white border-t border-slate-200 overflow-x-auto">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`flex-shrink-0 flex flex-col items-center py-2 px-3 text-xs transition ${tab===t.id?"text-indigo-600":"text-slate-400"}`}>
            <span className="text-lg">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
