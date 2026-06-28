// Quita metadatos (EXIF/XMP/GPS, comentarios) de una imagen ANTES de subirla al
// bucket público. Puro y testeable (`node --test`): sin dependencias nativas.
//
// Por qué: las fotos de personas/edificios van a un bucket PÚBLICO. Una foto de
// teléfono suele traer GPS en EXIF → publicar la imagen filtraría la ubicación
// exacta de quien reporta. El picker del cliente ya re-encoda con <canvas> (lo
// que elimina EXIF), pero esto es defensa en profundidad para cualquier subida
// que NO pase por ese widget (p. ej. un POST directo al server action).
//
// Cobertura: JPEG (quita APP1=EXIF/XMP y COM) y PNG (quita chunks de metadatos).
// WebP se deja pasar (el widget solo produce JPEG); si en el futuro se acepta
// WebP de fuentes no confiables, añadir aquí su limpieza. Ante CUALQUIER duda o
// formato desconocido, devuelve el buffer original — nunca corrompe la imagen.

// JPEG: recorre los segmentos marcador y descarta APP1 (0xE1) y COM (0xFE).
// Conserva APP0 (JFIF) y el resto; copia intacto a partir de SOS (datos de scan).
function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // no es JPEG
  const out = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return buf; // desalineado → no tocar
    let marker = buf[i + 1];
    while (marker === 0xff && i + 2 < buf.length) {
      i += 1; // saltar bytes de relleno 0xFF
      marker = buf[i + 1];
    }
    // SOS (inicio de scan) o EOI: copiar todo lo restante y terminar.
    if (marker === 0xda || marker === 0xd9) {
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    // Marcadores autónomos sin longitud (RST0–RST7): copiar y seguir.
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return buf; // truncado
    const len = buf.readUInt16BE(i + 2); // incluye los 2 bytes de longitud
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) return buf; // malformado → no tocar
    const drop = marker === 0xe1 || marker === 0xfe; // APP1 (EXIF/XMP) / COM
    if (!drop) out.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(out);
}

// PNG: recorre los chunks y descarta los ancilares de metadatos.
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
function stripPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return buf;
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (end > buf.length) {
      out.push(buf.subarray(i)); // malformado → copiar resto sin tocar
      break;
    }
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    if (type === "IEND") break;
    i = end;
  }
  return Buffer.concat(out);
}

/**
 * Devuelve un buffer sin metadatos para el contentType dado.
 * Nunca lanza: ante cualquier problema devuelve el buffer original.
 * @param {Buffer | Uint8Array} input
 * @param {string} contentType
 * @returns {Buffer}
 */
export function stripImageMetadata(input, contentType) {
  try {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    if (contentType === "image/jpeg") return stripJpeg(buf);
    if (contentType === "image/png") return stripPng(buf);
    return buf; // webp / desconocido: passthrough
  } catch {
    return Buffer.isBuffer(input) ? input : Buffer.from(input);
  }
}
