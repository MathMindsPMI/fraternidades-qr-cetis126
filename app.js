
'use strict';

// ============================================
// FRATERNIDADES QR | CETis 126
// Asistencia de fraternidades y académica
// ============================================

const $ = id => document.getElementById(id);
const C = window.APP_CONFIG;
const houses = ['Agua', 'Aire', 'Tierra', 'Fuego'];
const KEY = 'f126-multi-v1';

let state = {
  session: null,
  profile: null,
  students: [],
  missions: [],
  attendance: [],
  pending: []
};

try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && Array.isArray(saved.pending)) {
    state = { ...state, ...saved };
  }
} catch (e) {
  console.warn('No se pudo recuperar el estado local', e);
}

const save = () =>
  localStorage.setItem(KEY, JSON.stringify(state));

const uid = () => crypto.randomUUID();

const esc = x => String(x ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

const configured = () =>
  /^https:\/\//.test(C.supabaseUrl) &&
  !C.supabaseUrl.includes('REEMPLAZAR') &&
  C.supabaseAnonKey &&
  !C.supabaseAnonKey.includes('REEMPLAZAR');

const online = () => navigator.onLine;

function status(message) {
  const sync = $('syncState');
  if (sync) sync.textContent = message;

  const academic = $('academicStatus');
  if (academic) academic.textContent = message;
}

// ============================================
// CONEXIÓN CON SUPABASE
// ============================================

function authHeaders(
  token = state.session?.access_token
) {
  return {
    apikey: C.supabaseAnonKey,
    Authorization:
      'Bearer ' + (token || C.supabaseAnonKey),
    'Content-Type': 'application/json'
  };
}

async function api(path, opts = {}) {
  if (!configured()) {
    throw Error(
      'Configura config.js con los datos de Supabase.'
    );
  }

  const response = await fetch(
    C.supabaseUrl + path,
    {
      ...opts,
      headers: {
        ...authHeaders(),
        ...opts.headers
      }
    }
  );

  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    throw Error(
      data?.message ||
      data?.error_description ||
      data?.msg ||
      'HTTP ' + response.status
    );
  }

  return data;
}

async function refreshToken() {
  if (!state.session?.refresh_token) {
    throw Error('No hay sesión activa.');
  }

  const data = await api(
    '/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: state.session.refresh_token
      })
    }
  );

  state.session = data;
  save();
}

async function request(path, opts = {}) {
  if (!state.session) {
    throw Error('Inicia sesión.');
  }

  if (
    Date.now() >
    (state.session.expires_at || 0) * 1000 - 60000
  ) {
    if (!online()) {
      throw Error(
        'Sesión vencida. Conéctate a Internet.'
      );
    }

    await refreshToken();
  }

  try {
    return await api(path, opts);
  } catch (error) {
    if (
      online() &&
      /JWT expired|invalid JWT/i.test(error.message)
    ) {
      await refreshToken();
      return api(path, opts);
    }

    throw error;
  }
}

// ============================================
// INICIO DE SESIÓN
// ============================================

async function signIn(alias, pin) {
  if (!online()) {
    throw Error(
      'El primer acceso necesita Internet.'
    );
  }

  const validAlias =
    /^[a-z0-9_-]{3,32}$/.test(alias);

  const validEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alias);

  if (!validAlias && !validEmail) {
    throw Error(
      'Escribe un alias o correo válido.'
    );
  }

  const email = alias.includes('@')
    ? alias
    : alias + '@' + C.emailDomain;

  const data = await api(
    '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: pin
      })
    }
  );

  state.session = data;

  const profiles = await request(
    '/rest/v1/profiles' +
    '?select=id,alias,display_name,role,house' +
    '&id=eq.' + encodeURIComponent(data.user.id)
  );

  if (!profiles.length) {
    state.session = null;
    save();

    throw Error(
      'Este usuario no tiene perfil asignado.'
    );
  }

  state.profile = profiles[0];
  state.students = [];
  state.missions = [];
  state.attendance = [];
  state.pending = [];

  save();
  await pull();
  showApp();
}

// ============================================
// MOSTRAR PORTAL SEGÚN EL USUARIO
// ============================================

