/* Sólo usa la API local. Las credenciales de R2 permanecen en el servidor. */
const $ = (selector) => document.querySelector(selector)
let contexto
let elegido
let previewUrl
let subiendo = false
let limpiando = false
const tarjetas = new Map()
const archivos = new Map()
const fmtBytes = (cantidad) =>
  cantidad < 1024 * 1024
    ? `${(cantidad / 1024).toFixed(1)} KB`
    : `${(cantidad / 1024 / 1024).toFixed(2)} MB`

function aviso(texto, tipo = '') {
  const notice = $('#notice')
  notice.textContent = texto
  notice.className = `notice ${tipo}`
  notice.hidden = !texto
}
async function api(ruta, method = 'GET') {
  const respuesta = await fetch(ruta, {
    method,
    headers: contexto ? { 'X-Demo-Token': contexto.token } : {},
    cache: 'no-store',
  })
  if (respuesta.status === 204) return null
  const datos = await respuesta.json()
  if (!respuesta.ok) throw new Error(datos.error || 'No se pudo completar la operación.')
  return datos
}
function quitarSeleccion() {
  elegido = undefined
  $('#file-input').value = ''
  $('#selection').hidden = true
  $('#upload-button').disabled = true
  $('#preview').hidden = true
  $('#preview').removeAttribute('src')
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = undefined
}
function elegir(archivo) {
  if (!archivo || !contexto || subiendo) return
  quitarSeleccion()
  const extension = archivo.name.split('.').pop().toLowerCase()
  if (!contexto.extensiones.includes(extension))
    return aviso('Ese tipo de archivo no está permitido.', 'error')
  if (archivo.size === 0 || archivo.size > contexto.maxBytes)
    return aviso(
      `El archivo debe tener contenido y pesar hasta ${fmtBytes(contexto.maxBytes)}.`,
      'error',
    )
  elegido = archivo
  $('#selected-name').textContent = archivo.name
  $('#selected-size').textContent = fmtBytes(archivo.size)
  $('#selection').hidden = false
  $('#upload-button').disabled = false
  if (['jpg', 'jpeg', 'png'].includes(extension)) {
    previewUrl = URL.createObjectURL(archivo)
    $('#preview').src = previewUrl
    $('#preview').hidden = false
  }
  aviso('')
}
function actualizarCantidad() {
  const cantidad = archivos.size
  $('#file-count').textContent = `${cantidad} ${cantidad === 1 ? 'archivo' : 'archivos'}`
  $('#empty').hidden = cantidad > 0
  $('#cleanup-bar').hidden = cantidad === 0
  $('#cleanup').disabled = limpiando || subiendo
}
function resultado(tarjeta, texto, tipo = '') {
  const elemento = tarjeta.querySelector('.file-result')
  elemento.hidden = false
  elemento.className = `file-result ${tipo}`
  elemento.textContent = texto
}
function actualizarReloj(tarjeta) {
  if (!tarjeta.enlace) return
  const segundos = Math.max(0, Math.ceil((Date.parse(tarjeta.enlace.venceEn) - Date.now()) / 1000))
  tarjeta.querySelector('.countdown').textContent = segundos
    ? `Enlace disponible · ${segundos} s restantes`
    : 'Enlace vencido · generá uno nuevo o comprobá el rechazo'
  tarjeta.querySelector('.expiry').classList.toggle('expired', segundos === 0)
  tarjeta.querySelector('.download').textContent = segundos
    ? 'Descargar archivo'
    : 'Abrir enlace vencido'
}
async function borrar(id) {
  await api(`/api/files/${id}`, 'DELETE')
  tarjetas.get(id)?.remove()
  tarjetas.delete(id)
  archivos.delete(id)
  actualizarCantidad()
}
function agregar(archivo) {
  archivos.set(archivo.id, archivo)
  const tarjeta = $('#file-template').content.firstElementChild.cloneNode(true)
  tarjetas.set(archivo.id, tarjeta)
  tarjeta.querySelector('.file-name').textContent = archivo.nombreOriginal
  tarjeta.querySelector('.file-type').textContent = archivo.nombreOriginal
    .split('.')
    .pop()
    .toUpperCase()
  tarjeta.querySelector('.file-size').textContent =
    `${fmtBytes(Number(archivo.tamanoBytes))} · Guardado en R2`
  tarjeta.querySelector('.file-key').textContent = archivo.clave
  const generar = tarjeta.querySelector('.generate')
  const verificar = tarjeta.querySelector('.verify')
  const eliminar = tarjeta.querySelector('.delete')
  generar.addEventListener('click', async () => {
    generar.disabled = true
    try {
      tarjeta.enlace = await api(`/api/files/${archivo.id}/link`, 'POST')
      tarjeta.querySelector('.download').href = tarjeta.enlace.url
      tarjeta.querySelector('.download-area').hidden = false
      generar.textContent = 'Generar un nuevo enlace'
      actualizarReloj(tarjeta)
      resultado(tarjeta, 'Enlace generado. Ya podés descargar el archivo.')
    } catch (error) {
      resultado(tarjeta, error.message, 'error')
    } finally {
      generar.disabled = false
    }
  })
  verificar.addEventListener('click', async () => {
    verificar.disabled = true
    resultado(tarjeta, 'Descargando desde R2 para comprobar el contenido…')
    try {
      const datos = await api(`/api/files/${archivo.id}/check`, 'POST')
      if (datos.coincide)
        resultado(
          tarjeta,
          `Descarga verificada · HTTP ${datos.httpStatus}. El contenido es idéntico al archivo original.`,
          'success',
        )
      else if (datos.vencido && [400, 401, 403].includes(datos.httpStatus))
        resultado(
          tarjeta,
          `Vencimiento comprobado · R2 rechazó este enlace con HTTP ${datos.httpStatus}. El archivo sigue guardado.`,
          'expired',
        )
      else
        resultado(
          tarjeta,
          `No se pudo verificar el contenido. Respuesta de R2: HTTP ${datos.httpStatus}.`,
          'error',
        )
    } catch (error) {
      resultado(tarjeta, error.message, 'error')
    } finally {
      verificar.disabled = false
    }
  })
  tarjeta.querySelector('.copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tarjeta.enlace.url)
      resultado(tarjeta, 'Enlace copiado. Se puede usar hasta su vencimiento.')
    } catch {
      resultado(
        tarjeta,
        'El navegador no permitió copiar. Podés copiar la dirección desde el botón Descargar archivo.',
        'error',
      )
    }
  })
  eliminar.addEventListener('click', async () => {
    eliminar.disabled = true
    try {
      await borrar(archivo.id)
      aviso('Archivo de prueba eliminado de R2.', 'success')
    } catch (error) {
      resultado(tarjeta, error.message, 'error')
      eliminar.disabled = false
    }
  })
  $('#file-list').prepend(tarjeta)
  actualizarCantidad()
}

