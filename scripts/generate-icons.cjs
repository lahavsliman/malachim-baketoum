/**
 * Generates PWA icons as valid PNG files using only Node.js built-ins.
 * Orange circle with white cross on dark background — fits מלאכים בכתום branding.
 */
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'latin1')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crcBuf])
}

// ── Icon renderer ──────────────────────────────────────────────────────────
function generateIcon(size) {
  const rowLen = 1 + size * 4   // 1 filter byte + RGBA per pixel
  const raw    = Buffer.alloc(size * rowLen, 0)
  const cx = size / 2, cy = size / 2
  const outerR = size * 0.42    // orange circle radius
  const armLen = outerR * 0.52  // cross arm half-length
  const armW   = outerR * 0.20  // cross arm half-width

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0           // filter: None
    for (let x = 0; x < size; x++) {
      const dx   = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const off  = y * rowLen + 1 + x * 4

      if (dist <= outerR) {
        const inCross = (Math.abs(dx) <= armW && Math.abs(dy) <= armLen) ||
                        (Math.abs(dy) <= armW && Math.abs(dx) <= armLen)
        if (inCross) {
          // white cross
          raw[off]=255; raw[off+1]=255; raw[off+2]=255; raw[off+3]=255
        } else {
          // orange #F97316
          raw[off]=249; raw[off+1]=115; raw[off+2]=22; raw[off+3]=255
        }
      } else {
        // dark background #0D0D0D
        raw[off]=13; raw[off+1]=13; raw[off+2]=13; raw[off+3]=255
      }
    }
  }

  const compressed = zlib.deflateSync(raw)

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0  // RGBA

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),  // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Write files ────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const sizes = [
  ['icon-192x192.png',      192],
  ['icon-512x512.png',      512],
  ['apple-touch-icon.png',  180],
]

sizes.forEach(([name, size]) => {
  const filePath = path.join(outDir, name)
  fs.writeFileSync(filePath, generateIcon(size))
  console.log(`✓ ${name}  (${size}x${size})`)
})

console.log('\nIcons written to public/icons/')
