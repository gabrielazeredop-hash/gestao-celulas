import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "./supabase.js"

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ROLES = { admin:"Gestor", supervisor:"Supervisor", leader:"Líder", secretary:"Secretário", member:"Membro" }
const ROLE_COLORS = { admin:"#1B4F8A", supervisor:"#7c3aed", leader:"#059669", secretary:"#E8921A", member:"#64748b" }
const DAYS = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"]
const STATUS_LIST = ["Visitante","Membro"]
const CELL_TYPES = ["Adultos","Jovens","Kids/Infantil","Casais","Homens","Mulheres"]
const CELL_STATUS = ["Ativa","Inativa","Multiplicada"]
const FREQUENCIES = ["Semanal","Quinzenal","Mensal"]
const REACTIONS = ["🙏","❤️","🔥","✝️","😭","🙌"]

// Cores da Promessa
const C = {
  primary: "#1B4F8A",
  gold: "#E8921A",
  dark: "#0f172a",
  darker: "#162035",
  light: "#f0f4f8",
  white: "#ffffff",
  success: "#059669",
  danger: "#dc2626",
  warning: "#d97706",
  purple: "#7c3aed",
}

function fmtDate(d){if(!d)return"—";try{const[y,m,day]=d.split("-");return`${day}/${m}/${y}`}catch{return d}}
function parseDate(str){
  // Parse YYYY-MM-DD without timezone shift
  if(!str)return null
  const[y,m,d]=str.split("-").map(Number)
  return new Date(y,m-1,d)
}
function calcAge(dob){if(!dob)return null;const b=parseDate(dob),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return a}
// Idade SEMPRE recalculada da data de nascimento. A coluna "age" do banco é só um retrato
// da época do cadastro e desatualiza sozinha — usar só como reserva de quem não tem data.
function ageOf(m){if(!m)return null;if(m.birth_date)return calcAge(m.birth_date);return m.age||null}
// Idade que a pessoa COMPLETA no aniversário deste ano
function ageTurning(dob){if(!dob)return null;return new Date().getFullYear()-parseDate(dob).getFullYear()}
// Sabendo dia + mês do aniversário e a idade de HOJE, o ano de nascimento é exato:
// basta saber se o aniversário deste ano já passou ou não.
function birthYearFrom(day,month,age){
  const d=parseInt(day),m=parseInt(month),a=parseInt(age)
  if(!d||!m||isNaN(a)||a<0||a>120||m<1||m>12)return null
  if(d<1||d>[31,29,31,30,31,30,31,31,30,31,30,31][m-1])return null
  const n=new Date(),curM=n.getMonth()+1
  const passou=curM>m||(curM===m&&n.getDate()>=d)
  return n.getFullYear()-a-(passou?0:1)
}
const SENHA_PADRAO="123456"
const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
// Uma presença por pessoa/dia/célula. Protege as contas caso sobre linha repetida no banco.
function dedupeAtt(list){
  const seen=new Set(),out=[]
  for(const a of list||[]){
    const k=`${a.date}|${a.cell_id||"geral"}|${a.member_id}`
    if(seen.has(k))continue
    seen.add(k);out.push(a)
  }
  return out
}
function fmtCPF(v){const d=v.replace(/\D/g,"");if(d.length>9)return d.slice(0,3)+"."+d.slice(3,6)+"."+d.slice(6,9)+"-"+d.slice(9,11);if(d.length>6)return d.slice(0,3)+"."+d.slice(3,6)+"."+d.slice(6);if(d.length>3)return d.slice(0,3)+"."+d.slice(3);return d}
function fmtPhone(v){const d=v.replace(/\D/g,"");if(d.length>10)return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;if(d.length>6)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;if(d.length>2)return`(${d.slice(0,2)}) ${d.slice(2)}`;return d}
// Data local no formato YYYY-MM-DD. NÃO usar toISOString: ele converte pra UTC e, depois
// das 21h no Brasil, joga a data pro dia seguinte (célula à noite virava o dia errado).
function toISO(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function todayStr(){return toISO(new Date())}
function btoa64(s){return btoa(unescape(encodeURIComponent(s)))}
function atob64(s){try{return decodeURIComponent(escape(atob(s)))}catch{return s}}
function getMonthBirthday(dob){if(!dob)return null;return parseInt(dob.split("-")[1])}
function getCurrentMonth(){return new Date().getMonth()+1}
// start/end zerados na meia-noite: senão o aniversariante do próprio dia de início
// da semana ficava "antes" do início e sumia da lista.
function getCurrentWeekDates(){const n=new Date();const day=n.getDay();const mon=new Date(n);mon.setDate(n.getDate()-(day===0?6:day-1));mon.setHours(0,0,0,0);const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);return{start:mon,end:sun}}
function getNextMeetingDate(day){
  const dayMap={"Segunda":1,"Terça":2,"Quarta":3,"Quinta":4,"Sexta":5,"Sábado":6,"Domingo":0}
  const target=dayMap[day]??3
  const today=new Date()
  const diff=(target-today.getDay()+7)%7
  const next=new Date(today)
  next.setDate(today.getDate()+(diff===0?7:diff))
  return toISO(next)
}
function getWeekRange(date=new Date()){
  const d=new Date(date)
  const day=d.getDay() // 0=Sun
  const sun=new Date(d);sun.setDate(d.getDate()-day)
  const sat=new Date(sun);sat.setDate(sun.getDate()+6)
  return{start:toISO(sun),end:toISO(sat)}
}

function isCurrentWeek(weekStart,weekEnd){
  if(!weekStart||!weekEnd)return false
  const today=todayStr()
  return today>=weekStart&&today<=weekEnd
}

function fmtWeek(start,end){
  if(!start||!end)return""
  return`${fmtDate(start)} a ${fmtDate(end)}`
}

function getAgeGroup(age){
  if(!age)return null
  if(age<=10)return{label:"Criança",color:"#06b6d4",icon:"🧒"}
  if(age<=15)return{label:"Adolescente",color:"#8b5cf6",icon:"🧑"}
  if(age<=22)return{label:"Jovem",color:"#10b981",icon:"👦"}
  return{label:"Adulto",color:"#1B4F8A",icon:"👤"}
}

function whatsappLink(phone,name=""){
  const n=phone?.replace(/\D/g,"");
  if(!n)return null;
  const num=n.startsWith("55")?n:`55${n}`;
  return `https://wa.me/${num}`
}

// ─── LOGO SVG ─────────────────────────────────────────────────────────────────
// White circle with flame cutout — matches Promessa Lago dos Peixes brand
const LogoIcon = ({size=40, dark=false}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="white" fillOpacity={dark?"1":"0.95"}/>
    <path fillRule="evenodd" clipRule="evenodd"
      d="M50 8 C50 8 62 18 65 30 C67 38 63 44 60 46 C60 46 65 38 58 30 C58 30 62 44 54 52 C54 52 58 42 52 36 C52 36 54 48 46 56 C46 56 44 46 48 38 C48 38 40 46 40 56 C40 64 46 70 50 72 C54 74 62 70 64 62 C66 54 62 46 62 46 C68 50 72 58 70 68 C68 76 60 84 50 86 C40 84 32 76 30 68 C28 58 32 50 38 46 C38 46 34 54 36 62 C36 62 30 54 32 44 C34 36 42 28 44 22 C44 22 40 30 42 38 C38 32 38 22 50 8 Z"
      fill="currentColor" opacity="0.85"
    />
    <circle cx="57" cy="28" r="3.5" fill="currentColor" opacity="0.7"/>
  </svg>
)

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon=({name,size=18,color="currentColor"})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {name==="users"&&<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>}
    {name==="check-circle"&&<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
    {name==="bar-chart"&&<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}
    {name==="send"&&<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}
    {name==="log-out"&&<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>}
    {name==="x"&&<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
    {name==="plus"&&<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
    {name==="trash"&&<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></>}
    {name==="edit"&&<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
    {name==="grid"&&<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>}
    {name==="arrow-left"&&<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}
    {name==="history"&&<><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></>}
    {name==="key"&&<><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>}
    {name==="inbox"&&<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>}
    {name==="gauge"&&<><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 2a10 10 0 0 1 7.39 16.56M12 2A10 10 0 0 0 4.61 18.56"/><line x1="12" y1="12" x2="16" y2="8"/></>}
    {name==="calendar"&&<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
    {name==="check"&&<polyline points="20 6 9 17 4 12"/>}
    {name==="eye"&&<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
    {name==="eye-off"&&<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>}
    {name==="search"&&<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
    {name==="shield"&&<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>}
    {name==="cake"&&<><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20M7 8v2M12 8v2M17 8v2"/></>}
    {name==="target"&&<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>}
    {name==="message"&&<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}
    {name==="event"&&<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
    {name==="id-card"&&<><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 9h4M14 12h4M14 15h2"/></>}
    {name==="pause"&&<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>}
    {name==="play"&&<><polygon points="5 3 19 12 5 21 5 3"/></>}
    {name==="link"&&<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>}
    {name==="comment"&&<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}
    {name==="pray"&&<><path d="M12 2C12 2 8 6 8 10c0 2.21 1.79 4 4 4s4-1.79 4-4c0-4-4-8-4-8z"/><path d="M8 18c0 2.21 1.79 4 4 4s4-1.79 4-4v-4H8v4z"/></>}
    {name==="whatsapp"&&<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>}
    {name==="repeat"&&<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>}
    {name==="chevron-right"&&<polyline points="9 18 15 12 9 6"/>}
    {name==="chevron-down"&&<polyline points="6 9 12 15 18 9"/>}
    {name==="flame"&&<><path d="M12 2c0 0-4 4-4 8a4 4 0 0 0 8 0c0-4-4-8-4-8z"/><path d="M12 12c0 0-2 2-2 4a2 2 0 0 0 4 0c0-2-2-4-2-4z"/></>}
    {name==="star"&&<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
    {name==="copy"&&<><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}
    {name==="user-plus"&&<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></>}
    {name==="meeting"&&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 2v4M16 2v4"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></>}
    {name==="church"&&<><path d="M12 2v5M9.5 4.5h5M5 10h14M5 10v10h5v-5h4v5h5V10M12 7v3"/></>}
    {name==="music"&&<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>}
    {name==="bell"&&<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
  </svg>
)

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
const Avatar=({name,photo,size=36,color=C.primary})=>{
  if(photo)return<img src={photo} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:`2px solid ${color}40`}}/>
  const initials=name?name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase():"?"
  return<div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:800,color:"#fff",flexShrink:0}}>{initials}</div>
}

const Badge=({label,color=C.primary,bg})=>(
  <span style={{background:bg||color+"18",color,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap",border:`1px solid ${color}30`}}>{label}</span>
)

const Btn=({children,onClick,variant="primary",size="md",full=false,disabled=false,icon=null,style:extra={}})=>{
  const variants={
    primary:{background:`linear-gradient(135deg,${C.primary},#1a5fa8)`,color:"#fff",border:"none",boxShadow:"0 2px 8px rgba(27,79,138,0.3)"},
    gold:{background:`linear-gradient(135deg,${C.gold},#d4820f)`,color:"#fff",border:"none",boxShadow:"0 2px 8px rgba(232,146,26,0.3)"},
    secondary:{background:"#f1f5f9",color:"#334155",border:"none"},
    danger:{background:"#fee2e2",color:"#991b1b",border:"none"},
    success:{background:"#dcfce7",color:"#166534",border:"none"},
    ghost:{background:"transparent",color:"#64748b",border:"1.5px solid #e2e8f0"},
    warning:{background:"#fef3c7",color:"#92400e",border:"none"},
    dark:{background:C.dark,color:"#fff",border:"none"},
  }
  return<button disabled={disabled} onClick={onClick} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:12,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"'Outfit',sans-serif",transition:"all 0.15s",opacity:disabled?0.5:1,width:full?"100%":"auto",fontSize:size==="sm"?13:15,padding:size==="sm"?"8px 14px":"12px 20px",...variants[variant],...extra}}>{icon&&<Icon name={icon} size={size==="sm"?14:16}/>}{children}</button>
}

const Inp=({label,value,onChange,type="text",placeholder="",required=false,readOnly=false,hint=""})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}{required&&<span style={{color:"#ef4444",marginLeft:3}}>*</span>}</label>}
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required} readOnly={readOnly}
      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,fontFamily:"'Outfit',sans-serif",background:readOnly?"#f8fafc":"#fff",color:"#1e293b",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"}}
      onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
    {hint&&<p style={{fontSize:11,color:"#94a3b8",marginTop:4,marginBottom:0}}>{hint}</p>}
  </div>
)

const Sel=({label,value,onChange,options,required=false})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}{required&&<span style={{color:"#ef4444",marginLeft:3}}>*</span>}</label>}
    <select value={value||""} onChange={e=>onChange(e.target.value)} required={required}
      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,fontFamily:"'Outfit',sans-serif",background:"#fff",color:"#1e293b",outline:"none"}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
)

const Textarea=({label,value,onChange,placeholder="",rows=3})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>}
    <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,fontFamily:"'Outfit',sans-serif",background:"#fff",color:"#1e293b",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
  </div>
)

const Card=({children,style:extra={}})=>(
  <div style={{background:"#fff",borderRadius:16,border:"1px solid #e8edf2",padding:"16px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",...extra}}>{children}</div>
)

const Modal=({open,onClose,title,children})=>{
  useEffect(()=>{
    if(open){document.body.style.overflow="hidden"}
    else{document.body.style.overflow=""}
    return()=>{document.body.style.overflow=""}
  },[open])
  if(!open)return null
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -8px 32px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 14px",borderBottom:"1px solid #f1f5f9",flexShrink:0}}>
          <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a",flex:1,paddingRight:12}}>{title}</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:12,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,color:"#64748b",fontSize:13,fontWeight:700,flexShrink:0}}>
            <Icon name="x" size={16}/>Fechar
          </button>
        </div>
        <div style={{overflowY:"auto",padding:"16px 20px 32px",flex:1}}>{children}</div>
      </div>
    </div>
  )
}

const Toast=({msg,type="success"})=>{
  if(!msg)return null
  const colors={success:["#dcfce7","#166534"],error:["#fee2e2","#991b1b"],info:["#dbeafe",C.primary],warning:["#fef3c7","#92400e"]}
  const[bg,color]=colors[type]||colors.info
  return<div style={{position:"fixed",bottom:24,left:16,right:16,background:bg,color,borderRadius:14,padding:"13px 18px",fontWeight:700,fontSize:14,zIndex:9999,textAlign:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",maxWidth:440,margin:"0 auto"}}>{msg}</div>
}

const Stat=({label,value,color=C.primary,icon,sub})=>(
  <div style={{background:"#fff",borderRadius:16,border:"1px solid #e8edf2",padding:"16px 14px",textAlign:"center",flex:1,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
    {icon&&<div style={{background:color+"15",borderRadius:12,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",color}}><Icon name={icon} size={20}/></div>}
    <div style={{fontSize:28,fontWeight:900,color,lineHeight:1}}>{value}</div>
    <div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</div>
    {sub&&<div style={{fontSize:11,color:"#64748b",marginTop:3}}>{sub}</div>}
  </div>
)

const Loader=()=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"48px 0",flexDirection:"column",gap:12}}>
    <div style={{width:32,height:32,border:`3px solid ${C.primary}30`,borderTopColor:C.primary,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <span style={{color:"#94a3b8",fontSize:13,fontWeight:600}}>Carregando...</span>
  </div>
)

const ProgressBar=({value,max,color=C.primary,showLabel=true})=>{
  const pct=max>0?Math.min(Math.round(value/max*100),100):0
  return(
    <div>
      {showLabel&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <span style={{fontSize:12,color:"#64748b",fontWeight:600}}>{value} de {max} membros</span>
        <span style={{fontSize:12,fontWeight:800,color}}>{pct}%</span>
      </div>}
      <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color},${color}dd)`,borderRadius:4,transition:"width 0.6s ease"}}/>
      </div>
    </div>
  )
}

const WppBtn=({phone,name})=>{
  const link=whatsappLink(phone,name)
  if(!link)return null
  return(
    <a href={link} target="_blank" rel="noopener noreferrer"
      style={{display:"inline-flex",alignItems:"center",gap:5,background:"#dcfce7",color:"#166534",borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700,textDecoration:"none",border:"1px solid #bbf7d0"}}>
      <Icon name="whatsapp" size={13}/>
      {phone}
    </a>
  )
}

// ─── LGPD ─────────────────────────────────────────────────────────────────────
function LGPDModal({onAccept}){
  const[c1,setC1]=useState(false)
  const[c2,setC2]=useState(false)
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:460,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:`linear-gradient(135deg,${C.primary},#162d5a)`,padding:"24px 24px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{background:"rgba(255,255,255,0.15)",borderRadius:12,padding:10,display:"flex"}}><Icon name="shield" size={22} color="#fff"/></div>
            <h2 style={{color:"#fff",fontSize:19,fontWeight:900,margin:0}}>Termos e Privacidade</h2>
          </div>
          <p style={{color:"#bfdbfe",fontSize:13,margin:0}}>Leia e aceite para continuar usando o sistema</p>
        </div>
        <div style={{overflowY:"auto",padding:"20px",flex:1}}>
          <div style={{background:"#f8fafc",borderRadius:14,padding:16,marginBottom:14,border:"1px solid #e2e8f0"}}>
            <p style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:8}}>📋 Política de Dados — LGPD</p>
            <p style={{fontSize:13,color:"#475569",lineHeight:1.65,margin:0}}>Coletamos seus dados pessoais (nome, CPF, telefone, e-mail, endereço e informações familiares) para organizar e gerenciar as células da nossa igreja. Seus dados são usados exclusivamente para fins administrativos internos. Apenas gestores, líderes, secretários e supervisores autorizados têm acesso. Você pode solicitar a correção ou exclusão dos seus dados a qualquer momento falando com o líder da sua célula.</p>
          </div>
          <div style={{background:"#f8fafc",borderRadius:14,padding:16,marginBottom:20,border:"1px solid #e2e8f0"}}>
            <p style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:8}}>📸 Uso de Imagem e Vídeo</p>
            <p style={{fontSize:13,color:"#475569",lineHeight:1.65,margin:0}}>Durante os encontros e eventos da célula, podemos registrar fotos e vídeos. Essas imagens podem ser usadas para comunicação interna entre os membros e também nas redes sociais oficiais da igreja. Caso não queira que sua imagem seja divulgada, informe ao líder da sua célula.</p>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[[c1,setC1,"Li e concordo com a Política de Dados (LGPD) e autorizo o armazenamento dos meus dados pessoais."],[c2,setC2,"Autorizo o uso da minha imagem em fotos e vídeos dos encontros para uso interno e nas redes sociais da igreja."]].map(([checked,setChecked,text],i)=>(
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer",background:checked?"#eff6ff":"#f8fafc",border:`1.5px solid ${checked?C.primary:"#e2e8f0"}`,borderRadius:14,padding:14,transition:"all 0.15s"}}>
                <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} style={{marginTop:2,width:18,height:18,flexShrink:0,accentColor:C.primary}}/>
                <span style={{fontSize:13,color:"#334155",fontWeight:600,lineHeight:1.55}}>{text}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{padding:"16px 20px",borderTop:"1px solid #f1f5f9"}}>
          <Btn full disabled={!c1||!c2} onClick={onAccept} variant={c1&&c2?"gold":"secondary"}>
            {c1&&c2?"✓ Concordo e quero continuar":"Marque as opções acima para continuar"}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const[session,setSession]=useState(null)
  const[page,setPage]=useState("login")
  const[toast,setToast]=useState({msg:"",type:"success"})
  const[showLGPD,setShowLGPD]=useState(false)
  const[pendingSession,setPendingSession]=useState(null)
  const[loading,setLoading]=useState(true)

  // Restore session from localStorage on load
  useEffect(()=>{
    try{
      const saved=localStorage.getItem("celulas_session")
      if(saved){
        const user=JSON.parse(saved)
        if(user&&user.id){
          setSession(user)
          const map={admin:"admin",supervisor:"supervisor",leader:"leader",secretary:"secretary",member:"member"}
          setPage(map[user.role]||"member")
        }
      }
    }catch(e){}
    setLoading(false)
  },[])

  const showToast=useCallback((msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),3500)},[])
  function doLogout(){setSession(null);setPage("login");localStorage.removeItem("celulas_session")}

  async function doLogin(user){
    if(user.active===false)return
    if(!user.lgpd_accepted){setPendingSession(user);setShowLGPD(true);return}
    startSession(user)
  }

  async function handleLGPDAccept(){
    if(!pendingSession)return
    await supabase.from("users").update({lgpd_accepted:true,lgpd_accepted_at:new Date().toISOString()}).eq("id",pendingSession.id)
    setShowLGPD(false);startSession({...pendingSession,lgpd_accepted:true});setPendingSession(null)
  }

  function startSession(user){
    setSession(user)
    try{localStorage.setItem("celulas_session",JSON.stringify(user))}catch(e){}
    const map={admin:"admin",supervisor:"supervisor",leader:"leader",secretary:"secretary",member:"member"}
    setPage(map[user.role]||"member")
  }

  if(loading)return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a,#1B4F8A)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{color:"rgba(255,255,255,0.9)"}}><LogoIcon size={64}/></div>
      <div style={{width:36,height:36,border:"3px solid rgba(255,255,255,0.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    </div>
  )

  return(
    <div style={{minHeight:"100vh",background:"#F4F6FA",fontFamily:"'Plus Jakarta Sans','Outfit',sans-serif",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap');
        :root{
          --blue:#1B4F8A;--blue2:#2F6FBF;--dark:#0F1B2D;
          --orange:#EA8C1C;--orange-deep:#D97B0F;
          --green:#0E9F6E;--red:#E02424;
          --ink:#0F1B2D;--slate:#54627A;--muted:#8A98AC;
          --bg:#F4F6FA;--card:#fff;--line:#E7ECF2;
          --tint-blue:#EAF1FB;--tint-orange:#FDF0E1;
          --tint-green:#E4F6EF;--tint-red:#FCEBEB;
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
        ::-webkit-scrollbar-track{background:transparent}
        input,select,textarea,button{font-family:'Plus Jakarta Sans','Outfit',sans-serif}
        .page-content{max-width:1120px;margin:0 auto;width:100%}
        .modal-inner{max-width:520px}
        .shell-content{animation:fadeUp .22s ease}
        .sidebar-nav-btn{transition:background .15s,color .15s}
        .sidebar-nav-btn:hover{background:rgba(255,255,255,.09)!important}
        .bottom-nav-btn{transition:color .15s}
        .card-hover{transition:transform .15s,box-shadow .15s}
        .card-hover:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(15,27,45,.1)!important}
        @media print{
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          @page{margin:18mm 14mm;size:A4 portrait}
          body{background:#fff!important;font-size:11pt}
          .no-print,.no-print *{display:none!important}
          .print-only{display:block!important}
          .print-page-break{page-break-before:always}
          header,nav,.shell-sidebar,.shell-bottomnav,.shell-topbar{display:none!important}
          .shell-main{padding:12px!important}
          .page-content{max-width:100%!important;padding:0!important}
          a[href]:after{content:none!important}
          button:not(.pdf-btn-keep){display:none!important}
          select{display:none!important}
          input{display:none!important}
        }
      `}</style>
      <Toast msg={toast.msg} type={toast.type}/>
      {showLGPD&&<LGPDModal onAccept={handleLGPDAccept}/>}
      {page==="login"&&<LoginPage onLogin={doLogin} showToast={showToast}/>}
      {session&&page!=="login"&&<AppShell session={session} logout={doLogout} showToast={showToast}/>}
    </div>
  )
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({onLogin,showToast}){
  const[login,setLogin]=useState("")
  const[pw,setPw]=useState("")
  const[showPw,setShowPw]=useState(false)
  const[err,setErr]=useState("")
  const[loading,setLoading]=useState(false)

  async function handleLogin(e){
    e.preventDefault();setErr("");setLoading(true)
    const input=login.trim()
    let data=null
    const cpfNorm=input.replace(/\D/g,"")
    if(cpfNorm.length===11){
      const r1=await supabase.from("users").select("*").eq("cpf",cpfNorm).single()
      if(r1.data)data=r1.data
      if(!data){const r2=await supabase.from("users").select("*").eq("cpf",fmtCPF(cpfNorm)).single();if(r2.data)data=r2.data}
    }
    if(!data){
      // O telefone e gravado formatado - "(21) 99201-8539". Procurar os ultimos 8
      // digitos direto no texto nunca casava: o hifen parte os digitos no meio.
      // Comparamos so os numeros, dos dois lados.
      const phoneNorm=input.replace(/\D/g,"")
      if(phoneNorm.length>=8){
        const{data:members}=await supabase.from("members").select("id,phone")
        const so=v=>(v||"").replace(/\D/g,"")
        const lista=(members||[]).filter(x=>so(x.phone).length>=8)
        const member=lista.find(x=>so(x.phone)===phoneNorm)||lista.find(x=>so(x.phone).endsWith(phoneNorm.slice(-8)))
        if(member){const{data:u}=await supabase.from("users").select("*").eq("member_id",member.id).maybeSingle();if(u)data=u}
      }
    }
    if(!data){
      const{data:members}=await supabase.from("members").select("id,email").ilike("email",input)
      if(members&&members.length>0){const member=members[0];const{data:u}=await supabase.from("users").select("*").eq("member_id",member.id).maybeSingle();if(u)data=u}
    }
    if(!data){setErr("Usuário não encontrado. Verifique CPF, telefone ou e-mail.");setLoading(false);return}
    if(data.active===false){setErr("Entre em contato com o líder da sua célula.");setLoading(false);return}
    if(atob64(data.password_hash)!==pw){setErr("Senha incorreta");setLoading(false);return}
    setLoading(false);onLogin(data)
  }

  const BG=`linear-gradient(165deg,#0F1B2D 0%,#1B4F8A 55%,#2F6FBF 100%)`
  const inputStyle={width:"100%",background:"rgba(255,255,255,.09)",border:"1.5px solid rgba(255,255,255,.14)",borderRadius:13,padding:"13px 16px",fontSize:15,color:"#fff",outline:"none",transition:"border-color .15s",boxSizing:"border-box"}

  return(
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"stretch"}}>
      {/* Left brand panel — hidden on mobile */}
      <div style={{flex:"0 0 46%",display:"none",background:"transparent",padding:"60px 48px",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}} className="login-brand">
        <div style={{position:"absolute",top:-120,left:-80,width:420,height:420,borderRadius:"50%",background:"radial-gradient(circle,rgba(234,140,28,.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-60,right:-60,width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(47,111,191,.3) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{marginBottom:36}}><LogoIcon size={60}/></div>
          <h1 style={{color:"#fff",fontSize:34,fontWeight:800,margin:"0 0 10px",lineHeight:1.15,letterSpacing:"-.5px"}}>Gestão de Células</h1>
          <p style={{color:"rgba(255,255,255,.65)",fontSize:17,margin:"0 0 48px",fontWeight:500,lineHeight:1.5}}>Promessa Lago dos Peixes</p>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {[["🤝","Conecte líderes e membros"],["📊","Acompanhe presenças em tempo real"],["🙏","Gerencie pedidos de oração"]].map(([ic,tx])=>(
              <div key={tx} style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{ic}</span>
                <span style={{color:"rgba(255,255,255,.75)",fontSize:14,fontWeight:500}}>{tx}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"40px 24px"}}>
        <div style={{width:"100%",maxWidth:400,animation:"slideUp .4s ease"}}>
          {/* Mobile logo */}
          <div style={{textAlign:"center",marginBottom:36}} className="login-mobile-logo">
            <div style={{width:80,height:80,borderRadius:22,background:"rgba(255,255,255,.11)",backdropFilter:"blur(10px)",border:"1.5px solid rgba(255,255,255,.18)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <LogoIcon size={48}/>
            </div>
            <h1 style={{color:"#fff",fontSize:22,fontWeight:800,margin:"0 0 4px"}}>Gestão de Células</h1>
            <p style={{color:"rgba(255,255,255,.6)",fontSize:13,margin:0}}>Promessa Lago dos Peixes</p>
          </div>

          <div style={{background:"rgba(255,255,255,.09)",backdropFilter:"blur(16px)",borderRadius:24,border:"1px solid rgba(255,255,255,.14)",padding:"32px 28px"}}>
            <h2 style={{color:"#fff",fontSize:18,fontWeight:700,margin:"0 0 24px",letterSpacing:"-.2px"}}>Entrar na sua conta</h2>
            <form onSubmit={handleLogin}>
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:7,letterSpacing:".06em",textTransform:"uppercase"}}>CPF, Telefone ou E-mail</label>
                <input value={login} onChange={e=>setLogin(e.target.value)} placeholder="Digite para acessar" required style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="rgba(255,255,255,.45)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.14)"}/>
              </div>
              <div style={{marginBottom:8,position:"relative"}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:7,letterSpacing:".06em",textTransform:"uppercase"}}>Senha</label>
                <input value={pw} onChange={e=>setPw(e.target.value)} type={showPw?"text":"password"} placeholder="Digite sua senha" required
                  style={{...inputStyle,paddingRight:48}}
                  onFocus={e=>e.target.style.borderColor="rgba(255,255,255,.45)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.14)"}/>
                <button type="button" onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:14,bottom:13,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.45)",display:"flex",padding:0}}><Icon name={showPw?"eye-off":"eye"} size={18}/></button>
              </div>
              {err&&<div style={{color:"#fca5a5",fontSize:13,fontWeight:600,background:"rgba(224,36,36,.12)",border:"1px solid rgba(224,36,36,.25)",padding:"10px 14px",borderRadius:10,marginTop:12}}>{err}</div>}
              <button type="submit" disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#EA8C1C,#D97B0F)",border:"none",borderRadius:13,color:"#fff",fontSize:15,fontWeight:800,padding:"14px 0",cursor:loading?"wait":"pointer",marginTop:22,opacity:loading?.7:1,boxShadow:"0 8px 22px -8px rgba(234,140,28,.7)",letterSpacing:".02em",transition:"opacity .15s"}}>
                {loading?"Entrando...":"Entrar →"}
              </button>
            </form>
            <p style={{color:"rgba(255,255,255,.35)",fontSize:12,textAlign:"center",margin:"18px 0 0"}}>Use CPF, telefone ou e-mail cadastrado</p>
          </div>
        </div>
      </div>

      <style>{`
        @media(min-width:900px){
          .login-brand{display:flex!important}
          .login-mobile-logo{display:none!important}
        }
      `}</style>
    </div>
  )
}

// ─── HOOKS E UTILS ────────────────────────────────────────────────────────────
function useTable(table,filter=null){
  const[data,setData]=useState([])
  const[loading,setLoading]=useState(true)
  async function load(){
    setLoading(true)
    let q=supabase.from(table).select("*").order("created_at",{ascending:false})
    if(filter)q=q.eq(filter.col,filter.val)
    const{data:rows}=await q
    setData(rows||[]);setLoading(false)
  }
  useEffect(()=>{
    load()
    const ch=supabase.channel(`rt_${table}_${filter?.val||"all"}_${Date.now()}`).on("postgres_changes",{event:"*",schema:"public",table},()=>load()).subscribe()
    return()=>supabase.removeChannel(ch)
  },[table,filter?.val])
  return{data,loading,reload:load}
}

async function addLog(session,action,detail){
  await supabase.from("logs").insert({action,detail,user_id:session?.id})
}

function ChangePasswordModal({open,onClose,session,showToast}){
  const[oldPw,setOldPw]=useState("")
  const[newPw,setNewPw]=useState("")
  const[confirmPw,setConfirmPw]=useState("")
  async function save(){
    if(newPw.length<6){showToast("Mínimo 6 caracteres","error");return}
    if(newPw!==confirmPw){showToast("Senhas não conferem","error");return}
    const{data}=await supabase.from("users").select("password_hash").eq("id",session.id).single()
    if(!data||atob64(data.password_hash)!==oldPw){showToast("Senha atual incorreta","error");return}
    await supabase.from("users").update({password_hash:btoa64(newPw)}).eq("id",session.id)
    showToast("Senha alterada!");setOldPw("");setNewPw("");setConfirmPw("");onClose()
  }
  return(
    <Modal open={open} onClose={onClose} title="Alterar Senha">
      <Inp label="Senha Atual" type="password" value={oldPw} onChange={setOldPw} placeholder="Senha atual"/>
      <Inp label="Nova Senha" type="password" value={newPw} onChange={setNewPw} placeholder="Mínimo 6 caracteres"/>
      <Inp label="Confirmar Nova Senha" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Repita a nova senha"/>
      <Btn full onClick={save} icon="key">Alterar Senha</Btn>
    </Modal>
  )
}

function MemberSearchModal({open,onClose,members,onSelect,title="Buscar Membro"}){
  const[search,setSearch]=useState("")
  const filtered=members.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())||(m.phone||"").includes(search))
  return(
    <Modal open={open} onClose={onClose} title={title}>
      <div style={{position:"relative",marginBottom:14}}>
        <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",pointerEvents:"none"}}><Icon name="search" size={15}/></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pelo nome..." autoFocus
          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px 10px 36px",fontSize:14,outline:"none"}}/>
      </div>
      {filtered.slice(0,10).map(m=>(
        <button key={m.id} onClick={()=>{onSelect(m);onClose()}} style={{width:"100%",textAlign:"left",background:"#f8fafc",border:"1px solid #e8edf2",borderRadius:12,padding:"10px 14px",cursor:"pointer",marginBottom:6,display:"flex",alignItems:"center",gap:12,transition:"background 0.1s"}}
          onMouseOver={e=>e.currentTarget.style.background="#eff6ff"} onMouseOut={e=>e.currentTarget.style.background="#f8fafc"}>
          <Avatar name={m.name} photo={m.photo_url} size={34} color={C.primary}/>
          <div><div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{m.name}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{m.phone||"Sem telefone"}</div>
          </div>
        </button>
      ))}
      {filtered.length===0&&<p style={{color:"#94a3b8",textAlign:"center",fontSize:13}}>Nenhum membro encontrado</p>}
    </Modal>
  )
}

// ─── HEADER COMPONENT ─────────────────────────────────────────────────────────
function Header({title,subtitle,logout,onChangePw}){
  return(
    <header style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"16px 18px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <LogoIcon size={32}/>
          <div>
            <div style={{color:"#fff",fontSize:15,fontWeight:800,letterSpacing:"-0.3px"}}>{title}</div>
            {subtitle&&<div style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:500}}>{subtitle}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {onChangePw&&<button onClick={onChangePw} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="key" size={15}/></button>}
          <button onClick={logout} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}>
            <Icon name="log-out" size={14}/>Sair
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
const NAV={
  admin:{
    primary:[
      {id:"dashboard",label:"Painel",icon:"gauge"},
      {id:"cells",label:"Células",icon:"grid"},
      {id:"members",label:"Membros",icon:"users"},
      {id:"meetings",label:"Encontros",icon:"meeting"},
    ],
    more:[
      {id:"songs",label:"Músicas",icon:"music"},
      {id:"studies",label:"Estudos",icon:"star"},
      {id:"prayer",label:"Orações",icon:"pray"},
      {id:"events",label:"Eventos",icon:"event"},
      {id:"reports",label:"Relatórios",icon:"bar-chart"},
      {id:"messages",label:"Mensagens",icon:"message"},
      {id:"requests",label:"Solicitações",icon:"inbox"},
      {id:"logs",label:"Auditoria",icon:"history"},
    ]
  },
  supervisor:{
    primary:[
      {id:"dashboard",label:"Painel",icon:"gauge"},
      {id:"cells",label:"Células",icon:"grid"},
      {id:"reports",label:"Relatórios",icon:"bar-chart"},
    ],
    more:[
      {id:"requests",label:"Solicitações",icon:"inbox"},
      {id:"messages",label:"Mensagens",icon:"message"},
    ]
  },
  leader:{
    primary:[
      {id:"dashboard",label:"Painel",icon:"gauge"},
      {id:"meetings",label:"Encontros",icon:"meeting"},
      {id:"members",label:"Membros",icon:"users"},
      {id:"prayer",label:"Orações",icon:"pray"},
    ],
    more:[
      {id:"songs",label:"Músicas",icon:"music"},
      {id:"studies",label:"Estudos",icon:"star"},
      {id:"events",label:"Eventos",icon:"event"},
      {id:"reports",label:"Relatórios",icon:"bar-chart"},
      {id:"messages",label:"Mensagens",icon:"message"},
      {id:"requests",label:"Solicitações",icon:"inbox"},
    ]
  },
  member:{
    primary:[
      {id:"home",label:"Início",icon:"home"},
      {id:"prayer",label:"Oração",icon:"pray"},
      {id:"profile",label:"Perfil",icon:"user"},
    ],
    more:[]
  }
}
NAV.secretary=NAV.leader

function Sidebar({session,tab,setTab,allNavItems,logout,onChangePw}){
  return(
    <aside style={{width:262,background:"linear-gradient(185deg,#0F1B2D 0%,#1B4F8A 100%)",position:"fixed",top:0,left:0,height:"100vh",display:"flex",flexDirection:"column",zIndex:200,boxShadow:"2px 0 16px rgba(0,0,0,.18)"}}>
      <div style={{padding:"26px 18px 20px",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <LogoIcon size={38}/>
          <div>
            <div style={{color:"#fff",fontSize:13.5,fontWeight:800,lineHeight:1.2,letterSpacing:"-.1px"}}>Gestão de Células</div>
            <div style={{color:"rgba(255,255,255,.45)",fontSize:10.5,marginTop:2}}>Promessa Lago dos Peixes</div>
          </div>
        </div>
      </div>
      <nav style={{flex:1,overflowY:"auto",padding:"10px 10px"}}>
        {allNavItems.map(item=>{
          const active=tab===item.id
          return(
            <button key={item.id} onClick={()=>setTab(item.id)} className="sidebar-nav-btn" style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"10px 14px",borderRadius:11,border:"none",cursor:"pointer",background:active?"rgba(255,255,255,.14)":"transparent",color:active?"#fff":"rgba(255,255,255,.5)",fontSize:13,fontWeight:active?700:500,marginBottom:1,textAlign:"left"}}>
              <Icon name={item.icon} size={17}/>
              <span style={{flex:1}}>{item.label}</span>
              {active&&<div style={{width:6,height:6,borderRadius:"50%",background:"#EA8C1C",flexShrink:0}}/>}
            </button>
          )
        })}
      </nav>
      <div style={{padding:"12px 10px 20px",borderTop:"1px solid rgba(255,255,255,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",marginBottom:4}}>
          <Avatar name={session.name} size={32} color="rgba(255,255,255,.18)"/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:"#fff",fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.name}</div>
            <div style={{color:"rgba(255,255,255,.35)",fontSize:10,textTransform:"capitalize"}}>{session.role}</div>
          </div>
        </div>
        <button onClick={onChangePw} className="sidebar-nav-btn" style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",background:"transparent",color:"rgba(255,255,255,.45)",fontSize:12,fontWeight:500}}>
          <Icon name="key" size={14}/>Alterar senha
        </button>
        <button onClick={logout} className="sidebar-nav-btn" style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",background:"transparent",color:"rgba(255,255,255,.45)",fontSize:12,fontWeight:500}}>
          <Icon name="log-out" size={14}/>Sair
        </button>
      </div>
    </aside>
  )
}

function Topbar({session,pageTitle,isMobile,logout,onChangePw}){
  if(!isMobile){
    return(
      <div style={{height:68,background:"#fff",borderBottom:"1px solid #E7ECF2",display:"flex",alignItems:"center",padding:"0 28px",boxShadow:"0 1px 0 #E7ECF2",flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:19,fontWeight:800,color:"#0F1B2D",letterSpacing:"-.3px"}}>{pageTitle}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={onChangePw} style={{background:"#F4F6FA",border:"1px solid #E7ECF2",borderRadius:10,padding:"8px 11px",cursor:"pointer",color:"#54627A",display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600}}>
            <Icon name="key" size={14}/>Senha
          </button>
          <div style={{display:"flex",alignItems:"center",gap:9,background:"#F4F6FA",border:"1px solid #E7ECF2",borderRadius:12,padding:"7px 14px 7px 10px"}}>
            <Avatar name={session.name} size={26} color={C.primary}/>
            <span style={{fontSize:13,fontWeight:600,color:"#0F1B2D"}}>{session.name.split(" ")[0]}</span>
          </div>
        </div>
      </div>
    )
  }
  return(
    <div style={{background:`linear-gradient(135deg,#0F1B2D,#1B4F8A)`,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 12px rgba(0,0,0,.2)",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <LogoIcon size={30}/>
        <div>
          <div style={{color:"#fff",fontSize:15,fontWeight:800}}>{pageTitle}</div>
          <div style={{color:"rgba(255,255,255,.55)",fontSize:11}}>{session.name}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={onChangePw} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"rgba(255,255,255,.8)",display:"flex"}}><Icon name="key" size={15}/></button>
        <button onClick={logout} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"rgba(255,255,255,.8)",display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}><Icon name="log-out" size={14}/>Sair</button>
      </div>
    </div>
  )
}

