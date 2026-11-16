export function donutSlicePath(start: number, fraction: number) {
  const point = (radius: number, value: number) => {
    const angle = (value * 360 - 90) * Math.PI / 180;
    // Trigonometry can differ in its last bits across JS runtimes. SVG attributes
    // need identical strings during hydration; subpixel precision is sufficient.
    return `${(110 + radius * Math.cos(angle)).toFixed(4)},${(110 + radius * Math.sin(angle)).toFixed(4)}`;
  };
  const mid = start + fraction / 2, end = start + fraction;
  // Two arcs also render a full circle when there is only one category.
  return `M${point(100, start)} A100,100 0 0,1 ${point(100, mid)} A100,100 0 0,1 ${point(100, end)}
    L${point(68, end)} A68,68 0 0,0 ${point(68, mid)} A68,68 0 0,0 ${point(68, start)} Z`;
}
