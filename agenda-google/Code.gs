/**
 * Agenda de Orientación y Consejería Psicológica — Katherine Ramos
 *
 * Se despliega como "Aplicación web" desde la cuenta psic.katherine.ramos@gmail.com
 * (ver INSTRUCCIONES.md). Todo lo que la página reserva cae en el Google Calendar
 * de esa cuenta, así que Katherine puede mover, editar o cancelar las citas desde
 * su app de Google Calendar como cualquier otro evento.
 */

// ───────────────────────── CONFIGURACIÓN ─────────────────────────
// Lo único que normalmente hay que tocar está aquí.
const CONFIG = {
  CORREO_PSICOLOGA: 'psic.katherine.ramos@gmail.com',
  NOMBRE_PSICOLOGA: 'Katherine Ramos',
  FIRMA: 'Estudiante de Psicología · Orientación y consejería psicológica',
  CALENDARIO_ID: 'primary',

  DURACION_MIN: 50,
  // Descanso tras cada sesión: impide que se reserve un horario pegado a otro evento.
  MARGEN_MIN: 10,
  DIAS_A_MOSTRAR: 21,
  // Evita reservas de último momento que Katherine no alcanzaría a ver.
  HORAS_ANTICIPACION_MIN: 12,

  // Horas de inicio de cada sesión, en hora de Perú.
  // 0 = domingo, 1 = lunes … 6 = sábado. Un día sin lista no se atiende.
  HORARIO: {
    1: ['16:00', '17:00', '18:00', '19:00'],
    2: ['16:00', '17:00', '18:00', '19:00'],
    3: ['16:00', '17:00', '18:00', '19:00'],
    4: ['16:00', '17:00', '18:00', '19:00'],
    5: ['16:00', '17:00', '18:00'],
    6: ['09:00', '10:00', '11:00', '12:00'],
  },
};

// Perú no usa horario de verano: el desfase es fijo todo el año.
const OFFSET = '-05:00';
const ZONA = 'America/Lima';
const ORIGEN = 'web-agenda';

// ───────────────────────── PUNTOS DE ENTRADA ─────────────────────────

function doGet() {
  try {
    return json({
      ok: true,
      duracionMin: CONFIG.DURACION_MIN,
      dias: calcularDisponibilidad(),
    });
  } catch (err) {
    console.error('doGet: ' + err.name);
    return json({ ok: false, error: 'servidor' });
  }
}

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (_) {
    return json({ ok: false, error: 'formato' });
  }

  // Campo trampa: invisible para personas, los bots lo rellenan.
  if (d.sitio) return json({ ok: true });

  const problema = validar(d);
  if (problema) return json({ ok: false, error: 'datos', detalle: problema });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json({ ok: false, error: 'servidor' });

  let evento, inicio;
  try {
    // Se vuelve a comprobar dentro del candado: dos personas pueden haber
    // elegido el mismo horario con la página abierta.
    inicio = new Date(d.inicio);
    const libre = calcularDisponibilidad().some(dia =>
      dia.horas.some(h => h.inicio === inicio.toISOString()));
    if (!libre) return json({ ok: false, error: 'no_disponible' });

    const fin = new Date(inicio.getTime() + CONFIG.DURACION_MIN * 60000);
    evento = crearEvento(d, inicio, fin);
  } catch (err) {
    console.error('doPost: ' + err.name);
    return json({ ok: false, error: 'servidor' });
  } finally {
    lock.releaseLock();
  }

  // La cita ya existe en el calendario: un fallo de correo no debe anularla.
  try { correoPaciente(d, inicio, evento); } catch (err) { console.error('correoPaciente: ' + err.name); }
  try { correoPsicologa(d, inicio, evento); } catch (err) { console.error('correoPsicologa: ' + err.name); }

  return json({ ok: true, inicio: inicio.toISOString(), meet: evento.meet });
}

// ───────────────────────── DISPONIBILIDAD ─────────────────────────