function BottomNav({tab,setTab,navItems,moreItems,onMoreOpen}){
  const isMoreActive=moreItems.some(i=>i.id===tab)
  return(
    <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #E7ECF2",display:"flex",zIndex:200,boxShadow:"0 -2px 12px rgba(15,27,45,.07)"}}>
      {navItems.map(item=>{
        const active=tab===item.id
        return(
          <button key={item.id} onClick={()=>setTab(item.id)} className="bottom-nav-btn" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 4px 11px",border:"none",cursor:"pointer",background:"transparent",color:active?"#1B4F8A":"#8A98AC",gap:3}}>
            <Icon name={item.icon} size={21}/>
            <span style={{fontSize:10,fontWeight:active?700:500,lineHeight:1}}>{item.label}</span>
          </button>
        )
      })}
      {moreItems.length>0&&(
        <button onClick={onMoreOpen} className="bottom-nav-btn" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 4px 11px",border:"none",cursor:"pointer",background:"transparent",color:isMoreActive?"#1B4F8A":"#8A98AC",gap:3}}>
          <Icon name="menu" size={21}/>
          <span style={{fontSize:10,fontWeight:isMoreActive?700:500,lineHeight:1}}>Mais</span>
        </button>
      )}
    </nav>
  )
}

function MoreDrawer({open,items,tab,setTab,onClose}){
  if(!open)return null
  return(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,27,45,.5)",zIndex:300}}/>
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderRadius:"22px 22px 0 0",zIndex:301,padding:"20px 16px 28px",boxShadow:"0 -4px 24px rgba(0,0,0,.15)",animation:"slideUp .2s ease"}}>
        <div style={{width:38,height:4,borderRadius:2,background:"#E7ECF2",margin:"0 auto 20px"}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {items.map(item=>{
            const active=tab===item.id
            return(
              <button key={item.id} onClick={()=>{setTab(item.id);onClose()}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:13,border:"1.5px solid",borderColor:active?"#1B4F8A":"#E7ECF2",background:active?"#EAF1FB":"#F4F6FA",cursor:"pointer",fontSize:13,fontWeight:active?700:500,color:active?"#1B4F8A":"#0F1B2D",textAlign:"left"}}>
                <Icon name={item.icon} size={16} color={active?"#1B4F8A":"#8A98AC"}/>
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function AppShell({session,logout,showToast}){
  const role=session.role
  const navConf=NAV[role]||NAV.member
  const allNavItems=[...navConf.primary,...navConf.more]
  const defaultTab=navConf.primary[0]?.id||"home"
  const[tab,setTab]=useState(defaultTab)
  const[isMobile,setIsMobile]=useState(typeof window!=="undefined"?window.innerWidth<900:false)
  const[moreOpen,setMoreOpen]=useState(false)
  const[showChangePw,setShowChangePw]=useState(false)

  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<900)
    window.addEventListener("resize",h)
    return()=>window.removeEventListener("resize",h)
  },[])

  const currentItem=allNavItems.find(i=>i.id===tab)
  const pageTitle=currentItem?.label||"Gestão de Células"

  function renderContent(){
    if(role==="admin"){
      if(tab==="dashboard")return<AdminOverview session={session} showToast={showToast} setTab={setTab}/>
      if(tab==="cells")return<CellsPanel session={session} showToast={showToast}/>
      if(tab==="members")return<MembersPanel session={session} showToast={showToast}/>
      if(tab==="meetings")return<MeetingsPanel session={session} showToast={showToast}/>
      if(tab==="events")return<EventsPanel session={session} showToast={showToast}/>
      if(tab==="prayer")return<PrayerPanel session={session} showToast={showToast}/>
      if(tab==="reports")return<ReportsPanel session={session}/>
      if(tab==="messages")return<MessagesPanel session={session} showToast={showToast}/>
      if(tab==="requests")return<AllRequestsPanel session={session} showToast={showToast}/>
      if(tab==="studies")return<StudiesPanel session={session} showToast={showToast}/>
      if(tab==="songs")return<SongsPanel session={session} showToast={showToast}/>
      if(tab==="logs")return<LogsPanel/>
    }
    if(role==="leader"||role==="secretary"){
      if(tab==="dashboard")return<LeaderHome session={session} showToast={showToast} setTab={setTab}/>
      if(tab==="meetings")return<MeetingsPanel session={session} showToast={showToast}/>
      if(tab==="members")return<MembersPanel session={session} showToast={showToast}/>
      if(tab==="prayer")return<PrayerPanel session={session} showToast={showToast}/>
      if(tab==="songs")return<SongsPanel session={session} showToast={showToast}/>
      if(tab==="studies")return<StudiesPanel session={session} showToast={showToast}/>
      if(tab==="events")return<EventsPanel session={session} showToast={showToast}/>
      if(tab==="reports")return<ReportsPanel session={session}/>
      if(tab==="messages")return<MessagesPanel session={session} showToast={showToast}/>
      if(tab==="requests")return<AllRequestsPanel session={session} showToast={showToast}/>
    }
    if(role==="supervisor"){
      if(tab==="dashboard")return<SupervisorHome session={session} showToast={showToast}/>
      if(tab==="cells")return<SupervisorCells session={session}/>
      if(tab==="requests")return<AllRequestsPanel session={session} showToast={showToast}/>
      if(tab==="messages")return<MessagesPanel session={session} showToast={showToast}/>
      if(tab==="reports")return<ReportsPanel session={session}/>
    }
    if(role==="member"){
      if(tab==="home")return<MemberHome session={session} showToast={showToast}/>
      if(tab==="prayer")return<PrayerPanel session={session} showToast={showToast}/>
      if(tab==="profile")return<MemberProfile session={session} showToast={showToast}/>
    }
    return null
  }

  return(
    <div style={{display:"flex",minHeight:"100vh",background:"#F4F6FA"}}>
      {!isMobile&&(
        <Sidebar session={session} tab={tab} setTab={setTab} allNavItems={allNavItems} logout={logout} onChangePw={()=>setShowChangePw(true)}/>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",marginLeft:isMobile?0:262,minWidth:0,minHeight:"100vh"}}>
        <Topbar session={session} pageTitle={pageTitle} isMobile={isMobile} logout={logout} onChangePw={()=>setShowChangePw(true)}/>
        <main style={{flex:1,overflowY:"auto",padding:isMobile?"16px 16px 88px":"24px 28px"}}>
          <div style={{maxWidth:1120,margin:"0 auto"}} className="shell-content" key={tab}>
            {renderContent()}
          </div>
        </main>
        {isMobile&&(
          <>
            <BottomNav tab={tab} setTab={setTab} navItems={navConf.primary} moreItems={navConf.more} onMoreOpen={()=>setMoreOpen(true)}/>
            <MoreDrawer open={moreOpen} items={navConf.more} tab={tab} setTab={setTab} onClose={()=>setMoreOpen(false)}/>
          </>
        )}
      </div>
      <ChangePasswordModal open={showChangePw} onClose={()=>setShowChangePw(false)} session={session} showToast={showToast}/>
    </div>
  )
}

// ─── LEADER HOME (painel do líder/secretário) ─────────────────────────────────
function LeaderHome({session,showToast,setTab}){
  const[lsBdModal,setLsBdModal]=useState(null)
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:meetings}=useTable("meetings")
  const{data:prayers}=useTable("prayer_requests")
  const cell=cells.find(c=>c.id===session.cell_id)
  const cellMembers=members.filter(m=>m.cell_id===session.cell_id&&m.status==="Membro")
  const cellVisitors=members.filter(m=>m.cell_id===session.cell_id&&m.status==="Visitante")
  const cellMeetings=meetings.filter(m=>m.cell_id===session.cell_id||m.is_general)
  const pendingPrayers=prayers.filter(p=>p.cell_id===session.cell_id&&p.status==="pending").length
  const{start,end}=getCurrentWeekDates()
  const weekBirthdays=members.filter(m=>m.cell_id===session.cell_id&&m.birth_date&&(()=>{const b=parseDate(m.birth_date);const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate());return t>=start&&t<=end})())
  const currentMonth=getCurrentMonth()
  const monthBirthdays=[...cellMembers,...cellVisitors].filter(m=>m.birth_date&&getMonthBirthday(m.birth_date)===currentMonth).sort((a,b)=>parseDate(a.birth_date).getDate()-parseDate(b.birth_date).getDate())
  const monthNames=["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
  const menu=[
    {id:"meetings",icon:"meeting",label:"Encontros",desc:"Registrar e gerenciar",color:C.success},
    {id:"members",icon:"users",label:"Pessoas",desc:`${cellMembers.length} membros, ${cellVisitors.length} visitantes`,color:C.primary},
    {id:"prayer",icon:"pray",label:"Orações",desc:`${pendingPrayers} pedido(s) pendente(s)`,color:"#7c3aed"},
    {id:"events",icon:"event",label:"Eventos",desc:"Gerenciar eventos",color:C.purple},
    {id:"reports",icon:"bar-chart",label:"Relatórios",desc:"Frequência e dados",color:C.gold},
    {id:"messages",icon:"message",label:"Mensagens",desc:"Comunicados",color:"#0891b2"},
    {id:"requests",icon:"inbox",label:"Solicitações",desc:"Inativações e alterações",color:C.danger},
    {id:"studies",icon:"star",label:"Estudos",desc:"Material de estudo",color:C.primary},
    {id:"songs",icon:"music",label:"Músicas",desc:"Repertório da célula",color:C.success},
  ]
  return(
    <div>
      {weekBirthdays.length>0&&(
        <div style={{background:`linear-gradient(135deg,${C.gold},#d4820f)`,borderRadius:16,padding:"14px 16px",marginBottom:16,boxShadow:"0 4px 16px rgba(232,146,26,.3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:22}}>🎂</span><span style={{color:"#fff",fontSize:13,fontWeight:800}}>Aniversário esta semana!</span></div>
          {weekBirthdays.map(m=>{
            const bDate=new Date(new Date().getFullYear(),parseDate(m.birth_date).getMonth(),parseDate(m.birth_date).getDate())
            const dn=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][bDate.getDay()]
            const dd=String(bDate.getDate()).padStart(2,"0")
            const dm=String(bDate.getMonth()+1).padStart(2,"0")
            return(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderTop:"1px solid rgba(255,255,255,.2)"}}>
                <Avatar name={m.name} photo={m.photo_url} size={30} color="rgba(255,255,255,.3)"/>
                <div style={{flex:1,minWidth:0}}><div style={{color:"#fff",fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div><div style={{color:"rgba(255,255,255,.8)",fontSize:11}}>{dn}, {dd}/{dm}</div></div>
                <button onClick={()=>setLsBdModal(m)} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4,flexShrink:0}}><Icon name="whatsapp" size={12}/>Parabéns</button>
              </div>
            )
          })}
          {lsBdModal&&<BirthdayMessageModal member={lsBdModal} cellName={cell?.name||""} senderName={session.name} senderRole={session.role} onClose={()=>setLsBdModal(null)}/>}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <Stat label="Membros" value={cellMembers.length} color={C.primary} icon="users" sub={cellVisitors.length>0?`+ ${cellVisitors.length} visitantes`:""}/>
        <Stat label="Encontros" value={cellMeetings.length} color={C.gold} icon="meeting"/>
      </div>
      {cell?.growth_goal>0&&(
        <Card style={{marginBottom:16,border:`1px solid ${C.primary}20`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{background:C.primary+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="target" size={16} color={C.primary}/></div><span style={{fontSize:14,fontWeight:800,color:C.primary}}>Meta de Crescimento</span></div>
          <ProgressBar value={cellMembers.length} max={cell.growth_goal} color={C.primary}/>
          {cellVisitors.length>0&&<div style={{fontSize:11,color:C.purple,marginTop:8}}>🌱 {cellVisitors.length} visitante(s) — potencial de crescimento!</div>}
        </Card>
      )}
      {cell?.next_meeting_date&&(
        <Card style={{marginBottom:16,border:`1px solid ${C.gold}30`,background:`${C.gold}05`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{background:C.gold+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="calendar" size={16} color={C.gold}/></div>
            <div><div style={{fontSize:13,fontWeight:800,color:C.gold}}>Próximo Encontro</div><div style={{fontSize:15,fontWeight:900,color:"#0f172a"}}>{fmtDate(cell.next_meeting_date)} às {cell.time}</div><div style={{fontSize:11,color:"#64748b"}}>{cell.frequency||"Semanal"} • {cell.neighborhood}</div></div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {menu.map(item=>(
          <button key={item.id} onClick={()=>setTab(item.id)} className="card-hover" style={{background:"#fff",borderRadius:16,border:"1px solid #E7ECF2",padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
            <div style={{width:46,height:46,borderRadius:14,background:item.color+"15",display:"flex",alignItems:"center",justifyContent:"center",color:item.color,flexShrink:0}}><Icon name={item.icon} size={22}/></div>
            <div><div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{item.label}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{item.desc}</div></div>
            <div style={{marginLeft:"auto"}}><Icon name="chevron-right" size={16} color="#cbd5e1"/></div>
          </button>
        ))}
      </div>
      {monthBirthdays.length>0&&(
        <Card style={{marginTop:16,border:"1px solid #fde68a",background:"#fffbeb"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:18}}>🎂</span>
            <span style={{fontSize:13,fontWeight:800,color:"#92400e"}}>Aniversariantes — {monthNames[currentMonth]}</span>
            <span style={{marginLeft:"auto",background:C.gold,color:"#fff",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{monthBirthdays.length}</span>
          </div>
          {monthBirthdays.map(m=>{
            const bDate=parseDate(m.birth_date)
            const dd=String(bDate.getDate()).padStart(2,"0")
            const mm=String(bDate.getMonth()+1).padStart(2,"0")
            return(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderTop:"1px solid #fde68a"}}>
                <Avatar name={m.name} photo={m.photo_url} size={28} color={C.gold}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#92400e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                  <div style={{fontSize:10,color:"#b45309"}}>{dd}/{mm} {m.status==="Visitante"&&"· Visitante"}</div>
                </div>
                {m.phone&&<button onClick={()=>setLsBdModal(m)} style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:3,fontSize:10,fontWeight:700,color:"#166534",cursor:"pointer",flexShrink:0}}><Icon name="whatsapp" size={10}/>Parabéns</button>}
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

// ─── SUPERVISOR HOME ──────────────────────────────────────────────────────────
function SupervisorHome({session,showToast}){
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:requests}=useTable("inactivation_requests")
  const{data:cellReqs}=useTable("cell_change_requests")
  const supervised=cells.filter(c=>c.supervisor_id===session.member_id||c.supervisor_id===session.id)
  const pendingCount=requests.filter(r=>r.status==="pending").length+cellReqs.filter(r=>r.status==="pending").length
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <Stat label="Células" value={supervised.length} color={C.purple} icon="grid"/>
        <Stat label="Pendências" value={pendingCount} color={C.danger} icon="inbox"/>
      </div>
      <SupervisorCells session={session}/>
    </div>
  )
}

function SupervisorCells({session}){
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const supervised=cells.filter(c=>c.supervisor_id===session.member_id||c.supervisor_id===session.id)
  if(supervised.length===0)return<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma célula atribuída</p></Card>
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {supervised.map(cell=>{
        const mc=members.filter(m=>m.cell_id===cell.id&&m.status==="Membro")
        const leaders=members.filter(m=>cell.leaders_ids?.includes(m.id))
        return(
          <Card key={cell.id}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
              <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{cell.name}</span>
              <Badge label={cell.cell_type||"Adultos"} color={C.primary}/>
              <Badge label={cell.cell_status||"Ativa"} color={cell.cell_status==="Inativa"?C.danger:C.success}/>
            </div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{cell.neighborhood} • {cell.day} às {cell.time}</div>
            {cell.frequency&&<div style={{fontSize:11,color:C.purple,marginBottom:8}}>🔄 {cell.frequency}{cell.next_meeting_date?` • Próx: ${fmtDate(cell.next_meeting_date)}`:""}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:"#64748b",marginBottom:cell.growth_goal>0?10:0}}>
              <span>👤 <b style={{color:"#334155"}}>{leaders.length>0?leaders[0].name.split(" ")[0]:"—"}</b></span>
              <span>👥 <b style={{color:"#334155"}}>{mc.length} membros</b></span>
            </div>
            {cell.growth_goal>0&&<ProgressBar value={mc.length} max={cell.growth_goal} color={C.purple}/>}
          </Card>
        )
      })}
    </div>
  )
}

// ─── MEMBER HOME & PROFILE ────────────────────────────────────────────────────
function MemberHome({session,showToast}){
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:attendanceRaw}=useTable("attendance");const attendance=dedupeAtt(attendanceRaw)
  const member=members.find(m=>m.id===session.member_id)
  const cell=member?cells.find(c=>c.id===member.cell_id):null
  const cellMembers=cell?members.filter(m=>m.cell_id===cell.id&&m.status==="Membro"):[]
  const leaders=cell?members.filter(m=>cell.leaders_ids?.includes(m.id)):[]
  const myAttRaw=attendance.filter(a=>a.member_id===session.member_id)
  const myAttMap={}
  myAttRaw.forEach(a=>{if(!myAttMap[a.date]||a.status==="Presente")myAttMap[a.date]=a})
  const myAtt=Object.values(myAttMap).sort((a,b)=>b.date.localeCompare(a.date))
  const pct=myAtt.length?Math.round(myAtt.filter(a=>a.status==="Presente").length/myAtt.length*100):0
  const{start,end}=getCurrentWeekDates()
  const weekBirthday=member?.birth_date&&(()=>{const b=parseDate(member.birth_date);const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate());return t>=start&&t<=end})()
  const freqColor=pct>=85?C.success:pct>=72?C.gold:C.danger
  return(
    <div>
      {weekBirthday&&<div style={{background:C.gold,borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:22}}>🎂</span><span style={{color:"#fff",fontSize:14,fontWeight:700}}>Parabéns pelo seu aniversário! 🎉</span></div>}
      {cell&&(
        <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.primary}12,${C.primary}06)`,border:`1px solid ${C.primary}20`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.primary,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Minha Célula</div>
          <div style={{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:4}}>{cell.name}</div>
          {cell.next_meeting_date&&<div style={{fontSize:13,color:"#64748b",marginBottom:4}}>{cell.day} • {cell.time} • {fmtDate(cell.next_meeting_date)}</div>}
          {cell.neighborhood&&<div style={{fontSize:12,color:"#94a3b8"}}>📍 {cell.neighborhood}</div>}
        </Card>
      )}
      {leaders.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10}}>MEU LÍDER</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Avatar name={leaders[0].name} photo={leaders[0].photo_url} size={42} color={C.primary}/>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{leaders[0].name}</div><div style={{fontSize:12,color:"#64748b"}}>Líder</div></div>
            {leaders[0].phone&&<a href={whatsappLink(leaders[0].phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"#166534",textDecoration:"none"}}><Icon name="whatsapp" size={14}/>Contato</a>}
          </div>
        </Card>
      )}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#64748b"}}>MINHA FREQUÊNCIA</div>
          <div style={{fontSize:22,fontWeight:800,color:freqColor}}>{pct}%</div>
        </div>
        <ProgressBar value={pct} max={100} color={freqColor}/>
        <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{myAtt.filter(a=>a.status==="Presente").length} presenças de {myAtt.length} encontros</div>
      </Card>
      {myAtt.slice(0,5).length>0&&(
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10}}>ÚLTIMOS ENCONTROS</div>
          {myAtt.slice(0,5).map(a=>(
            <div key={a.id||a.date} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
              <span style={{color:"#334155",fontWeight:500}}>{fmtDate(a.date)}</span>
              <span style={{fontSize:11,fontWeight:700,background:a.status==="Presente"?C.success+"15":C.danger+"15",color:a.status==="Presente"?C.success:C.danger,padding:"3px 10px",borderRadius:20}}>{a.status}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function MemberProfile({session,showToast}){
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const member=members.find(m=>m.id===session.member_id)
  const cell=member?cells.find(c=>c.id===member.cell_id):null
  if(!member)return<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Carregando perfil...</p></Card>
  return(
    <div>
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <Avatar name={member.name} photo={member.photo_url} size={56} color={C.primary}/>
          <div><div style={{fontSize:17,fontWeight:800,color:"#0f172a"}}>{member.name}</div><div style={{fontSize:12,color:"#64748b"}}>{cell?.name||"Sem célula"} • {member.status}</div></div>
        </div>
        <h3 style={{fontSize:13,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Informações Pessoais</h3>
        {[["Telefone",member.phone],["E-mail",member.email],["Bairro",member.neighborhood],["Batizado",member.baptized?`✓ Sim${member.baptism_date?` (${fmtDate(member.baptism_date)})`:""}`:member.baptized===false?"✗ Não":"—"],["Nascimento",fmtDate(member.birth_date)],["Idade",ageOf(member)?`${ageOf(member)} anos`:null]].map(([k,v])=>v?(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
            <span style={{color:"#94a3b8",fontWeight:600}}>{k}</span>
            <span style={{color:"#334155",fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{v}</span>
          </div>
        ):null)}
      </Card>
      {(member.father_name||member.mother_name||member.spouse_name)&&(
        <Card style={{marginBottom:12}}>
          <h3 style={{fontSize:13,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Família</h3>
          {member.father_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Pai</span><span style={{color:"#334155",fontWeight:700}}>{member.father_name}</span></div>}
          {member.mother_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Mãe</span><span style={{color:"#334155",fontWeight:700}}>{member.mother_name}</span></div>}
          {member.spouse_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Cônjuge</span><span style={{color:"#334155",fontWeight:700}}>{member.spouse_name}</span></div>}
        </Card>
      )}
      {cell&&(
        <Card>
          <h3 style={{fontSize:13,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Minha Célula</h3>
          {[["Nome",cell.name],["Tipo",cell.cell_type],["Dia",cell.day],["Horário",cell.time],["Bairro",cell.neighborhood],["Próximo encontro",fmtDate(cell.next_meeting_date)]].map(([k,v])=>v&&v!=="—"?(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
              <span style={{color:"#94a3b8",fontWeight:600}}>{k}</span>
              <span style={{color:"#334155",fontWeight:700,textAlign:"right"}}>{v}</span>
            </div>
          ):null)}
        </Card>
      )}
    </div>
  )
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({session,logout,showToast}){
  const[tab,setTab]=useState("dashboard")
  const[showChangePw,setShowChangePw]=useState(false)
  const tabs=[
    {id:"dashboard",label:"Painel",icon:"gauge"},
    {id:"meetings",label:"Encontros",icon:"meeting"},
    {id:"songs",label:"Músicas",icon:"music"},
    {id:"studies",label:"Estudos",icon:"star"},
    {id:"prayer",label:"Orações",icon:"pray"},
    {id:"cells",label:"Células",icon:"grid"},
    {id:"members",label:"Membros",icon:"users"},
    {id:"events",label:"Eventos",icon:"event"},
    {id:"reports",label:"Relatórios",icon:"bar-chart"},
    {id:"messages",label:"Mensagens",icon:"message"},
    {id:"requests",label:"Solicits.",icon:"inbox"},
    {id:"logs",label:"Auditoria",icon:"history"},
  ]
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <header style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"14px 18px 0",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{color:"rgba(255,255,255,0.9)"}}><LogoIcon size={34}/></div>
            <div>
              <div style={{color:"#fff",fontSize:15,fontWeight:800}}>Painel do Gestor</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:11}}>{session?.name}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setShowChangePw(true)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="key" size={15}/></button>
            <button onClick={logout} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}><Icon name="log-out" size={14}/>Sair</button>
          </div>
        </div>
        <div className="tabs-scroll" style={{display:"flex",gap:1,overflowX:"auto",paddingBottom:3}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"rgba(255,255,255,0.15)":"transparent",border:"none",borderRadius:"8px 8px 0 0",padding:"7px 12px 10px",cursor:"pointer",color:tab===t.id?"#fff":"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:60,flexShrink:0,transition:"all 0.15s",borderBottom:tab===t.id?"2.5px solid "+C.gold:"2.5px solid transparent",whiteSpace:"nowrap"}}>
              <Icon name={t.icon} size={16}/><span>{t.label}</span>
            </button>
          ))}
        </div>
      </header>
      <div style={{flex:1,padding:"16px",overflowY:"auto",animation:"fadeIn 0.2s ease"}}>
        <div style={{maxWidth:1200,margin:"0 auto",width:"100%"}}>
          {tab==="dashboard"&&<AdminOverview session={session} showToast={showToast} setTab={setTab}/>}
          {tab==="cells"&&<CellsPanel session={session} showToast={showToast}/>}
          {tab==="members"&&<MembersPanel session={session} showToast={showToast}/>}
          {tab==="meetings"&&<MeetingsPanel session={session} showToast={showToast}/>}
          {tab==="events"&&<EventsPanel session={session} showToast={showToast}/>}
          {tab==="prayer"&&<PrayerPanel session={session} showToast={showToast}/>}
          {tab==="reports"&&<ReportsPanel session={session}/>}
          {tab==="messages"&&<MessagesPanel session={session} showToast={showToast}/>}
          {tab==="requests"&&<AllRequestsPanel session={session} showToast={showToast}/>}
          {tab==="studies"&&<StudiesPanel session={session} showToast={showToast}/>}
          {tab==="songs"&&<SongsPanel session={session} showToast={showToast}/>}
          {tab==="logs"&&<LogsPanel/>}
        </div>
      </div>
      <ChangePasswordModal open={showChangePw} onClose={()=>setShowChangePw(false)} session={session} showToast={showToast}/>
    </div>
  )
}

function AdminOverview({session,showToast,setTab}){
  const[bdModal,setBdModal]=useState(null)
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:requests}=useTable("inactivation_requests")
  const{data:cellReqs}=useTable("cell_change_requests")
  const{data:prayers}=useTable("prayer_requests")
  const{data:meetings}=useTable("meetings")
  const{data:attendanceRaw}=useTable("attendance");const attendance=dedupeAtt(attendanceRaw)

  const activeMembers=members.filter(m=>m.status==="Membro")
  const visitors=members.filter(m=>m.status==="Visitante")
  const baptized=members.filter(m=>m.baptized).length
  const notBaptized=activeMembers.filter(m=>m.baptized===false).length
  const activeCells=cells.filter(c=>c.cell_status!=="Inativa")
  const pending=requests.filter(r=>r.status==="pending").length+cellReqs.filter(r=>r.status==="pending").length
  const pendingPrayers=prayers.filter(p=>p.status==="pending").length

  // Attendance stats last 30 days
  const thirtyDaysAgo=new Date();thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);thirtyDaysAgo.setHours(0,0,0,0)
  const recentAtt=attendance.filter(a=>a.date&&parseDate(a.date)>=thirtyDaysAgo)
  const recentPresent=recentAtt.filter(a=>a.status==="Presente").length
  const recentTotal=recentAtt.length
  const avgFreq=recentTotal>0?Math.round(recentPresent/recentTotal*100):0

  // Cell performance
  const cellStats=activeCells.map(c=>{
    const mc=members.filter(m=>m.cell_id===c.id&&m.status==="Membro").length
    const vis=members.filter(m=>m.cell_id===c.id&&m.status==="Visitante").length
    const cAtt=recentAtt.filter(a=>a.cell_id===c.id)
    const cPct=cAtt.length>0?Math.round(cAtt.filter(a=>a.status==="Presente").length/cAtt.length*100):null
    return{id:c.id,name:c.name,type:c.cell_type||"Adultos",members:mc,visitors:vis,goal:c.growth_goal||0,freq:cPct,next:c.next_meeting_date,time:c.time}
  }).sort((a,b)=>b.members-a.members)

  // Gender breakdown
  const men=activeMembers.filter(m=>m.gender==="Masculino").length
  const women=activeMembers.filter(m=>m.gender==="Feminino").length

  // Type breakdown
  const typeMap={}
  activeMembers.forEach(m=>{const cell=cells.find(c=>c.id===m.cell_id);const t=cell?.cell_type||"Sem célula";typeMap[t]=(typeMap[t]||0)+1})

  // Birthdays
  const currentMonth=getCurrentMonth()
  const{start,end}=getCurrentWeekDates()
  const birthdays=members.filter(m=>m.birth_date&&m.status!=="Inativo"&&getMonthBirthday(m.birth_date)===currentMonth).sort((a,b)=>parseDate(a.birth_date).getDate()-parseDate(b.birth_date).getDate())
  const weekBirthdays=members.filter(m=>{
    if(!m.birth_date)return false
    const b=parseDate(m.birth_date)
    const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate())
    return t>=start&&t<=end
  }).map(m=>{
    const cell=cells.find(c=>c.id===m.cell_id)
    const bDate=new Date(new Date().getFullYear(),parseDate(m.birth_date).getMonth(),parseDate(m.birth_date).getDate())
    const weekDays=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]
    const dayName=weekDays[bDate.getDay()]
    const dayNum=String(bDate.getDate()).padStart(2,"0")
    const monthNum=String(bDate.getMonth()+1).padStart(2,"0")
    return{...m,cellName:cell?.name||"Sem célula",dayName,dayNum,monthNum}
  })
  const nextMeetings=activeCells.filter(c=>c.next_meeting_date).sort((a,b)=>a.next_meeting_date.localeCompare(b.next_meeting_date)).slice(0,4)
  const monthNames=["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

  // ── CRESCIMENTO: novos membros por mês (últimos 6 meses) ──
  const growthData=(()=>{
    const months=[]
    const now=new Date()
    for(let i=5;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1)
      const y=d.getFullYear(),m=d.getMonth()
      const count=members.filter(mb=>{
        if(!mb.created_at)return false
        const cd=new Date(mb.created_at)
        return cd.getFullYear()===y&&cd.getMonth()===m&&mb.status!=="Inativo"
      }).length
      months.push({label:monthNames[m+1],count})
    }
    return months
  })()

  // ── FREQUÊNCIA SEMANAL: últimas 8 semanas ──
  const freqWeekData=(()=>{
    const weeks=[]
    const now=new Date()
    for(let i=7;i>=0;i--){
      const sun=new Date(now)
      sun.setDate(now.getDate()-now.getDay()-i*7)
      sun.setHours(0,0,0,0)
      const sat=new Date(sun)
      sat.setDate(sun.getDate()+6)
      sat.setHours(23,59,59,999)
      const wAtt=attendance.filter(a=>{if(!a.date)return false;const d=parseDate(a.date);return d>=sun&&d<=sat})
      const pct=wAtt.length>0?Math.round(wAtt.filter(a=>a.status==="Presente").length/wAtt.length*100):null
      const label=`${String(sun.getDate()).padStart(2,"0")}/${String(sun.getMonth()+1).padStart(2,"0")}`
      weeks.push({label,pct})
    }
    return weeks
  })()

  // ── ALERTA DE FALTAS: membros com 2+ encontros seguidos ausentes ──
  const absentAlerts=(()=>{
    const alerts=[]
    const activeMembersList=members.filter(m=>m.status==="Membro")
    activeMembersList.forEach(m=>{
      const mAtt=attendance.filter(a=>a.member_id===m.id).sort((a,b)=>b.date.localeCompare(a.date))
      if(mAtt.length>=2&&mAtt[0].status==="Ausente"&&mAtt[1].status==="Ausente"){
        const cell=cells.find(c=>c.id===m.cell_id)
        alerts.push({...m,cellName:cell?.name||"Sem célula",missedCount:mAtt.filter((a,i)=>i<mAtt.length&&a.status==="Ausente"&&(i===0||mAtt[i-1].status==="Ausente")).length})
      }
    })
    return alerts.slice(0,10)
  })()

  return(
    <div style={{animation:"fadeIn 0.2s ease"}}>

      {/* ALERTS */}
      {weekBirthdays.length>0&&(
        <div style={{background:`linear-gradient(135deg,${C.gold},#c97b10)`,borderRadius:16,padding:"14px 18px",marginBottom:16,boxShadow:"0 4px 16px rgba(232,146,26,0.35)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{fontSize:28}}>🎂</div>
            <span style={{color:"#fff",fontSize:13,fontWeight:800,flex:1}}>Aniversário esta semana!</span>
          </div>
          {weekBirthdays.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:"1px solid rgba(255,255,255,0.2)"}}>
              <Avatar name={m.name} photo={m.photo_url} size={34} color="rgba(255,255,255,0.3)"/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#fff",fontSize:13,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>{m.cellName} • {m.dayName}, {m.dayNum}/{m.monthNum}</div>
              </div>
              <button onClick={()=>setBdModal(m)} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:10,padding:"6px 12px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,flexShrink:0}}><Icon name="whatsapp" size={13}/>Parabéns</button>
            </div>
          ))}
          {bdModal&&<BirthdayMessageModal member={bdModal} cellName={bdModal.cellName} senderName={session.name} senderRole={session.role} onClose={()=>setBdModal(null)}/>}
        </div>
      )}
      {(pending+pendingPrayers)>0&&(
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:14,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <Icon name="bell" size={18} color={C.danger}/>
          <div style={{flex:1,fontSize:13,fontWeight:700,color:"#991b1b"}}>{pending} solicitação(ões) + {pendingPrayers} pedido(s) de oração pendentes</div>
          <button onClick={()=>setTab("requests")} style={{background:C.danger,border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700}}>Ver</button>
        </div>
      )}

      {/* MAIN STATS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        <Stat label="Membros" value={activeMembers.length} color={C.primary} icon="users"/>
        <Stat label="Visitantes" value={visitors.length} color={C.gold} icon="user-plus"/>
        <Stat label="Células" value={activeCells.length} color={C.success} icon="grid"/>
        <Stat label="Batizados" value={baptized} color={C.purple} icon="check-circle"/>
      </div>

      {/* TWO COLUMN LAYOUT ON DESKTOP */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>

        {/* PRÓXIMOS ENCONTROS */}
        <Card style={{border:`1px solid ${C.primary}20`,background:`${C.primary}04`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{background:C.primary+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="calendar" size={15} color={C.primary}/></div>
              <span style={{fontSize:13,fontWeight:800,color:C.primary}}>Próximos Encontros</span>
            </div>
            <button onClick={()=>setTab("meetings")} style={{fontSize:11,color:C.primary,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Ver todos →</button>
          </div>
          {nextMeetings.length===0&&<p style={{color:"#94a3b8",fontSize:12,margin:0}}>Nenhum encontro agendado</p>}
          {nextMeetings.map(c=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${C.primary}12`}}>
              <div><div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{c.name}</div><div style={{fontSize:10,color:"#64748b"}}>{c.type}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:800,color:C.primary}}>{fmtDate(c.next)}</div><div style={{fontSize:10,color:"#64748b"}}>{c.time}</div></div>
            </div>
          ))}
        </Card>

        {/* FREQUÊNCIA GERAL */}
        <Card style={{border:`1px solid ${C.success}20`,background:`${C.success}04`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{background:C.success+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="bar-chart" size={15} color={C.success}/></div>
            <span style={{fontSize:13,fontWeight:800,color:C.success}}>Frequência (30 dias)</span>
          </div>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:42,fontWeight:900,color:avgFreq>=75?C.success:avgFreq>=50?C.warning:C.danger,lineHeight:1}}>{avgFreq}%</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>{recentPresent} presenças de {recentTotal} registros</div>
          </div>
          <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${avgFreq}%`,background:avgFreq>=75?C.success:avgFreq>=50?C.warning:C.danger,borderRadius:4,transition:"width 0.6s"}}/>
          </div>
        </Card>
      </div>

      {/* CELL OVERVIEW TABLE */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{background:C.gold+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="grid" size={15} color={C.gold}/></div>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Visão das Células</span>
          </div>
          <button onClick={()=>setTab("cells")} style={{fontSize:11,color:C.primary,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Gerenciar →</button>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:"2px solid #f1f5f9"}}>
                {["Célula","Tipo","Membros","Visitantes","Meta","Freq."].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"6px 8px",color:"#94a3b8",fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cellStats.map(c=>(
                <tr key={c.id} style={{borderBottom:"1px solid #f8fafc"}}>
                  <td style={{padding:"8px",fontWeight:700,color:"#0f172a"}}>{c.name}</td>
                  <td style={{padding:"8px"}}><Badge label={c.type} color={C.primary}/></td>
                  <td style={{padding:"8px",fontWeight:700,color:C.primary}}>{c.members}</td>
                  <td style={{padding:"8px",color:C.gold,fontWeight:600}}>{c.visitors}</td>
                  <td style={{padding:"8px"}}>
                    {c.goal>0?(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:60,height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(c.members/c.goal*100,100)}%`,background:C.primary,borderRadius:3}}/></div>
                        <span style={{color:"#64748b",fontSize:10}}>{c.members}/{c.goal}</span>
                      </div>
                    ):<span style={{color:"#cbd5e1"}}>—</span>}
                  </td>
                  <td style={{padding:"8px"}}>
                    {c.freq!==null?(
                      <span style={{fontWeight:800,color:c.freq>=75?C.success:c.freq>=50?C.warning:C.danger}}>{c.freq}%</span>
                    ):<span style={{color:"#cbd5e1"}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ALERTA DE FALTAS */}
      {absentAlerts.length>0&&(
        <Card style={{marginBottom:14,border:`1px solid ${C.danger}30`,background:"#fff5f5"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{background:C.danger+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="bell" size={15} color={C.danger}/></div>
            <span style={{fontSize:13,fontWeight:800,color:C.danger}}>⚠️ Precisam de atenção — 2+ faltas seguidas</span>
            <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,background:C.danger,color:"#fff",borderRadius:20,padding:"2px 10px"}}>{absentAlerts.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {absentAlerts.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:10,padding:"8px 12px",border:"1px solid #fecaca"}}>
                <Avatar name={m.name} photo={m.photo_url} size={30} color={C.danger}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{m.cellName}</div>
                </div>
                {m.phone&&<a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"4px 8px",display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:"#166534",textDecoration:"none",flexShrink:0}}><Icon name="whatsapp" size={11}/>Contatar</a>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* GRÁFICOS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>

        {/* CRESCIMENTO MENSAL */}
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{background:C.primary+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="user-plus" size={15} color={C.primary}/></div>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Novos Membros (6 meses)</span>
          </div>
          {(()=>{
            const maxVal=Math.max(...growthData.map(d=>d.count),1)
            const h=120
            return(
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:h+32}}>
                {growthData.map((d,i)=>{
                  const barH=d.count>0?Math.max(Math.round(d.count/maxVal*h),6):3
                  return(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <span style={{fontSize:10,fontWeight:800,color:C.primary,opacity:d.count>0?1:0}}>{d.count}</span>
                      <div style={{width:"100%",height:barH,background:i===growthData.length-1?C.primary:C.primary+"60",borderRadius:"4px 4px 0 0",transition:"height 0.4s"}}/>
                      <span style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{d.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Card>

        {/* FREQUÊNCIA SEMANAL */}
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{background:C.success+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="bar-chart" size={15} color={C.success}/></div>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Frequência Semanal (%)</span>
          </div>
          {(()=>{
            const vals=freqWeekData.map(d=>d.pct??0)
            const maxVal=Math.max(...vals,1)
            const h=120
            return(
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:h+32}}>
                {freqWeekData.map((d,i)=>{
                  const barH=d.pct!==null?Math.max(Math.round(d.pct/100*h),4):3
                  const color=d.pct===null?"#e2e8f0":d.pct>=75?C.success:d.pct>=50?C.warning:C.danger
                  return(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <span style={{fontSize:9,fontWeight:800,color,opacity:d.pct!==null?1:0}}>{d.pct}%</span>
                      <div style={{width:"100%",height:barH,background:color,borderRadius:"4px 4px 0 0",transition:"height 0.4s"}}/>
                      <span style={{fontSize:9,color:"#94a3b8",fontWeight:600,transform:"rotate(-30deg)",transformOrigin:"top center",marginTop:4,whiteSpace:"nowrap"}}>{d.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Card>
      </div>

      {/* BOTTOM ROW */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>

        {/* COMPOSIÇÃO */}
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{background:C.purple+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="users" size={15} color={C.purple}/></div>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Composição</span>
          </div>
          {[["Homens",men,C.primary],["Mulheres",women,"#e11d8c"],["Batizados",baptized,C.gold],["Não batizados",notBaptized,C.warning]].map(([label,value,color])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:12,color:"#64748b",minWidth:100}}>{label}</span>
              <div style={{flex:1,height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${activeMembers.length?Math.round(value/activeMembers.length*100):0}%`,background:color,borderRadius:3}}/>
              </div>
              <span style={{fontSize:12,fontWeight:700,color,minWidth:20,textAlign:"right"}}>{value}</span>
            </div>
          ))}
        </Card>

        {/* ANIVERSARIANTES DO MÊS */}
        <Card style={{border:"1px solid #fde68a",background:"#fffbeb"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:18}}>🎂</span>
            <span style={{fontSize:13,fontWeight:800,color:"#92400e"}}>Aniversariantes — {monthNames[currentMonth]}</span>
          </div>
          {birthdays.length===0&&<p style={{color:"#b45309",fontSize:12,margin:0}}>Nenhum este mês</p>}
          <div>
            {birthdays.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderTop:"1px solid #fde68a"}}>
                <Avatar name={m.name} photo={m.photo_url} size={26} color={C.gold}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#92400e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                  <div style={{fontSize:10,color:"#b45309"}}>{fmtDate(m.birth_date)}</div>
                </div>
                {m.phone&&<a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",borderRadius:6,padding:"3px 6px",display:"flex",alignItems:"center",gap:3,fontSize:10,fontWeight:700,color:"#166534",textDecoration:"none",flexShrink:0}}><Icon name="whatsapp" size={10}/>Wish</a>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {[
          {id:"members",icon:"user-plus",label:"Novo Membro",color:C.primary},
          {id:"meetings",icon:"meeting",label:"Encontro",color:C.success},
          {id:"prayer",icon:"pray",label:"Orações",color:C.purple},
          {id:"reports",icon:"bar-chart",label:"Relatórios",color:C.gold},
        ].map(item=>(
          <button key={item.id} onClick={()=>setTab(item.id)} style={{background:"#fff",borderRadius:14,border:"1px solid #e8edf2",padding:"14px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center",boxShadow:"0 1px 6px rgba(0,0,0,0.04)",transition:"all 0.15s"}}
            onMouseOver={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)"}} onMouseOut={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 1px 6px rgba(0,0,0,0.04)"}}>
            <div style={{width:40,height:40,borderRadius:12,background:item.color+"15",display:"flex",alignItems:"center",justifyContent:"center",color:item.color}}><Icon name={item.icon} size={19}/></div>
            <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CellsPanel({session,showToast}){
  const{data:cells,loading}=useTable("cells")
  const{data:members}=useTable("members")
  const[modal,setModal]=useState(false)
  const[editing,setEditing]=useState(null)
  const[deleteId,setDeleteId]=useState(null)
  const[memberSearch,setMemberSearch]=useState(null)
  const[filterType,setFilterType]=useState("")
  const[filterStatus,setFilterStatus]=useState("")

  const emptyForm={name:"",day:"Quarta",time:"19:30",neighborhood:"",street:"",number:"",cep:"",started_at:"",growth_goal:"",active:true,cell_type:"Adultos",cell_status:"Ativa",origin_cell_id:"",frequency:"Semanal",reminder_hours:24,reminder_channels:[],auto_create_meetings:true,leaders_ids:[],secretaries_ids:[],trainees_ids:[],hosts_ids:[],supervisor_id:""}
  const[form,setForm]=useState(emptyForm)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))

  function openEdit(c){
    setForm({name:c.name,day:c.day||"Quarta",time:c.time||"",neighborhood:c.neighborhood||"",street:c.street||"",number:c.number||"",cep:c.cep||"",started_at:c.started_at||"",growth_goal:c.growth_goal||"",active:c.active!==false,cell_type:c.cell_type||"Adultos",cell_status:c.cell_status||"Ativa",origin_cell_id:c.origin_cell_id||"",frequency:c.frequency||"Semanal",reminder_hours:c.reminder_hours||24,reminder_channels:c.reminder_channels||[],auto_create_meetings:c.auto_create_meetings!==false,leaders_ids:c.leaders_ids||[],secretaries_ids:c.secretaries_ids||[],trainees_ids:c.trainees_ids||[],hosts_ids:c.hosts_ids||[],supervisor_id:c.supervisor_id||""})
    setEditing(c.id);setModal(true)
  }

  function toggleChannel(ch){setForm(p=>({...p,reminder_channels:p.reminder_channels.includes(ch)?p.reminder_channels.filter(c=>c!==ch):[...p.reminder_channels,ch]}))}
  function toggleFuncMember(field,id){setForm(p=>({...p,[field]:p[field].includes(id)?p[field].filter(i=>i!==id):[...p[field],id]}))}

  async function searchCep(cep){
    const c=cep.replace(/\D/g,"");if(c.length!==8)return
    try{const r=await fetch(`https://viacep.com.br/ws/${c}/json/`);const d=await r.json();if(!d.erro){setForm(p=>({...p,street:d.logradouro||"",neighborhood:d.bairro||""}))}}catch{}
  }

  async function save(){
    if(!form.name.trim()){showToast("Nome é obrigatório","error");return}
    const nextDate=form.auto_create_meetings?getNextMeetingDate(form.day):null
    const payload={name:form.name.trim().toUpperCase(),day:form.day,time:form.time,neighborhood:form.neighborhood,street:form.street,number:form.number,cep:form.cep,supervisor_id:form.supervisor_id||null,started_at:form.started_at||null,growth_goal:parseInt(form.growth_goal)||0,active:form.cell_status!=="Inativa",cell_type:form.cell_type,cell_status:form.cell_status,origin_cell_id:form.origin_cell_id||null,frequency:form.frequency,reminder_hours:parseInt(form.reminder_hours)||24,reminder_channels:form.reminder_channels,auto_create_meetings:form.auto_create_meetings,next_meeting_date:nextDate,leaders_ids:form.leaders_ids,secretaries_ids:form.secretaries_ids,trainees_ids:form.trainees_ids,hosts_ids:form.hosts_ids}
    if(editing){
      const{error}=await supabase.from("cells").update(payload).eq("id",editing)
      if(error){showToast("Erro: "+error.message,"error");return}
      await addLog(session,"update",`Célula atualizada: ${form.name}`)
      showToast("Célula atualizada!")
    }else{
      const{error}=await supabase.from("cells").insert(payload)
      if(error){showToast("Erro: "+error.message,"error");return}
      await addLog(session,"create",`Célula criada: ${form.name}`)
      showToast("Célula criada!")
    }
    for(const id of form.leaders_ids)await supabase.from("users").update({role:"leader",cell_id:editing}).eq("member_id",id)
    for(const id of form.secretaries_ids)await supabase.from("users").update({role:"secretary",cell_id:editing}).eq("member_id",id)
    setModal(false);setEditing(null);setForm(emptyForm)
  }

  async function del(){await supabase.from("cells").delete().eq("id",deleteId);showToast("Célula removida");setDeleteId(null)}

  const filteredCells=cells.filter(c=>{
    const matchType=!filterType||c.cell_type===filterType
    const matchStatus=!filterStatus||(c.cell_status||"Ativa")===filterStatus
    return matchType&&matchStatus
  })

  const statusColors={"Ativa":C.success,"Inativa":C.danger,"Multiplicada":C.purple}
  const typeColors={"Adultos":C.primary,"Jovens":C.gold,"Kids/Infantil":C.success,"Casais":"#e11d8c","Homens":"#0891b2","Mulheres":"#a855f7"}
  const mOpts=[{value:"",label:"— Nenhum —"},...members.filter(m=>m.status==="Membro").map(m=>({value:m.id,label:m.name}))]

  function FuncSection({field,label,color}){
    const ids=form[field]||[]
    const mems=members.filter(m=>ids.includes(m.id))
    return(
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>
          <button type="button" onClick={()=>setMemberSearch({field,label})} style={{background:color+"15",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",color,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Icon name="plus" size={12}/>Adicionar</button>
        </div>
        {mems.length===0&&<p style={{fontSize:12,color:"#94a3b8",margin:0,fontStyle:"italic"}}>Nenhum {label.toLowerCase()} definido</p>}
        {mems.map(m=>(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:color+"08",borderRadius:10,marginBottom:4,border:`1px solid ${color}20`}}>
            <Avatar name={m.name} size={26} color={color}/>
            <span style={{fontSize:13,fontWeight:600,color:"#334155",flex:1}}>{m.name}</span>
            {m.phone&&<a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",borderRadius:6,padding:"3px 6px",display:"flex",color:"#166534",textDecoration:"none"}}><Icon name="whatsapp" size={12}/></a>}
            <button type="button" onClick={()=>toggleFuncMember(field,m.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,display:"flex"}}><Icon name="x" size={14}/></button>
          </div>
        ))}
      </div>
    )
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Células <span style={{fontSize:13,color:"#94a3b8",fontWeight:500}}>({filteredCells.length})</span></h2>
        <Btn icon="plus" size="sm" onClick={()=>{setForm(emptyForm);setEditing(null);setModal(true)}}>Nova</Btn>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {["",..."Adultos Jovens Kids/Infantil Casais Homens Mulheres".split(" ")].map(t=>(
          <button key={t} onClick={()=>setFilterType(t)} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,border:`1.5px solid ${filterType===t?C.primary:"#e2e8f0"}`,background:filterType===t?C.primary:"#fff",color:filterType===t?"#fff":"#64748b",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            {t||"Todos"}
          </button>
        ))}
      </div>

      {loading&&<Loader/>}
      {!loading&&filteredCells.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma célula encontrada</p></Card>}
      {filteredCells.map(cell=>{
        const mc=members.filter(m=>m.cell_id===cell.id&&m.status==="Membro").length
        const visitors=members.filter(m=>m.cell_id===cell.id&&m.status==="Visitante").length
        const leaders=members.filter(m=>cell.leaders_ids?.includes(m.id))
        const cStatus=cell.cell_status||"Ativa"
        const cType=cell.cell_type||"Adultos"
        const originCell=cell.origin_cell_id?cells.find(c=>c.id===cell.origin_cell_id):null
        return(
          <Card key={cell.id} style={{marginBottom:10,opacity:cStatus==="Inativa"?0.65:1}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{cell.name}</span>
                  <Badge label={cType} color={typeColors[cType]||C.primary}/>
                  <Badge label={cStatus} color={statusColors[cStatus]||C.success}/>
                </div>
                <div style={{fontSize:12,color:"#64748b"}}>{cell.neighborhood||"—"} • {cell.day} às {cell.time||"—"}</div>
                {cell.frequency&&<div style={{fontSize:11,color:C.purple,marginTop:2}}>🔄 {cell.frequency}{cell.next_meeting_date?` • Próx: ${fmtDate(cell.next_meeting_date)}`:""}</div>}
                {originCell&&<div style={{fontSize:11,color:C.gold,marginTop:2}}>🌱 Multiplicada de: {originCell.name}</div>}
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0,marginLeft:8}}>
                <button onClick={()=>openEdit(cell)} style={{background:C.primary+"15",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.primary}}><Icon name="edit" size={14}/></button>
                {session?.role==="admin"&&<button onClick={()=>setDeleteId(cell.id)} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.danger}}><Icon name="trash" size={14}/></button>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:"#64748b",marginBottom:10}}>
              <span>👤 <b style={{color:"#334155"}}>{leaders.length>0?leaders.map(l=>l.name.split(" ")[0]).join(", "):"—"}</b></span>
              <span>👥 <b style={{color:"#334155"}}>{mc} membros{visitors>0?` + ${visitors} vis.`:""}</b></span>
            </div>
            {cell.growth_goal>0&&<ProgressBar value={mc} max={cell.growth_goal} color={C.primary}/>}
            {cell.started_at&&<div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>📅 Iniciada: {fmtDate(cell.started_at)}</div>}
          </Card>
        )
      })}

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Célula":"Nova Célula"}>
        <Inp label="Nome" value={form.name} onChange={v=>f("name")(v.toUpperCase())} required/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Sel label="Tipo" value={form.cell_type} onChange={f("cell_type")} options={CELL_TYPES.map(t=>({value:t,label:t}))}/>
          <Sel label="Status" value={form.cell_status} onChange={f("cell_status")} options={CELL_STATUS.map(s=>({value:s,label:s}))}/>
        </div>
        {form.cell_status==="Multiplicada"&&(
          <Sel label="Célula de Origem" value={form.origin_cell_id} onChange={f("origin_cell_id")} options={[{value:"",label:"— Selecione —"},...cells.filter(c=>c.id!==editing).map(c=>({value:c.id,label:c.name}))]}/>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Sel label="Dia" value={form.day} onChange={f("day")} options={DAYS.map(d=>({value:d,label:d}))}/>
          <Inp label="Horário" type="time" value={form.time} onChange={f("time")}/>
        </div>
        <Sel label="Periodicidade" value={form.frequency} onChange={f("frequency")} options={FREQUENCIES.map(fr=>({value:fr,label:fr}))}/>
        <div style={{marginBottom:14}}><label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}><input type="checkbox" checked={form.auto_create_meetings} onChange={e=>f("auto_create_meetings")(e.target.checked)} style={{width:16,height:16,accentColor:C.primary}}/><span style={{fontSize:13,fontWeight:600,color:"#334155"}}>Criar encontros automaticamente</span></label></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Inp label="Data de Início" type="date" value={form.started_at} onChange={f("started_at")}/>
          <Inp label="Meta de Membros" type="number" value={form.growth_goal} onChange={f("growth_goal")} placeholder="Ex: 20"/>
        </div>
        <div style={{marginBottom:14,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:14,padding:14}}>
          <p style={{fontSize:12,fontWeight:700,color:C.success,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.04em"}}>🔔 Lembrete Automático</p>
          <Inp label="Enviar X horas antes" type="number" value={form.reminder_hours} onChange={f("reminder_hours")} placeholder="Ex: 24"/>
          <div style={{display:"flex",gap:8}}>
            {["SMS","WhatsApp","Email"].map(ch=>(<button key={ch} type="button" onClick={()=>toggleChannel(ch)} style={{flex:1,padding:"8px 4px",borderRadius:10,fontSize:12,fontWeight:700,border:`1.5px solid ${form.reminder_channels.includes(ch)?C.success:"#e2e8f0"}`,background:form.reminder_channels.includes(ch)?"#dcfce7":"#f8fafc",color:form.reminder_channels.includes(ch)?C.success:"#64748b",cursor:"pointer"}}>{ch==="SMS"?"📱":ch==="WhatsApp"?"💬":"📧"} {ch}</button>))}
          </div>
        </div>
        <Inp label="CEP" value={form.cep} onChange={v=>{f("cep")(v);searchCep(v)}} placeholder="00000-000"/>
        <Inp label="Rua/Avenida" value={form.street} onChange={f("street")}/>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
          <Inp label="Bairro" value={form.neighborhood} onChange={f("neighborhood")}/>
          <Inp label="Número" value={form.number} onChange={f("number")}/>
        </div>
        <Sel label="Supervisor" value={form.supervisor_id} onChange={f("supervisor_id")} options={mOpts}/>
        <div style={{borderTop:"1px solid #f1f5f9",margin:"14px 0",paddingTop:14}}>
          <p style={{fontSize:12,fontWeight:800,color:"#0f172a",marginBottom:14,textTransform:"uppercase",letterSpacing:"0.04em"}}>Funções na Célula</p>
          <FuncSection field="leaders_ids" label="Líderes" color={C.success}/>
          <FuncSection field="secretaries_ids" label="Secretários" color={C.gold}/>
          <FuncSection field="trainees_ids" label="Líderes em Treinamento" color={C.purple}/>
          <FuncSection field="hosts_ids" label="Anfitriões" color="#0891b2"/>
        </div>
        <Btn full onClick={save} style={{marginTop:8}}>{editing?"Salvar Alterações":"Criar Célula"}</Btn>
      </Modal>

      {memberSearch&&<MemberSearchModal open title={`Adicionar ${memberSearch.label}`} members={members.filter(m=>m.status==="Membro"&&!form[memberSearch.field].includes(m.id))} onSelect={m=>toggleFuncMember(memberSearch.field,m.id)} onClose={()=>setMemberSearch(null)}/>}
      {deleteId&&<Modal open title="Confirmar Exclusão" onClose={()=>setDeleteId(null)}>
        <p style={{color:"#64748b",marginBottom:16}}>Tem certeza? Esta ação não pode ser desfeita.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Btn variant="ghost" onClick={()=>setDeleteId(null)}>Cancelar</Btn><Btn variant="danger" onClick={del}>Excluir</Btn></div>
      </Modal>}
    </div>
  )
}

// ─── MEMBERS PANEL ────────────────────────────────────────────────────────────
function MembersPanel({session,showToast}){
  const{data:allMembers,loading}=useTable("members")
  const{data:cells}=useTable("cells")
  const isAdmin=session?.role==="admin"||session?.role==="supervisor"
  const canInactivate=session?.role==="admin"||session?.role==="supervisor"
  // Leader/secretary only see their cell's members
  const members=isAdmin?allMembers:allMembers.filter(m=>m.cell_id===session?.cell_id)
  const[modal,setModal]=useState(false)
  const[editing,setEditing]=useState(null)
  const[deleteId,setDeleteId]=useState(null)
  const[pwModal,setPwModal]=useState(null)
  const[newPw,setNewPw]=useState("")
  const[search,setSearch]=useState("")
  const[filterStatus,setFilterStatus]=useState("")
  const[filterCell,setFilterCell]=useState("")
  const[filterAge,setFilterAge]=useState("")
  const[cardModal,setCardModal]=useState(null)
  const[showFamilySearch,setShowFamilySearch]=useState(false)
  const[familyField,setFamilyField]=useState(null)
  const[showInviterSearch,setShowInviterSearch]=useState(false)
  const[showInactive,setShowInactive]=useState(false)
  const[inactivateModal,setInactivateModal]=useState(null)
  const[inactiveReason,setInactiveReason]=useState("")
  const[reactivateModal,setReactivateModal]=useState(null)
  const[requestInactModal,setRequestInactModal]=useState(null)
  const[requestInactReason,setRequestInactReason]=useState("")
  const[requestDeleteModal,setRequestDeleteModal]=useState(null)
  const[requestDeleteReason,setRequestDeleteReason]=useState("")

  async function submitInactRequest(){
    if(!requestInactReason.trim()){showToast("Informe o motivo","error");return}
    const m=members.find(x=>x.id===requestInactModal)
    await supabase.from("inactivation_requests").insert({member_id:m.id,member_name:m.name,cell_id:m.cell_id||null,reason:requestInactReason.trim(),requested_by:session.id,requested_by_name:session.name,status:"pending"})
    await addLog(session,"create",`Solicitação de inativação enviada: ${m.name}`)
    showToast("Solicitação enviada ao gestor!");setRequestInactModal(null);setRequestInactReason("")
  }

  async function submitDeleteRequest(){
    if(!requestDeleteReason.trim()){showToast("Informe o motivo","error");return}
    const m=members.find(x=>x.id===requestDeleteModal)
    await supabase.from("inactivation_requests").insert({member_id:m.id,member_name:m.name,cell_id:m.cell_id||null,reason:`[EXCLUIR] ${requestDeleteReason.trim()}`,requested_by:session.id,requested_by_name:session.name,status:"pending"})
    await addLog(session,"create",`Solicitação de exclusão enviada: ${m.name}`)
    showToast("Solicitação de exclusão enviada ao gestor!");setRequestDeleteModal(null);setRequestDeleteReason("")
  }

  const emptyForm={name:"",cpf:"",birth_date:"",age:"",gender:"Masculino",phone:"",email:"",neighborhood:"",cell_id:"",status:"Visitante",baptized:false,baptism_date:"",invited_by:"",father_name:"",mother_name:"",spouse_name:"",photo_url:"",church_member:false}
  const[form,setForm]=useState(emptyForm)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  // Como o cadastro sabe a data: completa, só dia+mês (calcula o ano pela idade), ou só a idade.
  // Muita criança não sabe o ano em que nasceu.
  const[birthMode,setBirthMode]=useState("full")
  const[bDay,setBDay]=useState("");const[bMonth,setBMonth]=useState("")

  function openEdit(m){
    setBirthMode(m.birth_date?"full":"age")
    setBDay(m.birth_date?String(parseDate(m.birth_date).getDate()):"")
    setBMonth(m.birth_date?String(parseDate(m.birth_date).getMonth()+1):"")
    setForm({name:m.name,cpf:m.cpf||"",birth_date:m.birth_date||"",age:m.age||"",gender:m.gender||"Masculino",phone:m.phone||"",email:m.email||"",neighborhood:m.neighborhood||"",cell_id:m.cell_id||"",status:m.status||"Visitante",baptized:m.baptized||false,baptism_date:m.baptism_date||"",invited_by:m.invited_by||"",father_name:m.father_name||"",mother_name:m.mother_name||"",spouse_name:m.spouse_name||"",photo_url:m.photo_url||"",church_member:m.church_member||false})
    setEditing(m.id);setModal(true)
  }

  async function confirmInactivate(){
    if(!inactiveReason.trim()){showToast("Justificativa obrigatória","error");return}
    const m=members.find(x=>x.id===inactivateModal)
    await supabase.from("members").update({status:"Inativo",inactive_reason:inactiveReason.trim(),inactivated_at:new Date().toISOString(),inactivated_by:session.name}).eq("id",inactivateModal)
    await supabase.from("users").update({active:false}).eq("member_id",inactivateModal)
    await addLog(session,"update",`Membro inativado: ${m?.name} — Motivo: ${inactiveReason.trim()}`)
    showToast("Membro inativado");setInactivateModal(null);setInactiveReason("")
  }

  async function confirmReactivate(){
    const m=members.find(x=>x.id===reactivateModal)
    await supabase.from("members").update({status:"Membro",inactive_reason:null,inactivated_at:null,inactivated_by:null}).eq("id",reactivateModal)
    await supabase.from("users").update({active:true}).eq("member_id",reactivateModal)
    await addLog(session,"update",`Membro reativado: ${m?.name}`)
    showToast("Membro reativado!");setReactivateModal(null)
  }

  async function save(){
    if(!form.name.trim()){showToast("Nome é obrigatório","error");return}
    if(form.status==="Membro"&&!form.cpf.replace(/\D/g,"")){showToast("CPF obrigatório para Membros","error");return}
    const cpfNorm=form.cpf.replace(/\D/g,"")
    // Modo "só dia e mês": monta a data de nascimento real a partir do ano deduzido da idade.
    let birthDate=birthMode==="age"?null:form.birth_date||null
    if(birthMode==="daymonth"){
      const y=birthYearFrom(bDay,bMonth,form.age)
      if(!y){showToast("Preencha dia, mês e idade","error");return}
      birthDate=`${y}-${String(bMonth).padStart(2,"0")}-${String(bDay).padStart(2,"0")}`
    }
    const idade=birthDate?calcAge(birthDate):(parseInt(form.age)||null)
    const payload={name:form.name.trim().toUpperCase(),cpf:cpfNorm||null,age:idade,birth_date:birthDate,gender:form.gender,phone:form.phone,email:form.email,neighborhood:form.neighborhood,cell_id:form.cell_id||null,status:form.status,role:"member",baptized:form.baptized,baptism_date:form.baptized&&form.baptism_date?form.baptism_date:null,invited_by:form.invited_by,father_name:form.father_name,mother_name:form.mother_name,spouse_name:form.spouse_name,photo_url:form.photo_url,church_member:form.church_member||false}
    // A conta de acesso nasce com QUALQUER contato: CPF, telefone ou e-mail.
    // Antes exigia CPF, e como visitante quase nunca informa CPF, a pessoa ficava
    // cadastrada mas sem senha nenhuma — a tela de login aceitava telefone, só que
    // não existia conta para ela entrar.
    const temContato=!!(cpfNorm||form.phone.replace(/\D/g,"")||form.email.trim())
    // devolve "criado" | "ja tinha" | mensagem de erro
    async function criarAcesso(memberId){
      const{data:ja}=await supabase.from("users").select("id").eq("member_id",memberId).maybeSingle()
      if(ja)return"ja tinha"
      const{error}=await supabase.from("users").insert({member_id:memberId,cpf:cpfNorm||null,password_hash:btoa64(SENHA_PADRAO),name:form.name.trim().toUpperCase(),role:"member",cell_id:form.cell_id||null,active:true})
      if(!error)return"criado"
      // a coluna cpf da tabela users ainda e obrigatoria no banco
      if(error.code==="23502")return"O banco ainda exige CPF para criar acesso. Cadastro salvo, mas sem login."
      return"Cadastro salvo, mas o acesso falhou: "+error.message
    }

    if(editing){
      const{error}=await supabase.from("members").update(payload).eq("id",editing)
      if(error){showToast("Erro: "+error.message,"error");return}
      if(form.spouse_name){const spouse=members.find(m=>m.name===form.spouse_name);if(spouse&&spouse.spouse_name!==form.name)await supabase.from("members").update({spouse_name:form.name}).eq("id",spouse.id)}
      // quem ganhou um contato agora também ganha acesso
      const r=temContato?await criarAcesso(editing):"ja tinha"
      await addLog(session,"update",`Membro atualizado: ${form.name}`)
      if(r==="criado")showToast(`Atualizado! Acesso criado — senha ${SENHA_PADRAO}`)
      else if(r==="ja tinha")showToast("Membro atualizado!")
      else showToast(r,"error")
    }else{
      const{data:newM,error}=await supabase.from("members").insert(payload).select().single()
      if(error){showToast("Erro: "+error.message,"error");return}
      if(form.spouse_name){const spouse=members.find(m=>m.name===form.spouse_name);if(spouse)await supabase.from("members").update({spouse_name:form.name}).eq("id",spouse.id)}
      if(newM&&temContato){
        const r=await criarAcesso(newM.id)
        if(r==="criado"||r==="ja tinha")showToast(`Cadastrado! Acesso liberado — senha ${SENHA_PADRAO}`)
        else showToast(r,"error")
      }else{showToast("Cadastrado! (sem telefone, e-mail ou CPF não há acesso ao sistema)")}
      await addLog(session,"create",`Cadastro criado: ${form.name}`)
    }
    setModal(false);setEditing(null);setForm(emptyForm);setBirthMode("full");setBDay("");setBMonth("")
  }

  async function del(){
    if(session?.role!=="admin"){showToast("Apenas o gestor pode excluir","error");return}
    await supabase.from("users").delete().eq("member_id",deleteId)
    await supabase.from("members").delete().eq("id",deleteId)
    await addLog(session,"delete","Cadastro removido")
    showToast("Removido");setDeleteId(null)
  }

  async function resetPw(){
    if(newPw.length<6){showToast("Senha muito curta","error");return}
    await supabase.from("users").update({password_hash:btoa64(newPw)}).eq("member_id",pwModal)
    showToast("Senha redefinida!");setPwModal(null);setNewPw("")
  }

  const filtered=members.filter(m=>{
    const isInativo=m.status==="Inativo"
    if(isInativo&&!showInactive)return false
    if(!isInativo&&showInactive&&filterStatus!=="Inativo")return false
    const matchSearch=m.name.toLowerCase().includes(search.toLowerCase())||(m.phone||"").includes(search)
    const matchStatus=!filterStatus||m.status===filterStatus
    const matchCell=!filterCell||(filterCell==="sem_celula"?!m.cell_id:m.cell_id===filterCell)
    const matchAge=!filterAge||(()=>{
      const a=ageOf(m);if(!a)return false
      if(filterAge==="crianca")return a<=10
      if(filterAge==="adolescente")return a>=11&&a<=15
      if(filterAge==="jovem")return a>=16&&a<=22
      if(filterAge==="adulto")return a>=23
      return true
    })()
    return matchSearch&&matchStatus&&matchCell&&matchAge
  })

  const cOpts=[{value:"",label:"— Sem célula —"},...cells.map(c=>({value:c.id,label:c.name}))]
  const totalMembers=members.filter(m=>m.status==="Membro").length
  const totalVisitors=members.filter(m=>m.status==="Visitante").length
  const totalInactive=members.filter(m=>m.status==="Inativo").length

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:"0 0 2px"}}>Pessoas</h2>
          <p style={{fontSize:12,color:"#94a3b8",margin:0}}>{totalMembers} membros • {totalVisitors} visitantes{totalInactive>0?` • ${totalInactive} inativos`:""}</p>
        </div>
        <div style={{display:"flex",gap:6}}>
          {totalInactive>0&&<button onClick={()=>{setShowInactive(p=>!p);setFilterStatus("")}} style={{background:showInactive?"#fee2e2":"#f1f5f9",border:`1.5px solid ${showInactive?C.danger:"#e2e8f0"}`,borderRadius:10,padding:"7px 12px",cursor:"pointer",color:showInactive?C.danger:"#64748b",fontSize:12,fontWeight:700}}>{showInactive?"← Ativos":"Ver Inativos"}</button>}
          {!showInactive&&<Btn icon="plus" size="sm" onClick={()=>{setForm(emptyForm);setBirthMode("full");setBDay("");setBMonth("");setEditing(null);setModal(true)}}>Novo</Btn>}
        </div>
      </div>

      <div style={{position:"relative",marginBottom:10}}>
        <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",pointerEvents:"none"}}><Icon name="search" size={15}/></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"10px 14px 10px 36px",fontSize:14,outline:"none",background:"#fff"}}/>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        {[["","Todos"],["Membro","Membros"],["Visitante","Visitantes"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilterStatus(v)} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,border:`1.5px solid ${filterStatus===v?C.primary:"#e2e8f0"}`,background:filterStatus===v?C.primary:"#fff",color:filterStatus===v?"#fff":"#64748b",cursor:"pointer"}}>
            {l}
          </button>
        ))}
        {isAdmin&&<select value={filterCell} onChange={e=>setFilterCell(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,outline:"none",background:"#fff",color:filterCell?"#1B4F8A":"#64748b",cursor:"pointer"}}>
          <option value="">Todas as células</option>
          {cells.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="sem_celula">Sem célula</option>
        </select>}
        <select value={filterAge} onChange={e=>setFilterAge(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,outline:"none",background:"#fff",color:filterAge?"#8b5cf6":"#64748b",cursor:"pointer"}}>
          <option value="">Todas as idades</option>
          <option value="crianca">🧒 Criança (até 10)</option>
          <option value="adolescente">🧑 Adolescente (11-15)</option>
          <option value="jovem">👦 Jovem (16-22)</option>
          <option value="adulto">👤 Adulto (23+)</option>
        </select>
      </div>

      {loading&&<Loader/>}
      {!loading&&filtered.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhum resultado</p></Card>}

      <div style={{background:"#fff",borderRadius:16,border:"1px solid #e8edf2",overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
        {filtered.map((m,i)=>{
          const cell=cells.find(c=>c.id===m.cell_id)
          const isMember=m.status==="Membro"
          const isInativo=m.status==="Inativo"
          return(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderTop:i>0?"1px solid #f1f5f9":"none",transition:"background 0.1s",cursor:"pointer",background:isInativo?"#fafafa":"transparent",opacity:isInativo?0.8:1}}
              onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background=isInativo?"#fafafa":"transparent"}>
              <Avatar name={m.name} photo={m.photo_url} size={38} color={isInativo?"#94a3b8":isMember?C.primary:C.gold}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:isInativo?"#94a3b8":"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{cell?.name||"Sem célula"}{ageOf(m)?` • ${ageOf(m)} anos`:""}</span>
                  {ageOf(m)&&!isInativo&&getAgeGroup(ageOf(m))&&<span style={{fontSize:10,fontWeight:700,color:getAgeGroup(ageOf(m)).color,background:getAgeGroup(ageOf(m)).color+"15",borderRadius:6,padding:"1px 6px"}}>{getAgeGroup(ageOf(m)).label}</span>}
                  {isInativo&&m.inactivated_at&&<span style={{fontSize:10,color:"#94a3b8"}}>Inativado em {fmtDate(m.inactivated_at?.split("T")[0])}</span>}
                </div>
                {isInativo&&m.inactive_reason&&<div style={{fontSize:11,color:"#ef4444",marginTop:2}}>Motivo: {m.inactive_reason}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {!isInativo&&m.phone?(
                  <a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:"#166534",textDecoration:"none"}}>
                    <Icon name="whatsapp" size={11}/>{fmtPhone(m.phone)}
                  </a>
                ):<span style={{fontSize:11,color:"#cbd5e1"}}>{isInativo?"":""}</span>}
                <Badge label={m.status} color={isInativo?"#94a3b8":isMember?C.primary:C.gold}/>
              </div>
              <div style={{display:"flex",gap:4,marginLeft:4}}>
                {!isInativo&&<button onClick={e=>{e.stopPropagation();setCardModal(m)}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:6,cursor:"pointer",color:"#64748b"}}><Icon name="id-card" size={13}/></button>}
                {!isInativo&&<button onClick={e=>{e.stopPropagation();openEdit(m)}} style={{background:C.primary+"15",border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.primary}}><Icon name="edit" size={13}/></button>}
                {!isInativo&&canInactivate&&<button onClick={e=>{e.stopPropagation();setInactivateModal(m.id);setInactiveReason("")}} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.danger,fontSize:11,fontWeight:700}}>Inativar</button>}
                {!isInativo&&!canInactivate&&(session?.role==="leader"||session?.role==="secretary")&&<button onClick={e=>{e.stopPropagation();setRequestInactModal(m.id);setRequestInactReason("")}} style={{background:"#fef3c7",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.warning,fontSize:11,fontWeight:700}}>Solicitar Inativação</button>}
                {!canInactivate&&(session?.role==="leader"||session?.role==="secretary")&&<button onClick={e=>{e.stopPropagation();setRequestDeleteModal(m.id);setRequestDeleteReason("")}} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.danger}}><Icon name="trash" size={13}/></button>}
                {isInativo&&canInactivate&&<button onClick={e=>{e.stopPropagation();setReactivateModal(m.id)}} style={{background:"#dcfce7",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.success,fontSize:11,fontWeight:700}}>Reativar</button>}
                {session?.role==="admin"&&<button onClick={e=>{e.stopPropagation();setDeleteId(m.id)}} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.danger}}><Icon name="trash" size={13}/></button>}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Cadastro":"Novo Cadastro"}>
        <Inp label="Nome Completo" value={form.name} onChange={v=>f("name")(v.toUpperCase())} required/>
        <Sel label="Status" value={form.status} onChange={f("status")} options={STATUS_LIST.map(s=>({value:s,label:s}))}/>
        <Inp label={form.status==="Membro"?"CPF (opcional — necessário para líderes/secretários)":"CPF (opcional)"} value={form.cpf} onChange={v=>f("cpf")(fmtCPF(v))} placeholder="000.000.000-00"/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase"}}>Nascimento / Idade</label>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {[["full","Sei a data completa"],["daymonth","Sei só o dia e o mês"],["age","Sei só a idade"]].map(([v,lbl])=>(
              <button key={v} type="button" onClick={()=>{setBirthMode(v);f("birth_date")("")}}
                style={{border:birthMode===v?`1.5px solid ${C.primary}`:"1.5px solid #e2e8f0",background:birthMode===v?C.primary+"12":"#fff",color:birthMode===v?C.primary:"#64748b",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>{lbl}</button>
            ))}
          </div>

          {birthMode==="full"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Data de Nascimento" type="date" value={form.birth_date} onChange={v=>{f("birth_date")(v);f("age")(calcAge(v)??"")}}/>
              <Inp label="Idade" value={form.birth_date?(calcAge(form.birth_date)??""):""} onChange={()=>{}} type="number" readOnly hint="calculada sozinha"/>
            </div>
          )}

          {birthMode==="daymonth"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"80px 1fr 90px",gap:10}}>
                <Inp label="Dia" type="number" value={bDay} onChange={setBDay} placeholder="15"/>
                <Sel label="Mês" value={bMonth} onChange={setBMonth} options={[{value:"",label:"Escolha..."},...MESES.map((m,i)=>({value:String(i+1),label:m}))]}/>
                <Inp label="Idade hoje" type="number" value={form.age} onChange={f("age")} placeholder="7"/>
              </div>
              {(()=>{
                const y=birthYearFrom(bDay,bMonth,form.age)
                if(!y)return<p style={{fontSize:12,color:"#94a3b8",margin:"0 0 2px"}}>Preencha o dia, o mês e a idade que a pessoa tem hoje — o sistema descobre o ano sozinho.</p>
                return<div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:10,padding:"8px 12px",fontSize:12.5,color:"#065f46",fontWeight:600}}>✓ Nasceu em <b>{String(bDay).padStart(2,"0")}/{String(bMonth).padStart(2,"0")}/{y}</b> — vai aparecer nos aniversariantes.</div>
              })()}
            </div>
          )}

          {birthMode==="age"&&(
            <div>
              <div style={{maxWidth:140}}><Inp label="Idade" type="number" value={form.age} onChange={f("age")} placeholder="7"/></div>
              <p style={{fontSize:11.5,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"8px 12px",margin:0}}>⚠️ Sem data de nascimento a pessoa não entra na lista de aniversariantes, e esta idade não se atualiza sozinha. Se descobrir o dia e o mês depois, é só editar aqui.</p>
            </div>
          )}
        </div>
        <Sel label="Sexo" value={form.gender} onChange={f("gender")} options={["Masculino","Feminino"].map(s=>({value:s,label:s}))}/>
        <Inp label="Telefone (WhatsApp)" value={form.phone} onChange={v=>f("phone")(fmtPhone(v))} placeholder="(00) 00000-0000"/>
        <Inp label="E-mail" type="email" value={form.email} onChange={f("email")}/>
        <Inp label="Bairro" value={form.neighborhood} onChange={v=>f("neighborhood")(v.toUpperCase())}/>
        <Sel label="Célula" value={form.cell_id} onChange={f("cell_id")} options={cOpts}/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>Convidado por</label>
          <div style={{display:"flex",gap:8}}>
            <input value={form.invited_by||""} onChange={e=>f("invited_by")(e.target.value.toUpperCase())} placeholder="Quem convidou esta pessoa?" style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none"}}/>
            <button type="button" onClick={()=>setShowInviterSearch(true)} style={{background:C.primary+"15",border:"none",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:C.primary,display:"flex",alignItems:"center"}}><Icon name="search" size={14}/></button>
          </div>
        </div>
        <Inp label="URL da Foto (link)" value={form.photo_url} onChange={f("photo_url")} placeholder="https://..."/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>Batismo</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <button type="button" onClick={()=>f("baptized")(true)} style={{flex:1,padding:"9px",borderRadius:10,fontSize:13,fontWeight:700,border:`1.5px solid ${form.baptized?C.success:"#e2e8f0"}`,background:form.baptized?"#dcfce7":"#f8fafc",color:form.baptized?C.success:"#64748b",cursor:"pointer"}}>✓ Batizado</button>
            <button type="button" onClick={()=>{f("baptized")(false);f("baptism_date")("")}} style={{flex:1,padding:"9px",borderRadius:10,fontSize:13,fontWeight:700,border:`1.5px solid ${!form.baptized?C.danger:"#e2e8f0"}`,background:!form.baptized?"#fee2e2":"#f8fafc",color:!form.baptized?C.danger:"#64748b",cursor:"pointer"}}>✗ Não batizado</button>
          </div>
          {form.baptized&&<Inp label="Data do Batismo (opcional)" type="date" value={form.baptism_date} onChange={f("baptism_date")}/>}
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>⛪ Membro da Promessa Lago dos Peixes?</label>
          <div style={{display:"flex",gap:8}}>
            <button type="button" onClick={()=>f("church_member")(true)} style={{flex:1,padding:"10px",borderRadius:10,fontSize:13,fontWeight:700,border:`1.5px solid ${form.church_member===true?C.primary:"#e2e8f0"}`,background:form.church_member===true?C.primary+"15":"#f8fafc",color:form.church_member===true?C.primary:"#64748b",cursor:"pointer"}}>⛪ Sim</button>
            <button type="button" onClick={()=>f("church_member")(false)} style={{flex:1,padding:"10px",borderRadius:10,fontSize:13,fontWeight:700,border:`1.5px solid ${form.church_member===false?"#dc2626":"#e2e8f0"}`,background:form.church_member===false?"#fee2e2":"#f8fafc",color:form.church_member===false?"#dc2626":"#64748b",cursor:"pointer"}}>✗ Não</button>
          </div>
        </div>
        <div style={{borderTop:"1px solid #f1f5f9",margin:"8px 0",paddingTop:12}}>
          <p style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Família</p>
          {[["father_name","Pai"],["mother_name","Mãe"],["spouse_name","Cônjuge"]].map(([field,label])=>(
            <div key={field} style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>
              <div style={{display:"flex",gap:8}}>
                <input value={form[field]||""} onChange={e=>f(field)(e.target.value.toUpperCase())} placeholder={`Nome do ${label.toLowerCase()}`} style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none"}}/>
                <button type="button" onClick={()=>{setFamilyField(field);setShowFamilySearch(true)}} style={{background:C.primary+"15",border:"none",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:C.primary,display:"flex",alignItems:"center"}}><Icon name="search" size={14}/></button>
              </div>
            </div>
          ))}
        </div>
        <Btn full onClick={save} style={{marginTop:8}}>{editing?"Salvar Alterações":"Cadastrar"}</Btn>
      </Modal>

      <MemberSearchModal open={showFamilySearch} title="Buscar Familiar" members={members} onSelect={m=>setForm(p=>({...p,[familyField]:m.name}))} onClose={()=>setShowFamilySearch(false)}/>
      <MemberSearchModal open={showInviterSearch} title="Quem convidou?" members={members} onSelect={m=>setForm(p=>({...p,invited_by:m.name}))} onClose={()=>setShowInviterSearch(false)}/>
      {cardModal&&<MemberCard member={cardModal} cells={cells} onClose={()=>setCardModal(null)}/>}
      {pwModal&&<Modal open title="Redefinir Senha" onClose={()=>setPwModal(null)}><Inp label="Nova Senha" type="password" value={newPw} onChange={setNewPw} placeholder="Mínimo 6 caracteres"/><Btn full onClick={resetPw}>Redefinir Senha</Btn></Modal>}
      {deleteId&&<Modal open title="Confirmar Exclusão" onClose={()=>setDeleteId(null)}><p style={{color:"#64748b",marginBottom:16}}>Remover permanentemente?</p><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Btn variant="ghost" onClick={()=>setDeleteId(null)}>Cancelar</Btn><Btn variant="danger" onClick={del}>Excluir</Btn></div></Modal>}

      <Modal open={!!inactivateModal} onClose={()=>setInactivateModal(null)} title="Inativar Membro">
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
          <p style={{color:"#991b1b",fontSize:13,fontWeight:700,margin:0}}>⚠️ O membro ficará inativo e não aparecerá nos relatórios, listas de presença ou aniversariantes.</p>
        </div>
        <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Informe o motivo da inativação:</p>
        <Textarea label="Justificativa" value={inactiveReason} onChange={setInactiveReason} placeholder="Ex: Mudança de cidade, afastamento por doença, saída da célula..." rows={3}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setInactivateModal(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={confirmInactivate}>Confirmar Inativação</Btn>
        </div>
      </Modal>

      <Modal open={!!reactivateModal} onClose={()=>setReactivateModal(null)} title="Reativar Membro">
        <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>Deseja reativar este membro? Ele voltará a aparecer nas listas normalmente com status <strong>Membro</strong>.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={()=>setReactivateModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={confirmReactivate}>Reativar</Btn>
        </div>
      </Modal>

      <Modal open={!!requestInactModal} onClose={()=>setRequestInactModal(null)} title="Solicitar Inativação">
        <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
          <p style={{color:"#92400e",fontSize:13,fontWeight:700,margin:0}}>⏳ Sua solicitação será enviada ao gestor/supervisor para aprovação.</p>
        </div>
        <Textarea label="Motivo da inativação" value={requestInactReason} onChange={setRequestInactReason} placeholder="Ex: Mudança de cidade, afastamento..." rows={3}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setRequestInactModal(null)}>Cancelar</Btn>
          <Btn variant="warning" onClick={submitInactRequest}>Enviar Solicitação</Btn>
        </div>
      </Modal>

      <Modal open={!!requestDeleteModal} onClose={()=>setRequestDeleteModal(null)} title="Solicitar Exclusão">
        <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
          <p style={{color:"#991b1b",fontSize:13,fontWeight:700,margin:0}}>🗑️ Use apenas para cadastros duplicados ou erros de cadastro. A exclusão será revisada pelo gestor antes de ser executada.</p>
        </div>
        <Textarea label="Motivo da exclusão" value={requestDeleteReason} onChange={setRequestDeleteReason} placeholder="Ex: Cadastro duplicado — já existe como João Silva" rows={3}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setRequestDeleteModal(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={submitDeleteRequest}>Enviar Solicitação</Btn>
        </div>
      </Modal>
    </div>
  )
}

