'use strict';
const $=id=>document.getElementById(id), C=window.APP_CONFIG, houses=['Agua','Aire','Tierra','Fuego'];
const KEY='f126-multi-v1';let state={session:null,profile:null,students:[],missions:[],attendance:[],pending:[]};
try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&Array.isArray(d.pending))state={...state,...d}}catch{}
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));const uid=()=>crypto.randomUUID();const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=()=>/^https:\/\//.test(C.supabaseUrl)&&!C.supabaseUrl.includes('REEMPLAZAR')&&C.supabaseAnonKey&&!C.supabaseAnonKey.includes('REEMPLAZAR');
const online=()=>navigator.onLine;
function status(s) {
  const el = $('syncState');
  if (el) el.textContent = s;

  const academic = $('academicStatus');
  if (academic) academic.textContent = s;
}
function authHeaders(token=state.session?.access_token){return {'apikey':C.supabaseAnonKey,'Authorization':'Bearer '+(token||C.supabaseAnonKey),'Content-Type':'application/json'}}
async function api(path,opts={}){if(!configured())throw Error('Configura config.js con URL y clave pública de Supabase.');const r=await fetch(C.supabaseUrl+path,{...opts,headers:{...authHeaders(),...opts.headers}});const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=raw}if(!r.ok)throw Error(data?.message||data?.error_description||data?.msg||'HTTP '+r.status);return data}
async function refreshToken(){if(!state.session?.refresh_token)throw Error('No hay sesión. Inicia sesión con Internet.');const d=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:state.session.refresh_token})});state.session=d;save()}
async function request(path,opts={}){if(!state.session)throw Error('Inicia sesión');if(Date.now()>((state.session.expires_at||0)*1000-60000)){if(!online())throw Error('Sesión vencida. Conservamos los registros pendientes; conecta Internet para renovar la sesión.');await refreshToken()}try{return await api(path,opts)}catch(e){if(online()&&/JWT expired|invalid JWT/i.test(e.message)){await refreshToken();return api(path,opts)}throw e}}
async function signIn(alias,pin){if(!online())throw Error('El primer acceso necesita Internet.');
if(!/^[a-z0-9_-]{3,32}$/.test(alias) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alias))throw Error('Escribe un alias o correo electrónico válido.');
const email=alias.includes('@')?alias:alias+'@'+C.emailDomain;const d=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:pin})});state.session=d;const profiles=await request('/rest/v1/profiles?select=id,alias,display_name,role,house&id=eq.'+encodeURIComponent(d.user.id));if(!profiles.length){state.session=null;save();throw Error('Este usuario no tiene perfil asignado. Solicita acceso a administración.')}state.profile=profiles[0];state.students=[];state.missions=[];state.attendance=[];state.pending=[];save();await pull();showApp()}