function showApp() {
  const profile = state.profile;
  const valid = !!(profile && state.session);

  const isTeacher =
    valid && profile.role === 'docente';

  $('login').classList.toggle('hidden', valid);

  $('app').classList.toggle(
    'hidden',
    !valid || isTeacher
  );

  $('academicApp').classList.toggle(
    'hidden',
    !isTeacher
  );

  if (!valid) return;

  if (isTeacher) {
    $('academicAttendance').classList.add('hidden');

    $('academicAssignments').classList.remove(
      'hidden'
    );

    $('academicTeacher').textContent =
      'Bienvenido(a), ' + profile.display_name;

    status('Consultando asignaturas y grupos...');

    loadTeacherAssignments()
      .then(() => {
        status(
          'Asignaturas y grupos consultados correctamente'
        );
      })
      .catch(error => {
        console.error(error);

        status(
          'Error al consultar asignaturas: ' +
          error.message
        );
      });

    return;
  }

  $('who').textContent =
    profile.display_name +
    ' · ' +
    (
      profile.role === 'admin'
        ? 'Administración'
        : profile.house
    );

  $('adminMission').classList.toggle(
    'hidden',
    profile.role !== 'admin'
  );

  $('adminStudent').classList.toggle(
    'hidden',
    profile.role !== 'admin'
  );

  $('qrHouse').value =
    profile.role === 'admin'
      ? ''
      : profile.house;

  $('qrHouse').disabled =
    profile.role !== 'admin';

  $('reportHouse').value =
    profile.role === 'admin'
      ? ''
      : profile.house;

  $('reportHouse').disabled =
    profile.role !== 'admin';

  render();

  status(
    online()
      ? 'Conectado · ' +
        state.pending.length +
        ' registros pendientes'
      : 'Sin conexión · ' +
        state.pending.length +
        ' registros pendientes'
  );
}

// ============================================
// PORTAL ACADÉMICO DEL DOCENTE
// ============================================

let academicRoster = [];
let academicAssignment = null;

async function loadTeacherAssignments() {
  if (
    !state.profile ||
    state.profile.role !== 'docente'
  ) {
    return [];
  }

  const teacherId = encodeURIComponent(
    state.profile.id
  );

  const assignments = await request(
    '/rest/v1/teaching_assignments' +
    '?select=id,school_period,active,' +
    'academic_subjects(name),' +
    'academic_groups(name)' +
    '&teacher_id=eq.' + teacherId +
    '&active=eq.true'
  );

  const list = $('academicAssignmentsList');
  list.replaceChildren();

  if (!assignments.length) {
    list.textContent =
      'No tienes asignaturas o grupos asignados.';

    return assignments;
  }

  assignments.forEach(assignment => {
    const card = document.createElement('div');
    card.className = 'stat';
    card.style.marginBottom = '12px';

    const subject = document.createElement('h4');

    subject.textContent =
      assignment.academic_subjects?.name ||
      'Asignatura sin nombre';

    const group = document.createElement('p');

    group.textContent =
      'Grupo: ' +
      (
        assignment.academic_groups?.name ||
        'Sin grupo'
      );

    const period = document.createElement('p');

    period.textContent =
      'Periodo escolar: ' +
      assignment.school_period;

    const button = document.createElement('button');

    button.type = 'button';

    button.textContent =
      '📝 Registrar asistencia';

    button.onclick = async () => {
      const groupName =
        assignment.academic_groups?.name;

      if (!groupName) {
        alert(
          'No se encontró el grupo asignado.'
        );
        return;
      }

      button.disabled = true;
      button.textContent = 'Consultando alumnos...';

      try {
        const students = await request(
          '/rest/v1/students' +
          '?select=id,name,group_name' +
          '&group_name=eq.' +
          encodeURIComponent(groupName) +
          '&order=name.asc'
        );

        openAcademicAttendance(
          assignment,
          students
        );

      } catch (error) {
        alert(
          'No se pudieron consultar los alumnos: ' +
          error.message
        );
      } finally {
        button.disabled = false;
        button.textContent =
          '📝 Registrar asistencia';
      }
    };

    card.append(
      subject,
      group,
      period,
      button
    );

    list.append(card);
  });

  return assignments;
}

// ============================================
// PASE DE LISTA MANUAL
// ============================================

function updateAcademicAttendanceSummary() {
  const selects = [
    ...document.querySelectorAll(
      '#academicAttendanceList ' +
      'select[data-student-id]'
    )
  ];

  const counts = {
    presente: 0,
    falta: 0,
    retardo: 0,
    justificada: 0
  };

  for (const select of selects) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        select.value
      )
    ) {
      counts[select.value]++;
    }
  }

  const marked =
    counts.presente +
    counts.falta +
    counts.retardo +
    counts.justificada;

  const pending = selects.length - marked;

  $('academicAttendanceMessage').textContent =
    'Presentes: ' + counts.presente +
    ' · Faltas: ' + counts.falta +
    ' · Retardos: ' + counts.retardo +
    ' · justificadas: ' + counts.justificada +
    ' · Sin marcar: ' + pending +
    ' · Vista previa sin guardar.';
}

