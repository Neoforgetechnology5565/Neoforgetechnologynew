declare module "utif" {
  const UTIF: { decode(buf: ArrayBuffer): Record<string, unknown>[]; decodeImage(buf: ArrayBuffer, ifd: Record<string, unknown>): void; toRGBA8(ifd: Record<string, unknown>): Uint8Array };
  export default UTIF;
}
