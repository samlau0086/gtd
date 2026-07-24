import { deflateSync } from "node:zlib";

const DIGITS = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function localDate(date = new Date()) {
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function countDueToday(tasks, date = localDate()) {
  if (!Array.isArray(tasks)) return 0;
  return tasks.filter(
    (task) => task?.status !== "done" && task?.dueDate === date,
  ).length;
}

export function createBadgePng(count) {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  const label = String(Math.max(1, Math.min(99, Math.trunc(count))));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - 15.5, y - 15.5);
      if (distance > 15.5) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = 232;
      pixels[offset + 1] = 65;
      pixels[offset + 2] = 72;
      pixels[offset + 3] = distance > 14.5 ? Math.round((15.5 - distance) * 255) : 255;
    }
  }

  const scale = label.length === 1 ? 5 : 3;
  const digitWidth = 3 * scale;
  const gap = label.length === 1 ? 0 : 2;
  const totalWidth = label.length * digitWidth + (label.length - 1) * gap;
  const startX = Math.floor((size - totalWidth) / 2);
  const startY = Math.floor((size - 5 * scale) / 2);

  [...label].forEach((digit, index) => {
    DIGITS[digit].forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") return;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            const x = startX + index * (digitWidth + gap) + columnIndex * scale + px;
            const y = startY + rowIndex * scale + py;
            const offset = (y * size + x) * 4;
            pixels[offset] = 255;
            pixels[offset + 1] = 255;
            pixels[offset + 2] = 255;
            pixels[offset + 3] = 255;
          }
        }
      });
    });
  });

  const scanlines = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const target = y * (1 + size * 4);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