async function openAcademicAttendance(
  assignment,
  students
) {
  academicAssignment = assignment;
  academicRoster = students;

  $('academicAssignments').classList.add(
    'hidden'
  );

  $('academicAttendance').classList.remove(
    'hidden'
  );

  $('academicAttendanceInfo').textContent =
    'Asignatura: ' +
    (
      assignment.academic_subjects?.name ||
      'Sin nombre'
    ) +
    ' · Grupo: ' +
    (
      assignment.academic_groups?.name ||
      'Sin grupo'
    ) +
    ' · Alumnos: ' + students.length;

  $('academicAttendanceDate').value =
    new Date().toLocaleDateString('en-CA');

  const list = $('academicAttendanceList');

  list.replaceChildren();

  if (!students.length) {
    list.textContent =
      'No se encontraron alumnos para este grupo.';

    updateAcademicAttendanceSummary();
    return;
  }

  students.forEach((student, index) => {
    const item = document.createElement('div');

    item.className = 'stat';
    item.style.marginBottom = '8px';

    const label = document.createElement('label');

    label.textContent =
      (index + 1) +
      '. ' +
      student.name +
      ' · ' +
      student.id;

    const select = document.createElement('select');

    select.dataset.studentId = student.id;

    const options = [
      ['', 'Sin marcar'],
      ['presente', 'Presente'],
      ['falta', 'Falta'],
      ['retardo', 'Retardo'],
      ['justificada', 'justificada']
    ];

    options.forEach(([value, title]) => {
      const option = document.createElement('option');

      option.value = value;
      option.textContent = title;

      select.append(option);
    });

    select.addEventListener(
      'change',
      updateAcademicAttendanceSummary
    );

    item.append(label, select);
    list.append(item);
  });
  const attendanceDate = $('academicAttendanceDate').value;

  try {
    const sessions = await request(
      '/rest/v1/class_sessions' +
      '?select=id' +
      '&assignment_id=eq.' +
      encodeURIComponent(assignment.id) +
      '&session_date=eq.' +
      encodeURIComponent(attendanceDate) +
      '&session_number=eq.1'
    );

    if (sessions.length) {
      const savedRecords = await request(
        '/rest/v1/academic_attendance' +
        '?select=student_id,status' +
        '&session_id=eq.' +
        encodeURIComponent(sessions[0].id)
      );

      savedRecords.forEach(record => {
        const select = [...list.querySelectorAll('select')]
          .find(item =>
            item.dataset.studentId === record.student_id
          );

        if (select) {
          select.value = record.status;
        }
      });
    }
  } catch (error) {
    console.error('Error al recuperar asistencias:', error);
    alert('No se pudieron recuperar las asistencias guardadas.');
  }
  updateAcademicAttendanceSummary();
}

$('academicBack').onclick = () => {
  $('academicAttendance').classList.add(
    'hidden'
  );

  $('academicAssignments').classList.remove(
    'hidden'
  );

  academicRoster = [];
  academicAssignment = null;
};

$('academicScanQR').onclick = () => {
  alert(
    'Próximamente utilizaremos el mismo QR ' +
    'de las fraternidades para registrar ' +
    'la asistencia académica.'
  );
};


