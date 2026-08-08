"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const output = path.join(__dirname, "../dashboard/assets/pwa");
const glyphs = {
    S: ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"]
};

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
}

function createIcon(size) {
    const pixels = Buffer.alloc(size * size * 4);
    const setPixel = (x, y, color) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const offset = (y * size + x) * 4;
        pixels.set(color, offset);
    };
    const fill = (x, y, width, height, color) => {
        for (let py = y; py < y + height; py++)
            for (let px = x; px < x + width; px++) setPixel(px, py, color);
    };

    fill(0, 0, size, size, [11, 15, 20, 255]);
    const inset = Math.round(size * 0.09);
    const border = Math.max(3, Math.round(size * 0.018));
    fill(inset, inset, size - inset * 2, border, [0, 255, 156, 255]);
    fill(inset, size - inset - border, size - inset * 2, border, [0, 255, 156, 255]);
    fill(inset, inset, border, size - inset * 2, [0, 255, 156, 255]);
    fill(size - inset - border, inset, border, size - inset * 2, [0, 255, 156, 255]);

    const scale = Math.max(3, Math.floor(size / 34));
    const gap = scale * 2;
    const glyphWidth = scale * 5;
    const textWidth = glyphWidth * 3 + gap * 2;
    const startX = Math.floor((size - textWidth) / 2);
    const startY = Math.floor((size - scale * 7) / 2);
    ["S", "T", "M"].forEach((letter, index) => {
        glyphs[letter].forEach((row, y) => [...row].forEach((value, x) => {
            if (value === "1") fill(startX + index * (glyphWidth + gap) + x * scale, startY + y * scale, scale, scale, [201, 255, 233, 255]);
        }));
    });

    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        const rowOffset = y * (size * 4 + 1);
        raw[rowOffset] = 0;
        pixels.copy(raw, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 6;

    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

fs.mkdirSync(output, { recursive: true });
for (const size of [192, 512])
    fs.writeFileSync(path.join(output, `icon-${size}.png`), createIcon(size));