function MemberCard({member,cells,onClose}){
  const cell=cells.find(c=>c.id===member.cell_id)
  const leaders=cell?cells.find(c=>c.id===member.cell_id):null
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:340,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"28px 24px",textAlign:"center"}}>
          <div style={{margin:"0 auto 14px"}}><Avatar name={member.name} photo={member.photo_url} size={80} color="rgba(255,255,255,0.2)"/></div>
          <div style={{color:"#fff",fontSize:17,fontWeight:900,marginBottom:4}}>{member.name}</div>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:12}}>{member.status}</div>
          {member.phone&&<a href={whatsappLink(member.phone)} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"6px 14px",marginTop:10,color:"#fff",textDecoration:"none",fontSize:13,fontWeight:600}}><Icon name="whatsapp" size={14}/>{member.phone}</a>}
        </div>
        <div style={{padding:"18px 20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{textAlign:"center",background:"#f8fafc",borderRadius:12,padding:12}}><div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Célula</div><div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{cell?.name||"—"}</div></div>
            <div style={{textAlign:"center",background:"#f8fafc",borderRadius:12,padding:12}}><div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Status</div><div style={{fontSize:13,fontWeight:800,color:C.success}}>{member.status}</div></div>
          </div>
          {member.baptized&&<div style={{background:"#fef3c7",borderRadius:10,padding:"8px 14px",marginBottom:12,textAlign:"center"}}><span style={{fontSize:13,fontWeight:700,color:"#92400e"}}>✓ Batizado{member.baptism_date?` em ${fmtDate(member.baptism_date)}`:""}</span></div>}
          <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",marginBottom:14}}>Promessa Lago dos Peixes</div>
          <Btn full variant="ghost" onClick={onClose}>Fechar</Btn>
        </div>
      </div>
    </div>
  )
}