$('academicSaveAttendance').onclick = async () => {
  const button = $('academicSaveAttendance');

  if (!academicAssignment || !academicRoster.length) {
    alert('Primero selecciona una asignatura y grupo.');
    return;
  }

  const date = $('academicAttendanceDate').value;

  if (!date) {
    alert('Selecciona la fecha de asistencia.');
    return;
  }

  const selects = [
    ...document.querySelectorAll(
      '#academicAttendanceList select[data-student-id]'
    )
  ];

  const records = selects.map(select => ({
    student_id: select.dataset.studentId,
    status: select.value
  }));

  if (records.some(record => !record.status)) {
    alert(
      'Debes marcar la asistencia de todos los alumnos antes de guardar.'
    );
    return;
  }

  if (!confirm(
    '¿Deseas guardar la asistencia de ' +
    records.length +
    ' alumnos del grupo ' +
    academicAssignment.academic_groups?.name +
    '?'
  )) {
    return;
  }

  button.disabled = true;
  button.textContent = 'Guardando asistencia...';

  try {
    const assignmentId = academicAssignment.id;

    // Buscar si ya existe la sesión de clase.
    let sessions = await request(
      '/rest/v1/class_sessions' +
      '?select=id' +
      '&assignment_id=eq.' +
      encodeURIComponent(assignmentId) +
      '&session_date=eq.' +
      encodeURIComponent(date) +
      '&session_number=eq.1'
    );

    let sessionId;

    if (sessions.length) {
      sessionId = sessions[0].id;
    } else {
      // Crear una nueva sesión académica.
      const created = await request(
        '/rest/v1/class_sessions',
        {
          method: 'POST',
          headers: {
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            assignment_id: assignmentId,
            session_date: date,
            session_number: 1,
            created_by: state.profile.id
          })
        }
      );

      sessionId = created[0].id;
    }

    // Consultar las asistencias previamente registradas.
    const existing = await request(
      '/rest/v1/academic_attendance' +
      '?select=student_id' +
      '&session_id=eq.' +
      encodeURIComponent(sessionId)
    );

    const existingIds = new Set(
      existing.map(record => record.student_id)
    );

    const newRecords = records
      .filter(record => !existingIds.has(record.student_id))
      .map(record => ({
        session_id: sessionId,
        student_id: record.student_id,
        status: record.status,
        registration_method: 'manual',
        recorded_by: state.profile.id
      }));

    if (newRecords.length) {
      await request(
        '/rest/v1/academic_attendance',
        {
          method: 'POST',
          headers: {
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(newRecords)
        }
      );
    }

    alert(
      'Asistencia procesada correctamente.\n' +
      'Registros nuevos: ' + newRecords.length +
      '\nRegistros existentes: ' + existing.length
    );

  } catch (error) {
    console.error(error);

    alert(
      'No se pudo guardar la asistencia: ' +
      error.message
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar asistencia';
  }
};


// ============================================
// DATOS DE FRATERNIDADES
// ============================================

async function pull() {
  if (!online()) {
    throw Error('Sin conexión.');
  }

  const [students, missions, attendance] =
    await Promise.all([
      request(
        '/rest/v1/students' +
        '?select=id,name,group_name,house,token' +
        '&order=name.asc'
      ),
      request(
        '/rest/v1/missions' +
        '?select=id,name,mission_date' +
        '&order=mission_date.desc'
      ),
      request(
        '/rest/v1/attendance' +
        '?select=mission_id,student_id,' +
        'recorded_at,recorded_by'
      )
    ]);

  state.students = students;
  state.missions = missions;
  state.attendance = attendance;

  save();
  render();
}

async function sync() {
  if (!state.profile || !state.session) return;

  if (!online()) {
    status(
      'Sin Internet · ' +
      state.pending.length +
      ' registros pendientes'
    );
    return;
  }

  const button = $('sync');
  button.disabled = true;

  try {
    await refreshToken();

    let sent = 0;

    for (const item of [...state.pending]) {
      try {
        await request(
          '/rest/v1/attendance' +
          '?on_conflict=mission_id,student_id',
          {
            method: 'POST',
            headers: {
              Prefer:
                'resolution=ignore-duplicates,return=minimal'
            },
            body: JSON.stringify({
              mission_id: item.mission_id,
              student_id: item.student_id,
              recorded_at: item.recorded_at,
              recorded_by: state.profile.id
            })
          }
        );

        state.pending = state.pending.filter(
          x => x.local_id !== item.local_id
        );

        save();
        sent++;

      } catch (error) {
        status(
          'Error al enviar asistencia: ' +
          error.message
        );
        break;
      }
    }

    await pull();

    status(
      'Sincronización finalizada · enviados: ' +
      sent +
      ' · pendientes: ' +
      state.pending.length
    );

  } catch (error) {
    status(
      'No se pudo sincronizar: ' +
      error.message
    );

  } finally {
    button.disabled = false;
    render();
  }
}

function records(missionId) {
  const result = new Map(
    state.attendance
      .filter(a => a.mission_id === missionId)
      .map(a => [
        a.student_id,
        { ...a, synced: true }
      ])
  );

  for (
    const item of state.pending.filter(
      a => a.mission_id === missionId
    )
  ) {
    if (!result.has(item.student_id)) {
      result.set(
        item.student_id,
        { ...item, synced: false }
      );
    }
  }

  return result;
}

function mark(code) {
  const mission = $('missionScanner').value;

  const student = state.students.find(
    s => s.token === code || s.id === code
  );

  if (!mission) {
    return msg('Selecciona una misión.', false);
  }

  if (!student) {
    return msg(
      'Código no reconocido en la lista descargada.',
      false
    );
  }

  if (
    state.profile.role === 'tutor' &&
    student.house !== state.profile.house
  ) {
    return msg(
      'El alumno pertenece a otra fraternidad.',
      false
    );
  }

  if (records(mission).has(student.id)) {
    return msg(
      'Ya registrado: ' + student.name,
      false
    );
  }

  state.pending.push({
    local_id: uid(),
    mission_id: mission,
    student_id: student.id,
    recorded_at: new Date().toISOString()
  });

  save();

  msg(
    '✓ Asistencia guardada en este celular: ' +
    student.name +
    ' · ' +
    student.house,
    true
  );

  render();

  if (navigator.vibrate) {
    navigator.vibrate(100);
  }

  if (online()) sync();
}

function msg(text, success) {
  $('scanMsg').textContent = text;

  $('scanMsg').className =
    'notice ' + (success ? 'ok' : 'bad');
}

// ============================================
// PANEL DE FRATERNIDADES
// ============================================

function render() {
  if (!state.profile) return;

  const profile = state.profile;
  const students = state.students;
  const missions = state.missions;

  for (const id of [
    'missionDashboard',
    'missionScanner',
    'missionReport'
  ]) {
    const element = $(id);
    const previous = element.value;

    element.innerHTML = missions.map(
      mission =>
        '<option value="' +
        esc(mission.id) +
        '">' +
        esc(mission.name) +
        ' · ' +
        esc(mission.mission_date) +
        '</option>'
    ).join('');

    if (missions.some(m => m.id === previous)) {
      element.value = previous;
    }
  }

  const mission = $('missionDashboard').value;
  const seen = records(mission);

  $('stats').innerHTML = houses
    .filter(
      house =>
        profile.role === 'admin' ||
        profile.house === house
    )
    .map(house => {
      const group = students.filter(
        s => s.house === house
      );

      const count = group.filter(
        s => seen.has(s.id)
      ).length;

      const percentage = group.length
        ? Math.round(100 * count / group.length)
        : 0;

      return (
        '<div class="stat">' +
        '<strong>' + esc(house) + '</strong>' +
        '<b>' + count + ' / ' + group.length + '</b>' +
        '<small>' + percentage + '% de asistencia</small>' +
        '</div>'
      );
    })
    .join('');

  renderStudents();
  renderReports();
  renderRecent();

  status(
    (online() ? 'En línea' : 'Sin conexión') +
    ' · ' +
    state.pending.length +
    ' asistencia(s) pendientes de sincronizar'
  );
}

function renderStudents() {
  const query =
    $('studentSearch').value.toLowerCase();

  $('studentRows').innerHTML =
    state.students
      .filter(student =>
        (
          student.id + ' ' +
          student.name + ' ' +
          student.group_name + ' ' +
          student.house
        ).toLowerCase().includes(query)
      )
      .map(student =>
        '<tr>' +
        '<td>' + esc(student.id) + '</td>' +
        '<td>' + esc(student.name) + '</td>' +
        '<td>' + esc(student.group_name) + '</td>' +
        '<td>' + esc(student.house) + '</td>' +
        '</tr>'
      )
      .join('');
}

function reportRows() {
  const mission = $('missionReport').value;
  const house = $('reportHouse').value;
  const seen = records(mission);

  return state.students
    .filter(student =>
      !house || student.house === house
    )
    .map(student => ({
      ...student,
      attendance: seen.get(student.id)
    }));
}

function renderReports() {
  const rows = reportRows();

  const present = rows.filter(
    row => row.attendance
  ).length;

  $('reportSummary').textContent =
    'Total: ' + rows.length +
    ' · Presentes: ' + present +
    ' · Ausentes: ' + (rows.length - present);

  $('reportRows').innerHTML = rows.map(
    student =>
      '<tr>' +
      '<td>' + esc(student.id) + '</td>' +
      '<td>' + esc(student.name) + '</td>' +
      '<td>' + esc(student.group_name) + '</td>' +
      '<td>' + esc(student.house) + '</td>' +
      '<td>' +
      (student.attendance ? 'Presente' : 'Ausente') +
      '</td>' +
      '<td>' +
      (
        student.attendance
          ? esc(
              new Date(
                student.attendance.recorded_at
              ).toLocaleString('es-MX')
            )
          : '—'
      ) +
      '</td>' +
      '<td>' +
      (
        student.attendance
          ? (
              student.attendance.synced
                ? 'Sincronizado'
                : 'Pendiente'
            )
          : '—'
      ) +
      '</td>' +
      '</tr>'
  ).join('');
}

function renderRecent() {
  const seen = records(
    $('missionScanner').value
  );

  $('recent').innerHTML =
    [...seen.entries()]
      .slice(-10)
      .reverse()
      .map(([id, attendance]) => {
        const student = state.students.find(
          s => s.id === id
        );

        return student
          ? '<div class="notice ok">✓ ' +
            esc(student.name) +
            ' · ' +
            esc(student.house) +
            ' · ' +
            (
              attendance.synced
                ? 'Sincronizado'
                : 'Pendiente'
            ) +
            '</div>'
          : '';
      })
      .join('') ||
    '<p class="muted">Sin registros.</p>';
}

// ============================================
// GENERACIÓN DE CÓDIGOS QR
// ============================================

function qrCanvas(value, size) {
  const qr = new window.OfflineQRCode(-1, 1);

  qr.addData(value);
  qr.make();

  const n = qr.getModuleCount();
  const quiet = 4;

  const scale = Math.max(
    3,
    Math.floor(size / (n + quiet * 2))
  );

  const canvas = document.createElement('canvas');

  canvas.width =
    canvas.height =
    (n + quiet * 2) * scale;

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.fillStyle = '#111';

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) {
        ctx.fillRect(
          (x + quiet) * scale,
          (y + quiet) * scale,
          scale,
          scale
        );
      }
    }
  }

  canvas.style.width = size + 'px';

  return canvas;
}