function calcularDisponibilidad() {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDARIO_ID) || CalendarApp.getDefaultCalendar();
  const ahora = new Date();
  const limite = ahora.getTime() + CONFIG.HORAS_ANTICIPACION_MIN * 3600000;
  const desde = new Date(fechaLima(ahora) + 'T00:00:00' + OFFSET);
  const hasta = new Date(desde.getTime() + (CONFIG.DIAS_A_MOSTRAR + 1) * 86400000);

  const ocupados = cal.getEvents(desde, hasta)
    .filter(bloquea)
    .map(ev => [ev.getStartTime().getTime(), ev.getEndTime().getTime()]);

  const dias = [];
  for (let i = 0; i < CONFIG.DIAS_A_MOSTRAR; i++) {
    const fecha = fechaLima(new Date(desde.getTime() + i * 86400000 + 12 * 3600000));
    const diaSemana = new Date(fecha + 'T12:00:00' + OFFSET).getUTCDay();
    const horas = (CONFIG.HORARIO[diaSemana] || [])
      .map(hhmm => {
        const ini = new Date(fecha + 'T' + hhmm + ':00' + OFFSET).getTime();
        return { ini: ini, fin: ini + (CONFIG.DURACION_MIN + CONFIG.MARGEN_MIN) * 60000 };
      })
      .filter(s => s.ini >= limite && !ocupados.some(([a, b]) => s.ini < b && a < s.fin))
      .map(s => ({ inicio: new Date(s.ini).toISOString() }));
    dias.push({ fecha: fecha, horas: horas });
  }
  return dias;
}

/**
 * Los eventos con hora siempre ocupan el horario (salvo los rechazados o
 * marcados como "Disponible"). Los de todo el día solo bloquean si su título lo
 * dice: así un cumpleaños no cierra la agenda, pero "No disponible" sí.
 */
function bloquea(ev) {
  try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return false; } catch (_) {}
  try {
    if (ev.getTransparency && ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) return false;
  } catch (_) {}
  if (ev.isAllDayEvent()) return /no disponible|bloque|vacacion|ocupad|feriado|descanso/i.test(ev.getTitle());
  return true;
}

// ───────────────────────── EVENTO ─────────────────────────

function crearEvento(d, inicio, fin) {
  const titulo = '🌿 Consejería · ' + d.nombre;
  const descripcion = [
    'Sesión de orientación y consejería psicológica (virtual).',
    '',
    'Paciente: ' + d.nombre,
    'Correo: ' + d.correo,
    'Teléfono: ' + d.telefono,
    'Primera vez: ' + (d.primeraVez ? 'sí' : 'no'),
    '',
    'Motivo de consulta:',
    d.motivo || '— (no indicado)',
    '',
    'Reservado desde la página web. Si mueves o cancelas la cita,',
    'Google avisará al paciente por correo.',
  ].join('\n');

  // Con el servicio avanzado de Calendar se añade el enlace de Google Meet.
  // Si no está activado, se crea igual pero sin Meet.
  try {
    const ev = Calendar.Events.insert({
      summary: titulo,
      description: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: ZONA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA },
      attendees: [{ email: d.correo, displayName: d.nombre }],
      colorId: '2',
      guestsCanSeeOtherGuests: false,
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      conferenceData: {
        createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      extendedProperties: { private: { origen: ORIGEN, nombre: d.nombre } },
    }, CONFIG.CALENDARIO_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });
    return { meet: ev.hangoutLink || '', enlace: ev.htmlLink || '' };
  } catch (_) {
    const cal = CalendarApp.getCalendarById(CONFIG.CALENDARIO_ID) || CalendarApp.getDefaultCalendar();
    const ev = cal.createEvent(titulo, inicio, fin, { description: descripcion, guests: d.correo, sendInvites: true });
    ev.setColor(CalendarApp.EventColor.PALE_GREEN);
    ev.setTag('origen', ORIGEN);
    ev.setTag('nombre', d.nombre);
    return { meet: '', enlace: '' };
  }
}

