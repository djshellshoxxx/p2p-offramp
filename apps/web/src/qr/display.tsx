import type { QrMatrix } from '../../../../packages/qr/index.ts';

/** Matrix integers become SVG geometry through React attributes; imported XML/HTML is never interpreted. */
export function QrSymbol({ matrix, label }: { readonly matrix: QrMatrix; readonly label: string }) {
  const quiet = 4, size = matrix.size + quiet * 2;
  const segments: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.rows[y]!;
    for (let x = 0; x < matrix.size;) {
      if (row[x] !== '1') { x++; continue; }
      const start = x; while (x < matrix.size && row[x] === '1') x++;
      segments.push(`M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`);
    }
  }
  return <svg className="qr-symbol" role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
    <rect x={0} y={0} width={size} height={size} fill="#ffffff" />
    <path d={segments.join('')} fill="#000000" />
  </svg>;
}