function renderQrs() {
  const house = $('qrHouse').value;
  const root = $('qrCards');

  root.replaceChildren();

  const logos = {
    Agua: './logo-agua.jpeg',
    Aire: './logo-aire.jpeg',
    Tierra: './logo-tierra.jpeg',
    Fuego: './logo-fuego.jpeg'
  };

  for (
    const student of state.students.filter(
      s => !house || s.house === house
    )
  ) {
    const card = document.createElement('article');

    card.className =
      'qr-card house-' + student.house;

    const top = document.createElement('div');
    top.className = 'qr-top';

    const institution = document.createElement('span');

    institution.textContent =
      'CETis 126 · FRATERNIDADES';

    const cetis = document.createElement('img');

    cetis.src = './logo-cetis126.jpeg';
    cetis.alt = 'CETis 126';

    top.append(institution, cetis);

    const middle = document.createElement('div');
    middle.className = 'qr-middle';

    const logo = document.createElement('img');

    logo.className = 'qr-logo';

    logo.src =
      logos[student.house] ||
      './logo-fraternidades.webp';

    logo.alt = 'Fraternidad ' + student.house;

    const houseName = document.createElement('div');

    houseName.className = 'qr-house-name';

    houseName.textContent =
      'FRATERNIDAD ' +
      student.house.toUpperCase();

    const name = document.createElement('div');

    name.className = 'qr-student';
    name.textContent = student.name;

    const detail = document.createElement('div');

    detail.className = 'qr-data';

    detail.textContent =
      'Matrícula: ' +
      student.id +
      ' · Grupo: ' +
      student.group_name;

    middle.append(
      logo,
      houseName,
      name,
      qrCanvas(student.token, 132),
      detail
    );

    const bottom = document.createElement('div');

    bottom.className = 'qr-bottom';

    bottom.textContent =
      '4 ELEMENTOS · 1 COMUNIDAD';

    card.append(top, middle, bottom);
    root.append(card);
  }
}