// ───────────────────────── CORREOS ─────────────────────────

function correoPaciente(d, inicio, evento) {
  const nombre = primerNombre(d.nombre);
  const cuerpo =
    '<p>Hola, ' + esc(nombre) + ':</p>' +
    '<p>Gracias por darte este momento. Reservar un espacio para ti, para escucharte y cuidar de tu ' +
    'bienestar emocional, ya es un acto de valentía y de cariño contigo. Me alegra que hayas decidido dar este paso.</p>' +
    caja('🌿 Tu sesión',
      fila('Fecha', fechaLarga(inicio)) +
      fila('Hora', horaCorta(inicio) + ' (hora de Perú)') +
      fila('Duración', CONFIG.DURACION_MIN + ' minutos') +
      fila('Modalidad', 'Virtual · Google Meet') +
      (evento.meet ? fila('Enlace', '<a href="' + esc(evento.meet) + '" style="color:#4E7A4E">' + esc(evento.meet) + '</a>', true)
                   : fila('Enlace', 'Te lo enviaré antes de la sesión'))) +
    caja('🍃 Para nuestro encuentro',
      '<ul style="margin:0;padding-left:18px;line-height:1.7">' +
      '<li>Busca un lugar tranquilo y privado donde puedas hablar con libertad.</li>' +
      '<li>Si puedes, usa audífonos y ten a mano un poco de agua.</li>' +
      '<li>No necesitas preparar nada: llega tal como estás. Iremos a tu ritmo.</li>' +
      '</ul>') +
    '<p>Todo lo que compartas será tratado con confidencialidad y respeto. Si necesitas reprogramar, ' +
    'avísame con al menos 24 horas de anticipación respondiendo a este correo o por WhatsApp.</p>' +
    '<p>También te llegará una invitación de Google Calendar para que la cita quede en tu agenda.</p>' +
    '<p>Nos vemos pronto. Con cariño,</p>' + firma() + avisoCrisis();

  MailApp.sendEmail({
    to: d.correo,
    subject: '🌿 Tu espacio está reservado — ' + fechaLarga(inicio) + ', ' + horaCorta(inicio),
    htmlBody: plantilla('Tu espacio está reservado', cuerpo),
    name: CONFIG.NOMBRE_PSICOLOGA + ' · Orientación psicológica',
    replyTo: CONFIG.CORREO_PSICOLOGA,
  });
}

function correoPsicologa(d, inicio, evento) {
  const cuerpo =
    '<p>Hola, Katherine 🌿</p>' +
    '<p>Alguien acaba de reservar un espacio contigo desde tu página web.</p>' +
    caja('📅 Cita',
      fila('Fecha', fechaLarga(inicio)) +
      fila('Hora', horaCorta(inicio) + ' (hora de Perú)') +
      (evento.meet ? fila('Meet', '<a href="' + esc(evento.meet) + '">' + esc(evento.meet) + '</a>', true) : '')) +
    caja('👤 Paciente',
      fila('Nombre', esc(d.nombre), true) +
      fila('Correo', esc(d.correo), true) +
      fila('Teléfono', esc(d.telefono), true) +
      fila('Primera vez', d.primeraVez ? 'Sí' : 'No')) +
    caja('💬 Motivo de consulta', '<p style="margin:0;white-space:pre-wrap">' + (esc(d.motivo) || '— No indicado') + '</p>') +
    '<p>La cita ya está en tu Google Calendar. Si la mueves o la cancelas desde la app, ' +
    'Google le avisará al paciente automáticamente.</p>' +
    (evento.enlace ? '<p><a href="' + esc(evento.enlace) + '" style="color:#4E7A4E;font-weight:bold">Abrir en Google Calendar →</a></p>' : '');

  MailApp.sendEmail({
    to: CONFIG.CORREO_PSICOLOGA,
    subject: '📅 Nueva cita: ' + d.nombre + ' — ' + fechaLarga(inicio) + ', ' + horaCorta(inicio),
    htmlBody: plantilla('Nueva cita agendada', cuerpo),
    name: 'Agenda web',
    replyTo: d.correo,
  });
}