$('#file-input').addEventListener('change', (event) => elegir(event.target.files[0]))
$('#clear-file').addEventListener('click', quitarSeleccion)
const zona = $('#dropzone')
for (const evento of ['dragenter', 'dragover'])
  zona.addEventListener(evento, (event) => {
    event.preventDefault()
    if (!subiendo) zona.classList.add('dragging')
  })
for (const evento of ['dragleave', 'drop'])
  zona.addEventListener(evento, (event) => {
    event.preventDefault()
    zona.classList.remove('dragging')
  })
zona.addEventListener('drop', (event) => elegir(event.dataTransfer.files[0]))
window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => event.preventDefault())
$('#upload-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!elegido || subiendo) return
  subiendo = true
  $('#upload-button').disabled = true
  $('#file-input').disabled = true
  $('#clear-file').disabled = true
  $('#progress-box').hidden = false
  $('#upload-progress').value = 0
  $('#progress-value').textContent = ''
  $('#progress-label').textContent = 'Enviando al backend…'
  actualizarCantidad()
  aviso('')
  try {
    const archivo = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/files')
      xhr.timeout = 150_000
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(elegido.name))
      xhr.setRequestHeader('X-Demo-Token', contexto.token)
      xhr.upload.onprogress = (progreso) => {
        if (!progreso.lengthComputable) return
        const porcentaje = Math.round((progreso.loaded / progreso.total) * 100)
        $('#upload-progress').value = porcentaje
        $('#progress-value').textContent = `${porcentaje}%`
        if (porcentaje === 100) $('#progress-label').textContent = 'Guardando en Cloudflare R2…'
      }
      xhr.onerror = () =>
        reject(
          new Error(
            'Se perdió la conexión con la interfaz local. Revisá que la terminal siga abierta.',
          ),
        )
      xhr.ontimeout = () =>
        reject(new Error('La subida tardó demasiado. Recargá la lista antes de volver a intentar.'))
      xhr.onload = () => {
        try {
          const datos = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) resolve(datos.archivo)
          else reject(new Error(datos.error || 'No se pudo subir el archivo.'))
        } catch {
          reject(new Error('El servidor devolvió una respuesta inesperada.'))
        }
      }
      xhr.send(elegido)
    })
    agregar(archivo)
    quitarSeleccion()
    aviso('Archivo subido a R2. Generá un enlace para descargarlo.', 'success')
  } catch (error) {
    aviso(error.message, 'error')
  } finally {
    subiendo = false
    $('#file-input').disabled = false
    $('#clear-file').disabled = false
    $('#upload-button').disabled = !elegido
    $('#progress-box').hidden = true
    actualizarCantidad()
  }
})
$('#cleanup').addEventListener('click', async () => {
  if (limpiando || !archivos.size) return
  if (
    !window.confirm(
      `¿Eliminar de R2 los ${archivos.size} archivos de esta prueba? Tus originales en la computadora se conservan.`,
    )
  )
    return
  limpiando = true
  actualizarCantidad()
  try {
    for (const id of [...archivos.keys()]) await borrar(id)
    aviso('Se eliminaron de R2 todos los archivos de esta prueba.', 'success')
  } catch (error) {
    aviso(error.message, 'error')
  } finally {
    limpiando = false
    actualizarCantidad()
  }
})
setInterval(() => tarjetas.forEach(actualizarReloj), 1000)

async function iniciar() {
  try {
    contexto = await api('/api/context')
    $('#connection-text').textContent =
      `Bucket: ${contexto.bucket} · Enlaces de ${contexto.segundos} segundos`
    $('.connection').classList.add('ready')
    $('#limits').textContent =
      `${contexto.extensiones.join(', ').toUpperCase()} · Hasta ${fmtBytes(contexto.maxBytes)}`
    $('#file-input').accept = contexto.extensiones.map((extension) => `.${extension}`).join(',')
    const datos = await api('/api/files')
    datos.archivos.forEach(agregar)
    $('#file-input').disabled = false
  } catch (error) {
    $('#connection-text').textContent = 'No se pudo cargar la interfaz local'
    $('.connection').classList.add('failed')
    aviso(error.message, 'error')
  }
}
iniciar()