// ============================================
// DESCARGAS CSV Y RESPALDOS
// ============================================

function download(
  name,
  content,
  type = 'text/csv;charset=utf-8'
) {
  const url = URL.createObjectURL(
    new Blob([content], { type })
  );

  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.click();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

const csv = rows =>
  rows.map(row =>
    row.map(value =>
      '"' +
      String(value ?? '').replace(/"/g, '""') +
      '"'
    ).join(',')
  ).join('\r\n');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  const firstLine = text.split(/\r?\n/)[0];

  const delimiter =
    (firstLine.match(/;/g) || []).length >
    (firstLine.match(/,/g) || []).length
      ? ';'
      : ',';

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (
      character === delimiter &&
      !quoted
    ) {
      row.push(value);
      value = '';
    } else if (
      (character === '\n' || character === '\r') &&
      !quoted
    ) {
      if (
        character === '\r' &&
        text[i + 1] === '\n'
      ) {
        i++;
      }

      row.push(value);

      if (row.some(x => x.trim())) {
        rows.push(row);
      }

      row = [];
      value = '';

    } else {
      value += character;
    }
  }

  row.push(value);

  if (row.some(x => x.trim())) {
    rows.push(row);
  }

  return rows;
}

// ============================================
// ESCÁNER QR DE FRATERNIDADES
// ============================================

let stream = null;
let video = null;
let timer = null;
let scanning = false;
let last = '';
let lastAt = 0;
let scanCanvas = null;
let scanContext = null;

async function stop() {
  scanning = false;
  clearTimeout(timer);

  if (stream) {
    stream.getTracks().forEach(
      track => track.stop()
    );
  }

  stream = null;
  video = null;
  scanCanvas = null;
  scanContext = null;

  $('reader').replaceChildren();
}