// ───────────────────────── RECORDATORIOS ─────────────────────────

/** Ejecutar una sola vez a mano: programa el envío de recordatorios cada hora. */
function instalarRecordatorios() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'enviarRecordatorios')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyHours(1).create();
}

/**
 * Un día antes, un correo cálido de recordatorio. Lee el calendario en el
 * momento del envío, así que si Katherine movió la cita se recuerda la hora
 * nueva, y si la canceló no se envía nada.
 */
function enviarRecordatorios() {
  const ahora = Date.now();
  const res = Calendar.Events.list(CONFIG.CALENDARIO_ID, {
    timeMin: new Date(ahora).toISOString(),
    timeMax: new Date(ahora + 25 * 3600000).toISOString(),
    singleEvents: true,
    privateExtendedProperty: 'origen=' + ORIGEN,
  });
  const props = PropertiesService.getScriptProperties();

  (res.items || []).forEach(ev => {
    if (ev.status === 'cancelled' || !ev.start || !ev.start.dateTime) return;
    const clave = 'rec_' + ev.id + '_' + ev.start.dateTime;
    if (props.getProperty(clave)) return;

    const inicio = new Date(ev.start.dateTime);
    // Quien reservó con menos de un día de margen acaba de recibir la confirmación.
    if (inicio.getTime() - new Date(ev.created).getTime() < 24 * 3600000) {
      props.setProperty(clave, '1');
      return;
    }
    const invitado = (ev.attendees || []).find(a => !a.self && !a.organizer && a.responseStatus !== 'declined');
    if (!invitado) return;

    const nombre = (ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.nombre)
      || invitado.displayName || '';
    const cuerpo =
      '<p>Hola' + (nombre ? ', ' + esc(primerNombre(nombre)) : '') + ':</p>' +
      '<p>Te escribo con cariño para recordarte que mañana tenemos nuestro espacio juntos. ' +
      'Ojalá puedas llegar con calma, sin prisa: este tiempo es tuyo.</p>' +
      caja('🌿 Tu sesión',
        fila('Fecha', fechaLarga(inicio)) +
        fila('Hora', horaCorta(inicio) + ' (hora de Perú)') +
        (ev.hangoutLink ? fila('Enlace', '<a href="' + esc(ev.hangoutLink) + '" style="color:#4E7A4E">' + esc(ev.hangoutLink) + '</a>', true) : '')) +
      '<p>Si te surgió algún imprevisto, respóndeme este correo y buscamos otro momento. No pasa nada.</p>' +
      '<p>Hasta mañana,</p>' + firma() + avisoCrisis();

    MailApp.sendEmail({
      to: invitado.email,
      subject: '🍃 Mañana nos vemos — ' + horaCorta(inicio) + ' (hora de Perú)',
      htmlBody: plantilla('Un recordatorio con cariño', cuerpo),
      name: CONFIG.NOMBRE_PSICOLOGA + ' · Orientación psicológica',
      replyTo: CONFIG.CORREO_PSICOLOGA,
    });
    props.setProperty(clave, '1');
  });
}

/** Ejecutar una vez a mano para conceder permisos y ver la disponibilidad en el registro. */
function probarConfiguracion() {
  const dias = calcularDisponibilidad();
  console.log('Días con horarios libres: ' + dias.filter(d => d.horas.length).length + ' de ' + dias.length);
}

// ───────────────────────── AUXILIARES ─────────────────────────

