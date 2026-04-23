export function buildExportFilename(d: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `simplemap-${y}${mo}${da}-${h}${mi}${s}.png`;
}

export interface ComposeOptions {
  createCanvas?: () => HTMLCanvasElement;
  stripHeight?: number;
  font?: string;
  backgroundColor?: string;
  textColor?: string;
}

const DEFAULT_STRIP_HEIGHT = 24;
const DEFAULT_FONT = '12px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';

export function composePngWithCredit(
  source: HTMLCanvasElement,
  credit: string,
  opts: ComposeOptions = {},
): HTMLCanvasElement {
  const stripH = opts.stripHeight ?? DEFAULT_STRIP_HEIGHT;
  const factory =
    opts.createCanvas ?? ((): HTMLCanvasElement => document.createElement("canvas"));
  const target = factory();
  target.width = source.width;
  target.height = source.height + stripH;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.fillStyle = opts.backgroundColor ?? "#ffffff";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);

  ctx.fillStyle = opts.backgroundColor ?? "#ffffff";
  ctx.fillRect(0, source.height, target.width, stripH);

  ctx.fillStyle = opts.textColor ?? "#333333";
  ctx.font = opts.font ?? DEFAULT_FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(credit, target.width - 8, source.height + stripH / 2);

  return target;
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, "image/png");
}