async function start() {
  if (scanning) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    return msg(
      'Este navegador no permite acceder a la cámara.',
      false
    );
  }

  let detector = null;

  if ('BarcodeDetector' in window) {
    try {
      detector = new BarcodeDetector({
        formats: ['qr_code']
      });
    } catch (error) {
      console.warn(error);
    }
  }

  if (
    !detector &&
    typeof window.jsQR !== 'function'
  ) {
    return msg(
      'No se cargó el lector QR alternativo.',
      false
    );
  }

  try {
    stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }
        },
        audio: false
      });

    video = document.createElement('video');

    video.setAttribute('playsinline', '');
    video.autoplay = true;
    video.muted = true;
    video.srcObject = stream;

    $('reader').replaceChildren(video);

    await video.play();

    scanning = true;

    if (!detector) {
      scanCanvas = document.createElement('canvas');

      scanContext = scanCanvas.getContext(
        '2d',
        { willReadFrequently: true }
      );

      if (!scanContext) {
        throw Error(
          'No se pudo preparar el lector.'
        );
      }
    }

    msg(
      'Cámara activa. Acerca el código QR.',
      true
    );

    const loop = async () => {
      if (!scanning) return;

      try {
        if (video.readyState >= 2) {
          let code = '';

          if (detector) {
            const results =
              await detector.detect(video);

            code = results[0]?.rawValue || '';

          } else if (
            video.videoWidth &&
            video.videoHeight
          ) {
            const maxSide = 720;

            const ratio = Math.min(
              1,
              maxSide /
              Math.max(
                video.videoWidth,
                video.videoHeight
              )
            );

            scanCanvas.width = Math.max(
              1,
              Math.round(
                video.videoWidth * ratio
              )
            );

            scanCanvas.height = Math.max(
              1,
              Math.round(
                video.videoHeight * ratio
              )
            );

            scanContext.drawImage(
              video,
              0,
              0,
              scanCanvas.width,
              scanCanvas.height
            );

            const pixels =
              scanContext.getImageData(
                0,
                0,
                scanCanvas.width,
                scanCanvas.height
              );

            code =
              window.jsQR(
                pixels.data,
                pixels.width,
                pixels.height,
                {
                  inversionAttempts:
                    'attemptBoth'
                }
              )?.data || '';
          }

          if (code) {
            const now = Date.now();

            if (
              code !== last ||
              now - lastAt > 1800
            ) {
              last = code;
              lastAt = now;

              mark(code);
            }
          }
        }
      } catch (error) {
        console.warn(
          'Error al leer QR:',
          error
        );
      }

      if (scanning) {
        timer = setTimeout(loop, 250);
      }
    };

    loop();

  } catch (error) {
    await stop();

    msg(
      'No se pudo abrir la cámara: ' +
      error.message,
      false
    );
  }
}

// ============================================
// EVENTOS DE INICIO Y CIERRE DE SESIÓN
// ============================================

$('loginForm').onsubmit = async event => {
  event.preventDefault();

  $('loginMsg').textContent = 'Ingresando…';

  try {
    await signIn(
      $('alias').value.trim().toLowerCase(),
      $('pin').value
    );

    $('pin').value = '';
    $('loginMsg').textContent = '';

  } catch (error) {
    $('loginMsg').textContent =
      error.message;
  }
};

$('logout').onclick = async () => {
  if (
    state.pending.length &&
    !confirm(
      'Hay asistencias pendientes. ' +
      'Si cierras sesión podrían perderse. ' +
      '¿Continuar?'
    )
  ) {
    return;
  }

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

  academicRoster = [];
  academicAssignment = null;

  save();
  showApp();
};

// ============================================
// EVENTOS GENERALES
// ============================================

$('sync').onclick = sync;

window.addEventListener('online', () => {
  if (
    state.profile &&
    state.profile.role !== 'docente'
  ) {
    sync();
  }
});

window.addEventListener('offline', () => {
  if (
    state.profile &&
    state.profile.role !== 'docente'
  ) {
    render();
  }
});

document.querySelectorAll('nav button')
  .forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('nav button')
        .forEach(item =>
          item.classList.remove('active')
        );

      button.classList.add('active');

      document.querySelectorAll('#app>section')
        .forEach(section =>
          section.classList.add('hidden')
        );

      $(button.dataset.tab).classList.remove(
        'hidden'
      );

      if (button.dataset.tab === 'qrs') {
        renderQrs();
      } else if (
        button.dataset.tab !== 'scanner'
      ) {
        stop();
      }
    };
  });

// ============================================
// CREAR MISIONES
// ============================================

$('addMission').onclick = async () => {
  if (!online()) {
    return alert(
      'Para crear misiones necesitas Internet.'
    );
  }

  try {
    const name =
      $('missionName').value.trim();

    const date =
      $('missionDate').value;

    if (!name || !date) {
      throw Error(
        'Completa nombre y fecha.'
      );
    }

    await request(
      '/rest/v1/missions',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          mission_date: date
        })
      }
    );

    $('missionName').value = '';

    await sync();

  } catch (error) {
    alert(error.message);
  }
};