function showApp() {
  const p = state.profile;
  const valid = !!(p && state.session);
  const isTeacher = valid && p.role === 'docente';

  $('login').classList.toggle('hidden', valid);
  $('app').classList.toggle('hidden', !valid || isTeacher);
  $('academicApp').classList.toggle('hidden', !isTeacher);

  if (!valid) return;

  if (isTeacher) {
    $('academicTeacher').textContent =
      'Bienvenido(a), ' + p.display_name;

   status('Consultando asignaturas y grupos...');

loadTeacherAssignments()
  .then(assignments => {
    console.log('Asignaciones del docente:', assignments);
    status('Asignaturas y grupos consultados correctamente');
  })
  .catch(error => {
    console.error('Error al consultar asignaciones:', error);
    status('Error al consultar asignaturas: ' + error.message);
  });

return;
  }

  $('who').textContent =
    p.display_name + ' · ' +
    (p.role === 'admin' ? 'Administración' : p.house);

  $('adminMission').classList.toggle('hidden', p.role !== 'admin');
  $('adminStudent').classList.toggle('hidden', p.role !== 'admin');

  $('qrHouse').value = p.role === 'admin' ? '' : p.house;
  $('qrHouse').disabled = p.role !== 'admin';

  $('reportHouse').value = p.role === 'admin' ? '' : p.house;
  $('reportHouse').disabled = p.role !== 'admin';

  render();

  status(
    online()
      ? 'Conectado · ' + state.pending.length + ' registros pendientes'
      : 'Sin conexión · ' + state.pending.length + ' registros pendientes'
  );
}
async function loadTeacherAssignments() {
  if (!state.profile || state.profile.role !== 'docente') return;

  const teacherId = encodeURIComponent(state.profile.id);

  const assignments = await request(
    '/rest/v1/teaching_assignments' +
    '?select=id,school_period,active,' +
    'academic_subjects(name),' +
    'academic_groups(name)' +
    '&teacher_id=eq.' + teacherId +
    '&active=eq.true'
  );

  console.log('Asignaturas y grupos del docente:', assignments);
const list = $('academicAssignmentsList');

if (list) {
  list.replaceChildren();

  if (assignments.length === 0) {
    list.textContent = 'No tienes asignaturas o grupos asignados.';
  } else {
    assignments.forEach(a => {
      const card = document.createElement('div');
      card.className = 'stat';

      const subject = document.createElement('h4');
      subject.textContent =
        a.academic_subjects?.name || 'Asignatura sin nombre';

      const group = document.createElement('p');
      group.textContent =
        'Grupo: ' + (a.academic_groups?.name || 'Sin grupo');

      const period = document.createElement('p');
      period.textContent =
        'Periodo escolar: ' + a.school_period;

      // Botón para registrar asistencia académica
const attendanceButton = document.createElement('button');
attendanceButton.type = 'button';
attendanceButton.textContent = '📝 Registrar asistencia';

attendanceButton.onclick = () => {
  alert(
    'Registro de asistencia\n\n' +
    'Asignatura: ' + (a.academic_subjects?.name || '') + '\n' +
    'Grupo: ' + (a.academic_groups?.name || '') + '\n\n' +
    'Próximamente abriremos la lista de alumnos.'
  );
};

card.append(subject, group, period, attendanceButton);
list.appendChild(card);
    });
  }
}
  return assignments;
}
async function pull(){if(!online())throw Error('Sin conexión');const [ss,mm,aa]=await Promise.all([request('/rest/v1/students?select=id,name,group_name,house,token&order=name.asc'),request('/rest/v1/missions?select=id,name,mission_date&order=mission_date.desc'),request('/rest/v1/attendance?select=mission_id,student_id,recorded_at,recorded_by')]);state.students=ss;state.missions=mm;state.attendance=aa;save();render()}
async function sync(){if(!state.profile||!state.session)return;if(!online()){status('Sin Internet · '+state.pending.length+' registros pendientes');return}const button=$('sync');button.disabled=true;try{await refreshToken();let ok=0;for(const item of [...state.pending]){try{await request('/rest/v1/attendance?on_conflict=mission_id,student_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({mission_id:item.mission_id,student_id:item.student_id,recorded_at:item.recorded_at,recorded_by:state.profile.id})});state.pending=state.pending.filter(x=>x.local_id!==item.local_id);save();ok++}catch(e){status('Error al enviar asistencia: '+e.message+' · pendientes: '+state.pending.length);break}}await pull();status('Sincronización finalizada · enviados: '+ok+' · pendientes: '+state.pending.length)}catch(e){status('No se pudo sincronizar: '+e.message+' · pendientes: '+state.pending.length)}finally{button.disabled=false;render()}}
function records(m){const out=new Map(state.attendance.filter(a=>a.mission_id===m).map(a=>[a.student_id,{...a,synced:true}]));for(const a of state.pending.filter(a=>a.mission_id===m))if(!out.has(a.student_id))out.set(a.student_id,{...a,synced:false});return out}
function mark(code){const mission=$('missionScanner').value,s=state.students.find(s=>s.token===code||s.id===code);if(!mission)return msg('Selecciona una misión.',false);if(!s)return msg('Código no reconocido en la lista descargada.',false);if(state.profile.role==='tutor'&&s.house!==state.profile.house)return msg('El alumno pertenece a otra fraternidad. No se registró.',false);if(records(mission).has(s.id))return msg('Ya registrado: '+s.name,false);state.pending.push({local_id:uid(),mission_id:mission,student_id:s.id,recorded_at:new Date().toISOString()});save();msg('✓ Asistencia guardada en este celular: '+s.name+' · '+s.house,true);render();if(navigator.vibrate)navigator.vibrate(100);if(online())sync()}
function msg(t,ok){$('scanMsg').textContent=t;$('scanMsg').className='notice '+(ok?'ok':'bad')}
function render(){if(!state.profile)return;const p=state.profile,ss=state.students,mm=state.missions;for(const id of ['missionDashboard','missionScanner','missionReport']){const el=$(id),old=el.value;el.innerHTML=mm.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.mission_date)}</option>`).join('');if(mm.some(m=>m.id===old))el.value=old}const m=$('missionDashboard').value,seen=records(m);$('stats').innerHTML=houses.filter(h=>p.role==='admin'||p.house===h).map(h=>{const arr=ss.filter(s=>s.house===h),n=arr.filter(s=>seen.has(s.id)).length;return `<div class="stat"><strong>${esc(h)}</strong><b>${n} / ${arr.length}</b><small>${arr.length?Math.round(100*n/arr.length):0}% de asistencia</small></div>`}).join('');renderStudents();renderReports();renderRecent();status((online()?'En línea':'Sin conexión')+' · '+state.pending.length+' asistencia(s) pendientes de sincronizar')}
function renderStudents(){const q=$('studentSearch').value.toLowerCase();$('studentRows').innerHTML=state.students.filter(s=>(s.id+' '+s.name+' '+s.group_name+' '+s.house).toLowerCase().includes(q)).map(s=>`<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.group_name)}</td><td>${esc(s.house)}</td></tr>`).join('')}
function reportRows(){const m=$('missionReport').value,h=$('reportHouse').value,seen=records(m);return state.students.filter(s=>!h||s.house===h).map(s=>({...s,attendance:seen.get(s.id)}))}
function renderReports(){const rows=reportRows(),n=rows.filter(r=>r.attendance).length;$('reportSummary').textContent=`Total: ${rows.length} · Presentes: ${n} · Ausentes: ${rows.length-n}`;$('reportRows').innerHTML=rows.map(s=>`<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.group_name)}</td><td>${esc(s.house)}</td><td>${s.attendance?'Presente':'Ausente'}</td><td>${s.attendance?esc(new Date(s.attendance.recorded_at).toLocaleString('es-MX')):'—'}</td><td>${s.attendance?(s.attendance.synced?'Sincronizado':'Pendiente'):'—'}</td></tr>`).join('')}
function renderRecent(){const seen=records($('missionScanner').value);$('recent').innerHTML=[...seen.entries()].slice(-10).reverse().map(([id,a])=>{const s=state.students.find(s=>s.id===id);return s?`<div class="notice ok">✓ ${esc(s.name)} · ${esc(s.house)} · ${a.synced?'Sincronizado':'Pendiente'}</div>`:''}).join('')||'<p class="muted">Sin registros.</p>'}
function qrCanvas(value,size){const qr=new window.OfflineQRCode(-1,1);qr.addData(value);qr.make();const n=qr.getModuleCount(),quiet=4,scale=Math.max(3,Math.floor(size/(n+quiet*2))),c=document.createElement('canvas');c.width=c.height=(n+quiet*2)*scale;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#111';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))ctx.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale);c.style.width=size+'px';return c}
function renderQrs(){
 const h=$('qrHouse').value,root=$('qrCards');root.replaceChildren();
 const logos={Agua:'./logo-agua.jpeg',Aire:'./logo-aire.jpeg',Tierra:'./logo-tierra.jpeg',Fuego:'./logo-fuego.jpeg'};
 for(const s of state.students.filter(s=>!h||s.house===h)){
  const div=document.createElement('article');div.className='qr-card house-'+s.house;
  const top=document.createElement('div');top.className='qr-top';
  const institution=document.createElement('span');institution.textContent='CETis 126 · FRATERNIDADES';
  const cetis=document.createElement('img');cetis.src='./logo-cetis126.jpeg';cetis.alt='CETis 126';top.append(institution,cetis);
  const middle=document.createElement('div');middle.className='qr-middle';
  const logo=document.createElement('img');logo.className='qr-logo';logo.src=logos[s.house]||'./logo-fraternidades.webp';logo.alt='Fraternidad '+s.house;
  const house=document.createElement('div');house.className='qr-house-name';house.textContent='FRATERNIDAD '+s.house.toUpperCase();
  const name=document.createElement('div');name.className='qr-student';name.textContent=s.name;
  const detail=document.createElement('div');detail.className='qr-data';detail.textContent='Matrícula: '+s.id+' · Grupo: '+s.group_name;
  middle.append(logo,house,name,qrCanvas(s.token,132),detail);
  const bottom=document.createElement('div');bottom.className='qr-bottom';bottom.textContent='4 ELEMENTOS · 1 COMUNIDAD';
  div.append(top,middle,bottom);root.append(div);
 }
}
function download(name,content,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}const csv=rows=>rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
function parseCsv(text){const rows=[];let row=[],v='',quoted=false;const delimiter=(text.split(/\r?\n/)[0].match(/;/g)||[]).length>(text.split(/\r?\n/)[0].match(/,/g)||[]).length?';':',';for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))rows.push(row);row=[];v=''}else v+=c}row.push(v);if(row.some(x=>x.trim()))rows.push(row);return rows}
let stream=null,video=null,timer=null,scanning=false,last='',lastAt=0,scanCanvas=null,scanContext=null;
async function stop(){scanning=false;clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video=null;scanCanvas=null;scanContext=null;$('reader').replaceChildren()}
async function start(){
  if(scanning)return;
  if(!navigator.mediaDevices?.getUserMedia)return msg('Este navegador no permite acceder a la cámara. Abre la aplicación en Safari o Chrome con HTTPS.',false);
  let detector=null;
  if('BarcodeDetector' in window){try{detector=new BarcodeDetector({formats:['qr_code']})}catch(e){console.warn('BarcodeDetector no disponible:',e)}}
  if(!detector&&typeof window.jsQR!=='function')return msg('No se cargó el lector QR alternativo (jsQR.js). Comprueba que el archivo esté publicado junto a app.js y actualiza la página.',false);
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    video=document.createElement('video');video.setAttribute('playsinline','');video.autoplay=true;video.muted=true;video.srcObject=stream;
    $('reader').replaceChildren(video);await video.play();scanning=true;
    if(!detector){scanCanvas=document.createElement('canvas');scanContext=scanCanvas.getContext('2d',{willReadFrequently:true});if(!scanContext)throw Error('No se pudo preparar el lector de imágenes.')}
    msg('Cámara activa. Acerca el código QR.',true);
    const loop=async()=>{
      if(!scanning)return;
      try{
        if(video.readyState>=2){
          let code='';
          if(detector){const results=await detector.detect(video);code=results[0]?.rawValue||''}
          else if(video.videoWidth&&video.videoHeight){
            const maxSide=720,ratio=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight));
            scanCanvas.width=Math.max(1,Math.round(video.videoWidth*ratio));scanCanvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
            scanContext.drawImage(video,0,0,scanCanvas.width,scanCanvas.height);
            const pixels=scanContext.getImageData(0,0,scanCanvas.width,scanCanvas.height);
            code=window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data||'';
          }
          if(code){const now=Date.now();if(code!==last||now-lastAt>1800){last=code;lastAt=now;mark(code)}}
        }
      }catch(e){console.warn('Error al leer QR:',e)}
      if(scanning)timer=setTimeout(loop,250);
    };
    loop();
  }catch(e){await stop();msg('No se pudo abrir la cámara: '+e.message+'. Comprueba los permisos de cámara del navegador.',false)}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMsg').textContent='Ingresando…';try{await signIn($('alias').value.trim().toLowerCase(),$('pin').value);$('pin').value='';$('loginMsg').textContent=''}catch(err){$('loginMsg').textContent=err.message}};
$('logout').onclick=async()=>{if(state.pending.length&&!confirm('Hay asistencias pendientes. Si cierras sesión podrían perderse. ¿Continuar?'))return;await stop();state={session:null,profile:null,students:[],missions:[],attendance:[],pending:[]};save();showApp()};

$('academicLogout').onclick = async () => {
  await stop();

  state = {
    session: null,
    profile: null,
    students: [],
    missions: [],
    attendance: [],
    pending: []
  };

  save();
  showApp();
};

$('sync').onclick=sync;window.addEventListener('online',()=>{if(state.profile)sync()});window.addEventListener('offline',()=>{if(state.profile)render()});
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('#app>section').forEach(s=>s.classList.add('hidden'));$(b.dataset.tab).classList.remove('hidden');if(b.dataset.tab==='qrs')renderQrs();else if(b.dataset.tab!=='scanner')stop()});
$('addMission').onclick=async()=>{if(!online())return alert('Para crear misiones necesitas Internet.');try{const name=$('missionName').value.trim(),date=$('missionDate').value;if(!name||!date)throw Error('Completa nombre y fecha.');await request('/rest/v1/missions',{method:'POST',body:JSON.stringify({name,mission_date:date})});$('missionName').value='';await sync()}catch(e){alert(e.message)}};
async function addStudents(rows){if(!online())throw Error('Importar alumnos requiere Internet.');if(state.pending.length)throw Error('Sincroniza asistencias pendientes antes de modificar el catálogo.');const existing=new Set(state.students.map(s=>s.id));let added=0,skipped=0;for(const s of rows){if(!s.id||!s.name||!s.group_name||!houses.includes(s.house)||existing.has(s.id)){skipped++;continue}try{await request('/rest/v1/students',{method:'POST',body:JSON.stringify({...s,token:'F126-'+uid()})});existing.add(s.id);added++}catch(e){skipped++;console.warn(e)}}await sync();alert('Agregados: '+added+' · omitidos: '+skipped)}
$('studentForm').onsubmit=async e=>{e.preventDefault();try{await addStudents([{id:$('studentId').value.trim(),name:$('studentName').value.trim(),group_name:$('studentGroup').value.trim(),house:$('studentHouse').value}]);e.target.reset()}catch(err){alert(err.message)}};
$('csvFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=parseCsv((await f.text()).replace(/^\uFEFF/,'')),head=data.shift().map(s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')),idx=k=>head.indexOf(k);if(['matricula','nombre','grupo','fraternidad'].some(k=>idx(k)<0))throw Error('Encabezados requeridos: matricula,nombre,grupo,fraternidad');await addStudents(data.map(r=>({id:(r[idx('matricula')]||'').trim(),name:(r[idx('nombre')]||'').trim(),group_name:(r[idx('grupo')]||'').trim(),house:houses.find(h=>h.toLowerCase()===(r[idx('fraternidad')]||'').trim().toLowerCase())||''})))}catch(err){alert(err.message)}e.target.value=''};
$('studentSearch').oninput=renderStudents;['missionDashboard','missionReport','reportHouse','missionScanner'].forEach(id=>$(id).onchange=render);$('qrHouse').onchange=renderQrs;$('print').onclick=()=>{renderQrs();window.print()};$('start').onclick=start;$('stop').onclick=stop;$('manualBtn').onclick=()=>{mark($('manual').value.trim());$('manual').value=''};
$('csvReport').onclick=()=>download('reporte_fraternidades.csv','\uFEFF'+csv([['matricula','nombre','grupo','fraternidad','estado','fecha_hora','sincronizacion'],...reportRows().map(s=>[s.id,s.name,s.group_name,s.house,s.attendance?'Presente':'Ausente',s.attendance?.recorded_at||'',s.attendance?(s.attendance.synced?'Sincronizado':'Pendiente'):''])]));
$('backup').onclick=()=>download('respaldo_local_fraternidades.json',JSON.stringify({profile:state.profile,students:state.students,missions:state.missions,attendance:state.attendance,pending:state.pending},null,2),'application/json');
$('missionDate').value=new Date().toLocaleDateString('en-CA');if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
if(state.profile&&state.session){showApp();if(online())sync()}else if(!configured())$('loginMsg').textContent='Antes de iniciar, configura config.js y ejecuta schema.sql en Supabase.';
