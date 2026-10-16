import { deflateSync } from 'node:zlib';

interface TiffFixtureOptions {
  width: number;
  height: number;
  values: number[];
  bits?: number;
  sampleFormat?: number;
  samplesPerPixel?: number;
  photometric?: number;
  littleEndian?: boolean;
  colorMap?: number[];
  extraSamples?: number[];
  noData?: string;
  orientation?: number;
  fillOrder?: number;
  compression?: number;
}

// Independent, minimal TIFF encoder: one strip, chunky samples, byte-padded rows.
// Tests exercise the real decoder rather than supplying pre-decoded IFD objects.
export function tiffFixture(options: TiffFixtureOptions): ArrayBuffer {
  const {
    width,
    height,
    values,
    bits = 8,
    sampleFormat = 1,
    samplesPerPixel = 1,
    photometric = 1,
    littleEndian = true,
    compression = 1,
  } = options;
  const stride = Math.ceil((width * samplesPerPixel * bits) / 8);
  const unpacked = new Uint8Array(stride * height);
  const samples = new DataView(unpacked.buffer);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * samplesPerPixel; x++) {
      const value = values[y * width * samplesPerPixel + x];
      const offset = y * stride + (x * bits) / 8;
      if (bits < 8) {
        unpacked[y * stride + Math.floor((x * bits) / 8)] |= value << (8 - bits - ((x * bits) % 8));
      } else if (sampleFormat === 3) {
        if (bits === 32) samples.setFloat32(offset, value, littleEndian);
        else samples.setFloat64(offset, value, littleEndian);
      } else if (sampleFormat === 2) {
        if (bits === 8) samples.setInt8(offset, value);
        else if (bits === 16) samples.setInt16(offset, value, littleEndian);
        else samples.setInt32(offset, value, littleEndian);
      } else {
        if (bits === 8) samples.setUint8(offset, value);
        else if (bits === 16) samples.setUint16(offset, value, littleEndian);
        else samples.setUint32(offset, value, littleEndian);
      }
    }
  }
  const data = compression === 8 ? new Uint8Array(deflateSync(unpacked)) : unpacked;
  const tags: { id: number; type: number; values: number[] }[] = [
    { id: 256, type: 4, values: [width] },
    { id: 257, type: 4, values: [height] },
    { id: 258, type: 3, values: Array(samplesPerPixel).fill(bits) },
    { id: 259, type: 3, values: [compression] },
    { id: 262, type: 3, values: [photometric] },
    { id: 266, type: 3, values: [options.fillOrder ?? 1] },
    { id: 273, type: 4, values: [0] },
    { id: 274, type: 3, values: [options.orientation ?? 1] },
    { id: 277, type: 3, values: [samplesPerPixel] },
    { id: 278, type: 4, values: [height] },
    { id: 279, type: 4, values: [data.length] },
    { id: 284, type: 3, values: [1] },
    { id: 339, type: 3, values: Array(samplesPerPixel).fill(sampleFormat) },
  ];
  if (options.colorMap) tags.push({ id: 320, type: 3, values: options.colorMap });
  if (options.extraSamples) tags.push({ id: 338, type: 3, values: options.extraSamples });
  if (options.noData)
    tags.push({
      id: 42113,
      type: 2,
      values: [...options.noData, '\0'].map((c) => c.charCodeAt(0)),
    });
  tags.sort((a, b) => a.id - b.id);
  const size = (type: number) => (type === 4 ? 4 : type === 3 ? 2 : 1);
  let extraOffset = 8 + 2 + tags.length * 12 + 4;
  const extraSize = tags.reduce((total, tag) => {
    const bytes = tag.values.length * size(tag.type);
    return total + (bytes > 4 ? bytes + (bytes % 2) : 0);
  }, 0);
  const dataOffset = extraOffset + extraSize;
  tags.find((tag) => tag.id === 273)!.values[0] = dataOffset;
  const buffer = new ArrayBuffer(dataOffset + data.length);
  const view = new DataView(buffer);
  view.setUint8(0, littleEndian ? 73 : 77);
  view.setUint8(1, littleEndian ? 73 : 77);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, tags.length, littleEndian);
  tags.forEach((tag, index) => {
    const entry = 10 + index * 12;
    view.setUint16(entry, tag.id, littleEndian);
    view.setUint16(entry + 2, tag.type, littleEndian);
    view.setUint32(entry + 4, tag.values.length, littleEndian);
    const bytes = tag.values.length * size(tag.type);
    let offset = entry + 8;
    if (bytes > 4) {
      view.setUint32(offset, extraOffset, littleEndian);
      offset = extraOffset;
      extraOffset += bytes + (bytes % 2);
    }
    tag.values.forEach((value, i) => {
      if (tag.type === 4) view.setUint32(offset + i * 4, value, littleEndian);
      else if (tag.type === 3) view.setUint16(offset + i * 2, value, littleEndian);
      else view.setUint8(offset + i, value);
    });
  });
  new Uint8Array(buffer).set(data, dataOffset);
  return buffer;
}