// ============================================
// AGREGAR E IMPORTAR ALUMNOS
// ============================================

async function addStudents(rows) {
  if (!online()) {
    throw Error(
      'Importar alumnos requiere Internet.'
    );
  }

  if (state.pending.length) {
    throw Error(
      'Sincroniza las asistencias pendientes.'
    );
  }

  const existing = new Set(
    state.students.map(s => s.id)
  );

  let added = 0;
  let skipped = 0;

  for (const student of rows) {
    if (
      !student.id ||
      !student.name ||
      !student.group_name ||
      !houses.includes(student.house) ||
      existing.has(student.id)
    ) {
      skipped++;
      continue;
    }

    try {
      await request(
        '/rest/v1/students',
        {
          method: 'POST',
          body: JSON.stringify({
            ...student,
            token: 'F126-' + uid()
          })
        }
      );

      existing.add(student.id);
      added++;

    } catch (error) {
      skipped++;
      console.warn(error);
    }
  }

  await sync();

  alert(
    'Agregados: ' + added +
    ' · Omitidos: ' + skipped
  );
}

$('studentForm').onsubmit = async event => {
  event.preventDefault();

  try {
    await addStudents([{
      id: $('studentId').value.trim(),
      name: $('studentName').value.trim(),
      group_name:
        $('studentGroup').value.trim(),
      house: $('studentHouse').value
    }]);

    event.target.reset();

  } catch (error) {
    alert(error.message);
  }
};

$('csvFile').onchange = async event => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const data = parseCsv(
      (await file.text()).replace(/^\uFEFF/, '')
    );

    const headers = data.shift().map(
      text =>
        text.trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
    );

    const idx = name =>
      headers.indexOf(name);

    if (
      [
        'matricula',
        'nombre',
        'grupo',
        'fraternidad'
      ].some(name => idx(name) < 0)
    ) {
      throw Error(
        'Encabezados requeridos: ' +
        'matricula,nombre,grupo,fraternidad'
      );
    }

    const students = data.map(row => ({
      id:
        (row[idx('matricula')] || '').trim(),

      name:
        (row[idx('nombre')] || '').trim(),

      group_name:
        (row[idx('grupo')] || '').trim(),

      house:
        houses.find(
          house =>
            house.toLowerCase() ===
            (
              row[idx('fraternidad')] || ''
            ).trim().toLowerCase()
        ) || ''
    }));

    await addStudents(students);

  } catch (error) {
    alert(error.message);
  }

  event.target.value = '';
};

// ============================================
// BOTONES DEL SISTEMA DE FRATERNIDADES
// ============================================

$('studentSearch').oninput = renderStudents;

[
  'missionDashboard',
  'missionReport',
  'reportHouse',
  'missionScanner'
].forEach(id => {
  $(id).onchange = render;
});

$('qrHouse').onchange = renderQrs;

$('print').onclick = () => {
  renderQrs();
  window.print();
};

$('start').onclick = start;
$('stop').onclick = stop;

$('manualBtn').onclick = () => {
  mark($('manual').value.trim());
  $('manual').value = '';
};

// ============================================
// REPORTES Y RESPALDOS
// ============================================

$('csvReport').onclick = () => {
  const rows = [
    [
      'matricula',
      'nombre',
      'grupo',
      'fraternidad',
      'estado',
      'fecha_hora',
      'sincronizacion'
    ],
    ...reportRows().map(student => [
      student.id,
      student.name,
      student.group_name,
      student.house,
      student.attendance
        ? 'Presente'
        : 'Ausente',
      student.attendance?.recorded_at || '',
      student.attendance
        ? (
            student.attendance.synced
              ? 'Sincronizado'
              : 'Pendiente'
          )
        : ''
    ])
  ];

  download(
    'reporte_fraternidades.csv',
    '\uFEFF' + csv(rows)
  );
};

$('backup').onclick = () => {
  download(
    'respaldo_local_fraternidades.json',
    JSON.stringify(
      {
        profile: state.profile,
        students: state.students,
        missions: state.missions,
        attendance: state.attendance,
        pending: state.pending
      },
      null,
      2
    ),
    'application/json'
  );
};

// ============================================
// INICIALIZACIÓN
// ============================================

$('missionDate').value =
  new Date().toLocaleDateString('en-CA');

if (
  'serviceWorker' in navigator &&
  location.protocol === 'https:'
) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch(console.warn);
}

if (state.profile && state.session) {
  showApp();

  if (
    online() &&
    state.profile.role !== 'docente'
  ) {
    sync();
  }

} else if (!configured()) {
  $('loginMsg').textContent =
    'Antes de iniciar, configura config.js ' +
    'y ejecuta schema.sql en Supabase.';
}
