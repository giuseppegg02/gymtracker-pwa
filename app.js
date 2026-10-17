/* GymTracker — applicazione principale.
   Dipende da analytics.js (GTA: schema/migrazione + metriche) e Chart.js (vendorizzato). */
'use strict';
const $=s=>document.querySelector(s),app=$('#app'),hd=$('#hd');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=m=>{const t=$('#t');t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display='none',2600)};
const L=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const S=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{toast('Salvataggio non riuscito: spazio o permessi del browser')}};
const dropDraft=()=>{draft=null;localStorage.removeItem('gt_draft')};
const fmtD=iso=>new Date(iso).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'2-digit'});
const fmtDT=iso=>new Date(iso).toLocaleString('it-IT',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
const fmtKg=n=>Math.round(n).toLocaleString('it-IT');
const fa=iso=>{const d=Math.floor((Date.now()-new Date(iso))/86400000);return d<=0?'oggi':d===1?'ieri':d+' giorni fa'};
const setT=s=>(s.kg||'BW')+'×'+s.reps;
const signed=n=>(n>0?'+':'')+n;
const pctTag=p=>p==null?'—':`<span class="delta ${p>0?'up':p<0?'down':''}">${signed(p)}%</span>`;
const kpi=(v,l)=>`<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
const back='<button class="btn g" data-act="back" aria-label="Indietro">←</button>';
let sc,raw,rawCustom=false,log=[],draft,tick,deferred,selEx=null,histMetric='e1rm',histName='';

/* ---- scheda: sessioni con sections/exercises + scienza ---- */
function normalize(r){
  const sessions=Object.entries(r).filter(([,v])=>v&&Array.isArray(v.sections)).map(([id,s])=>({
    id,label:s.label||id,focus:s.focus||'',note:s.note||'',
    sections:s.sections.map(sec=>({title:sec.title||'',exercises:sec.exercises.flatMap(ex=>{
      const names=String(ex.name).split(' + ').map(x=>x.trim());
      const sets=parseInt((ex.detail||'').match(/^(\d+)\s*×/)?.[1])||3;
      return names.map(n=>({name:n,id:ex.id&&names.length===1?String(ex.id):GTA.slug(n),sets,detail:ex.detail||'',desc:ex.desc||'',badge:ex.badge||'',color:ex.color||'',
        ss:names.length>1?names.filter(x=>x!==n).join(' + '):''}));
    })}))
  }));
  if(!sessions.length)throw Error('nessuna sessione trovata nel file');
  return{sessions,sci:Array.isArray(r.scienza)?r.scienza:[]};
}
const badgeMap={};
function rebuildBadgeMap(){for(const k of Object.keys(badgeMap))delete badgeMap[k];for(const s of sc.sessions)for(const sec of s.sections)for(const e of sec.exercises)badgeMap[e.id]={badge:e.badge||'',color:e.color||''}}
const badgeOf=id=>(badgeMap[id]||{}).badge||'';
const badgeColor=id=>(badgeMap[id]||{}).color||'';
/* Ultima performance registrata per l'id stabile di un esercizio (log ordinato per data desc). */
const prev=ex=>{for(const w of log){const e=w.exercises.find(e=>e.id===ex.id);if(e)return e.sets}return null};
const rows=ex=>draft.sets[ex.name]||(draft.sets[ex.name]=Array.from({length:ex.sets},()=>({kg:'',reps:'',ok:false})));

/* ---- grafici (Chart.js, con destroy a ogni cambio vista) ---- */
let charts=[];
function destroyCharts(){for(const c of charts){try{c.destroy()}catch{}}charts=[]}
const theme=()=>{const cs=getComputedStyle(document.documentElement);return{
  ac:cs.getPropertyValue('--ac').trim()||'#2E7D6B',mu:cs.getPropertyValue('--mu').trim()||'#5B706A',
  line:cs.getPropertyValue('--line').trim()||'#D5E2DD',tx:cs.getPropertyValue('--tx').trim()||'#14231F'}};
const BCOL={Legs:'#7CB342',Push:'#E8A33D',Pull:'#2E9E86',Altro:'#9AA5A0'};
function mkChart(id,cfg){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  try{charts.push(new Chart(el.getContext('2d'),cfg))}catch(e){console.warn('grafico',id,e)}
}
const baseOpts=()=>{const t=theme();return{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtKg(c.parsed.y!=null?c.parsed.y:c.parsed)+' kg'}}},
  scales:{x:{ticks:{color:t.mu,maxTicksLimit:8},grid:{display:false}},y:{ticks:{color:t.mu,callback:v=>fmtKg(v)},grid:{color:t.line}}}}};
function chTonnage(pts){
  const t=theme();
  mkChart('chTonnage',{type:'line',data:{labels:pts.map(p=>fmtD(p.date)),datasets:[{data:pts.map(p=>Math.round(p.ton)),borderColor:t.ac,backgroundColor:t.ac+'26',fill:true,tension:.25,pointRadius:2.5}]},options:baseOpts()});
}
function chWeekly(buckets){
  const t=theme();
  mkChart('chWeekly',{type:'bar',data:{labels:buckets.map(b=>b.weekStart.slice(8)+'/'+b.weekStart.slice(5,7)),datasets:[{data:buckets.map(b=>Math.round(b.tonnage)),backgroundColor:t.ac+'CC',borderRadius:4}]},options:baseOpts()});
}
function chSplit(split){
  const t=theme();
  const keys=Object.keys(split).sort((a,b)=>split[b].tonnage-split[a].tonnage);
  mkChart('chSplit',{type:'doughnut',data:{labels:keys,datasets:[{data:keys.map(k=>Math.round(split[k].tonnage)),backgroundColor:keys.map(k=>BCOL[k]||BCOL.Altro),borderColor:t.line,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{color:t.mu,boxWidth:12}},tooltip:{callbacks:{label:c=>c.label+': '+fmtKg(c.parsed)+' kg'}}}}});
}
function chEx(series){
  const t=theme();
  mkChart('chEx',{type:'line',data:{labels:series.map(s=>fmtD(s.date)),datasets:[
    {label:'1RM stimato',data:series.map(s=>Math.round(s.e1RM)),borderColor:t.ac,backgroundColor:t.ac+'26',fill:true,tension:.25,pointRadius:2.5},
    {label:'Carico massimo',data:series.map(s=>s.maxKg),borderColor:t.mu,borderDash:[5,4],tension:.25,pointRadius:0}]},
    options:{...baseOpts(),plugins:{legend:{display:true,labels:{color:t.mu,boxWidth:12}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtKg(c.parsed.y)+' kg'}}}}});
}
function chHist(series,metric){
  const t=theme();
  const val=s=>metric==='kg'?s.maxKg:metric==='ton'?s.tonnage:s.e1RM;
  const lbl=metric==='kg'?'Carico massimo':metric==='ton'?'Tonnellaggio':'1RM stimato';
  mkChart('chHist',{type:'line',data:{labels:series.map(s=>fmtD(s.date)),datasets:[{label:lbl,data:series.map(s=>Math.round(val(s))),borderColor:t.ac,backgroundColor:t.ac+'26',fill:true,tension:.25,pointRadius:2.5}]},options:baseOpts()});
}

/* ---- viste ---- */
function home(){
  hd.innerHTML='<h1>GymTracker</h1><button class="btn g" data-go="#/menu" aria-label="Impostazioni">☰</button>';
  let h='';
  if(draft){const s=sc.sessions.find(s=>s.id===draft.sid);
    h+=`<div class="card hl"><b>Allenamento in corso</b><div class="mu">${esc(s?s.label:draft.sid)}</div><div class="row" style="margin-top:10px"><button class="btn" data-go="#/w/${encodeURIComponent(draft.sid)}">Riprendi</button><button class="btn g" data-act="drop">Scarta</button></div></div>`}
  const w=GTA.lastWorkout(log);
  if(w){const st=GTA.sessionStats(w,badgeOf);
    h+=`<div class="card last"><div class="row"><b>Ultimo allenamento</b><span class="mu" style="margin-left:auto">${fa(w.date)}</span></div>
<div style="font-size:17px;font-weight:700;margin-top:2px">${esc(w.sessionLabel)}</div>
<div class="mu">${fmtDT(w.date)} · ${w.durationMin} min · ${st.sets} serie · ${st.exercises} esercizi · ${fmtKg(st.tonnage)} kg</div>
<div class="row" style="margin-top:10px"><button class="btn" data-go="#/s/${encodeURIComponent(w.id)}">Dettaglio</button><button class="btn g" data-go="#/stats">Analisi</button></div></div>`}
  for(const s of sc.sessions){const n=log.filter(w=>w.sessionId===s.id),l=n[0];
    h+=`<div class="card"><b style="font-size:17px">${esc(s.label)}</b><div class="mu">${esc(s.focus)}</div><div class="mu" style="margin:8px 0">${l?'Ultima volta il '+fmtD(l.date)+' ('+n.length+(n.length===1?' seduta':' sedute')+')':'Non ancora eseguita'}</div><button class="btn" data-act="start" data-sid="${esc(s.id)}">Inizia ${esc(s.label)}</button></div>`}
  h+='<div class="row" style="margin-top:4px"><button class="btn g" style="flex:1" data-go="#/stats">Analisi allenamento</button><button class="btn g" style="flex:1" data-go="#/sci">Note scientifiche</button></div>';
  app.innerHTML=h;
}
function workout(sid){
  const s=sc.sessions.find(x=>x.id===sid);
  if(!s||!draft||draft.sid!==sid)return location.replace('#/');
  hd.innerHTML=`${back}<h1>${esc(s.label)} <span class="mu" id="clk"></span></h1><button class="btn" data-act="finish">Termina</button>`;
  let h='';
  for(const sec of s.sections){
    h+=`<div class="sec">${esc(sec.title)}</div>`;
    for(const ex of sec.exercises){
      const r=rows(ex),p=prev(ex);
      h+=`<div class="card"><div class="row"><b style="flex:1">${esc(ex.name)}</b><span class="bd b-${esc(ex.color)}">${esc(ex.badge)}</span><button class="btn g s" data-go="#/h/${encodeURIComponent(ex.name)}" aria-label="Storico">📈</button></div>
<div class="mu">${esc(ex.detail)}</div>${ex.ss?`<div class="mu">Superset con ${esc(ex.ss)}</div>`:''}${p?`<div class="mu">Ultima volta: ${p.map(setT).join('  ')}</div>`:''}
${r.map((x,i)=>{const q=p&&(p[i]||p[p.length-1])||{};
return `<div class="set${x.ok?' ok':''}" data-ex="${esc(ex.name)}" data-i="${i}"><span class="mu">${i+1}</span><input inputmode="decimal" data-f="kg" aria-label="kg" placeholder="${esc(q.kg??'kg')}" value="${esc(x.kg)}"><input inputmode="numeric" data-f="reps" aria-label="ripetizioni" placeholder="${esc(q.reps??'rip')}" value="${esc(x.reps)}"><button class="ck" data-act="ck" aria-label="Fatta">✓</button></div>`}).join('')}
<div class="row" style="margin-top:10px"><button class="btn g s" data-act="add" data-ex="${esc(ex.name)}">+ serie</button><button class="btn g s" data-act="del" data-ex="${esc(ex.name)}">− serie</button></div>
<details><summary>Descrizione tecnica</summary><div class="mu">${esc(ex.desc)}</div></details></div>`;
    }
  }
  app.innerHTML=h;clock();
}
function clock(){
  clearInterval(tick);
  const f=()=>{const e=$('#clk');if(!e||!draft)return clearInterval(tick);e.textContent=Math.floor((Date.now()-draft.start)/60000)+' min'};
  f();tick=setInterval(f,15000);
}
function hist(name){
  histName=name;
  hd.innerHTML=`${back}<h1>${esc(name)}</h1>`;
  const series=GTA.exerciseSeries(log,GTA.slug(name),name);
  if(!series.length){app.innerHTML='<p class="mu">Nessun dato registrato per questo esercizio.</p>';return}
  const pr=GTA.exercisePR(series);
  const seg=[['kg','Carico max'],['e1rm','1RM stimato'],['ton','Tonnellaggio']]
    .map(([k,l])=>`<button class="btn g s${histMetric===k?' on':''}" data-act="hm" data-m="${k}">${l}</button>`).join('');
  app.innerHTML=`<div class="card"><div class="seg">${seg}</div><div class="chart"><canvas id="chHist"></canvas></div>
<div class="kpis">${kpi(fmtKg(pr.bestKg.maxKg)+' kg','miglior carico')}${kpi(fmtKg(pr.bestE1.e1RM)+' kg','miglior 1RM')}${kpi(pr.sessions,'sedute')}${kpi(pr.deltaKg==null?'—':signed(pr.deltaKg)+' kg','ultima vs prec.')}</div>
<div class="mu" style="margin-top:8px">Serie migliore: ${fmtD(pr.bestKg.date)} · Miglior 1RM: ${fmtD(pr.bestE1.date)}</div></div>`+
    [...series].reverse().map(s=>`<div class="card"><b>${fmtD(s.date)}</b> <span class="mu">${esc(s.label)}</span><div style="margin-top:4px;font-variant-numeric:tabular-nums">${s.sets} serie · max ${fmtKg(s.maxKg)} kg · 1RM ${fmtKg(s.e1RM)} kg · ${fmtKg(s.tonnage)} kg</div></div>`).join('');
  chHist(series,histMetric);
}
function detail(id){
  const w=log.find(x=>String(x.id)===String(id));
  if(!w)return location.replace('#/');
  const st=GTA.sessionStats(w,badgeOf);
  const cmp=GTA.compareSessions(log,w.sessionId);
  const isLast=cmp&&cmp.last&&String(cmp.last.id)===String(w.id);
  hd.innerHTML=`${back}<h1>${esc(w.sessionLabel)}</h1>`;
  let h=`<div class="card"><b style="font-size:17px">${fmtDT(w.date)}</b><div class="mu">${fa(w.date)}</div>
<div class="kpis">${kpi(st.sets,'serie')}${kpi(st.exercises,'esercizi')}${kpi(w.durationMin,'minuti')}${kpi(fmtKg(st.tonnage),'kg totali')}</div>
${isLast&&cmp.delta?`<div class="mu" style="margin-top:8px">Vs seduta precedente: ${pctTag(cmp.delta.tonnagePct)} tonnellaggio · ${signed(cmp.delta.sets)} serie · ${signed(cmp.delta.durationMin)} min</div>`:''}</div>`;
  for(const e of w.exercises){
    const bestE=Math.max(0,...e.sets.map(s=>GTA.e1rm(s.kg,s.reps)));
    h+=`<div class="card"><div class="row"><b style="flex:1">${esc(e.name)}</b><span class="bd b-${esc(badgeColor(e.id))}">${esc(badgeOf(e.id)||'Altro')}</span></div>
<div class="ex-h mu">${e.sets.length} serie · ${fmtKg(GTA.tonnageOfSets(e.sets))} kg · 1RM ${bestE?fmtKg(bestE)+' kg':'—'}</div>
<div class="ex-h" style="margin-top:4px">${e.sets.map(setT).join('  ')}</div></div>`;
  }
  app.innerHTML=h;
}
function analysis(){
  destroyCharts();
  hd.innerHTML=`${back}<h1>Analisi allenamento</h1>`;
  if(!log.length){app.innerHTML='<p class="mu">Nessun allenamento salvato: inizia una sessione dalla home per vedere l\'analisi.</p>';return}
  const last=GTA.lastWorkout(log),f=GTA.frequency(log);
  const pts=[...log].reverse().map(w=>({date:w.date,ton:GTA.sessionStats(w,badgeOf).tonnage}));
  const weekly=GTA.weeklyBuckets(log,12);
  const split={};
  for(const w of log){const st=GTA.sessionStats(w,badgeOf);
    for(const[b,v] of Object.entries(st.byBadge)){split[b]=split[b]||{tonnage:0,sets:0};split[b].tonnage+=v.tonnage;split[b].sets+=v.sets}}
  const cmps=sc.sessions.map(s=>({label:s.label,c:GTA.compareSessions(log,s.id)})).filter(x=>x.c);
  const exs=GTA.uniqueExercises(log);
  if(!selEx||!exs.some(e=>e.id===selEx))selEx=exs.length?exs[0].id:null;
  const series=GTA.exerciseSeries(log,selEx);
  const pr=GTA.exercisePR(series);
  const splitKeys=Object.keys(split).sort((a,b)=>split[b].tonnage-split[a].tonnage);
  let h=`<div class="card last"><div class="row"><b>Ultimo allenamento</b><span class="mu" style="margin-left:auto">${fa(last.date)}</span></div>
<div style="font-size:17px;font-weight:700;margin-top:2px">${esc(last.sessionLabel)}</div>
<div class="mu">${fmtDT(last.date)}</div>
<div class="row" style="margin-top:10px"><button class="btn" data-go="#/s/${encodeURIComponent(last.id)}">Dettaglio</button></div></div>
<div class="card"><b>Frequenza</b><div class="kpis">${kpi(f.thisWeek,'questa sett.')}${kpi(f.last4,'ultime 4 sett.')}${kpi(f.streak,'streak (settimane)')}${kpi(f.daysSinceLast==null?'—':f.daysSinceLast,'giorni fa')}</div>
<div class="mu" style="margin-top:8px">Media ${String(f.avgPerWeek).replace('.',',')} allenamenti a settimana nelle ultime 4 settimane.</div></div>
<div class="card"><b>Tonnellaggio per seduta</b><div class="mu">kg × ripetizioni totali di ogni allenamento</div><div class="chart"><canvas id="chTonnage"></canvas></div></div>
<div class="card"><b>Volume settimanale</b><div class="mu">Tonnellaggio totale delle ultime 12 settimane</div><div class="chart"><canvas id="chWeekly"></canvas></div></div>
<div class="card"><b>Split per gruppo muscolare</b><div class="mu">Tonnellaggio storico per badge (${splitKeys.map(k=>esc(k)).join(' · ')})</div><div class="chart"><canvas id="chSplit"></canvas></div></div>`;
  for(const{x,label,c}of cmps){
    h+=`<div class="card"><b>${esc(label)}</b>
<div class="lst"><span>Ultima · ${fmtD(c.last.date)}</span><span>${fmtKg(c.lastStats.tonnage)} kg · ${c.lastStats.sets} serie · ${c.lastStats.durationMin} min</span></div>
${c.prev?`<div class="lst"><span>Precedente · ${fmtD(c.prev.date)}</span><span>${fmtKg(c.prevStats.tonnage)} kg · ${c.prevStats.sets} serie · ${c.prevStats.durationMin} min</span></div>`:''}
<div class="mu" style="margin-top:6px">${c.delta?`Vs precedente: ${pctTag(c.delta.tonnagePct)} tonnellaggio · ${signed(c.delta.sets)} serie · ${signed(c.delta.durationMin)} min`:'Prima seduta registrata per questa sessione.'}</div></div>`;
  }
  h+=`<div class="card"><b>Progressione per esercizio</b>
<select id="exsel" aria-label="Esercizio">${exs.map(e=>`<option value="${esc(e.id)}"${e.id===selEx?' selected':''}>${esc(e.name)}</option>`).join('')}</select>
<div class="chart"><canvas id="chEx"></canvas></div>
${pr?`<div class="kpis">${kpi(fmtKg(pr.bestKg.maxKg)+' kg','miglior carico')}${kpi(fmtKg(pr.bestE1.e1RM)+' kg','miglior 1RM')}${kpi(pr.sessions,'sedute')}${kpi(pr.deltaE1RM==null?'—':pctTag(pr.deltaE1RM),'1RM ultima/prec.')}</div>
<div class="mu" style="margin-top:8px">Ultima seduta: ${fmtD(pr.last.date)} · ${pr.last.sets} serie · ${fmtKg(pr.last.tonnage)} kg</div>`:'<p class="mu">Nessun dato.</p>'}</div>`;
  app.innerHTML=h;
  chTonnage(pts);chWeekly(weekly);chSplit(split);if(series.length)chEx(series);
}
function sci(){
  hd.innerHTML=`${back}<h1>Note scientifiche</h1>`;
  app.innerHTML=sc.sci.length?sc.sci.map(s=>`<div class="card"><b>${esc(s.title)}</b><div class="mu" style="font-size:14px;margin-top:6px">${esc(s.body)}</div></div>`).join(''):'<p class="mu">Questa scheda non contiene note.</p>';
}
async function menu(){
  hd.innerHTML=`${back}<h1>Impostazioni</h1>`;
  const p=navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():null;
  app.innerHTML=`<div class="card"><b>Dati</b><div class="mu">${log.length} allenamenti salvati su questo dispositivo, nel browser di questo indirizzo. Archiviazione protetta dalla pulizia automatica: ${p===null?'non disponibile':p?'sì':'no'}. Esporta un backup ogni tanto (formato v2, vedi SCHEMA.md).</div><div class="col"><button class="btn" data-act="exp">Esporta backup</button><button class="btn g" data-act="imp">Ripristina backup</button></div></div>
<div class="card"><b>Scheda</b><div class="mu">Importa un file .json o .jsx con la stessa struttura di quella attuale. Lo storico è legato all'id stabile dell'esercizio (in assenza, dal nome).</div><div class="col"><button class="btn g" data-act="sch">Importa scheda</button><button class="btn g" data-act="def">Torna alla scheda originale</button></div></div>${deferred?'<button class="btn" style="width:100%" data-act="inst">Installa app</button>':''}`;
}

/* ---- azioni ---- */
function start(sid){
  if(draft&&draft.sid!==sid&&!confirm('Hai un allenamento in corso. Scartarlo e iniziare questa sessione?'))return;
  if(!draft||draft.sid!==sid){draft={sid,start:Date.now(),sets:{}};S('gt_draft',draft)}
  location.hash='#/w/'+encodeURIComponent(sid);
}
function finish(){
  const exercises=[];let n=0;
  for(const [name,v] of Object.entries(draft.sets)){
    const sets=v.map(x=>({kg:parseFloat(String(x.kg).replace(',','.'))||0,reps:parseInt(x.reps)||0})).filter(x=>x.reps>0);
    if(sets.length){exercises.push({id:GTA.slug(name),name,sets});n+=sets.length}
  }
  if(!n){if(confirm("Nessuna serie registrata. Scartare l'allenamento?")){dropDraft();location.replace('#/')}return}
  if(!confirm('Salvare '+n+' serie?'))return;
  const s=sc.sessions.find(x=>x.id===draft.sid);
  log.unshift({id:Date.now(),sessionId:draft.sid,sessionLabel:s?s.label:draft.sid,date:new Date().toISOString(),durationMin:Math.round((Date.now()-draft.start)/60000),exercises});
  S('gt_log',log);dropDraft();toast('Allenamento salvato');location.replace('#/');
}
const row=el=>{const d=el.closest&&el.closest('.set');return d&&{d,x:draft.sets[d.dataset.ex][+d.dataset.i],k:d.querySelector('[data-f=kg]'),r:d.querySelector('[data-f=reps]')}};
function pick(acc,fn){const f=$('#f');f.accept=acc;f.onchange=async()=>{const file=f.files[0];f.value='';if(file)try{await fn(await file.text())}catch(e){alert('Errore: '+e.message)}};f.click()}
function exp(){
  const backup={
    schema:'gymtracker.backup',v:2,exportedAt:new Date().toISOString(),
    counts:GTA.backupCounts(log),
    schedule:rawCustom&&raw?{source:'imported',fingerprint:GTA.fingerprint(JSON.stringify(raw)),data:raw}:{source:'bundled'},
    history:log,
  };
  const b=new Blob([JSON.stringify(backup)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='gymtracker-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1e4);
  toast('Backup esportato (schema v2)');
}
document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');if(g){location.hash=g.dataset.go;return}
  const a=e.target.closest('[data-act]');if(!a)return;const d=a.dataset;
  const redraw=()=>{const y=scrollY;workout(draft.sid);scrollTo(0,y)};
  switch(d.act){
    case'back':history.length>1?history.back():location.replace('#/');break;
    case'start':start(d.sid);break;
    case'drop':if(confirm('Scartare l\'allenamento in corso?')){dropDraft();home()}break;
    case'finish':finish();break;
    case'ck':{const{d:el,x,k,r}=row(a);x.ok=!x.ok;
      if(x.ok)for(const[f,i]of[['kg',k],['reps',r]])if(i.value===''&&i.placeholder!==''&&!isNaN(i.placeholder)){i.value=i.placeholder;x[f]=i.value}
      el.classList.toggle('ok',x.ok);S('gt_draft',draft);break}
    case'add':draft.sets[d.ex].push({kg:'',reps:'',ok:false});S('gt_draft',draft);redraw();break;
    case'del':if(draft.sets[d.ex].length>1){draft.sets[d.ex].pop();S('gt_draft',draft);redraw()}break;
    case'hm':{histMetric=d.m;const y=scrollY;hist(histName);scrollTo(0,y);break}
    case'exp':exp();break;
    case'imp':pick('.json',t=>{
      const m=GTA.migrateBackup(JSON.parse(t));
      if(!confirm('Sostituire i dati attuali con '+m.history.length+' allenamenti?'))return;
      log=m.history;S('gt_log',log);
      if(m.schedule&&m.schedule.data){raw=m.schedule.data;rawCustom=true;S('gt_raw',raw);sc=normalize(raw);rebuildBadgeMap()}
      dropDraft();toast('Backup ripristinato');menu()});break;
    case'sch':pick('.json,.jsx,.js,.txt',t=>{
      t=t.trim();let r;
      if(t[0]==='{')r=JSON.parse(t);
      else{const m=t.match(/const\s+data\s*=\s*(\{[\s\S]*?\n\});?/);if(!m)throw Error('struttura non riconosciuta');r=new Function('return '+m[1])()}
      const n=normalize(r);
      if(draft&&!confirm('Hai un allenamento in corso: verrà scartato. Continuare?'))return;
      dropDraft();raw=r;rawCustom=true;sc=n;S('gt_raw',raw);rebuildBadgeMap();toast('Scheda importata: '+n.sessions.length+' sessioni');menu()});break;
    case'def':if(confirm('Tornare alla scheda originale? Lo storico resta.')){localStorage.removeItem('gt_raw');dropDraft();location.reload()}break;
    case'inst':deferred.prompt();deferred=null;menu();break;
  }
});
app.addEventListener('input',e=>{const r=row(e.target);if(!r)return;r.x[e.target.dataset.f]=e.target.value;S('gt_draft',draft)});
app.addEventListener('change',e=>{if(e.target.id==='exsel'){selEx=e.target.value;const y=scrollY;analysis();scrollTo(0,y)}});

/* ---- routing (l'indietro di Android funziona via hash) ---- */
const pos={};
addEventListener('scroll',()=>{pos[location.hash]=scrollY},{passive:true});
function route(){
  clearInterval(tick);destroyCharts();
  const y=pos[location.hash]||0,[,a,b]=location.hash.split('/');
  if(a==='w')workout(decodeURIComponent(b));
  else if(a==='h')hist(decodeURIComponent(b));
  else if(a==='s')detail(decodeURIComponent(b));
  else if(a==='stats')analysis();
  else if(a==='sci')sci();
  else if(a==='menu')menu();
  else home();
  scrollTo(0,y);
}
addEventListener('hashchange',route);
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
(async()=>{
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();
  try{
    const stored=L('gt_log',[]);
    log=GTA.migrateLogV1(stored);
    log.sort((x,y)=>String(y.date).localeCompare(String(x.date)));
    if(JSON.stringify(log)!==JSON.stringify(stored))S('gt_log',log);
    rawCustom=!!localStorage.getItem('gt_raw');
    raw=L('gt_raw',null)||await(await fetch('scheda.json')).json();
    sc=normalize(raw);rebuildBadgeMap();
  }catch(e){app.innerHTML='<p>Impossibile caricare la scheda: '+esc(e.message)+'</p>';return}
  route();
})();