function validar(d) {
  if (!d.inicio || isNaN(new Date(d.inicio))) return 'inicio';
  if (typeof d.nombre !== 'string' || d.nombre.trim().length < 2 || d.nombre.length > 80) return 'nombre';
  if (typeof d.correo !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo) || d.correo.length > 120) return 'correo';
  if (typeof d.telefono !== 'string' || !/^[+\d\s()-]{6,20}$/.test(d.telefono)) return 'telefono';
  if (d.motivo && (typeof d.motivo !== 'string' || d.motivo.length > 600)) return 'motivo';
  if (d.mayorDeEdad !== true || d.consentimiento !== true) return 'consentimiento';
  d.nombre = d.nombre.trim();
  d.correo = d.correo.trim().toLowerCase();
  d.telefono = d.telefono.trim();
  d.motivo = (d.motivo || '').trim();
  return null;
}

function plantilla(titulo, cuerpo) {
  return '<div style="background:#FFF8F0;padding:24px 12px;font-family:Nunito,Segoe UI,Arial,sans-serif;color:#3A2E24">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E3EEDA">' +
    '<div style="background:linear-gradient(135deg,#BDD9AD,#EAE3F7,#F9E0E0);padding:26px 28px;text-align:center">' +
    '<div style="font-size:30px">🌿</div>' +
    '<h1 style="margin:6px 0 0;font-family:Georgia,serif;font-style:italic;font-size:24px;color:#3A2E24">' + esc(titulo) + '</h1></div>' +
    '<div style="padding:24px 28px;font-size:15px;line-height:1.7;color:#5A4535">' + cuerpo + '</div></div></div>';
}

function caja(titulo, contenido) {
  return '<div style="background:#EBF4E2;border-radius:14px;padding:14px 18px;margin:16px 0">' +
    '<div style="font-weight:bold;color:#4E7A4E;margin-bottom:6px">' + titulo + '</div>' + contenido + '</div>';
}

// `yaEscapado` permite pasar HTML propio (enlaces); el resto se escapa aquí.
function fila(etiqueta, valor, yaEscapado) {
  return '<div style="padding:2px 0"><span style="color:#7A6058">' + esc(etiqueta) + ':</span> <strong>' +
    (yaEscapado ? valor : esc(valor)) + '</strong></div>';
}

function firma() {
  return '<p style="margin:4px 0 0;font-family:Georgia,serif;font-style:italic;font-size:18px;color:#3A2E24">' +
    esc(CONFIG.NOMBRE_PSICOLOGA) + '</p><p style="margin:0;font-size:13px;color:#7A6058">' + esc(CONFIG.FIRMA) + '</p>';
}

function avisoCrisis() {
  return '<p style="margin-top:22px;padding:12px 14px;background:#F9E0E0;border-radius:12px;font-size:12.5px;color:#5A4535">' +
    'Este espacio no es un servicio de emergencias. Si atraviesas una crisis o sientes que tu vida está en riesgo, ' +
    'llama gratis a la <strong>Línea 113, opción 5</strong> (salud mental, MINSA) o acude al servicio de emergencia más cercano. ' +
    'No estás sola, no estás solo.</p>';
}

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLima(fecha) {
  return Utilities.formatDate(fecha, ZONA, 'yyyy-MM-dd');
}

function fechaLarga(fecha) {
  const [a, m, d] = fechaLima(fecha).split('-').map(Number);
  const diaSemana = new Date(fechaLima(fecha) + 'T12:00:00' + OFFSET).getUTCDay();
  return DIAS_ES[diaSemana] + ' ' + d + ' de ' + MESES_ES[m - 1] + (a !== new Date().getFullYear() ? ' de ' + a : '');
}

function horaCorta(fecha) {
  const [h, min] = Utilities.formatDate(fecha, ZONA, 'H:mm').split(':').map(Number);
  return (h % 12 || 12) + ':' + String(min).padStart(2, '0') + (h < 12 ? ' a. m.' : ' p. m.');
}

function primerNombre(nombre) {
  return String(nombre).trim().split(/\s+/)[0];
}

function esc(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
