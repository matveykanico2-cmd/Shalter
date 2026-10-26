// Типы вендоренного qrcode-generator (public/js/lib/qrcode.js) — только то, что нужно pretty-qr.
export interface QrCode {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

declare function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QrCode;
export default qrcode;
