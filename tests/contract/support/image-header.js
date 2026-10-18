const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads the dimensions an image file declares in its own header, without decoding it. */
export class ImageHeader {
  /** { width, height } of a PNG, from its IHDR chunk; throws when the bytes are not a PNG. */
  static png(buffer) {
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  /** The images of an ICO file as { width, height, format }; a width or height of 0 in the directory means 256. */
  static ico(buffer) {
    if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1)
      throw new Error('not an ICO file');
    return Array.from({ length: buffer.readUInt16LE(4) }, (_, index) => {
      const entry = 6 + index * 16;
      const size = buffer.readUInt32LE(entry + 8);
      const offset = buffer.readUInt32LE(entry + 12);
      const isPng = buffer.subarray(offset, offset + 8).equals(PNG_SIGNATURE);
      return {
        width: buffer.readUInt8(entry) || 256,
        height: buffer.readUInt8(entry + 1) || 256,
        format: isPng ? 'png' : 'bmp',
        ...(isPng ? { pngSize: ImageHeader.png(buffer.subarray(offset, offset + size)) } : {}),
      };
    });
  }
}
