import { test } from "node:test";
import assert from "node:assert/strict";
import { stripImageMetadata } from "./stripExif.mjs";

// Construye un JPEG mínimo: SOI + APP1(EXIF) + APP0(JFIF) + SOS + scan + EOI.
function makeJpeg() {
  const seg = (marker, payload) => {
    const len = payload.length + 2;
    return Buffer.concat([
      Buffer.from([0xff, marker, (len >> 8) & 0xff, len & 0xff]),
      payload,
    ]);
  };
  const soi = Buffer.from([0xff, 0xd8]);
  const app1 = seg(0xe1, Buffer.from("Exif\x00\x00GPSDATA-secret", "latin1"));
  const app0 = seg(0xe0, Buffer.from("JFIF\x00", "latin1"));
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01]); // SOS + 1 byte scan
  const scan = Buffer.from([0x12, 0x34]);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app1, app0, sos, scan, eoi]);
}

test("JPEG: quita APP1/EXIF pero conserva imagen y APP0", () => {
  const input = makeJpeg();
  const out = stripImageMetadata(input, "image/jpeg");
  assert.ok(!out.includes(Buffer.from("Exif")), "EXIF debe desaparecer");
  assert.ok(!out.includes(Buffer.from("GPSDATA-secret")), "GPS debe desaparecer");
  assert.ok(out.includes(Buffer.from("JFIF")), "APP0/JFIF se conserva");
  assert.equal(out[0], 0xff);
  assert.equal(out[1], 0xd8); // sigue siendo JPEG (SOI)
  assert.ok(out.length < input.length);
});

test("PNG: quita chunk tEXt pero conserva IHDR/IEND", () => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); // CRC no se valida en el stripper
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = chunk("IHDR", Buffer.alloc(13, 1));
  const text = chunk("tEXt", Buffer.from("Comment\x00ubicacion-secreta", "latin1"));
  const iend = chunk("IEND", Buffer.alloc(0));
  const input = Buffer.concat([sig, ihdr, text, iend]);
  const out = stripImageMetadata(input, "image/png");
  assert.ok(!out.includes(Buffer.from("ubicacion-secreta")), "tEXt debe desaparecer");
  assert.ok(out.includes(Buffer.from("IHDR")));
  assert.ok(out.includes(Buffer.from("IEND")));
  assert.ok(out.length < input.length);
});

test("formato desconocido y datos basura: passthrough sin romper", () => {
  const junk = Buffer.from([1, 2, 3, 4, 5]);
  assert.deepEqual(stripImageMetadata(junk, "image/webp"), junk);
  assert.deepEqual(stripImageMetadata(junk, "image/jpeg"), junk); // no es JPEG → original
});