// ─── BIRTHDAY MESSAGE MODAL ───────────────────────────────────────────────────
function BirthdayMessageModal({member,cellName,senderName,senderRole,onClose}){
  const[selected,setSelected]=useState(0)
  const firstName=member.name.split(" ")[0]

  const roleLabel={admin:"Gestor",supervisor:"Supervisor",leader:"Líder",secretary:"Secretário"}[senderRole]||"Líder"
  const celula=`Célula ${cellName}`
  const signature=`\n\n— ${senderName}\n${roleLabel} | ${celula}`

  const messages=[
    {verse:"Salmos 91:16",text:`Olá ${firstName}! 🎂🎉\n\nHoje é um dia muito especial — seu aniversário! Em nome da ${celula}, queremos te desejar um ano repleto das bênçãos de Deus.\n\n*"De longura de dias o saciarei e lhe mostrarei a minha salvação."* — Salmos 91:16\n\nQue Deus te abençoe grandemente!${signature}`},
    {verse:"Jeremias 29:11",text:`Feliz aniversário, ${firstName}! 🎉🙏\n\nNeste dia tão especial, toda a equipe da ${celula} celebra com você!\n\n*"Porque sou eu que conheço os planos que tenho para vocês, diz o Senhor, planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro."* — Jeremias 29:11\n\nQue seu novo ano de vida seja cheio do propósito de Deus!${signature}`},
    {verse:"Números 6:24-26",text:`${firstName}, feliz aniversário! 🎂❤️\n\nA ${celula} te parabeniza neste dia especial e ora por você!\n\n*"O Senhor te abençoe e te guarde; o Senhor faça resplandecer o Seu rosto sobre ti e tenha misericórdia de ti; o Senhor volte o Seu rosto para ti e te dê a paz."* — Números 6:24-26\n\nPaz e alegria no seu coração!${signature}`},
    {verse:"Filipenses 4:7",text:`Parabéns, ${firstName}! 🎉🌟\n\nQue alegria celebrar mais um ano da sua vida! A equipe da ${celula} está com você!\n\n*"E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos pensamentos em Cristo Jesus."* — Filipenses 4:7\n\nQue a paz de Deus transborde na sua vida!${signature}`},
    {verse:"Deuteronômio 33:25",text:`${firstName}, muitos parabéns! 🎂🔥\n\nDeus tem um plano lindo para a sua vida e estamos muito felizes de caminhar contigo na ${celula}!\n\n*"Como são os teus dias, assim será a tua força."* — Deuteronômio 33:25\n\nQue Deus renove suas forças a cada dia deste novo ano!${signature}`},
  ]

  const wppLink=member.phone?`https://wa.me/55${member.phone.replace(/\D/g,"")}?text=${encodeURIComponent(messages[selected].text)}`:null

  return(
    <Modal open title={`🎂 Mensagem para ${firstName}`} onClose={onClose}>
      <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>Escolha uma mensagem para enviar pelo WhatsApp:</p>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {messages.map((m,i)=>(
          <button key={i} onClick={()=>setSelected(i)} style={{textAlign:"left",background:selected===i?C.primary+"10":"#f8fafc",border:`1.5px solid ${selected===i?C.primary:"#e2e8f0"}`,borderRadius:12,padding:"10px 14px",cursor:"pointer",transition:"all 0.15s"}}>
            <div style={{fontSize:12,fontWeight:700,color:selected===i?C.primary:"#334155",marginBottom:3}}>Mensagem {i+1} — {m.verse}</div>
            <div style={{fontSize:11,color:"#64748b",lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{m.text.split("\n")[0]}</div>
          </button>
        ))}
      </div>
      <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 14px",marginBottom:14,border:"1px solid #e2e8f0",maxHeight:160,overflowY:"auto"}}>
        <p style={{fontSize:12,color:"#334155",margin:0,lineHeight:1.7,whiteSpace:"pre-line"}}>{messages[selected].text}</p>
      </div>
      {wppLink?(
        <a href={wppLink} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#25d366",borderRadius:12,padding:"12px",color:"#fff",textDecoration:"none",fontSize:14,fontWeight:800,boxShadow:"0 2px 8px rgba(37,211,102,0.3)"}}>
          <Icon name="whatsapp" size={18}/>Enviar pelo WhatsApp
        </a>
      ):(
        <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",textAlign:"center",fontSize:13,color:C.danger,fontWeight:600}}>Membro sem telefone cadastrado</div>
      )}
    </Modal>
  )
}

// ─── MEETINGS PANEL ───────────────────────────────────────────────────────────
function MeetingsPanel({session,showToast}){
  const{data:meetings,loading,reload}=useTable("meetings")
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:attendanceRaw}=useTable("attendance");const attendance=dedupeAtt(attendanceRaw)
  const{data:comments}=useTable("meeting_comments")
  // step: "form" | "attendance"
  const[step,setStep]=useState(null) // null = closed
  const[deleteMeetingId,setDeleteMeetingId]=useState(null)
  const[editing,setEditing]=useState(null)
  const[savedMeeting,setSavedMeeting]=useState(null)
  const[commentsModal,setCommentsModal]=useState(null)
  const[editAttModal,setEditAttModal]=useState(null)
  const[preacherSearchIdx,setPreacherSearchIdx]=useState(null)
  const[studySearch,setStudySearch]=useState(false)
  const[songSearch,setSongSearch]=useState(false)
  const[songQuery,setSongQuery]=useState("")
  const[selectedSongs,setSelectedSongs]=useState([])
  const[marks,setMarks]=useState({})
  const{data:studies}=useTable("studies")
  const{data:allSongs}=useTable("songs")
  const[saving,setSaving]=useState(false)
  const[cellFilter,setCellFilter]=useState("")
  // Travas síncronas contra clique repetido (ver comentário em saveAttendance)
  const savingFormRef=useRef(false)
  const savingAttRef=useRef(false)

  const emptyForm={cell_id:session?.cell_id||"",date:todayStr(),theme:"",theme_youth:"",preachers:["",""],songs:"",photos_link:"",is_general:false}
  const[form,setForm]=useState(emptyForm)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))

  const isAdmin=session?.role==="admin"||session?.role==="supervisor"
  const myCells=isAdmin?cells:cells.filter(c=>c.id===session?.cell_id)

  function openNew(){setForm({...emptyForm,cell_id:session?.cell_id||""});setEditing(null);setMarks({});setStep("form")}
  function openEdit(meeting){
    const songList=meeting.songs?meeting.songs.split(", ").filter(Boolean):[]
    let preachers=["",""]
    try{const arr=JSON.parse(meeting.preacher);if(Array.isArray(arr))preachers=arr.length<2?[...arr,...Array(2-arr.length).fill("")]:arr}
    catch{preachers=[meeting.preacher||"",meeting.preacher_kids||""]}
    setForm({cell_id:meeting.cell_id||"",date:meeting.date,theme:meeting.theme||"",theme_youth:meeting.theme_youth||"",preachers,songs:meeting.songs||"",photos_link:meeting.photos_link||"",is_general:meeting.is_general||false})
    setSelectedSongs(songList)
    setEditing(meeting.id);setMarks({});setStep("form")
  }

  async function saveForm(){
    if(savingFormRef.current)return
    if(!form.date){showToast("Data obrigatória","error");return}
    if(!form.is_general&&!form.cell_id){showToast("Selecione a célula","error");return}
    savingFormRef.current=true
    setSaving(true)
    try{
      const payload={cell_id:form.is_general?null:form.cell_id||null,date:form.date,theme:form.theme,theme_youth:form.theme_youth,songs:form.songs,photos_link:form.photos_link,is_general:form.is_general,created_by:session.id,preacher:JSON.stringify(form.preachers.filter(p=>p.trim()))}
      if(editing){
        const{error}=await supabase.from("meetings").update(payload).eq("id",editing)
        if(error){showToast("Erro ao salvar: "+error.message,"error");return}
        const cellName=cells.find(c=>c.id===form.cell_id)?.name||"Celulão"
        await addLog(session,"update",`Encontro editado: ${cellName} — ${form.date}`)
        showToast("Encontro atualizado!")
        setStep(null);setEditing(null)
      }else{
        // Se já existe encontro dessa célula nessa data, reaproveita em vez de criar outro.
        const jaExiste=meetings.find(m=>m.date===form.date&&(form.is_general?m.is_general:m.cell_id===form.cell_id))
        if(jaExiste){
          setSavedMeeting(jaExiste)
          showToast("Já havia um encontro nessa data — abrindo a chamada dele.")
          setStep("attendance")
          return
        }
        const{data:newMeeting,error}=await supabase.from("meetings").insert(payload).select().single()
        if(error||!newMeeting){showToast("Erro ao criar encontro: "+(error?.message||"tente novamente"),"error");return}
        if(form.cell_id&&!form.is_general){
          const cell=cells.find(c=>c.id===form.cell_id)
          if(cell?.auto_create_meetings)await supabase.from("cells").update({next_meeting_date:getNextMeetingDate(cell.day)}).eq("id",form.cell_id)
        }
        const cellName=cells.find(c=>c.id===form.cell_id)?.name||"Celulão"
        await addLog(session,"create",`Encontro registrado: ${cellName} — ${form.date}`)
        setSavedMeeting(newMeeting)
        showToast("Encontro criado! Agora faça a chamada 👇")
        setStep("attendance") // go straight to attendance
      }
      reload()
    }finally{savingFormRef.current=false;setSaving(false)}
  }

  // savingAttRef: trava síncrona contra clique repetido. O "saving" do useState só vale no
  // próximo render, e dois toques rápidos rodavam a gravação em paralelo — cada uma achava
  // a chamada vazia e inseria tudo de novo (foi assim que uma célula de 18 pessoas acabou
  // com 108 linhas de presença).
  async function saveAttendance(){
    if(savingAttRef.current)return
    const meeting=savedMeeting||meetings.find(m=>m.id===editing)
    if(!meeting){setStep(null);return}
    savingAttRef.current=true;setSaving(true)
    try{
      const cellId=meeting.cell_id
      const isGeneral=meeting.is_general
      const targetMembers=isGeneral?members.filter(m=>m.status==="Membro"||m.status==="Visitante"):members.filter(m=>m.cell_id===cellId&&(m.status==="Membro"||m.status==="Visitante"))
      let q=supabase.from("attendance").select("id,member_id,status").eq("date",meeting.date)
      q=cellId?q.eq("cell_id",cellId):q.is("cell_id",null)
      const{data:existing,error:selErr}=await q
      if(selErr){showToast("Erro ao ler a chamada: "+selErr.message,"error");return}
      // Se já houver linha repetida da mesma pessoa, fica a mais antiga e as sobras são apagadas.
      const existingMap={},extras=[]
      ;(existing||[]).forEach(e=>{
        if(existingMap[e.member_id])extras.push(e.id)
        else existingMap[e.member_id]={id:e.id,status:e.status}
      })
      const toInsert=[]
      const toUpdate=[]
      for(const m of targetMembers){
        const prev=existingMap[m.id]
        const st=marks[m.id]||(prev?.status)||"Ausente"
        if(prev){
          if(marks[m.id]&&marks[m.id]!==prev.status) toUpdate.push({id:prev.id,status:st})
        }else{
          toInsert.push({member_id:m.id,member_name:m.name,cell_id:cellId,date:meeting.date,theme:meeting.theme,preacher:meeting.preacher,songs:meeting.songs,photos_link:meeting.photos_link,status:st,recorded_by:session.id})
        }
      }
      const results=await Promise.all([
        toInsert.length>0?supabase.from("attendance").insert(toInsert):Promise.resolve({}),
        extras.length>0?supabase.from("attendance").delete().in("id",extras):Promise.resolve({}),
        ...toUpdate.map(u=>supabase.from("attendance").update({status:u.status}).eq("id",u.id))
      ])
      const err=results.find(r=>r&&r.error)?.error
      if(err){showToast("Erro ao salvar a chamada: "+err.message,"error");return}
      showToast("Presença salva! ✓")
      setStep(null);setMarks({});setSavedMeeting(null)
    }finally{savingAttRef.current=false;setSaving(false)}
  }

  function skipAttendance(){setStep(null);setMarks({});setSavedMeeting(null)}

  const myMeetings=isAdmin||session?.role==="supervisor"?meetings:meetings.filter(m=>m.cell_id===session?.cell_id||m.is_general)
  const filteredMeetings=myMeetings.filter(m=>!cellFilter||m.cell_id===cellFilter||m.is_general).sort((a,b)=>b.date.localeCompare(a.date))
  const currentMeeting=savedMeeting||(editing?meetings.find(m=>m.id===editing):null)
  const attMembers=currentMeeting?(currentMeeting.is_general?members.filter(m=>m.status==="Membro"||m.status==="Visitante"):members.filter(m=>m.cell_id===currentMeeting.cell_id&&(m.status==="Membro"||m.status==="Visitante"))):[]
  const presentCount=Object.values(marks).filter(v=>v==="Presente").length

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Encontros</h2>
        <Btn icon="plus" size="sm" onClick={openNew}>Novo Encontro</Btn>
      </div>

      {isAdmin&&<select value={cellFilter} onChange={e=>setCellFilter(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"10px 14px",fontSize:13,outline:"none",background:"#fff",marginBottom:14}}>
        <option value="">Todas as células</option>
        {myCells.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>}

      {loading&&<Loader/>}
      {!loading&&filteredMeetings.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhum encontro registrado</p></Card>}

      {filteredMeetings.map(meeting=>{
        const cell=cells.find(c=>c.id===meeting.cell_id)
        // Conta 1 por pessoa: se sobrar linha repetida no banco, o número não infla.
        const meetingAtt=dedupeAtt(attendance.filter(a=>a.date===meeting.date&&(meeting.is_general||a.cell_id===meeting.cell_id)))
        const present=meetingAtt.filter(a=>a.status==="Presente").length
        const total=meetingAtt.length
        const meetingComments=comments.filter(c=>c.attendance_date===meeting.date&&(meeting.is_general||c.cell_id===meeting.cell_id))
        return(
          <Card key={meeting.id} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{fmtDate(meeting.date)}</span>
                  {meeting.is_general&&<Badge label="🔥 Celulão" color={C.gold}/>}
                  {cell&&<Badge label={cell.name} color={C.primary}/>}
                </div>
                {meeting.theme&&<div style={{fontSize:12,color:"#64748b"}}>📖 {meeting.theme}</div>}
                {(()=>{let ps=[];try{const a=JSON.parse(meeting.preacher);if(Array.isArray(a))ps=a.filter(Boolean)}catch{if(meeting.preacher)ps=[meeting.preacher];if(meeting.preacher_kids)ps.push(meeting.preacher_kids)};return ps.map((p,i)=><div key={i} style={{fontSize:12,color:"#64748b"}}>🎤 {p}</div>)})()}
                {meeting.theme_youth&&<div style={{fontSize:12,color:"#64748b"}}>📖 Jovens: {meeting.theme_youth}</div>}
                {meeting.songs&&<div style={{fontSize:12,color:"#64748b"}}>🎵 {meeting.songs}</div>}
              </div>
              <div style={{display:"flex",gap:4,flexDirection:"column",alignItems:"flex-end"}}>
                {total>0?<div style={{display:"flex",gap:4}}><Badge label={`✓ ${present}`} color={C.success}/><Badge label={`✗ ${total-present}`} color={C.danger}/></div>:<Badge label="Sem presença" color="#94a3b8"/>}
                {meeting.photos_link&&<a href={meeting.photos_link} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.primary,fontWeight:600,display:"flex",alignItems:"center",gap:3,textDecoration:"none"}}><Icon name="link" size={11}/>Fotos</a>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>{setSavedMeeting(meeting);setMarks({});setStep("attendance")}} style={{background:total>0?"#fef3c7":C.primary+"15",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:total>0?C.warning:C.primary,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                <Icon name="check-circle" size={12}/>{total>0?"Editar Presença":"Registrar Presença"}
              </button>
              <button onClick={()=>setCommentsModal(meeting)} style={{background:"#f0fdf4",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:C.success,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                <Icon name="comment" size={12}/>Comentários{meetingComments.length>0&&` (${meetingComments.length})`}
              </button>
              <button onClick={()=>openEdit(meeting)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"#64748b",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                <Icon name="edit" size={12}/>Editar
              </button>
            </div>
          </Card>
        )
      })}

      {/* STEP 1 — FORM */}
      <Modal open={step==="form"} onClose={()=>setStep(null)} title={editing?"Editar Encontro":"Novo Encontro"}>
        <div style={{marginBottom:14}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:form.is_general?C.gold+"10":"#f8fafc",border:`1.5px solid ${form.is_general?C.gold:"#e2e8f0"}`,borderRadius:12,padding:12}}>
            <input type="checkbox" checked={form.is_general} onChange={e=>f("is_general")(e.target.checked)} style={{width:16,height:16,accentColor:C.gold}}/>
            <span style={{fontSize:13,fontWeight:700,color:form.is_general?C.gold:"#334155"}}>🔥 Celulão — Encontro Geral</span>
          </label>
        </div>
        {!form.is_general&&(myCells.length===1?
          <div style={{marginBottom:14,background:`${C.primary}08`,border:`1px solid ${C.primary}20`,borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:700,color:C.primary}}>
            🏠 {myCells[0].name}
          </div>
          :<Sel label="Célula" value={form.cell_id} onChange={f("cell_id")} options={[{value:"",label:"Selecione..."},...myCells.map(c=>({value:c.id,label:c.name}))]} required/>
        )}
        <Inp label="Data" type="date" value={form.date} onChange={f("date")} required/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>Tema da Palavra</label>
          <div style={{display:"flex",gap:8}}>
            <input value={form.theme} onChange={e=>f("theme")(e.target.value)} placeholder="Tema do encontro" style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none"}}/>
            <button type="button" onClick={()=>setStudySearch(true)} style={{background:C.gold+"15",border:"none",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:C.gold,display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:700,flexShrink:0}}><Icon name="star" size={14}/>Estudos</button>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase"}}>🎤 Quem conduziu a Palavra</label>
          {form.preachers.map((p,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
              <input value={p} onChange={e=>{const arr=[...form.preachers];arr[i]=e.target.value;f("preachers")(arr)}} placeholder={i===0?"Nome de quem conduziu":`Condutor ${i+1}`} style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none"}}/>
              <button type="button" onClick={()=>setPreacherSearchIdx(i)} style={{background:C.primary+"15",border:"none",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:C.primary,display:"flex",alignItems:"center"}}><Icon name="search" size={14}/></button>
              {form.preachers.length>1&&<button type="button" onClick={()=>f("preachers")(form.preachers.filter((_,j)=>j!==i))} style={{background:"#fee2e2",border:"none",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:"#ef4444",display:"flex",alignItems:"center"}}><Icon name="x" size={14}/></button>}
            </div>
          ))}
          <button type="button" onClick={()=>f("preachers")([...form.preachers,""])} style={{background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:700,color:"#64748b",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><Icon name="plus" size={13}/>Adicionar condutor</button>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>Músicas Cantadas</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={form.songs} onChange={e=>f("songs")(e.target.value)} placeholder="Digite manualmente ou use o botão..." style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none"}}/>
            <button type="button" onClick={()=>setSongSearch(true)} style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"10px 12px",cursor:"pointer",color:C.success,display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
              <Icon name="music" size={14}/>Repertório
            </button>
          </div>
          {selectedSongs.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {selectedSongs.map((s,i)=>(
                <div key={i} style={{background:C.success+"10",border:`1px solid ${C.success}30`,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:600,color:C.success,display:"flex",alignItems:"center",gap:6}}>
                  🎵 {s}
                  <button type="button" onClick={()=>{const ns=selectedSongs.filter((_,j)=>j!==i);setSelectedSongs(ns);f("songs")(ns.join(", "))}} style={{background:"none",border:"none",cursor:"pointer",color:C.success,display:"flex",padding:0}}><Icon name="x" size={12}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Inp label="Link das Fotos" value={form.photos_link} onChange={f("photos_link")} placeholder="https://..."/>
        <Btn full onClick={saveForm} disabled={saving} icon={editing?"check":"chevron-right"}>
          {saving?"Salvando...":(editing?"Salvar Alterações":"Salvar e Fazer Chamada →")}
        </Btn>
      </Modal>

      {/* STEP 2 — ATTENDANCE */}
      {step==="attendance"&&currentMeeting&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{padding:"18px 20px 14px",borderBottom:"1px solid #f1f5f9",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a"}}>Chamada — {fmtDate(currentMeeting.date)}</h3>
                <button onClick={skipAttendance} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:"#64748b",display:"flex"}}><Icon name="x" size={15}/></button>
              </div>
              {currentMeeting.theme&&<div style={{fontSize:12,color:"#64748b"}}>📖 {currentMeeting.theme}</div>}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
                <span style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>{attMembers.length} pessoas na lista</span>
                <span style={{fontSize:14,fontWeight:900,color:C.success}}>{presentCount} ✓ Presentes</span>
              </div>
            </div>
            <div style={{overflowY:"auto",padding:"12px 16px",flex:1}}>
              {attMembers.map(m=>{
                const existing=attendance.find(a=>a.date===currentMeeting.date&&a.member_id===m.id)
                const s=marks[m.id]||(existing?.status)||""
                return(
                  <div key={m.id} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <Avatar name={m.name} photo={m.photo_url} size={30} color={m.status==="Membro"?C.primary:C.gold}/>
                      <div style={{flex:1}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{m.name}</span>
                        {m.status==="Visitante"&&<span style={{fontSize:10,color:C.gold,fontWeight:600,marginLeft:6}}>visitante</span>}
                      </div>
                      {existing&&!marks[m.id]&&<Badge label={existing.status} color={existing.status==="Presente"?C.success:C.danger}/>}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      {["Presente","Ausente","Justificado"].map(v=>(
                        <button key={v} onClick={()=>setMarks(p=>({...p,[m.id]:v}))} style={{padding:"8px 4px",borderRadius:8,fontSize:12,fontWeight:700,border:`1.5px solid ${s===v?(v==="Presente"?C.success:v==="Ausente"?C.danger:C.warning):"#e2e8f0"}`,background:s===v?(v==="Presente"?"#dcfce7":v==="Ausente"?"#fee2e2":"#fef3c7"):"#f8fafc",color:s===v?(v==="Presente"?C.success:v==="Ausente"?C.danger:C.warning):"#94a3b8",cursor:"pointer"}}>
                          {v==="Presente"?"✓":v==="Ausente"?"✗":"?"} {v==="Justificado"?"Justif.":v}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{padding:"12px 16px 24px",borderTop:"1px solid #f1f5f9",flexShrink:0,display:"flex",gap:10}}>
              <Btn variant="ghost" onClick={skipAttendance} disabled={saving} style={{flex:1}}>Pular</Btn>
              <Btn onClick={saveAttendance} icon="check" disabled={saving} style={{flex:2}}>{saving?"Salvando...":`Salvar Chamada (${presentCount} presentes)`}</Btn>
            </div>
          </div>
        </div>
      )}

      {commentsModal&&<CommentsModal date={commentsModal.date} cellId={commentsModal.cell_id} session={session} showToast={showToast} onClose={()=>setCommentsModal(null)}/>}
      {editAttModal&&<EditAttendanceModal date={editAttModal.meeting.date} cellId={editAttModal.meeting.cell_id} items={editAttModal.items} showToast={showToast} onClose={()=>setEditAttModal(null)}/>}
      {deleteMeetingId&&<Modal open title="Excluir Encontro" onClose={()=>setDeleteMeetingId(null)}>
        <p style={{color:"#64748b",marginBottom:16}}>Excluir este encontro e toda a presença registrada?</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={()=>setDeleteMeetingId(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={async()=>{
            const m=meetings.find(x=>x.id===deleteMeetingId)||{}
            const cellName=cells.find(c=>c.id===m.cell_id)?.name||"Celulão"
            await supabase.from("attendance").delete().eq("date",m.date).eq("cell_id",m.cell_id)
            await supabase.from("meetings").delete().eq("id",deleteMeetingId)
            await addLog(session,"delete",`Encontro excluído: ${cellName} — ${m.date}`)
            showToast("Encontro excluído")
            setDeleteMeetingId(null)
          }}>Excluir</Btn>
        </div>
      </Modal>}
      <MemberSearchModal open={preacherSearchIdx!==null} title="🎤 Quem passou a Palavra?" members={members} onSelect={m=>{const arr=[...form.preachers];arr[preacherSearchIdx]=m.name;f("preachers")(arr)}} onClose={()=>setPreacherSearchIdx(null)}/>
      <Modal open={songSearch} onClose={()=>setSongSearch(false)} title="Selecionar Músicas 🎵">
        <p style={{fontSize:12,color:"#64748b",marginBottom:10}}>Selecione quantas músicas quiser. Clique novamente para remover.</p>
        <div style={{position:"relative",marginBottom:12}}>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",pointerEvents:"none"}}><Icon name="search" size={15}/></div>
          <input value={songQuery} onChange={e=>setSongQuery(e.target.value)} placeholder="Buscar música ou artista..." autoFocus style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px 10px 36px",fontSize:14,outline:"none"}}/>
        </div>
        {allSongs.filter(s=>(s.status||"approved")==="approved").length===0&&<p style={{color:"#94a3b8",textAlign:"center",fontSize:13}}>Nenhuma música no repertório ainda.</p>}
        {allSongs.filter(s=>(s.status||"approved")==="approved"&&(s.title.toLowerCase().includes(songQuery.toLowerCase())||(s.artist||"").toLowerCase().includes(songQuery.toLowerCase()))).map(s=>{
          const selected=selectedSongs.includes(s.title)
          return(
            <button key={s.id} onClick={()=>{
              const ns=selected?selectedSongs.filter(t=>t!==s.title):[...selectedSongs,s.title]
              setSelectedSongs(ns)
              f("songs")(ns.join(", "))
            }} style={{width:"100%",textAlign:"left",background:selected?C.success+"10":"#f8fafc",border:`1.5px solid ${selected?C.success:"#e8edf2"}`,borderRadius:12,padding:"10px 14px",cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",gap:10,transition:"all 0.1s"}}>
              <div style={{width:28,height:28,borderRadius:8,background:selected?C.success:C.primary+"15",display:"flex",alignItems:"center",justifyContent:"center",color:selected?"#fff":C.primary,flexShrink:0,fontSize:14}}>
                {selected?"✓":"♪"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                {s.artist&&<div style={{fontSize:11,color:"#94a3b8"}}>{s.artist}</div>}
              </div>
              {s.link&&<a href={s.link} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:C.primary,display:"flex"}}><Icon name="link" size={14}/></a>}
            </button>
          )
        })}
        <Btn full onClick={()=>setSongSearch(false)} style={{marginTop:8}}>Confirmar Seleção ({selectedSongs.length})</Btn>
      </Modal>
      <Modal open={studySearch} onClose={()=>setStudySearch(false)} title="Selecionar Estudo">
        {studies.filter(s=>!s.cell_id||s.cell_id===form.cell_id||form.is_general).length===0&&<p style={{color:"#94a3b8",textAlign:"center",fontSize:13}}>Nenhum estudo cadastrado. Cadastre em Estudos primeiro.</p>}
        {studies.filter(s=>!s.cell_id||s.cell_id===form.cell_id||form.is_general).sort((a,b)=>{const aA=isCurrentWeek(a.week_start,a.week_end)?1:0;const bA=isCurrentWeek(b.week_start,b.week_end)?1:0;return bA-aA}).map(s=>{
          const current=isCurrentWeek(s.week_start,s.week_end)
          return(
            <button key={s.id} onClick={()=>{f("theme")(s.title);setStudySearch(false)}} style={{width:"100%",textAlign:"left",background:current?C.gold+"08":"#f8fafc",border:`1.5px solid ${current?C.gold:"#e8edf2"}`,borderRadius:12,padding:"12px 14px",cursor:"pointer",marginBottom:8,transition:"all 0.1s"}}
              onMouseOver={e=>e.currentTarget.style.background=current?C.gold+"15":"#eff6ff"} onMouseOut={e=>e.currentTarget.style.background=current?C.gold+"08":"#f8fafc"}>
              {current&&<div style={{fontSize:10,fontWeight:800,color:C.gold,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>✦ Estudo desta semana</div>}
              <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:3}}>{s.title}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {s.week_start&&s.week_end&&<span style={{fontSize:11,color:"#94a3b8"}}>{fmtWeek(s.week_start,s.week_end)}</span>}
                {s.link&&<span style={{fontSize:11,color:C.primary,fontWeight:600}}>🔗 Material disponível</span>}
                {s.link_kids&&<span style={{fontSize:11,color:C.gold,fontWeight:600}}>👧 Kids disponível</span>}
                {s.link_youth&&<span style={{fontSize:11,color:C.purple,fontWeight:600}}>🧑 Jovens disponível</span>}
              </div>
            </button>
          )
        })}
      </Modal>
    </div>
  )
}

function EditAttendanceModal({date,cellId,items,showToast,onClose}){
  const[marks,setMarks]=useState(()=>{const m={};items.forEach(i=>{m[i.member_id]={status:i.status,id:i.id,name:i.member_name}});return m})
  const[saving,setSaving]=useState(false)
  async function save(){
    setSaving(true)
    for(const[,data] of Object.entries(marks)){
      await supabase.from("attendance").update({status:data.status}).eq("id",data.id)
    }
    showToast("Presença atualizada!");setSaving(false);onClose()
  }
  return(
    <Modal open title={`Editar Presença • ${fmtDate(date)}`} onClose={onClose}>
      {Object.entries(marks).map(([memberId,data])=>(
        <div key={memberId} style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:6}}>{data.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {["Presente","Ausente","Justificado"].map(v=>(
              <button key={v} onClick={()=>setMarks(p=>({...p,[memberId]:{...p[memberId],status:v}}))} style={{padding:"7px 4px",borderRadius:8,fontSize:12,fontWeight:700,border:`1.5px solid ${data.status===v?(v==="Presente"?C.success:v==="Ausente"?C.danger:C.warning):"#e2e8f0"}`,background:data.status===v?(v==="Presente"?"#dcfce7":v==="Ausente"?"#fee2e2":"#fef3c7"):"#f8fafc",color:data.status===v?(v==="Presente"?C.success:v==="Ausente"?C.danger:C.warning):"#64748b",cursor:"pointer"}}>
                {v==="Presente"?"✓":v==="Ausente"?"✗":"?"} {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Btn full onClick={save} disabled={saving} icon="check" style={{marginTop:8}}>{saving?"Salvando...":"Salvar"}</Btn>
    </Modal>
  )
}

function CommentsModal({date,cellId,session,showToast,onClose}){
  const{data:allComments,reload}=useTable("meeting_comments",{col:"attendance_date",val:date})
  const cellComments=allComments.filter(c=>!cellId||c.cell_id===cellId)
  const[newComment,setNewComment]=useState("")
  const[reaction,setReaction]=useState("")
  async function addComment(){
    if(!newComment.trim()){showToast("Escreva um comentário","error");return}
    await supabase.from("meeting_comments").insert({attendance_date:date,cell_id:cellId||null,member_id:session.member_id||null,member_name:session.name,comment:newComment.trim(),reaction})
    setNewComment("");setReaction("");reload();showToast("Comentário adicionado!")
  }
  return(
    <Modal open title={`Comentários • ${fmtDate(date)}`} onClose={onClose}>
      <Textarea value={newComment} onChange={setNewComment} placeholder="Como foi o encontro? Compartilhe..." rows={3}/>
      <div style={{marginBottom:14}}>
        <p style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>Reação</p>
        <div style={{display:"flex",gap:8}}>{REACTIONS.map(r=>(<button key={r} onClick={()=>setReaction(r===reaction?"":r)} style={{fontSize:22,background:reaction===r?C.primary+"10":"#f8fafc",border:`1.5px solid ${reaction===r?C.primary:"#e2e8f0"}`,borderRadius:12,padding:"7px 10px",cursor:"pointer"}}>{r}</button>))}</div>
      </div>
      <Btn full onClick={addComment} icon="send" style={{marginBottom:18}}>Comentar</Btn>
      <div style={{borderTop:"1px solid #f1f5f9",paddingTop:14}}>
        <p style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:12}}>{cellComments.length} comentário(s)</p>
        {cellComments.length===0&&<p style={{color:"#94a3b8",fontSize:13,textAlign:"center"}}>Nenhum comentário ainda 😊</p>}
        {cellComments.map(c=>(
          <div key={c.id} style={{background:"#f8fafc",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid #f1f5f9"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{c.member_name}</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>{c.reaction&&<span style={{fontSize:18}}>{c.reaction}</span>}<span style={{fontSize:11,color:"#94a3b8"}}>{new Date(c.created_at).toLocaleString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
            </div>
            <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.55}}>{c.comment}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ─── PRAYER PANEL ─────────────────────────────────────────────────────────────
function PrayerPanel({session,showToast}){
  const{data:prayers,loading}=useTable("prayer_requests")
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const[modal,setModal]=useState(false)
  const[form,setForm]=useState({request:"",is_private:false,cell_id:""})

  const canSeeAll=session?.role==="admin"||session?.role==="supervisor"
  const visiblePrayers=prayers.filter(p=>{
    if(canSeeAll)return true
    if(p.is_private)return p.member_id===session.member_id
    return p.cell_id===session.cell_id
  })

  async function createPrayer(){
    if(!form.request.trim()){showToast("Descreva o pedido","error");return}
    await supabase.from("prayer_requests").insert({request:form.request,is_private:form.is_private,cell_id:form.cell_id||session.cell_id||null,member_id:session.member_id||null,member_name:session.name,status:"pending"})
    showToast("Pedido registrado! 🙏")
    setModal(false);setForm({request:"",is_private:false,cell_id:""})
  }

  async function resolve(id){
    await supabase.from("prayer_requests").update({status:"prayed",resolved_by:session.id,resolved_at:new Date().toISOString()}).eq("id",id)
    showToast("Marcado como orado! 🙏")
  }

  async function deletePrayer(id){
    await supabase.from("prayer_requests").delete().eq("id",id)
    showToast("Pedido removido")
  }

  const canDelete=session?.role==="admin"||session?.role==="supervisor"||session?.role==="leader"

  const statusColor={pending:C.gold,prayed:C.success}
  const statusLabel={pending:"Aguardando oração",prayed:"Orado ✓"}

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Pedidos de Oração 🙏</h2>
        <Btn icon="plus" size="sm" onClick={()=>setModal(true)}>Novo Pedido</Btn>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <div style={{background:`linear-gradient(135deg,${C.primary},#1a5fa8)`,borderRadius:12,padding:"12px 16px",flex:1,textAlign:"center",boxShadow:"0 2px 8px rgba(27,79,138,0.2)"}}>
          <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{visiblePrayers.filter(p=>p.status==="pending").length}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Pendentes</div>
        </div>
        <div style={{background:`linear-gradient(135deg,${C.success},#047857)`,borderRadius:12,padding:"12px 16px",flex:1,textAlign:"center",boxShadow:"0 2px 8px rgba(5,150,105,0.2)"}}>
          <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{visiblePrayers.filter(p=>p.status==="prayed").length}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Orados</div>
        </div>
      </div>

      {loading&&<Loader/>}
      {!loading&&visiblePrayers.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>🙏</div>
          <p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>Nenhum pedido de oração</p>
          <p style={{color:"#cbd5e1",fontSize:12}}>Seja o primeiro a compartilhar um pedido</p>
        </div>
      )}

      {visiblePrayers.map(p=>{
        const cell=cells.find(c=>c.id===p.cell_id)
        const isPending=p.status==="pending"
        return(
          <Card key={p.id} style={{marginBottom:10,borderLeft:`3px solid ${statusColor[p.status]||C.gold}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.purple+"15",display:"flex",alignItems:"center",justifyContent:"center",color:C.purple,flexShrink:0}}><Icon name="pray" size={16}/></div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{p.member_name}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{cell?.name||"Geral"} • {fmtDate(p.created_at?.split("T")[0])}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge label={statusLabel[p.status]||p.status} color={statusColor[p.status]||C.gold}/>
                {p.is_private&&<Badge label="🔒 Privado" color="#64748b"/>}
              </div>
            </div>
            <p style={{fontSize:13,color:"#334155",margin:"0 0 10px",lineHeight:1.6,background:"#f8fafc",borderRadius:10,padding:"10px 12px"}}>{p.request}</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {isPending&&(session?.role==="admin"||session?.role==="leader"||session?.role==="secretary"||session?.role==="supervisor")&&(
                <button onClick={()=>resolve(p.id)} style={{background:C.success+"15",border:`1px solid ${C.success}30`,borderRadius:8,padding:"6px 14px",cursor:"pointer",color:C.success,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  <Icon name="check" size={13}/>Marcar como Orado
                </button>
              )}
              {canDelete&&(
                <button onClick={()=>deletePrayer(p.id)} style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.danger,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
                  <Icon name="trash" size={12}/>Excluir
                </button>
              )}
            </div>
          </Card>
        )
      })}

      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Pedido de Oração">
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:40}}>🙏</div>
          <p style={{fontSize:13,color:"#64748b",margin:0}}>Compartilhe seu pedido com sua célula ou apenas com os líderes</p>
        </div>
        <Textarea label="Seu Pedido" value={form.request} onChange={v=>setForm(p=>({...p,request:v}))} placeholder="Descreva seu pedido de oração..." rows={4}/>
        <div style={{marginBottom:16}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:form.is_private?"#f8fafc":"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:12}}>
            <input type="checkbox" checked={form.is_private} onChange={e=>setForm(p=>({...p,is_private:e.target.checked}))} style={{width:16,height:16,accentColor:C.primary}}/>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#334155"}}>🔒 Pedido Privado</div>
              <div style={{fontSize:11,color:"#94a3b8"}}>Somente líderes e gestor poderão ver</div>
            </div>
          </label>
        </div>
        <Btn full onClick={createPrayer} variant="gold">Enviar Pedido 🙏</Btn>
      </Modal>
    </div>
  )
}

// ─── EVENTS PANEL ─────────────────────────────────────────────────────────────
function EventsPanel({session,showToast}){
  const{data:events,loading}=useTable("events")
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:eventAtt}=useTable("event_attendance")
  const[modal,setModal]=useState(false)
  const[editing,setEditing]=useState(null)
  const[attModal,setAttModal]=useState(null)
  const[marks,setMarks]=useState({})
  const emptyForm={title:"",description:"",date:"",time:"",location:"",cell_id:"",type:"Evento",photos_link:""}
  const[form,setForm]=useState(emptyForm)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const myCells=session?.role==="admin"||session?.role==="supervisor"?cells:cells.filter(c=>c.id===session?.cell_id)

  async function save(){
    if(!form.title||!form.date){showToast("Título e data obrigatórios","error");return}
    const payload={...form,cell_id:form.cell_id||null,created_by:session.id}
    if(editing){await supabase.from("events").update(payload).eq("id",editing);showToast("Evento atualizado!")}
    else{await supabase.from("events").insert(payload);showToast("Evento criado!")}
    setModal(false);setEditing(null);setForm(emptyForm)
  }

  async function saveAtt(eventId){
    const records=Object.entries(marks).map(([mid,status])=>({event_id:eventId,member_id:mid,member_name:members.find(m=>m.id===mid)?.name||"",status}))
    if(records.length>0)await supabase.from("event_attendance").insert(records)
    showToast("Presença salva!");setAttModal(null);setMarks({})
  }

  const typeColors={Evento:C.primary,Culto:C.gold,Retiro:C.success,Confraternização:"#e11d8c",Batismo:"#0891b2",Outro:"#64748b"}

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Eventos</h2>
        <Btn icon="plus" size="sm" onClick={()=>{setForm(emptyForm);setEditing(null);setModal(true)}}>Novo</Btn>
      </div>
      {loading&&<Loader/>}
      {!loading&&events.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhum evento</p></Card>}
      {events.map(ev=>{
        const cell=cells.find(c=>c.id===ev.cell_id)
        const attCount=eventAtt.filter(a=>a.event_id===ev.id&&a.status==="Presente").length
        const tColor=typeColors[ev.type]||C.primary
        return(
          <Card key={ev.id} style={{marginBottom:10,borderLeft:`3px solid ${tColor}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>{ev.title}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{fmtDate(ev.date)}{ev.time&&` às ${ev.time}`}</div>
                {ev.location&&<div style={{fontSize:12,color:"#64748b"}}>📍 {ev.location}</div>}
                {cell&&<div style={{fontSize:12,color:"#64748b"}}>🏠 {cell.name}</div>}
              </div>
              <div style={{display:"flex",gap:4,flexDirection:"column",alignItems:"flex-end"}}>
                <Badge label={ev.type} color={tColor}/>
                {attCount>0&&<Badge label={`✓ ${attCount}`} color={C.success}/>}
              </div>
            </div>
            {ev.description&&<p style={{fontSize:12,color:"#64748b",margin:"0 0 8px",lineHeight:1.5}}>{ev.description}</p>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>{setAttModal(ev);setMarks({})}} style={{background:C.primary+"15",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:C.primary,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Icon name="check-circle" size={12}/>Presença</button>
              {ev.photos_link&&<a href={ev.photos_link} target="_blank" rel="noopener noreferrer" style={{background:"#f0fdf4",border:"none",borderRadius:8,padding:"5px 10px",color:C.success,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}><Icon name="link" size={12}/>Fotos</a>}
              <button onClick={()=>{setForm({title:ev.title,description:ev.description||"",date:ev.date,time:ev.time||"",location:ev.location||"",cell_id:ev.cell_id||"",type:ev.type,photos_link:ev.photos_link||""});setEditing(ev.id);setModal(true)}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"#64748b",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Icon name="edit" size={12}/>Editar</button>
            </div>
          </Card>
        )
      })}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Evento":"Novo Evento"}>
        <Inp label="Título" value={form.title} onChange={f("title")} required placeholder="Nome do evento"/>
        <Sel label="Tipo" value={form.type} onChange={f("type")} options={["Evento","Culto","Retiro","Confraternização","Batismo","Outro"].map(t=>({value:t,label:t}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Inp label="Data" type="date" value={form.date} onChange={f("date")} required/><Inp label="Horário" type="time" value={form.time} onChange={f("time")}/></div>
        <Inp label="Local" value={form.location} onChange={f("location")} placeholder="Endereço ou nome"/>
        <Sel label="Célula (opcional)" value={form.cell_id} onChange={f("cell_id")} options={[{value:"",label:"— Geral —"},...myCells.map(c=>({value:c.id,label:c.name}))]}/>
        <Textarea label="Descrição" value={form.description} onChange={f("description")} placeholder="Detalhes..."/>
        <Inp label="Link das Fotos" value={form.photos_link} onChange={f("photos_link")} placeholder="https://..."/>
        <Btn full onClick={save}>{editing?"Salvar Alterações":"Criar Evento"}</Btn>
      </Modal>
      {attModal&&(
        <Modal open title={`Presença — ${attModal.title}`} onClose={()=>{setAttModal(null);setMarks({})}}>
          {(attModal.cell_id?members.filter(m=>m.cell_id===attModal.cell_id&&(m.status==="Membro"||m.status==="Visitante")):members.filter(m=>m.status==="Membro")).map(m=>{
            const s=marks[m.id]
            return(
              <div key={m.id} style={{marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:6}}>{m.name}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {["Presente","Ausente"].map(v=>(<button key={v} onClick={()=>setMarks(p=>({...p,[m.id]:v}))} style={{padding:"7px",borderRadius:8,fontSize:12,fontWeight:700,border:`1.5px solid ${s===v?(v==="Presente"?C.success:C.danger):"#e2e8f0"}`,background:s===v?(v==="Presente"?"#dcfce7":"#fee2e2"):"#f8fafc",color:s===v?(v==="Presente"?C.success:C.danger):"#64748b",cursor:"pointer"}}>{v==="Presente"?"✓ Presente":"✗ Ausente"}</button>))}
                </div>
              </div>
            )
          })}
          <Btn full onClick={()=>saveAtt(attModal.id)} style={{marginTop:12}}>Salvar Presença</Btn>
        </Modal>
      )}
    </div>
  )
}



// ─── SONGS PANEL ──────────────────────────────────────────────────────────────
const SONG_CATS=['Adoração','Louvor','Comunhão','Ceia','Ao Ar Livre','Casamento','Aniversário','Missões','Infantil','Outro']
const SONG_TONS=['','A','A#/Bb','B','C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab']
const SONG_EMPTY={title:"",artist:"",tom:"",tomIg:"",cf:"",yt:"",cats:[],lyrics:"",obs:""}

function SongsPanel({session,showToast}){
  const{data:songs,loading}=useTable("songs")
  const[modal,setModal]=useState(false)
  const[editing,setEditing]=useState(null)
  const[deleteId,setDeleteId]=useState(null)
  const[aberta,setAberta]=useState(null)
  const[search,setSearch]=useState("")
  const[filterTab,setFilterTab]=useState("approved")
  const[form,setForm]=useState(SONG_EMPTY)
  const[sugestoes,setSugestoes]=useState([])
  const[buscando,setBuscando]=useState(false)
  const timerRef=useRef(null)

  const isAdmin=session?.role==="admin"||session?.role==="supervisor"
  const isLeader=session?.role==="leader"
  const canEdit=isAdmin||isLeader
  const canApprove=session?.role==="leader"||session?.role==="admin"||session?.role==="supervisor"

  const approved=songs.filter(s=>(s.status||"approved")==="approved")
  const pending=songs.filter(s=>s.status==="pending")

  const filtered=(filterTab==="approved"?approved:pending).filter(s=>
    s.title.toLowerCase().includes(search.toLowerCase())||
    (s.artist||"").toLowerCase().includes(search.toLowerCase())
  )

  function buscarItunes(nome){
    clearTimeout(timerRef.current)
    setSugestoes([])
    if(nome.length<3)return
    timerRef.current=setTimeout(async()=>{
      setBuscando(true)
      try{
        const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(nome)}&entity=song&limit=10&country=br`)
        const d=await r.json()
        setSugestoes((d.results||[]).slice(0,8))
      }catch(e){console.error(e)}
      setBuscando(false)
    },600)
  }

  async function buscarTudo(nome,artista){
    if(!nome)return
    setBuscando(true)
    try{
      const params=new URLSearchParams({nome,artista:artista||""})
      const r=await fetch(`/api/buscar-musica?${params}`)
      const d=await r.json()
      const updates={}
      if(d.lyrics)updates.lyrics=d.lyrics
      if(d.yt)updates.yt=d.yt
      if(d.cf)updates.cf=d.cf
      if(Object.keys(updates).length){
        setForm(f=>({...f,...updates}))
        const msgs=[]
        if(d.lyrics)msgs.push("letra")
        if(d.yt)msgs.push("YouTube")
        if(d.cf)msgs.push("cifra")
        showToast(`Carregado automaticamente: ${msgs.join(" + ")}!`)
      }else{
        showToast("Letra não encontrada. Cole manualmente.","error")
      }
    }catch{showToast("Erro ao buscar.","error")}
    setBuscando(false)
  }

  function selSugestao(x){
    const nome=x.trackName||""
    const artista=x.artistName||""
    setForm(f=>({...f,title:nome,artist:artista}))
    setSugestoes([])
    buscarTudo(nome,artista)
  }

  function toggleCat(cat){
    setForm(f=>({...f,cats:f.cats.includes(cat)?f.cats.filter(c=>c!==cat):[...f.cats,cat]}))
  }

  function openEdit(s){
    setForm({
      title:s.title||"",
      artist:s.artist||"",
      tom:s.tom||"",
      tomIg:s.tom_ig||"",
      cf:s.cifra||s.cf||"",
      yt:s.yt||"",
      cats:Array.isArray(s.cat)?s.cat:(s.cat?JSON.parse(s.cat||"[]"):[]),
      lyrics:s.lyrics||"",
      obs:s.obs||""
    })
    setEditing(s.id);setSugestoes([]);setModal(true)
  }

  function openNew(){
    setForm(SONG_EMPTY);setEditing(null);setSugestoes([]);setModal(true)
  }

  async function save(){
    if(!form.title.trim()){showToast("Nome da música obrigatório","error");return}
    const row={
      title:form.title.trim(),
      artist:form.artist.trim(),
      tom:form.tom,
      tom_ig:form.tomIg,
      cifra:form.cf.trim(),
      yt:form.yt.trim(),
      cat:JSON.stringify(form.cats),
      lyrics:form.lyrics.trim(),
      obs:form.obs.trim()
    }
    if(editing){
      await supabase.from("songs").update(row).eq("id",editing)
      showToast("Música atualizada! 🎵")
    }else{
      const exists=approved.find(s=>s.title.trim().toLowerCase()===form.title.trim().toLowerCase())
      if(exists){showToast(`"${exists.title}" já está cadastrada!`,"error");return}
      await supabase.from("songs").insert({...row,status:"approved",created_by:session.id,created_by_name:session.name})
      showToast("Música cadastrada! 🎵")
    }
    setModal(false);setEditing(null);setForm(SONG_EMPTY);setSugestoes([])
  }

  async function approve(id){
    await supabase.from("songs").update({status:"approved"}).eq("id",id)
    showToast("Música aprovada e adicionada ao repertório! ✓")
  }

  async function reject(id){
    await supabase.from("songs").delete().eq("id",id)
    showToast("Sugestão rejeitada")
  }

  async function del(){
    await supabase.from("songs").delete().eq("id",deleteId)
    showToast("Música removida");setDeleteId(null)
  }

  function getCats(s){
    try{return Array.isArray(s.cat)?s.cat:(s.cat?JSON.parse(s.cat):[])}catch{return[]}
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:"0 0 2px"}}>Repertório 🎵</h2>
          <p style={{fontSize:12,color:"#94a3b8",margin:0}}>{approved.length} música(s){pending.length>0?` • ${pending.length} pendente(s)`:""}</p>
        </div>
        <Btn icon="plus" size="sm" onClick={openNew}>Nova</Btn>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:12,background:"#f1f5f9",borderRadius:12,padding:4}}>
        <button onClick={()=>setFilterTab("approved")} style={{flex:1,padding:"8px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:filterTab==="approved"?"#fff":"transparent",color:filterTab==="approved"?"#0f172a":"#64748b",boxShadow:filterTab==="approved"?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
          ✓ Aprovadas ({approved.length})
        </button>
        <button onClick={()=>setFilterTab("pending")} style={{flex:1,padding:"8px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:filterTab==="pending"?"#fff":"transparent",color:filterTab==="pending"?"#0f172a":"#64748b",boxShadow:filterTab==="pending"?"0 1px 4px rgba(0,0,0,0.08)":"none",position:"relative"}}>
          ⏳ Sugestões ({pending.length})
          {pending.length>0&&<span style={{position:"absolute",top:4,right:8,background:C.danger,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{pending.length}</span>}
        </button>
      </div>

      <div style={{position:"relative",marginBottom:14}}>
        <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",pointerEvents:"none"}}><Icon name="search" size={15}/></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar música ou artista..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"10px 14px 10px 36px",fontSize:14,outline:"none",background:"#fff"}}/>
      </div>

      {loading&&<Loader/>}
      {!loading&&filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>🎵</div>
          <p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>{filterTab==="pending"?"Nenhuma sugestão pendente":"Nenhuma música cadastrada ainda"}</p>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(s=>{
          const cats=getCats(s)
          const isOpen=aberta===s.id
          return(
            <div key={s.id} style={{background:"#fff",border:"1px solid #e8edf2",borderRadius:isOpen?"12px 12px 0 0":12,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div onClick={()=>setAberta(isOpen?null:s.id)} style={{padding:"12px 14px",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{s.title}</div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:3}}>
                      <span style={{fontSize:11,color:"#94a3b8"}}>{s.artist||"—"}</span>
                      {s.tom_ig&&<span style={{fontSize:11,color:C.primary,fontWeight:700}}>Tom: {s.tom_ig}</span>}
                      {cats.map(c=><span key={c} style={{fontSize:10,background:C.primary+"15",color:C.primary,borderRadius:6,padding:"1px 6px",fontWeight:600}}>{c}</span>)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    {s.yt&&<a href={s.yt} target="_blank" rel="noopener noreferrer" style={{background:"#fee2e2",borderRadius:8,padding:"5px 8px",color:"#dc2626",textDecoration:"none",fontSize:12,fontWeight:700}}>▶</a>}
                    {(s.cifra||s.cf)&&<a href={s.cifra||s.cf} target="_blank" rel="noopener noreferrer" style={{background:"#fef3c7",borderRadius:8,padding:"5px 8px",color:"#d97706",textDecoration:"none",fontSize:12}}>🎸</a>}
                    {canEdit&&filterTab==="approved"&&<button onClick={()=>openEdit(s)} style={{background:C.primary+"15",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.primary,display:"flex"}}><Icon name="edit" size={14}/></button>}
                    {canEdit&&filterTab==="approved"&&<button onClick={()=>setDeleteId(s.id)} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.danger,display:"flex"}}><Icon name="trash" size={14}/></button>}
                  </div>
                </div>
              </div>
              {isOpen&&(
                <div style={{background:"#f8fafc",borderTop:"1px solid #e8edf2",borderRadius:"0 0 12px 12px",padding:"12px 14px"}}>
                  {s.lyrics
                    ?<pre style={{fontSize:12,lineHeight:1.9,color:"#334155",whiteSpace:"pre-wrap",maxHeight:260,overflowY:"auto",fontFamily:"inherit",margin:0}}>{s.lyrics}</pre>
                    :<div style={{color:"#94a3b8",fontSize:12}}>Sem letra cadastrada.</div>
                  }
                  {s.obs&&<div style={{fontSize:11,color:"#94a3b8",marginTop:6,fontStyle:"italic"}}>{s.obs}</div>}
                </div>
              )}
              {filterTab==="pending"&&canApprove&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 14px 12px"}}>
                  <Btn variant="success" size="sm" onClick={()=>approve(s.id)}>✓ Aprovar</Btn>
                  <Btn variant="danger" size="sm" onClick={()=>reject(s.id)}>✗ Rejeitar</Btn>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {modal&&(
        <Modal open={modal} onClose={()=>{setModal(false);setEditing(null);setForm(SONG_EMPTY);setSugestoes([])}} title={editing?"Editar Música":"Nova Música"}>
          <div style={{position:"relative",marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>
              Nome da Música * {buscando&&<span style={{color:C.primary,fontWeight:400,textTransform:"none",letterSpacing:0}}> 🔍 buscando...</span>}
            </label>
            <input
              value={form.title}
              onChange={e=>{setForm(f=>({...f,title:e.target.value}));buscarItunes(e.target.value)}}
              placeholder="Digite para buscar automaticamente..."
              style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"#fff",boxSizing:"border-box"}}
            />
            {sugestoes.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1px solid "+C.primary,borderRadius:"0 0 10px 10px",zIndex:200,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>
                {sugestoes.map((x,i)=>(
                  <div key={i} onClick={()=>selSugestao(x)} style={{padding:"9px 12px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f1f5f9",color:"#334155"}} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background=""}>
                    {x.trackName} <span style={{color:"#94a3b8"}}>— {x.artistName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Inp label="Artista / Ministério" value={form.artist} onChange={v=>setForm(f=>({...f,artist:v}))} placeholder="Ex: Ministério Zoe"/>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Tom Original</label>
              <select value={form.tom} onChange={e=>setForm(f=>({...f,tom:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"#fff"}}>
                {SONG_TONS.map(t=><option key={t} value={t}>{t||"—"}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Tom na Igreja</label>
              <select value={form.tomIg} onChange={e=>setForm(f=>({...f,tomIg:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"#fff"}}>
                {SONG_TONS.map(t=><option key={t} value={t}>{t||"—"}</option>)}
              </select>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Link Cifra Club</label>
            <input type="url" value={form.cf} onChange={e=>setForm(f=>({...f,cf:e.target.value}))} placeholder="Preenchido automaticamente ou cole o link..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"#fff",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Link YouTube</label>
            <input type="url" value={form.yt} onChange={e=>setForm(f=>({...f,yt:e.target.value}))} placeholder="Preenchido automaticamente ou cole o link..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"#fff",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Categorias</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {SONG_CATS.map(cat=>{
                const sel=form.cats.includes(cat)
                return(
                  <label key={cat} onClick={()=>toggleCat(cat)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:sel?C.primary+"15":"#f8fafc",border:`1px solid ${sel?C.primary:"#e2e8f0"}`,borderRadius:8,cursor:"pointer",userSelect:"none"}}>
                    <div style={{width:16,height:16,flexShrink:0,borderRadius:4,border:`2px solid ${sel?C.primary:"#94a3b8"}`,background:sel?C.primary:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {sel&&<span style={{color:"#fff",fontSize:11,fontWeight:900,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{fontSize:12,color:sel?C.primary:"#334155",fontWeight:sel?600:400}}>{cat}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>
              <span>Letra</span>
              {form.title&&(
                <button type="button" onClick={()=>buscarTudo(form.title,form.artist)} disabled={buscando} style={{fontSize:11,color:C.primary,background:"none",border:"none",cursor:buscando?"not-allowed":"pointer",fontWeight:600,fontFamily:"inherit",opacity:buscando?.6:1,textTransform:"none",letterSpacing:0}}>
                  {buscando?"🔍 Buscando...":"✨ Buscar letra + YouTube + Cifra automaticamente"}
                </button>
              )}
            </label>
            <textarea value={form.lyrics} onChange={e=>setForm(f=>({...f,lyrics:e.target.value}))} placeholder="Clique em 'Buscar automaticamente' ou cole aqui..." rows={6} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:13,outline:"none",background:"#fff",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.7}}/>
          </div>

          <Inp label="Observações" value={form.obs} onChange={v=>setForm(f=>({...f,obs:v}))} placeholder="Notas sobre a música..."/>
          <Btn full onClick={save} icon="music">{editing?"Salvar Alterações":"Cadastrar Música"}</Btn>
        </Modal>
      )}

      {deleteId&&<Modal open title="Confirmar Exclusão" onClose={()=>setDeleteId(null)}>
        <p style={{color:"#64748b",marginBottom:16}}>Remover esta música do repertório?</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={()=>setDeleteId(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={del}>Excluir</Btn>
        </div>
      </Modal>}
    </div>
  )
}


// ─── STUDIES PANEL ────────────────────────────────────────────────────────────
function StudiesPanel({session,showToast}){
  const{data:studies,loading}=useTable("studies")
  const{data:cells}=useTable("cells")
  const[modal,setModal]=useState(false)
  const[editing,setEditing]=useState(null)
  const[deleteId,setDeleteId]=useState(null)
  const{start:ws,end:we}=getWeekRange()
  const emptyForm={title:"",link:"",link_kids:"",link_youth:"",cell_id:"",week_start:ws,week_end:we,description:""}
  const[form,setForm]=useState(emptyForm)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const isAdmin=session?.role==="admin"||session?.role==="supervisor"
  const myCells=isAdmin?cells:cells.filter(c=>c.id===session?.cell_id)
  const visibleStudies=(isAdmin?studies:studies.filter(s=>!s.cell_id||s.cell_id===session?.cell_id))
    .sort((a,b)=>{
      const aActive=isCurrentWeek(a.week_start,a.week_end)?1:0
      const bActive=isCurrentWeek(b.week_start,b.week_end)?1:0
      if(bActive!==aActive)return bActive-aActive
      if(a.week_start&&b.week_start)return b.week_start.localeCompare(a.week_start)
      return 0
    })

  async function save(){
    if(!form.title.trim()){showToast("Título obrigatório","error");return}
    const payload={title:form.title.trim(),link:form.link,link_kids:form.link_kids||null,link_youth:form.link_youth||null,cell_id:form.cell_id||null,week_start:form.week_start||null,week_end:form.week_end||null,description:form.description,created_by:session.id}
    if(editing){
      await supabase.from("studies").update(payload).eq("id",editing)
      showToast("Estudo atualizado!")
    }else{
      await supabase.from("studies").insert(payload)
      showToast("Estudo cadastrado!")
    }
    setModal(false);setEditing(null);setForm(emptyForm)
  }

  async function del(){
    await supabase.from("studies").delete().eq("id",deleteId)
    showToast("Estudo removido");setDeleteId(null)
  }

  function openEdit(s){
    setForm({title:s.title,link:s.link||"",link_kids:s.link_kids||"",link_youth:s.link_youth||"",cell_id:s.cell_id||"",week_start:s.week_start||"",week_end:s.week_end||"",description:s.description||""})
    setEditing(s.id);setModal(true)
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Estudos 📚</h2>
        <Btn icon="plus" size="sm" onClick={()=>{setForm(emptyForm);setEditing(null);setModal(true)}}>Novo</Btn>
      </div>

      {loading&&<Loader/>}
      {!loading&&visibleStudies.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📚</div>
          <p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>Nenhum estudo cadastrado</p>
          <Btn onClick={()=>setModal(true)} icon="plus" style={{marginTop:8}}>Cadastrar primeiro estudo</Btn>
        </div>
      )}

      {visibleStudies.map(s=>{
        const cell=cells.find(c=>c.id===s.cell_id)
        return(
          <Card key={s.id} style={{marginBottom:10,borderLeft:`3px solid ${C.primary}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>{s.title}</div>
                {(s.week_start&&s.week_end)&&(
                  <div style={{display:"inline-flex",alignItems:"center",gap:5,background:isCurrentWeek(s.week_start,s.week_end)?C.gold+"20":"#f1f5f9",border:`1px solid ${isCurrentWeek(s.week_start,s.week_end)?C.gold:"#e2e8f0"}`,borderRadius:8,padding:"3px 8px",fontSize:11,fontWeight:700,color:isCurrentWeek(s.week_start,s.week_end)?C.gold:"#64748b"}}>
                    📅 {fmtWeek(s.week_start,s.week_end)}{isCurrentWeek(s.week_start,s.week_end)&&" ✦ Esta semana"}
                  </div>
                )}
                {cell?<div style={{fontSize:12,color:"#64748b"}}>🏠 {cell.name}</div>:<div style={{fontSize:12,color:C.gold}}>📢 Todas as células</div>}
                {s.description&&<p style={{fontSize:12,color:"#64748b",margin:"6px 0 0",lineHeight:1.5}}>{s.description}</p>}
              </div>
              <div style={{display:"flex",gap:5,marginLeft:8,flexShrink:0}}>
                <button onClick={()=>openEdit(s)} style={{background:C.primary+"15",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.primary}}><Icon name="edit" size={14}/></button>
                {isAdmin&&<button onClick={()=>setDeleteId(s.id)} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:7,cursor:"pointer",color:C.danger}}><Icon name="trash" size={14}/></button>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {s.link&&(
                <a href={s.link} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,background:C.primary,borderRadius:10,padding:"8px 16px",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:700,boxShadow:`0 2px 8px ${C.primary}40`}}>
                  <Icon name="link" size={14}/>Acessar Estudo
                </a>
              )}
              {s.link_kids&&(
                <a href={s.link_kids} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,background:"#f59e0b",borderRadius:10,padding:"8px 16px",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:700,boxShadow:"0 2px 8px rgba(245,158,11,0.4)"}}>
                  <Icon name="star" size={14}/>👧 Estudo Kids
                </a>
              )}
              {s.link_youth&&(
                <a href={s.link_youth} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,background:"#7c3aed",borderRadius:10,padding:"8px 16px",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:700,boxShadow:"0 2px 8px rgba(124,58,237,0.4)"}}>
                  <Icon name="star" size={14}/>🧑 Estudo Jovens
                </a>
              )}
            </div>
          </Card>
        )
      })}

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Estudo":"Novo Estudo"}>
        <Inp label="Tema do Estudo" value={form.title} onChange={f("title")} required placeholder="Ex: Jesus, o Bom Pastor"/>
        <Inp label="Link do Material" value={form.link} onChange={f("link")} placeholder="https://drive.google.com/..."/>
        <Inp label="Link Kids 👧" value={form.link_kids} onChange={f("link_kids")} placeholder="https://drive.google.com/... (versão para crianças)"/>
        <Inp label="Link Jovens 🧑" value={form.link_youth} onChange={f("link_youth")} placeholder="https://drive.google.com/... (versão para jovens)"/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase"}}>Semana de Vigência</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{display:"block",fontSize:10,color:"#94a3b8",marginBottom:4,fontWeight:600}}>Início (Domingo)</label><input type="date" value={form.week_start||""} onChange={e=>f("week_start")(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none"}}/></div>
            <div><label style={{display:"block",fontSize:10,color:"#94a3b8",marginBottom:4,fontWeight:600}}>Fim (Sábado)</label><input type="date" value={form.week_end||""} onChange={e=>f("week_end")(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none"}}/></div>
          </div>
          {form.week_start&&form.week_end&&<p style={{fontSize:11,color:C.primary,marginTop:6,fontWeight:600}}>📅 Semana de {fmtWeek(form.week_start,form.week_end)}</p>}
        </div>
        <Sel label="Célula" value={form.cell_id} onChange={f("cell_id")} options={[{value:"",label:"📢 Todas as células"},...myCells.map(c=>({value:c.id,label:c.name}))]}/>
        <Textarea label="Descrição (opcional)" value={form.description} onChange={f("description")} placeholder="Breve descrição do estudo..." rows={3}/>
        <Btn full onClick={save}>{editing?"Salvar Alterações":"Cadastrar Estudo"}</Btn>
      </Modal>

      {deleteId&&<Modal open title="Confirmar Exclusão" onClose={()=>setDeleteId(null)}>
        <p style={{color:"#64748b",marginBottom:16}}>Remover este estudo permanentemente?</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={()=>setDeleteId(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={del}>Excluir</Btn>
        </div>
      </Modal>}
    </div>
  )
}

function ReportsPanel({session}){
  const{data:members}=useTable("members")
  const{data:cells}=useTable("cells")
  const{data:attendanceRaw}=useTable("attendance");const attendance=dedupeAtt(attendanceRaw)
  const{data:meetings}=useTable("meetings")
  const[reportTab,setReportTab]=useState("frequencia")
  const[gerando,setGerando]=useState(false)
  const[cellFilter,setCellFilter]=useState("")
  const[sortAtt,setSortAtt]=useState("faltas") // "faltas" | "pct" | "nome"
  const[riskFilter,setRiskFilter]=useState("todos") // "todos"|"critico"|"atencao"|"ok"

  const isAdmin=session?.role==="admin"||session?.role==="supervisor"
  const myCells=isAdmin?cells:cells.filter(c=>c.id===session?.cell_id)
  const myCellIds=new Set(myCells.map(c=>c.id))
  const baseMembers=isAdmin?members:members.filter(m=>myCellIds.has(m.cell_id))
  const baseMeetings=isAdmin?meetings:meetings.filter(m=>(m.cell_id&&myCellIds.has(m.cell_id))||m.is_general)

  // ── helpers ──
  const SmallBar=({value,max,color})=>(<div style={{height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden",flex:1}}><div style={{height:"100%",width:`${max?Math.min(100,Math.round(value/max*100)):0}%`,background:color,borderRadius:4,transition:"width .5s"}}/></div>)

  function attColor(pct){return pct>=75?C.success:pct>=50?C.warning:C.danger}
  function riskLabel(pct){return pct>=75?"ok":pct>=50?"atencao":"critico"}
  function riskBadge(pct){
    if(pct>=75)return{label:"✓ Regular",bg:"#dcfce7",color:C.success}
    if(pct>=50)return{label:"⚠ Atenção",bg:"#fef3c7",color:C.warning}
    return{label:"✗ Crítico",bg:"#fee2e2",color:C.danger}
  }

  // ── RELATÓRIO 1: FREQUÊNCIA POR MEMBRO ──────────────────────────────────────
  function calcCelulas(){
    return myCells.map(c=>{
      const mc=baseMembers.filter(m=>m.cell_id===c.id&&m.status==="Membro")
      const vis=baseMembers.filter(m=>m.cell_id===c.id&&m.status==="Visitante")
      const cellAtt=attendance.filter(a=>a.cell_id===c.id)
      const cellMeetings=baseMeetings.filter(m=>m.cell_id===c.id)
      const present=cellAtt.filter(a=>a.status==="Presente").length
      const total=cellAtt.length
      const pct=total>0?Math.round(present/total*100):null
      return{...c,membros:mc.length,visitantes:vis.length,encontros:cellMeetings.length,pct,memberList:mc}
    }).filter(c=>c.cell_status!=="Inativa").sort((a,b)=>(a.pct??-1)-(b.pct??-1))
  }

  function calcFaixas(){
    const base=cellFilter?baseMembers.filter(m=>m.cell_id===cellFilter):baseMembers
    const ativos=base.filter(m=>m.status==="Membro")
    const faixas=[
      {label:"Crianças (0 a 10)",count:ativos.filter(m=>ageOf(m)&&ageOf(m)<=10).length},
      {label:"Adolescentes (11 a 15)",count:ativos.filter(m=>ageOf(m)>=11&&ageOf(m)<=15).length},
      {label:"Jovens (16 a 22)",count:ativos.filter(m=>ageOf(m)>=16&&ageOf(m)<=22).length},
      {label:"Adultos (23 a 59)",count:ativos.filter(m=>ageOf(m)>=23&&ageOf(m)<=59).length},
      {label:"60+",count:ativos.filter(m=>ageOf(m)>=60).length},
      {label:"Sem idade cadastrada",count:ativos.filter(m=>!ageOf(m)).length},
    ].filter(f=>f.count>0)
    return{faixas,total:ativos.length,ativos,
      masc:ativos.filter(m=>m.gender==="Masculino").length,
      fem:ativos.filter(m=>m.gender==="Feminino").length}
  }

  function calcVisitantes(){
    const base=cellFilter?baseMembers.filter(m=>m.cell_id===cellFilter):baseMembers
    const visitors=base.filter(m=>m.status==="Visitante")
    return{visitors,
      converted:base.filter(m=>m.status==="Membro"),
      visitorsWithAtt:visitors.filter(m=>attendance.some(a=>a.member_id===m.id)),
      batizados:base.filter(m=>m.status==="Membro"&&m.baptized),
      aBatizar:base.filter(m=>m.status==="Membro"&&m.baptized===false),
      naoMembros:base.filter(m=>m.status==="Membro"&&m.church_member!==true)}
  }

  function calcFrequencia(){
    // Todos os encontros ordenados por data por célula
    const meetingsByCellSorted={}
    baseMeetings.forEach(mt=>{
      const cid=mt.cell_id||"geral"
      if(!meetingsByCellSorted[cid])meetingsByCellSorted[cid]=[]
      meetingsByCellSorted[cid].push(mt)
    })
    Object.values(meetingsByCellSorted).forEach(arr=>arr.sort((a,b)=>a.date.localeCompare(b.date)))

    // Mapa de presença por membro com todos os registros
    const attMap={}
    attendance.forEach(a=>{
      if(!attMap[a.member_id])attMap[a.member_id]={records:[]}
      attMap[a.member_id].records.push({date:a.date,status:a.status,cell_id:a.cell_id})
    })

    // Enrich com contexto de "desde quando"
    let rows=baseMembers
      .filter(m=>m.status==="Membro"||(m.status==="Visitante"&&attMap[m.id]))
      .map(m=>{
        const records=(attMap[m.id]?.records||[]).sort((a,b)=>a.date.localeCompare(b.date))
        const firstDate=records.length>0?records[0].date:null

        // Encontros da célula a partir do primeiro registro do membro
        const cellMeetings=(meetingsByCellSorted[m.cell_id]||[])
        const totalCellMeetings=cellMeetings.length
        const meetingsSinceFirst=firstDate?cellMeetings.filter(mt=>mt.date>=firstDate):[]
        const firstMeetingIndex=firstDate?cellMeetings.findIndex(mt=>mt.date>=firstDate):-1
        const meetingNumber=firstMeetingIndex>=0?firstMeetingIndex+1:null

        // Contagem desde o primeiro registro
        const present=records.filter(r=>r.status==="Presente").length
        const absences=records.filter(r=>r.status==="Ausente").length
        const justified=records.filter(r=>r.status==="Justificado").length
        const total=records.length
        const pct=total>0?Math.round(present/total*100):null

        // Faltas consecutivas (das mais recentes)
        const desc=[...records].sort((a,b)=>b.date.localeCompare(a.date))
        let consecutive=0
        for(const r of desc){if(r.status==="Ausente")consecutive++;else break}

        const cell=cells.find(c=>c.id===m.cell_id)
        return{
          ...m,
          att:{total,present,absences,justified,records},
          pct,consecutive,
          cellName:cell?.name||"Sem célula",
          firstDate,meetingNumber,totalCellMeetings,
          meetingsSinceCount:meetingsSinceFirst.length
        }
      })

    if(cellFilter)rows=rows.filter(m=>m.cell_id===cellFilter)
    if(riskFilter!=="todos")rows=rows.filter(m=>{
      if(m.pct===null)return riskFilter==="critico"
      return riskLabel(m.pct)===riskFilter
    })
    if(sortAtt==="faltas")rows.sort((a,b)=>b.att.absences-a.att.absences)
    else if(sortAtt==="pct")rows.sort((a,b)=>(a.pct??-1)-(b.pct??-1))
    else rows.sort((a,b)=>a.name.localeCompare(b.name))

    return rows
  }

  function ReportFrequencia(){
    const rows=calcFrequencia()
    const totalRows=rows.length
    const criticos=rows.filter(m=>m.pct!==null&&m.pct<50).length
    const atencao=rows.filter(m=>m.pct!==null&&m.pct>=50&&m.pct<75).length
    const semRegistro=rows.filter(m=>m.pct===null).length

    function fmtShortDate(d){if(!d)return"";try{const[,m,day]=d.split("-");return`${day}/${m}`}catch{return d}}

    return(
      <div>
        {/* resumo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          <div style={{background:"#fee2e2",borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:C.danger}}>{criticos}</div>
            <div style={{fontSize:11,color:C.danger,fontWeight:700}}>Crítico &lt;50%</div>
          </div>
          <div style={{background:"#fef3c7",borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:C.warning}}>{atencao}</div>
            <div style={{fontSize:11,color:C.warning,fontWeight:700}}>Atenção 50–74%</div>
          </div>
          <div style={{background:"#dcfce7",borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:C.success}}>{totalRows-criticos-atencao-semRegistro}</div>
            <div style={{fontSize:11,color:C.success,fontWeight:700}}>Regular ≥75%</div>
          </div>
        </div>

        {/* filtros */}
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <select value={cellFilter} onChange={e=>setCellFilter(e.target.value)} style={{flex:1,minWidth:140,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="">Todas as células</option>
            {myCells.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={riskFilter} onChange={e=>setRiskFilter(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="todos">Todos os riscos</option>
            <option value="critico">Crítico (&lt;50%)</option>
            <option value="atencao">Atenção (50–74%)</option>
            <option value="ok">Regular (≥75%)</option>
          </select>
          <select value={sortAtt} onChange={e=>setSortAtt(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="faltas">↓ Mais faltas</option>
            <option value="pct">↑ Menor %</option>
            <option value="nome">A–Z Nome</option>
          </select>
        </div>

        {rows.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhum resultado</p></Card>}

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {rows.map(m=>{
            const badge=m.pct!==null?riskBadge(m.pct):{label:"Sem dados",bg:"#f1f5f9",color:"#64748b"}
            // contexto de "desde quando"
            const sinceCtx=m.meetingNumber&&m.firstDate
              ?(m.meetingNumber===1
                ? `Desde o 1º encontro (${fmtShortDate(m.firstDate)})`
                : `A partir do ${m.meetingNumber}º encontro (${fmtShortDate(m.firstDate)})`)
              :null
            // encontros que aconteceram antes do membro entrar
            const meetingsBefore=m.totalCellMeetings-m.meetingsSinceCount
            return(
              <div key={m.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${m.pct!==null&&m.pct<50?"#fecaca":m.pct!==null&&m.pct<75?"#fde68a":"#e8edf2"}`,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <Avatar name={m.name} photo={m.photo_url} size={36} color={m.pct!==null?attColor(m.pct):"#94a3b8"}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{m.cellName}{m.status==="Visitante"?" · Visitante":""}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,background:badge.bg,color:badge.color,borderRadius:20,padding:"3px 9px",flexShrink:0}}>{badge.label}</span>
                </div>

                {m.att.total>0?(
                  <>
                    {/* contexto "desde quando" */}
                    {sinceCtx&&(
                      <div style={{fontSize:11,color:"#64748b",background:"#f8fafc",borderRadius:8,padding:"5px 9px",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
                        <span style={{color:"#94a3b8"}}>📅</span>
                        <span>{sinceCtx}</span>
                        {meetingsBefore>0&&<span style={{color:"#94a3b8",marginLeft:"auto"}}>célula tinha {meetingsBefore} encontro{meetingsBefore>1?"s":""} antes</span>}
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <SmallBar value={m.att.present} max={m.att.total} color={attColor(m.pct)}/>
                      <span style={{fontSize:13,fontWeight:900,color:attColor(m.pct),minWidth:36,textAlign:"right"}}>{m.pct}%</span>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"#64748b"}}>✓ <b style={{color:C.success}}>{m.att.present}</b> presenças</span>
                      <span style={{fontSize:11,color:"#64748b"}}>✗ <b style={{color:C.danger}}>{m.att.absences}</b> faltas</span>
                      {m.att.justified>0&&<span style={{fontSize:11,color:"#64748b"}}>? <b style={{color:C.warning}}>{m.att.justified}</b> justif.</span>}
                      {m.consecutive>=2&&<span style={{fontSize:11,fontWeight:700,color:C.danger,background:"#fee2e2",borderRadius:8,padding:"1px 7px"}}>🚨 {m.consecutive} faltas seguidas</span>}
                    </div>
                  </>
                ):(
                  <div style={{fontSize:12,color:"#94a3b8",fontStyle:"italic"}}>Sem registros de presença ainda</div>
                )}

                {m.phone&&(
                  <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>
                    <a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:5,background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,color:"#166534",textDecoration:"none"}}>
                      <Icon name="whatsapp" size={12}/>Contatar pelo WhatsApp
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {semRegistro>0&&<p style={{fontSize:11,color:"#94a3b8",textAlign:"center",marginTop:12}}>{semRegistro} membro(s) sem nenhum encontro registrado</p>}
      </div>
    )
  }

  // ── RELATÓRIO 2: FAIXAS ETÁRIAS ─────────────────────────────────────────────
  function ReportFaixas(){
    const base=cellFilter?baseMembers.filter(m=>m.cell_id===cellFilter):baseMembers
    const ativos=base.filter(m=>m.status==="Membro")
    const faixas=[
      {label:"Crianças (0 a 10)",color:"#06b6d4",count:ativos.filter(m=>ageOf(m)&&ageOf(m)<=10).length},
      {label:"Adolescentes (11 a 15)",color:"#8b5cf6",count:ativos.filter(m=>ageOf(m)>=11&&ageOf(m)<=15).length},
      {label:"Jovens (16 a 22)",color:"#10b981",count:ativos.filter(m=>ageOf(m)>=16&&ageOf(m)<=22).length},
      {label:"Adultos (23 a 59)",color:C.primary,count:ativos.filter(m=>ageOf(m)>=23&&ageOf(m)<=59).length},
      {label:"60+",color:C.gold,count:ativos.filter(m=>ageOf(m)>=60).length},
      {label:"Sem idade cadastrada",color:"#94a3b8",count:ativos.filter(m=>!ageOf(m)).length},
    ].filter(f=>f.count>0)
    const total=ativos.length

    // Masc/Fem
    const masc=ativos.filter(m=>m.gender==="Masculino").length
    const fem=ativos.filter(m=>m.gender==="Feminino").length
    const outros=ativos.length-masc-fem

    return(
      <div>
        <div style={{marginBottom:12}}>
          <select value={cellFilter} onChange={e=>setCellFilter(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="">Toda a igreja</option>
            {myCells.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <Card style={{marginBottom:12}}>
          <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:14}}>Faixas Etárias — {total} membros ativos</h3>
          {faixas.map(f=>(
            <div key={f.label} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:f.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#334155"}}>{f.label}</span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:900,color:f.color}}>{f.count}</span>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{total>0?Math.round(f.count/total*100):0}%</span>
                </div>
              </div>
              <SmallBar value={f.count} max={total} color={f.color}/>
            </div>
          ))}
          {total>0&&(
            <div style={{height:14,background:"#f1f5f9",borderRadius:7,overflow:"hidden",display:"flex",marginTop:14}}>
              {faixas.filter(f=>f.label!=="Sem idade cadastrada").map(f=>(
                <div key={f.label} style={{height:"100%",width:`${Math.round(f.count/total*100)}%`,background:f.color}} title={`${f.label}: ${f.count}`}/>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:12}}>Por Sexo</h3>
          {[["Masculino",masc,C.primary],["Feminino",fem,"#e11d8c"],outros>0&&["Outro/N/I",outros,"#94a3b8"]].filter(Boolean).map(([k,v,cor])=>(
            <div key={k} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:600,color:"#334155"}}>{k}</span>
                <div style={{display:"flex",gap:6}}><span style={{fontSize:13,fontWeight:900,color:cor}}>{v}</span><span style={{fontSize:11,color:"#94a3b8"}}>{total>0?Math.round(v/total*100):0}%</span></div>
              </div>
              <SmallBar value={v} max={total} color={cor}/>
            </div>
          ))}
        </Card>
      </div>
    )
  }

  // ── RELATÓRIO 3: VISITAS E CONVERSÃO ────────────────────────────────────────
  function ReportVisitantes(){
    const base=cellFilter?baseMembers.filter(m=>m.cell_id===cellFilter):baseMembers
    const visitors=base.filter(m=>m.status==="Visitante")
    const converted=base.filter(m=>m.status==="Membro")

    // Visitors with attendance records = returning visitors
    const visitorsWithAtt=visitors.filter(m=>attendance.some(a=>a.member_id===m.id))

    // Members who used to be visitors (heuristic: joined cell later, no way to know exactly — show all members baptized recently)
    const batizados=base.filter(m=>m.status==="Membro"&&m.baptized)
    const aBatizar=base.filter(m=>m.status==="Membro"&&m.baptized===false)
    const naoMembros=base.filter(m=>m.status==="Membro"&&m.church_member!==true)

    return(
      <div>
        <div style={{marginBottom:12}}>
          <select value={cellFilter} onChange={e=>setCellFilter(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="">Toda a igreja</option>
            {myCells.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <div style={{background:C.primary+"10",borderRadius:12,padding:"12px",textAlign:"center",border:`1px solid ${C.primary}20`}}>
            <div style={{fontSize:26,fontWeight:900,color:C.primary}}>{visitors.length}</div>
            <div style={{fontSize:11,color:C.primary,fontWeight:700}}>Visitantes ativos</div>
          </div>
          <div style={{background:C.gold+"10",borderRadius:12,padding:"12px",textAlign:"center",border:`1px solid ${C.gold}20`}}>
            <div style={{fontSize:26,fontWeight:900,color:C.gold}}>{visitorsWithAtt.length}</div>
            <div style={{fontSize:11,color:C.gold,fontWeight:700}}>Voltaram ao menos 1x</div>
          </div>
          <div style={{background:C.success+"10",borderRadius:12,padding:"12px",textAlign:"center",border:`1px solid ${C.success}20`}}>
            <div style={{fontSize:26,fontWeight:900,color:C.success}}>{batizados.length}</div>
            <div style={{fontSize:11,color:C.success,fontWeight:700}}>Batizados</div>
          </div>
          <div style={{background:C.danger+"10",borderRadius:12,padding:"12px",textAlign:"center",border:`1px solid ${C.danger}20`}}>
            <div style={{fontSize:26,fontWeight:900,color:C.danger}}>{aBatizar.length}</div>
            <div style={{fontSize:11,color:C.danger,fontWeight:700}}>A batizar</div>
          </div>
        </div>

        {visitors.length>0&&(
          <Card style={{marginBottom:12}}>
            <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:12}}>Visitantes ({visitors.length})</h3>
            {visitors.map(m=>{
              const att=attendance.filter(a=>a.member_id===m.id)
              const cell=cells.find(c=>c.id===m.cell_id)
              return(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:"1px solid #f1f5f9"}}>
                  <Avatar name={m.name} photo={m.photo_url} size={32} color={C.gold}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{cell?.name||"Sem célula"} · {att.length} visita(s)</div>
                  </div>
                  {m.phone&&<a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"4px 8px",display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:"#166534",textDecoration:"none",flexShrink:0}}><Icon name="whatsapp" size={11}/>Contato</a>}
                </div>
              )
            })}
          </Card>
        )}

        {naoMembros.length>0&&(
          <Card style={{border:"1px solid #bfdbfe",background:"#eff6ff"}}>
            <h3 style={{fontSize:14,fontWeight:800,color:C.primary,marginBottom:12}}>⛪ Membros de célula que não são membros da igreja ({naoMembros.length})</h3>
            {naoMembros.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderTop:"1px solid #bfdbfe"}}>
                <Avatar name={m.name} photo={m.photo_url} size={30} color={C.primary}/>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{cells.find(c=>c.id===m.cell_id)?.name||"Sem célula"}</div></div>
                {m.phone&&<a href={whatsappLink(m.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"4px 8px",display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:"#166534",textDecoration:"none",flexShrink:0}}><Icon name="whatsapp" size={11}/>Contato</a>}
              </div>
            ))}
          </Card>
        )}
      </div>
    )
  }

  // ── RELATÓRIO 4: VISÃO GERAL DAS CÉLULAS ────────────────────────────────────
  function ReportCelulas(){
    const cellStats=myCells.map(c=>{
      const mc=baseMembers.filter(m=>m.cell_id===c.id&&m.status==="Membro")
      const vis=baseMembers.filter(m=>m.cell_id===c.id&&m.status==="Visitante")
      const cellAtt=attendance.filter(a=>a.cell_id===c.id)
      const cellMeetings=baseMeetings.filter(m=>m.cell_id===c.id)
      const present=cellAtt.filter(a=>a.status==="Presente").length
      const total=cellAtt.length
      const pct=total>0?Math.round(present/total*100):null
      return{...c,membros:mc.length,visitantes:vis.length,encontros:cellMeetings.length,pct,memberList:mc}
    }).filter(c=>c.cell_status!=="Inativa").sort((a,b)=>(a.pct??-1)-(b.pct??-1))

    return(
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {cellStats.map(c=>(
            <div key={c.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${c.pct!==null&&c.pct<50?"#fecaca":c.pct!==null&&c.pct<75?"#fde68a":"#e8edf2"}`,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{c.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{c.day} às {c.time} · {c.neighborhood}</div>
                </div>
                {c.pct!==null&&(()=>{const b=riskBadge(c.pct);return<span style={{fontSize:11,fontWeight:700,background:b.bg,color:b.color,borderRadius:20,padding:"3px 10px"}}>{b.label}</span>})()}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                {[["Membros",c.membros,C.primary],["Visitantes",c.visitantes,C.gold],["Encontros",c.encontros,"#64748b"],["Frequência",c.pct!==null?`${c.pct}%`:"—",c.pct!==null?attColor(c.pct):"#94a3b8"]].map(([l,v,cor])=>(
                  <div key={l} style={{textAlign:"center",background:"#f8fafc",borderRadius:8,padding:"6px 4px"}}>
                    <div style={{fontSize:16,fontWeight:900,color:cor}}>{v}</div>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{l}</div>
                  </div>
                ))}
              </div>
              {c.pct!==null&&<SmallBar value={c.pct} max={100} color={attColor(c.pct)}/>}
              {c.growth_goal>0&&(
                <div style={{marginTop:8}}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Meta: {c.membros}/{c.growth_goal} membros</div>
                  <SmallBar value={c.membros} max={c.growth_goal} color={C.primary}/>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const REPORT_TABS=[
    {id:"frequencia",label:"Frequência",icon:"check-circle"},
    {id:"celulas",label:"Células",icon:"grid"},
    {id:"faixas",label:"Faixas Etárias",icon:"users"},
    {id:"visitantes",label:"Visitas",icon:"user-plus"},
  ]

  const TAB_LABELS={frequencia:"Relatório de Frequência",celulas:"Desempenho das Células",faixas:"Faixas Etárias",visitantes:"Visitas e Conversão"}

  // ── PDF DE VERDADE ──────────────────────────────────────────────────────────
  // Antes isso era window.print(), que fotografava a tela inteira (menu lateral
  // incluso) e gastava 10 paginas. Agora o documento e montado a partir dos dados.
  async function gerarPDF(){
    setGerando(true)
    try{
      const{default:jsPDF}=await import("jspdf")
      const{default:autoTable}=await import("jspdf-autotable")
      const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"})
      const LARG=doc.internal.pageSize.getWidth()
      const AZUL=[27,79,138]
      const cellName=cellFilter?cells.find(c=>c.id===cellFilter)?.name:"Toda a Igreja"
      const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})

      // cabecalho da primeira pagina
      doc.setFillColor(...AZUL);doc.rect(0,0,LARG,26,"F")
      doc.setTextColor(255);doc.setFontSize(14);doc.setFont("helvetica","bold")
      doc.text(TAB_LABELS[reportTab],14,12)
      doc.setFontSize(9);doc.setFont("helvetica","normal")
      doc.text(`Promessa Lago dos Peixes  |  ${cellName}  |  Gerado em ${hoje}`,14,19)
      let y=34

      const resumo=(itens)=>{
        doc.setTextColor(60);doc.setFontSize(9)
        const larg=(LARG-28)/itens.length
        itens.forEach((it,i)=>{
          const x=14+i*larg
          doc.setFillColor(244,247,250);doc.roundedRect(x,y,larg-3,16,2,2,"F")
          doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...AZUL)
          doc.text(String(it[1]),x+larg/2-1.5,y+7,{align:"center"})
          doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(110)
          doc.text(it[0],x+larg/2-1.5,y+12.5,{align:"center"})
        })
        y+=22
      }

      const tabela=(head,body)=>{
        autoTable(doc,{
          startY:y,head:[head],body,
          theme:"striped",
          styles:{fontSize:8,cellPadding:2.2,overflow:"linebreak"},
          headStyles:{fillColor:AZUL,textColor:255,fontStyle:"bold",fontSize:8},
          alternateRowStyles:{fillColor:[247,250,252]},
          margin:{left:14,right:14,top:20},
          didDrawPage:(d)=>{
            if(d.pageNumber>1){
              doc.setFillColor(...AZUL);doc.rect(0,0,LARG,12,"F")
              doc.setTextColor(255);doc.setFontSize(8);doc.setFont("helvetica","bold")
              doc.text(`${TAB_LABELS[reportTab]}  -  ${cellName}`,14,8)
            }
          }
        })
        y=doc.lastAutoTable.finalY+8
      }

      if(reportTab==="frequencia"){
        const rows=calcFrequencia()
        resumo([
          ["Crítico (<50%)",rows.filter(m=>m.pct!==null&&m.pct<50).length],
          ["Atenção (50-74%)",rows.filter(m=>m.pct!==null&&m.pct>=50&&m.pct<75).length],
          ["Regular (75% ou +)",rows.filter(m=>m.pct!==null&&m.pct>=75).length],
          ["Sem registro",rows.filter(m=>m.pct===null).length],
          ["Total",rows.length],
        ])
        tabela(["Nome","Célula","Situação","Freq.","Presenças","Faltas","Just.","Faltas seguidas"],
          rows.map(m=>[
            m.name,m.cellName,
            m.pct===null?"Sem registro":m.pct>=75?"Regular":m.pct>=50?"Atenção":"Crítico",
            m.pct===null?"-":m.pct+"%",
            m.att.present,m.att.absences,m.att.justified,
            m.consecutive>0?String(m.consecutive):"-",
          ]))
      }

      if(reportTab==="celulas"){
        const cs=calcCelulas()
        resumo([
          ["Células",cs.length],
          ["Membros",cs.reduce((s,c)=>s+c.membros,0)],
          ["Visitantes",cs.reduce((s,c)=>s+c.visitantes,0)],
          ["Encontros",cs.reduce((s,c)=>s+c.encontros,0)],
        ])
        tabela(["Célula","Dia","Hora","Bairro","Membros","Visitantes","Encontros","Frequência"],
          cs.map(c=>[c.name,c.day||"-",c.time||"-",c.neighborhood||"-",c.membros,c.visitantes,c.encontros,c.pct!==null?c.pct+"%":"-"]))
      }

      if(reportTab==="faixas"){
        const{faixas,total,ativos,masc,fem}=calcFaixas()
        resumo([["Membros",total],["Masculino",masc],["Feminino",fem]])
        tabela(["Faixa etária","Quantidade","% do total"],
          faixas.map(f=>[f.label,f.count,total?Math.round(f.count/total*100)+"%":"0%"]))
        doc.setFontSize(10);doc.setFont("helvetica","bold");doc.setTextColor(...AZUL)
        doc.text("Membros por faixa etária",14,y);y+=2
        tabela(["Nome","Célula","Idade","Sexo"],
          [...ativos].sort((a,b)=>(ageOf(a)||0)-(ageOf(b)||0))
            .map(m=>[m.name,cells.find(c=>c.id===m.cell_id)?.name||"Sem célula",ageOf(m)??"-",m.gender||"-"]))
      }

      if(reportTab==="visitantes"){
        const v=calcVisitantes()
        resumo([
          ["Visitantes",v.visitors.length],
          ["Voltaram 1x+",v.visitorsWithAtt.length],
          ["Batizados",v.batizados.length],
          ["A batizar",v.aBatizar.length],
        ])
        const voltou=new Set(v.visitorsWithAtt.map(m=>m.id))
        tabela(["Visitante","Célula","Idade","Telefone","Já voltou","Convidado por"],
          v.visitors.map(m=>[m.name,cells.find(c=>c.id===m.cell_id)?.name||"Sem célula",ageOf(m)??"-",m.phone||"-",voltou.has(m.id)?"Sim":"Não",m.invited_by||"-"]))
      }

      // rodape com numeracao em todas as paginas
      const tot=doc.internal.getNumberOfPages()
      for(let i=1;i<=tot;i++){
        doc.setPage(i)
        const alt=doc.internal.pageSize.getHeight()
        doc.setFontSize(7.5);doc.setTextColor(150);doc.setFont("helvetica","normal")
        doc.text("Promessa Lago dos Peixes - Gestão de Células",14,alt-8)
        doc.text(`Página ${i} de ${tot}`,LARG-14,alt-8,{align:"right"})
      }

      const limpo=(t)=>t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()
      doc.save(`${limpo(TAB_LABELS[reportTab])}-${limpo(cellName)}-${todayStr()}.pdf`)
    }catch(e){
      console.error(e)
      alert("Nao foi possivel gerar o PDF: "+e.message)
    }finally{setGerando(false)}
  }


  return(
    <div>
      {/* cabeçalho de impressão (invisível na tela, aparece só no PDF) */}
      <div className="print-only" style={{display:"none",borderBottom:"2px solid #1B4F8A",paddingBottom:12,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:"#1B4F8A",display:"flex",alignItems:"center",justifyContent:"center"}}><LogoIcon size={26}/></div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:"#1B4F8A"}}>{TAB_LABELS[reportTab]}</div>
            <div style={{fontSize:12,color:"#64748b"}}>Promessa Lago dos Peixes · {cellFilter?cells.find(c=>c.id===cellFilter)?.name:"Toda a Igreja"} · Gerado em {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}</div>
          </div>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Relatórios</h2>
        <button onClick={gerarPDF} disabled={gerando} className="no-print" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#1B4F8A",border:"none",borderRadius:10,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9,15 12,18 15,15"/></svg>
          {gerando?"Gerando...":"Baixar PDF"}
        </button>
      </div>

      {/* seletor de abas */}
      <div className="no-print" style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:2}}>
        {REPORT_TABS.map(t=>(
          <button key={t.id} onClick={()=>{setReportTab(t.id);setCellFilter("");setRiskFilter("todos")}}
            style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,border:`1.5px solid ${reportTab===t.id?C.primary:"#e2e8f0"}`,background:reportTab===t.id?C.primary:"#fff",color:reportTab===t.id?"#fff":"#64748b",cursor:"pointer",transition:"all .15s"}}>
            <Icon name={t.icon} size={13}/>{t.label}
          </button>
        ))}
      </div>

      <div style={{animation:"fadeIn 0.2s ease"}}>
        {reportTab==="frequencia"&&<ReportFrequencia/>}
        {reportTab==="celulas"&&<ReportCelulas/>}
        {reportTab==="faixas"&&<ReportFaixas/>}
        {reportTab==="visitantes"&&<ReportVisitantes/>}
      </div>
    </div>
  )
}

function MessagesPanel({session,showToast}){
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:msgs}=useTable("messages")
  const[form,setForm]=useState({title:"",body:"",target_type:"all",target_cell_id:"",target_role:"",channels:{sms:false,whatsapp:true,email:false}})
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const isAdmin=session?.role==="admin"
  const isSupervisor=session?.role==="supervisor"
  const targetOptions=[{value:"all",label:"Todos os membros"},{value:"cell",label:"Uma célula específica"},...((isAdmin||isSupervisor)?[{value:"role",label:"Por função"}]:[])]
  const roleOptions=[{value:"leader",label:"Apenas Líderes"},{value:"secretary",label:"Apenas Secretários"},{value:"supervisor",label:"Apenas Supervisores"}]
  function getTargetCount(){
    if(form.target_type==="all")return members.filter(m=>m.status==="Membro").length
    if(form.target_type==="cell"&&form.target_cell_id)return members.filter(m=>m.cell_id===form.target_cell_id&&m.status==="Membro").length
    if(form.target_type==="role"&&form.target_role)return members.filter(m=>m.role===form.target_role).length
    return 0
  }
  async function send(){
    if(!form.title||!form.body){showToast("Título e mensagem obrigatórios","error");return}
    const channels=Object.entries(form.channels).filter(([,v])=>v).map(([k])=>k.toUpperCase())
    if(!channels.length){showToast("Selecione ao menos um canal","error");return}
    await supabase.from("messages").insert({title:form.title,body:form.body,channels,sent_by:session.id,sent_by_name:session.name,target_type:form.target_type,target_cell_id:form.target_cell_id||null,target_role:form.target_role,target_count:getTargetCount()})
    showToast(`Mensagem registrada para ${getTargetCount()} pessoas!`)
    setForm(p=>({...p,title:"",body:""}))
  }
  const myCells=isAdmin?cells:cells.filter(c=>c.id===session?.cell_id)
  return(
    <div>
      <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:16}}>Mensagens</h2>
      <Card style={{marginBottom:16}}>
        <Sel label="Enviar para" value={form.target_type} onChange={f("target_type")} options={targetOptions}/>
        {form.target_type==="cell"&&<Sel label="Célula" value={form.target_cell_id} onChange={f("target_cell_id")} options={[{value:"",label:"Selecione..."},...myCells.map(c=>({value:c.id,label:c.name}))]}/>}
        {form.target_type==="role"&&<Sel label="Função" value={form.target_role} onChange={f("target_role")} options={roleOptions}/>}
        <Inp label="Título" value={form.title} onChange={f("title")} placeholder="Ex: Lembrete do encontro" required/>
        <Textarea label="Mensagem" value={form.body} onChange={f("body")} placeholder="Escreva aqui..." rows={4}/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>Canais</label>
          <div style={{display:"flex",gap:8}}>{["sms","whatsapp","email"].map(ch=>(<button key={ch} onClick={()=>setForm(p=>({...p,channels:{...p.channels,[ch]:!p.channels[ch]}}))} style={{flex:1,padding:"10px 6px",borderRadius:12,border:`1.5px solid ${form.channels[ch]?C.primary:"#e2e8f0"}`,background:form.channels[ch]?C.primary+"10":"#f8fafc",color:form.channels[ch]?C.primary:"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>{ch==="sms"?"📱 SMS":ch==="whatsapp"?"💬 WhatsApp":"📧 E-mail"}</button>))}</div>
        </div>
        {getTargetCount()>0&&<div style={{background:C.primary+"08",border:`1px solid ${C.primary}20`,borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:13,color:C.primary,fontWeight:600}}>📤 Para {getTargetCount()} pessoa(s)</div>}
        <Btn full icon="send" onClick={send}>Enviar Mensagem</Btn>
      </Card>
      <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10}}>Histórico</h3>
      {msgs.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma mensagem enviada</p></Card>}
      {msgs.map(m=>(
        <Card key={m.id} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{m.title}</span>
            <span style={{fontSize:11,color:"#94a3b8"}}>{fmtDate(m.created_at?.split("T")[0])}</span>
          </div>
          <p style={{fontSize:12,color:"#64748b",margin:"0 0 8px",lineHeight:1.5}}>{m.body}</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {m.channels?.map(c=><Badge key={c} label={c} color={C.primary}/>)}
            <Badge label={`${m.target_count} pessoas`} color={C.success}/>
            <Badge label={m.sent_by_name} color="#64748b"/>
          </div>
        </Card>
      ))}
    </div>
  )
}

function AllRequestsPanel({session,showToast}){
  const{data:inactReqs}=useTable("inactivation_requests")
  const{data:cellReqs}=useTable("cell_change_requests")
  const{data:members}=useTable("members")
  const{data:cells}=useTable("cells")
  const[tab,setTab]=useState("inativacao")
  const[modal,setModal]=useState(false)
  const[cellModal,setCellModal]=useState(false)
  const[form,setForm]=useState({member_id:"",reason:""})
  const[cellForm,setCellForm]=useState({cell_id:"",field_name:"",requested_value:"",reason:""})
  const canResolve=session?.role==="admin"||session?.role==="supervisor"
  const sc={pending:C.warning,approved:C.success,rejected:C.danger}
  const sl={pending:"Pendente",approved:"Aprovado",rejected:"Rejeitado"}

  async function createInact(){
    if(!form.member_id||!form.reason){showToast("Preencha todos os campos","error");return}
    const member=members.find(m=>m.id===form.member_id)
    await supabase.from("inactivation_requests").insert({member_id:form.member_id,member_name:member?.name||"",cell_id:member?.cell_id||null,reason:form.reason,requested_by:session.id,requested_by_name:session.name,status:"pending"})
    showToast("Solicitação enviada!");setModal(false);setForm({member_id:"",reason:""})
  }

  async function createCellReq(){
    if(!cellForm.cell_id||!cellForm.field_name||!cellForm.requested_value){showToast("Preencha todos os campos","error");return}
    const cell=cells.find(c=>c.id===cellForm.cell_id)
    await supabase.from("cell_change_requests").insert({cell_id:cellForm.cell_id,cell_name:cell?.name||"",requested_by:session.id,requested_by_name:session.name,field_name:cellForm.field_name,requested_value:cellForm.requested_value,reason:cellForm.reason,status:"pending"})
    showToast("Solicitação enviada!");setCellModal(false);setCellForm({cell_id:"",field_name:"",requested_value:"",reason:""})
  }

  async function resolveInact(id,status){
    const req=inactReqs.find(r=>r.id===id)
    const isDeleteReq=req?.reason?.startsWith("[EXCLUIR]")
    await supabase.from("inactivation_requests").update({status,resolved_by:session.id,resolved_at:new Date().toISOString()}).eq("id",id)
    if(status==="approved"&&req){
      if(isDeleteReq){
        await supabase.from("members").delete().eq("id",req.member_id)
        await supabase.from("users").delete().eq("member_id",req.member_id)
        await addLog(session,"delete",`Exclusão aprovada: ${req.member_name} — ${req.reason}`)
      }else{
        await supabase.from("members").update({status:"Inativo",inactive_reason:req.reason,inactivated_at:new Date().toISOString(),inactivated_by:session.name}).eq("id",req.member_id)
        await supabase.from("users").update({active:false}).eq("member_id",req.member_id)
        await addLog(session,"update",`Inativação aprovada: ${req.member_name} — Motivo: ${req.reason}`)
      }
    }
    if(status==="rejected"&&req){
      await addLog(session,"update",`${isDeleteReq?"Exclusão":"Inativação"} rejeitada: ${req.member_name}`)
    }
    showToast(status==="approved"?(isDeleteReq?"Aprovado! Membro excluído.":"Aprovado! Membro inativado."):"Solicitação rejeitada")
  }

  async function resolveCellReq(id,status){
    await supabase.from("cell_change_requests").update({status,resolved_by:session.id,resolved_at:new Date().toISOString()}).eq("id",id)
    showToast(status==="approved"?"Aprovado!":"Rejeitado")
  }

  const mOpts=[{value:"",label:"Selecione..."},...members.filter(m=>m.status==="Membro").map(m=>({value:m.id,label:m.name}))]
  const myCells=session?.role==="admin"?cells:cells.filter(c=>c.id===session?.cell_id)
  const cellOpts=[{value:"",label:"Selecione a célula..."},...myCells.map(c=>({value:c.id,label:c.name}))]
  const fieldOpts=[{value:"",label:"Selecione..."},{value:"Endereço",label:"Endereço"},{value:"Horário",label:"Horário"},{value:"Dia da semana",label:"Dia da semana"},{value:"Anfitrião",label:"Anfitrião"},{value:"Outro",label:"Outro"}]

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",margin:0}}>Solicitações</h2>
        <div style={{display:"flex",gap:6}}>
          <Btn icon="plus" size="sm" variant="secondary" onClick={()=>setCellModal(true)}>Célula</Btn>
          <Btn icon="plus" size="sm" onClick={()=>setModal(true)}>Inativação</Btn>
        </div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:14,background:"#f1f5f9",borderRadius:12,padding:4}}>
        {[["inativacao","Inativações"],["celula","Alterações de Célula"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"8px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:tab===id?"#fff":"transparent",color:tab===id?"#0f172a":"#64748b",boxShadow:tab===id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{label}</button>
        ))}
      </div>
      {tab==="inativacao"&&(
        <div>
          {inactReqs.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma solicitação</p></Card>}
          {inactReqs.map(r=>{
            const isDeleteReq=r.reason?.startsWith("[EXCLUIR]")
            const displayReason=isDeleteReq?r.reason.replace("[EXCLUIR] ",""):r.reason
            return(<Card key={r.id} style={{marginBottom:10,borderLeft:`3px solid ${isDeleteReq?C.danger:sc[r.status]||C.warning}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{r.member_name}</span>
                    {isDeleteReq&&<span style={{fontSize:10,fontWeight:700,background:"#fee2e2",color:C.danger,borderRadius:6,padding:"1px 7px"}}>EXCLUSÃO</span>}
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Por: {r.requested_by_name} • {fmtDate(r.created_at?.split("T")[0])}</div>
                </div>
                <Badge label={sl[r.status]||r.status} color={sc[r.status]||C.warning}/>
              </div>
              <p style={{fontSize:12,color:"#64748b",margin:"0 0 8px",background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}>Motivo: {displayReason}</p>
              {r.status==="pending"&&canResolve&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Btn variant={isDeleteReq?"danger":"success"} size="sm" onClick={()=>resolveInact(r.id,"approved")}>{isDeleteReq?"🗑️ Excluir":"✓ Aprovar"}</Btn>
                  <Btn variant="ghost" size="sm" onClick={()=>resolveInact(r.id,"rejected")}>✗ Rejeitar</Btn>
                </div>
              )}
            </Card>)
          })}
        </div>
      )}
      {tab==="celula"&&(
        <div>
          {cellReqs.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma solicitação</p></Card>}
          {cellReqs.map(r=>(<Card key={r.id} style={{marginBottom:10,borderLeft:`3px solid ${sc[r.status]||C.warning}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div><span style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{r.cell_name}</span><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Por: {r.requested_by_name} • {fmtDate(r.created_at?.split("T")[0])}</div></div><Badge label={sl[r.status]||r.status} color={sc[r.status]||C.warning}/></div>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 4px"}}>Campo: <b>{r.field_name}</b></p>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 8px",background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}>Novo valor: {r.requested_value}{r.reason?` — ${r.reason}`:""}</p>
            {r.status==="pending"&&canResolve&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><Btn variant="success" size="sm" onClick={()=>resolveCellReq(r.id,"approved")}>✓ Aprovar</Btn><Btn variant="danger" size="sm" onClick={()=>resolveCellReq(r.id,"rejected")}>✗ Rejeitar</Btn></div>)}
          </Card>))}
        </div>
      )}
      <Modal open={modal} onClose={()=>setModal(false)} title="Solicitar Inativação">
        <Sel label="Membro" value={form.member_id} onChange={v=>setForm(p=>({...p,member_id:v}))} options={mOpts}/>
        <Textarea label="Motivo" value={form.reason} onChange={v=>setForm(p=>({...p,reason:v}))} placeholder="Explique o motivo..."/>
        <Btn full onClick={createInact}>Enviar Solicitação</Btn>
      </Modal>
      <Modal open={cellModal} onClose={()=>setCellModal(false)} title="Solicitar Alteração na Célula">
        <Sel label="Célula" value={cellForm.cell_id} onChange={v=>setCellForm(p=>({...p,cell_id:v}))} options={cellOpts}/>
        <Sel label="Campo a alterar" value={cellForm.field_name} onChange={v=>setCellForm(p=>({...p,field_name:v}))} options={fieldOpts}/>
        <Inp label="Novo valor" value={cellForm.requested_value} onChange={v=>setCellForm(p=>({...p,requested_value:v}))} placeholder="Ex: Rua das Flores, 123"/>
        <Textarea label="Motivo (opcional)" value={cellForm.reason} onChange={v=>setCellForm(p=>({...p,reason:v}))} rows={2}/>
        <Btn full onClick={createCellReq}>Enviar Solicitação</Btn>
      </Modal>
    </div>
  )
}

function LogsPanel(){
  const{data:logs,loading}=useTable("logs")
  const{data:users}=useTable("users")
  const emoji={create:"➕",update:"✏️",delete:"🗑️"}
  return(
    <div>
      <h2 style={{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:16}}>Auditoria</h2>
      {loading&&<Loader/>}
      {!loading&&logs.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhum registro</p></Card>}
      {logs.map(log=>{
        const user=users.find(u=>u.id===log.user_id)
        const userName=user?.name||"Usuário desconhecido"
        return(
          <div key={log.id} style={{background:"#fff",borderRadius:12,padding:"10px 14px",marginBottom:6,border:"1px solid #e8edf2",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>{emoji[log.action]||"📝"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:"#334155"}}>{log.detail}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"#94a3b8"}}>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                <span style={{fontSize:11,fontWeight:700,color:C.primary,background:C.primary+"10",padding:"1px 7px",borderRadius:6}}>👤 {userName}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── LEADER/SECRETARY DASHBOARD ───────────────────────────────────────────────
function LeaderSecretaryDashboard({session,logout,showToast}){
  const[sub,setSub]=useState("home")
  const[lsBdModal,setLsBdModal]=useState(null)
  const[showChangePw,setShowChangePw]=useState(false)
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:meetings}=useTable("meetings")
  const{data:prayers}=useTable("prayer_requests")
  const cell=cells.find(c=>c.id===session.cell_id)
  const cellMembers=members.filter(m=>m.cell_id===session.cell_id&&m.status==="Membro")
  const cellVisitors=members.filter(m=>m.cell_id===session.cell_id&&m.status==="Visitante")
  const cellMeetings=meetings.filter(m=>m.cell_id===session.cell_id||m.is_general)
  const roleLabel=session.role==="secretary"?"Secretário":"Líder"
  const leaders=cell?members.filter(m=>cell.leaders_ids?.includes(m.id)):[]

  const currentMonth=getCurrentMonth()
  const{start,end}=getCurrentWeekDates()
  const weekBirthdays=members.filter(m=>m.cell_id===session.cell_id&&m.birth_date&&(()=>{const b=parseDate(m.birth_date);const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate());return t>=start&&t<=end})())
  const pendingPrayers=prayers.filter(p=>p.cell_id===session.cell_id&&p.status==="pending").length

  const menu=[
    {id:"members",icon:"users",label:"Pessoas",desc:`${cellMembers.length} membros, ${cellVisitors.length} visitantes`,color:C.primary},
    {id:"meetings",icon:"meeting",label:"Encontros",desc:"Registrar e gerenciar",color:C.success},
    {id:"events",icon:"event",label:"Eventos",desc:"Gerenciar eventos",color:C.purple},
    {id:"prayer",icon:"pray",label:"Orações",desc:`${pendingPrayers} pedido(s) pendente(s)`,color:"#7c3aed"},
    {id:"reports",icon:"bar-chart",label:"Relatórios",desc:"Frequência e dados",color:C.gold},
    {id:"messages",icon:"message",label:"Mensagens",desc:"Comunicados",color:"#0891b2"},
    {id:"requests",icon:"inbox",label:"Solicitações",desc:"Inativações e alterações",color:C.danger},
    {id:"studies",icon:"star",label:"Estudos",desc:"Material de estudo",color:C.primary},
    {id:"songs",icon:"music",label:"Músicas",desc:"Repertório da célula",color:C.success},
  ]

  function renderSub(){
    if(sub==="members")return<MembersPanel session={session} showToast={showToast}/>
    if(sub==="meetings")return<MeetingsPanel session={session} showToast={showToast}/>
    if(sub==="events")return<EventsPanel session={session} showToast={showToast}/>
    if(sub==="prayer")return<PrayerPanel session={session} showToast={showToast}/>
    if(sub==="reports")return<ReportsPanel session={session}/>
    if(sub==="messages")return<MessagesPanel session={session} showToast={showToast}/>
    if(sub==="requests")return<AllRequestsPanel session={session} showToast={showToast}/>
    if(sub==="studies")return<StudiesPanel session={session} showToast={showToast}/>
    if(sub==="songs")return<SongsPanel session={session} showToast={showToast}/>
    return null
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <header style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <LogoIcon size={30}/>
          <div><div style={{color:"#fff",fontSize:15,fontWeight:800}}>{cell?.name||"Minha Célula"}</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:11}}>{roleLabel} • {session.name}</div></div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShowChangePw(true)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="key" size={15}/></button>
          <button onClick={logout} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}><Icon name="log-out" size={14}/>Sair</button>
        </div>
      </header>
      {sub==="home"?(
        <div style={{flex:1,padding:"16px 16px 80px"}}>
          {weekBirthdays.length>0&&(
            <div style={{background:`linear-gradient(135deg,${C.gold},#d4820f)`,borderRadius:16,padding:"14px 16px",marginBottom:16,boxShadow:"0 4px 16px rgba(232,146,26,0.3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{fontSize:24}}>🎂</div>
                <span style={{color:"#fff",fontSize:13,fontWeight:800}}>Aniversário esta semana!</span>
              </div>
              {weekBirthdays.map(m=>{
                const bDate=new Date(new Date().getFullYear(),parseDate(m.birth_date).getMonth(),parseDate(m.birth_date).getDate())
                const weekDays=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]
                const dayName=weekDays[bDate.getDay()]
                const dayNum=String(bDate.getDate()).padStart(2,"0")
                const monthNum=String(bDate.getMonth()+1).padStart(2,"0")
                return(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderTop:"1px solid rgba(255,255,255,0.2)"}}>
                    <Avatar name={m.name} photo={m.photo_url} size={30} color="rgba(255,255,255,0.3)"/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:"#fff",fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                      <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>{dayName}, {dayNum}/{monthNum}</div>
                    </div>
                    <button onClick={()=>setLsBdModal(m)} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4,flexShrink:0}}><Icon name="whatsapp" size={12}/>Parabéns</button>
                  </div>
                )
              })}
              {lsBdModal&&<BirthdayMessageModal member={lsBdModal} cellName={cell?.name||""} senderName={session.name} senderRole={session.role} onClose={()=>setLsBdModal(null)}/>}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <Stat label="Membros" value={cellMembers.length} color={C.primary} icon="users" sub={cellVisitors.length>0?`+ ${cellVisitors.length} visitantes`:""}/>
            <Stat label="Encontros" value={cellMeetings.length} color={C.gold} icon="meeting"/>
          </div>
          {cell?.growth_goal>0&&(
            <Card style={{marginBottom:16,border:`1px solid ${C.primary}20`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{background:C.primary+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="target" size={16} color={C.primary}/></div>
                <span style={{fontSize:14,fontWeight:800,color:C.primary}}>Meta de Crescimento</span>
              </div>
              <ProgressBar value={cellMembers.length} max={cell.growth_goal} color={C.primary}/>
              {cellVisitors.length>0&&<div style={{fontSize:11,color:C.purple,marginTop:8}}>🌱 {cellVisitors.length} visitante(s) — potencial de crescimento!</div>}
            </Card>
          )}
          {cell?.next_meeting_date&&(
            <Card style={{marginBottom:16,border:`1px solid ${C.gold}30`,background:`${C.gold}05`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{background:C.gold+"15",borderRadius:8,padding:6,display:"flex"}}><Icon name="calendar" size={16} color={C.gold}/></div>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:C.gold}}>Próximo Encontro</div>
                  <div style={{fontSize:15,fontWeight:900,color:"#0f172a"}}>{fmtDate(cell.next_meeting_date)} às {cell.time}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{cell.frequency||"Semanal"} • {cell.neighborhood}</div>
                </div>
              </div>
            </Card>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {menu.map(item=>(
              <button key={item.id} onClick={()=>setSub(item.id)} style={{background:"#fff",borderRadius:16,border:"1px solid #e8edf2",padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",transition:"all 0.15s"}}
                onMouseOver={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseOut={e=>e.currentTarget.style.transform="translateY(0)"}>
                <div style={{width:46,height:46,borderRadius:14,background:item.color+"15",display:"flex",alignItems:"center",justifyContent:"center",color:item.color,flexShrink:0}}><Icon name={item.icon} size={22}/></div>
                <div><div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{item.label}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{item.desc}</div></div>
                <div style={{marginLeft:"auto"}}><Icon name="chevron-right" size={16} color="#cbd5e1"/></div>
              </button>
            ))}
          </div>
        </div>
      ):(
        <div style={{flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:10,background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <button onClick={()=>setSub("home")} style={{background:"#f1f5f9",border:"none",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"#64748b",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600}}><Icon name="arrow-left" size={15}/>Voltar</button>
            <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{menu.find(i=>i.id===sub)?.label}</span>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 16px 80px"}}>{renderSub()}</div>
        </div>
      )}
      <ChangePasswordModal open={showChangePw} onClose={()=>setShowChangePw(false)} session={session} showToast={showToast}/>
    </div>
  )
}

function SupervisorDashboard({session,logout,showToast}){
  const[sub,setSub]=useState("home")
  const[showChangePw,setShowChangePw]=useState(false)
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:requests}=useTable("inactivation_requests")
  const{data:cellReqs}=useTable("cell_change_requests")
  const supervised=cells.filter(c=>c.supervisor_id===session.member_id||c.supervisor_id===session.id)
  const pendingCount=requests.filter(r=>r.status==="pending").length+cellReqs.filter(r=>r.status==="pending").length

  const menu=[
    {id:"cells",icon:"grid",label:"Células",desc:`${supervised.length} supervisionadas`,color:C.primary},
    {id:"requests",icon:"inbox",label:"Solicitações",desc:`${pendingCount} pendente(s)`,color:C.danger},
    {id:"messages",icon:"message",label:"Mensagens",desc:"Comunicar com líderes",color:C.purple},
    {id:"reports",icon:"bar-chart",label:"Relatórios",desc:"Visão geral",color:C.gold},
  ]

  function CellsView(){
    return(<div>
      {supervised.length===0&&<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Nenhuma célula atribuída</p></Card>}
      {supervised.map(cell=>{
        const mc=members.filter(m=>m.cell_id===cell.id&&m.status==="Membro")
        const leaders=members.filter(m=>cell.leaders_ids?.includes(m.id))
        return(<Card key={cell.id} style={{marginBottom:10}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
            <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{cell.name}</span>
            <Badge label={cell.cell_type||"Adultos"} color={C.primary}/>
            <Badge label={cell.cell_status||"Ativa"} color={cell.cell_status==="Inativa"?C.danger:C.success}/>
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{cell.neighborhood} • {cell.day} às {cell.time}</div>
          {cell.frequency&&<div style={{fontSize:11,color:C.purple,marginBottom:8}}>🔄 {cell.frequency}{cell.next_meeting_date?` • Próx: ${fmtDate(cell.next_meeting_date)}`:""}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:"#64748b",marginBottom:cell.growth_goal>0?10:0}}>
            <span>👤 <b style={{color:"#334155"}}>{leaders.length>0?leaders[0].name.split(" ")[0]:"—"}</b></span>
            <span>👥 <b style={{color:"#334155"}}>{mc.length} membros</b></span>
          </div>
          {cell.growth_goal>0&&<ProgressBar value={mc.length} max={cell.growth_goal} color={C.purple}/>}
        </Card>)
      })}
    </div>)
  }

  function renderSub(){
    if(sub==="cells")return<CellsView/>
    if(sub==="requests")return<AllRequestsPanel session={session} showToast={showToast}/>
    if(sub==="messages")return<MessagesPanel session={session} showToast={showToast}/>
    if(sub==="reports")return<ReportsPanel session={session}/>
    return null
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <header style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><LogoIcon size={30}/><div><div style={{color:"#fff",fontSize:15,fontWeight:800}}>Supervisor</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:11}}>{session.name}</div></div></div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShowChangePw(true)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="key" size={15}/></button>
          <button onClick={logout} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}><Icon name="log-out" size={14}/>Sair</button>
        </div>
      </header>
      {sub==="home"?(
        <div style={{flex:1,padding:"16px 16px 80px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            <Stat label="Células" value={supervised.length} color={C.purple} icon="grid"/>
            <Stat label="Pendências" value={pendingCount} color={C.danger} icon="inbox"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {menu.map(item=>(<button key={item.id} onClick={()=>setSub(item.id)} style={{background:"#fff",borderRadius:16,border:"1px solid #e8edf2",padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",transition:"all 0.15s"}} onMouseOver={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseOut={e=>e.currentTarget.style.transform="translateY(0)"}><div style={{width:46,height:46,borderRadius:14,background:item.color+"15",display:"flex",alignItems:"center",justifyContent:"center",color:item.color,flexShrink:0}}><Icon name={item.icon} size={22}/></div><div><div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{item.label}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{item.desc}</div></div><div style={{marginLeft:"auto"}}><Icon name="chevron-right" size={16} color="#cbd5e1"/></div></button>))}
          </div>
        </div>
      ):(
        <div style={{flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:10,background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <button onClick={()=>setSub("home")} style={{background:"#f1f5f9",border:"none",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"#64748b",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600}}><Icon name="arrow-left" size={15}/>Voltar</button>
            <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{menu.find(i=>i.id===sub)?.label}</span>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 16px 80px"}}>{renderSub()}</div>
        </div>
      )}
      <ChangePasswordModal open={showChangePw} onClose={()=>setShowChangePw(false)} session={session} showToast={showToast}/>
    </div>
  )
}

// ─── MEMBER PORTAL ────────────────────────────────────────────────────────────
function MemberPortal({session,logout,showToast}){
  const[tab,setTab]=useState("dados")
  const[showChangePw,setShowChangePw]=useState(false)
  const[commentsModal,setCommentsModal]=useState(null)
  const{data:cells}=useTable("cells")
  const{data:members}=useTable("members")
  const{data:attendanceRaw}=useTable("attendance");const attendance=dedupeAtt(attendanceRaw)
  const{data:prayers}=useTable("prayer_requests")
  const[showPrayerModal,setShowPrayerModal]=useState(false)
  const[prayerForm,setPrayerForm]=useState({request:"",is_private:false})

  const member=members.find(m=>m.id===session.member_id)
  const cell=member?cells.find(c=>c.id===member.cell_id):null
  const cellMembers=cell?members.filter(m=>m.cell_id===cell.id&&m.status==="Membro"):[]
  const leaders=cell?members.filter(m=>cell.leaders_ids?.includes(m.id)):[]
  const myAttRaw=attendance.filter(a=>a.member_id===session.member_id)
  // Deduplicate by date — keep the one with "Presente" if exists, otherwise first
  const myAttMap={}
  myAttRaw.forEach(a=>{
    if(!myAttMap[a.date]||a.status==="Presente")myAttMap[a.date]=a
  })
  const myAtt=Object.values(myAttMap).sort((a,b)=>b.date.localeCompare(a.date))
  const pct=myAtt.length?Math.round(myAtt.filter(a=>a.status==="Presente").length/myAtt.length*100):0
  const myPrayers=prayers.filter(p=>p.member_id===session.member_id)
  const{data:songs}=useTable("songs")
  const[lyricsModal,setLyricsModal]=useState(null)
  const[suggestModal,setSuggestModal]=useState(false)
  const[suggestForm,setSuggestForm]=useState({title:"",artist:"",lyrics:""})

  const{start,end}=getCurrentWeekDates()
  const weekBirthday=member?.birth_date&&(()=>{const b=parseDate(member.birth_date);const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate());return t>=start&&t<=end})()

  async function submitPrayer(){
    if(!prayerForm.request.trim()){showToast("Descreva o pedido","error");return}
    await supabase.from("prayer_requests").insert({request:prayerForm.request,is_private:prayerForm.is_private,cell_id:member?.cell_id||null,member_id:session.member_id||null,member_name:session.name,status:"pending"})
    showToast("Pedido enviado! 🙏");setShowPrayerModal(false);setPrayerForm({request:"",is_private:false})
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.darker},${C.primary})`,padding:"20px 18px 16px",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
        {weekBirthday&&<div style={{background:C.gold,borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🎂</span><span style={{color:"#fff",fontSize:13,fontWeight:700}}>Hoje é seu aniversário? Parabéns! 🎉</span></div>}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Avatar name={member?.name||session?.name||"?"} photo={member?.photo_url} size={50} color="rgba(255,255,255,0.2)"/>
            <div><div style={{color:"#fff",fontSize:16,fontWeight:800}}>{member?.name||session?.name}</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{cell?.name||"Sem célula"}</div></div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setShowChangePw(true)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:10,padding:8,cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="key" size={16}/></button>
            <button onClick={logout} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:10,padding:8,cursor:"pointer",color:"rgba(255,255,255,0.8)",display:"flex"}}><Icon name="log-out" size={16}/></button>
          </div>
        </div>
        <div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.08)",borderRadius:14,padding:3}}>
          {[["dados","Dados"],["celula","Célula"],["presenca","Presença"],["musicas","🎵"],["oracao","Oração"],["aniversario","🎂"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"8px 4px",borderRadius:12,fontSize:10,fontWeight:700,border:"none",cursor:"pointer",background:tab===id?"#fff":"transparent",color:tab===id?C.primary:"rgba(255,255,255,0.6)",transition:"all 0.15s"}}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,padding:"16px 16px 80px",overflowY:"auto"}}>
        {tab==="dados"&&member&&(
          <div>
            <Card style={{marginBottom:12}}>
              <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:14}}>Informações Pessoais</h3>
              {[["Telefone",member.phone],["E-mail",member.email],["Bairro",member.neighborhood],["Status",member.status],["Batizado",member.baptized?`✓ Sim${member.baptism_date?` (${fmtDate(member.baptism_date)})`:""}`:member.baptized===false?"✗ Não":"—"],["Nascimento",fmtDate(member.birth_date)],["Idade",ageOf(member)?`${ageOf(member)} anos`:null]].map(([k,v])=>v?(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
                  <span style={{color:"#94a3b8",fontWeight:600}}>{k}</span>
                  <span style={{color:"#334155",fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{v}</span>
                </div>
              ):null)}
            </Card>
            {(member.father_name||member.mother_name||member.spouse_name)&&(
              <Card>
                <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:12}}>Família</h3>
                {member.father_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Pai</span><span style={{color:"#334155",fontWeight:700}}>{member.father_name}</span></div>}
                {member.mother_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Mãe</span><span style={{color:"#334155",fontWeight:700}}>{member.mother_name}</span></div>}
                {member.spouse_name&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13}}><span style={{color:"#94a3b8",fontWeight:600}}>Cônjuge</span><span style={{color:"#334155",fontWeight:700}}>{member.spouse_name}</span></div>}
              </Card>
            )}
          </div>
        )}

        {tab==="celula"&&(
          <div>
            {cell?(<>
              <Card style={{marginBottom:12}}>
                <h3 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:14}}>Minha Célula</h3>
                {[["Nome",cell.name],["Tipo",cell.cell_type],["Dia",cell.day],["Horário",cell.time],["Periodicidade",cell.frequency],["Próximo encontro",fmtDate(cell.next_meeting_date)],["Bairro",cell.neighborhood],["Endereço",cell.street?`${cell.street}, ${cell.number||"s/n"}`:"—"],["Membros",cellMembers.length.toString()],["Início",fmtDate(cell.started_at)]].map(([k,v])=>v&&v!=="—"?(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
                    <span style={{color:"#94a3b8",fontWeight:600}}>{k}</span>
                    <span style={{color:"#334155",fontWeight:700,textAlign:"right"}}>{v}</span>
                  </div>
                ):null)}
              </Card>

              {leaders.length>0&&(
                <Card style={{marginBottom:12,border:`1px solid ${C.primary}20`,background:`${C.primary}04`}}>
                  <h3 style={{fontSize:14,fontWeight:800,color:C.primary,marginBottom:12}}>👤 Meu Líder</h3>
                  {leaders.map(leader=>(
                    <div key={leader.id} style={{display:"flex",alignItems:"center",gap:12}}>
                      <Avatar name={leader.name} photo={leader.photo_url} size={44} color={C.primary}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{leader.name}</div>
                        <div style={{fontSize:12,color:"#64748b"}}>Líder</div>
                      </div>
                      {leader.phone&&<a href={whatsappLink(leader.phone)} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:700,color:"#166534",textDecoration:"none"}}><Icon name="whatsapp" size={15}/>Contato</a>}
                    </div>
                  ))}
                </Card>
              )}

              {cell.growth_goal>0&&(
                <Card style={{border:`1px solid ${C.gold}30`}}>
                  <h3 style={{fontSize:14,fontWeight:800,color:C.gold,marginBottom:12}}>🎯 Meta de Crescimento</h3>
                  <ProgressBar value={cellMembers.length} max={cell.growth_goal} color={C.gold}/>
                  <p style={{fontSize:12,color:"#64748b",marginTop:10,textAlign:"center",marginBottom:0}}>A célula quer chegar em {cell.growth_goal} membros. Convide alguém! 🙌</p>
                </Card>
              )}
            </>):(<Card><p style={{color:"#94a3b8",textAlign:"center",margin:0}}>Você não está em nenhuma célula</p></Card>)}
          </div>
        )}

        {tab==="presenca"&&(
          <div>
            {myAtt.length>0&&(
              <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.primary}08,${C.primary}15)`,border:`1px solid ${C.primary}20`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:800,color:C.primary}}>Minha Frequência</span>
                  <span style={{fontSize:24,fontWeight:900,color:pct>=75?C.success:pct>=50?C.warning:C.danger}}>{pct}%</span>
                </div>
                <div style={{height:10,background:"rgba(255,255,255,0.5)",borderRadius:5,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct>=75?C.success:pct>=50?C.warning:C.danger,borderRadius:5,transition:"width 0.6s"}}/>
                </div>
                <div style={{fontSize:12,color:C.primary,marginTop:8}}>{myAtt.filter(a=>a.status==="Presente").length} presenças de {myAtt.length} encontros</div>
              </Card>
            )}
            {myAtt.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:48,marginBottom:12}}>📅</div><p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>Nenhum encontro registrado</p></div>}
            {myAtt.map(a=>{
              const sc=a.status==="Presente"?C.success:a.status==="Ausente"?C.danger:C.warning
              const si=a.status==="Presente"?"✓":a.status==="Ausente"?"✗":"?"
              return(
                <Card key={a.id} style={{marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:sc+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:sc,flexShrink:0}}>{si}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{fmtDate(a.date)}</div>
                      {a.theme&&<div style={{fontSize:11,color:"#94a3b8"}}>📖 {a.theme}</div>}
                      {a.preacher&&<div style={{fontSize:11,color:"#94a3b8"}}>🎤 {a.preacher}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <Badge label={a.status} color={sc}/>
                      {a.status==="Presente"&&(<button onClick={()=>setCommentsModal({date:a.date,cellId:a.cell_id})} style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"3px 8px",cursor:"pointer",color:C.success,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3}}><Icon name="comment" size={11}/>Comentar</button>)}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {tab==="musicas"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <h3 style={{fontSize:16,fontWeight:800,color:"#0f172a",margin:0}}>🎵 Repertório</h3>
              <Btn icon="plus" size="sm" variant="gold" onClick={()=>setSuggestModal(true)}>Sugerir</Btn>
            </div>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>Músicas aprovadas para a célula</p>
            {songs.filter(s=>(s.status||"approved")==="approved").length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:48,marginBottom:12}}>🎵</div>
                <p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>Nenhuma música no repertório ainda</p>
              </div>
            )}
            {songs.filter(s=>(s.status||"approved")==="approved").map(s=>(
              <Card key={s.id} style={{marginBottom:10,borderLeft:`3px solid ${C.primary}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:12,background:C.primary+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:C.primary}}>
                    <Icon name="music" size={18}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                    {s.artist&&<div style={{fontSize:12,color:"#94a3b8"}}>{s.artist}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {s.lyrics&&<button onClick={()=>setLyricsModal(s)} style={{background:C.gold+"15",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.gold,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Icon name="music" size={13}/>Letra</button>}
                    {s.link&&<a href={s.link} target="_blank" rel="noopener noreferrer" style={{background:C.primary+"15",borderRadius:8,padding:7,display:"flex",color:C.primary,textDecoration:"none"}}><Icon name="link" size={14}/></a>}
                  </div>
                </div>
              </Card>
            ))}

            {lyricsModal&&(
              <Modal open title={`🎵 ${lyricsModal.title}`} onClose={()=>setLyricsModal(null)}>
                {lyricsModal.artist&&<p style={{fontSize:13,color:"#94a3b8",fontWeight:600,marginBottom:16}}>{lyricsModal.artist}</p>}
                <div style={{background:"#f8fafc",borderRadius:14,padding:"16px 18px",border:"1px solid #e8edf2",maxHeight:400,overflowY:"auto"}}>
                  <pre style={{fontSize:14,color:"#334155",lineHeight:1.9,fontFamily:"'Outfit',sans-serif",whiteSpace:"pre-wrap",margin:0}}>{lyricsModal.lyrics}</pre>
                </div>
                {lyricsModal.link&&<a href={lyricsModal.link} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:C.primary,borderRadius:12,padding:"11px",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:700,marginTop:14}}><Icon name="link" size={15}/>Ouvir música</a>}
              </Modal>
            )}

            <Modal open={suggestModal} onClose={()=>{setSuggestModal(false);setSuggestForm({title:"",artist:"",lyrics:""})}} title="Sugerir Música 🎵">
              <p style={{fontSize:13,color:"#64748b",marginBottom:14}}>Sua sugestão será enviada para aprovação do líder.</p>
              <Inp label="Nome da Música *" value={suggestForm.title} onChange={v=>setSuggestForm(p=>({...p,title:v}))} required placeholder="Ex: Não Desista de Você"/>
              <Inp label="Cantor / Ministério *" value={suggestForm.artist} onChange={v=>setSuggestForm(p=>({...p,artist:v}))} required placeholder="Ex: Ministério Zoe"/>
              <Textarea label="Letra *" value={suggestForm.lyrics} onChange={v=>setSuggestForm(p=>({...p,lyrics:v}))} placeholder="Cole a letra completa aqui..." rows={6}/>
              <Btn full variant="gold" onClick={async()=>{
                if(!suggestForm.title.trim()||!suggestForm.artist.trim()||!suggestForm.lyrics.trim()){showToast("Nome, cantor e letra são obrigatórios","error");return}
                await supabase.from("songs").insert({title:suggestForm.title.trim(),artist:suggestForm.artist.trim(),lyrics:suggestForm.lyrics.trim(),link:"",status:"pending",created_by:session.id,created_by_name:session.name})
                showToast("Sugestão enviada! O líder irá avaliar 🎵")
                setSuggestModal(false);setSuggestForm({title:"",artist:"",lyrics:""})
              }}>Enviar Sugestão</Btn>
            </Modal>
          </div>
        )}

        {tab==="aniversario"&&(
          <div>
            <h3 style={{fontSize:16,fontWeight:800,color:"#0f172a",marginBottom:6}}>🎂 Aniversariantes</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>Pessoas da sua célula que estão de parabéns!</p>

            {/* SEMANA */}
            {(()=>{
              const{start,end}=getCurrentWeekDates()
              const allCellPeople=[...cellMembers,...cellVisitors]
              const weekBdays=allCellPeople.filter(m=>{
                if(!m.birth_date)return false
                const b=parseDate(m.birth_date)
                const t=new Date(new Date().getFullYear(),b.getMonth(),b.getDate())
                return t>=start&&t<=end
              })
              const weekDays=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]
              return(
                <div style={{marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:4,height:20,background:C.gold,borderRadius:2}}/>
                    <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Esta Semana</span>
                    {weekBdays.length>0&&<span style={{background:C.gold,color:"#fff",fontSize:11,fontWeight:700,padding:"1px 8px",borderRadius:10}}>{weekBdays.length}</span>}
                  </div>
                  {weekBdays.length===0&&(
                    <div style={{background:"#f8fafc",borderRadius:14,padding:"20px",textAlign:"center",border:"1px solid #f1f5f9"}}>
                      <div style={{fontSize:32,marginBottom:8}}>🎂</div>
                      <p style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>Nenhum aniversariante esta semana</p>
                    </div>
                  )}
                  {weekBdays.map(m=>{
                    const bDate=new Date(new Date().getFullYear(),parseDate(m.birth_date).getMonth(),parseDate(m.birth_date).getDate())
                    const dayName=weekDays[bDate.getDay()]
                    const dayNum=String(bDate.getDate()).padStart(2,"0")
                    const monthNum=String(bDate.getMonth()+1).padStart(2,"0")
                    const firstName=m.name.split(" ")[0]
                    const msg=`Olá ${firstName}! 🎂🎉 A Célula ${cell?.name} te deseja um feliz aniversário! Que Deus abençoe muito a sua vida. Parabéns! 🙏❤️`
                    const wppLink=m.phone?`https://wa.me/55${m.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`:null
                    const isToday=bDate.toDateString()===new Date().toDateString()
                    return(
                      <Card key={m.id} style={{marginBottom:10,border:`1.5px solid ${isToday?C.gold:"#fde68a"}`,background:isToday?"#fffbeb":"#fffef5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <Avatar name={m.name} photo={m.photo_url} size={46} color={C.gold}/>
                          <div style={{flex:1,minWidth:0}}>
                            {isToday&&<div style={{fontSize:10,fontWeight:800,color:C.gold,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>🎉 Hoje!</div>}
                            <div style={{fontSize:14,fontWeight:800,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                            <div style={{fontSize:12,color:"#92400e",fontWeight:600}}>{isToday?"Parabéns! 🎂":`${dayName}, ${dayNum}/${monthNum}`}</div>
                            {ageTurning(m.birth_date)&&<div style={{fontSize:11,color:"#b45309"}}>Completa {ageTurning(m.birth_date)} anos</div>}
                          </div>
                          {wppLink&&(
                            <a href={wppLink} target="_blank" rel="noopener noreferrer" style={{background:"#25d366",borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:5,color:"#fff",textDecoration:"none",fontSize:12,fontWeight:700,flexShrink:0}}>
                              <Icon name="whatsapp" size={14}/>Parabéns
                            </a>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )
            })()}

            {/* MÊS */}
            {(()=>{
              const currentMonth=getCurrentMonth()
              const monthNames=["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
              const monthBdays=[...cellMembers,...cellVisitors].filter(m=>m.birth_date&&getMonthBirthday(m.birth_date)===currentMonth)
                .sort((a,b)=>parseDate(a.birth_date).getDate()-parseDate(b.birth_date).getDate())
              return(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:4,height:20,background:C.primary,borderRadius:2}}/>
                    <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Todo o Mês de {monthNames[currentMonth]}</span>
                    {monthBdays.length>0&&<span style={{background:C.primary,color:"#fff",fontSize:11,fontWeight:700,padding:"1px 8px",borderRadius:10}}>{monthBdays.length}</span>}
                  </div>
                  {monthBdays.length===0&&(
                    <div style={{background:"#f8fafc",borderRadius:14,padding:"20px",textAlign:"center",border:"1px solid #f1f5f9"}}>
                      <p style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>Nenhum aniversariante este mês</p>
                    </div>
                  )}
                  {monthBdays.map(m=>{
                    const bDate=parseDate(m.birth_date)
                    const dayNum=String(bDate.getDate()).padStart(2,"0")
                    const firstName=m.name.split(" ")[0]
                    const msg=`Olá ${firstName}! 🎂🎉 A Célula ${cell?.name} te deseja um feliz aniversário! Que Deus abençoe muito a sua vida. Parabéns! 🙏❤️`
                    const wppLink=m.phone?`https://wa.me/55${m.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`:null
                    const{start,end}=getCurrentWeekDates()
                    const thisYear=new Date(new Date().getFullYear(),bDate.getMonth(),bDate.getDate())
                    const isThisWeek=thisYear>=start&&thisYear<=end
                    return(
                      <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:"1px solid #f1f5f9"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:C.primary+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:14,fontWeight:900,color:C.primary}}>{dayNum}</span>
                        </div>
                        <Avatar name={m.name} photo={m.photo_url} size={34} color={C.primary}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{isThisWeek?"🎉 Esta semana!":fmtDate(m.birth_date)}{ageTurning(m.birth_date)?` • ${ageTurning(m.birth_date)} anos`:""}</div>
                        </div>
                        {wppLink&&(
                          <a href={wppLink} target="_blank" rel="noopener noreferrer" style={{background:"#dcfce7",borderRadius:8,padding:"5px 8px",display:"flex",alignItems:"center",gap:4,color:"#166534",textDecoration:"none",fontSize:11,fontWeight:700,flexShrink:0}}>
                            <Icon name="whatsapp" size={12}/>Wish
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {tab==="oracao"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontSize:16,fontWeight:800,color:"#0f172a",margin:0}}>Pedidos de Oração 🙏</h3>
              <Btn icon="plus" size="sm" variant="gold" onClick={()=>setShowPrayerModal(true)}>Novo</Btn>
            </div>
            {myPrayers.length===0&&(<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:48,marginBottom:12}}>🙏</div><p style={{color:"#94a3b8",fontSize:14,fontWeight:600}}>Você não tem pedidos de oração</p><Btn variant="gold" onClick={()=>setShowPrayerModal(true)} style={{marginTop:8}}>Fazer um Pedido</Btn></div>)}
            {myPrayers.map(p=>(
              <Card key={p.id} style={{marginBottom:10,borderLeft:`3px solid ${p.status==="prayed"?C.success:C.gold}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{fmtDate(p.created_at?.split("T")[0])}</span>
                  <div style={{display:"flex",gap:4}}>
                    <Badge label={p.status==="prayed"?"✓ Orado":"Aguardando"} color={p.status==="prayed"?C.success:C.gold}/>
                    {p.is_private&&<Badge label="🔒" color="#64748b"/>}
                  </div>
                </div>
                <p style={{fontSize:13,color:"#334155",margin:0,lineHeight:1.55,background:"#f8fafc",borderRadius:10,padding:"10px 12px"}}>{p.request}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showPrayerModal} onClose={()=>setShowPrayerModal(false)} title="Novo Pedido de Oração">
        <div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:40}}>🙏</div></div>
        <Textarea label="Seu Pedido" value={prayerForm.request} onChange={v=>setPrayerForm(p=>({...p,request:v}))} placeholder="Compartilhe seu pedido..." rows={4}/>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:12,marginBottom:16}}>
          <input type="checkbox" checked={prayerForm.is_private} onChange={e=>setPrayerForm(p=>({...p,is_private:e.target.checked}))} style={{width:16,height:16,accentColor:C.primary}}/>
          <div><div style={{fontSize:13,fontWeight:700,color:"#334155"}}>🔒 Pedido Privado</div><div style={{fontSize:11,color:"#94a3b8"}}>Somente líderes poderão ver</div></div>
        </label>
        <Btn full onClick={submitPrayer} variant="gold">Enviar Pedido 🙏</Btn>
      </Modal>

      {commentsModal&&<CommentsModal date={commentsModal.date} cellId={commentsModal.cellId} session={session} showToast={showToast} onClose={()=>setCommentsModal(null)}/>}
      <ChangePasswordModal open={showChangePw} onClose={()=>setShowChangePw(false)} session={session} showToast={showToast}/>
    </div>
  )
}
