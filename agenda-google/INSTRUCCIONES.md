# Conectar la agenda con Google Calendar

La página funciona en **modo demostración** hasta que hagas estos pasos (unos 10 minutos, una sola vez).
Todo se hace **con la sesión iniciada en `psic.katherine.ramos@gmail.com`**: así las citas caen en su calendario y los correos salen desde su cuenta.

## 1. Crear el script

1. Entra a <https://script.google.com> con la cuenta de Katherine → **Nuevo proyecto**.
2. Ponle de nombre `Agenda web`.
3. Borra lo que haya en `Código.gs` y pega todo el contenido de [`Code.gs`](Code.gs).
4. Engranaje ⚙️ **Configuración del proyecto** → marca **"Mostrar el archivo de manifiesto appsscript.json"**.
   Vuelve al editor, abre `appsscript.json` y reemplázalo por el contenido de [`appsscript.json`](appsscript.json).
   (Esto activa el servicio de Calendar que crea el enlace de **Google Meet** automáticamente.)
5. Guarda (💾).

## 2. Dar permisos y probar

1. Arriba, elige la función `probarConfiguracion` → **Ejecutar**.
2. Google pedirá permisos → **Revisar permisos** → elige la cuenta → *"Google no verificó esta app"* → **Configuración avanzada → Ir a Agenda web** → **Permitir**.
   (Es normal: la app es suya y solo ella la usa.)
3. En el registro debe aparecer cuántos días tienen horarios libres.

## 3. Publicar

1. **Implementar → Nueva implementación** → tipo **Aplicación web**.
2. *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier usuario**.
3. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
4. En `index.html`, busca `const AGENDA_URL = '';` y pega la URL entre las comillas:
   ```js
   const AGENDA_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
   ```
   El aviso de "Modo demostración" desaparece solo.

## 4. Recordatorios (opcional, recomendado)

Elige la función `instalarRecordatorios` → **Ejecutar**. Desde entonces, cada paciente recibe un correo cálido de recordatorio un día antes de su sesión.

---

## Cómo funciona en el día a día

- **Cuando alguien reserva:** se crea el evento en su Google Calendar (en verde, con enlace de Meet), el paciente recibe un correo de bienvenida + la invitación de Calendar, y Katherine recibe un aviso con los datos y el motivo de consulta.
- **Mover o cancelar una cita:** desde la app de Google Calendar, como cualquier evento. Al guardar, elige **"Enviar"** para que Google le avise al paciente.
- **Bloquear horarios:** cualquier evento con hora en su calendario ocupa ese espacio automáticamente.
  Para bloquear un **día entero**, crea un evento de *todo el día* titulado **"No disponible"** (también sirven "Vacaciones", "Feriado", "Descanso", "Ocupada").
- **Cambiar el horario de atención, la duración o la anticipación mínima:** edita `CONFIG` al inicio del script y luego **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva → Implementar** (la URL no cambia).
  Si cambias `HORARIO`, actualiza también el de `datosDemo()` en `index.html` (solo afecta al modo demostración).

## Límites a tener en cuenta

- Una cuenta gratuita de Gmail puede enviar ~100 correos al día desde scripts: sobra para una agenda.
- El formulario tiene una protección básica contra bots, pero no un captcha.
