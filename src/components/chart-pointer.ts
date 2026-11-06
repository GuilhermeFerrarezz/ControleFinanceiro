import type { PointerEvent } from 'react';

export function chartPeriodIndex(event: PointerEvent<SVGSVGElement>, left: number, right: number, count: number) {
  const transform = event.currentTarget.getScreenCTM();
  if (!transform || count === 0) return null;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
  return Math.max(0, Math.min(count - 1, Math.round((point.x - left) / (right - left) * (count - 1))));
}
