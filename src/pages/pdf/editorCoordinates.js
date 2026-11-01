// Editor rectangles are fractions of the PDF.js viewport at the rotation when created.
// PDF.js handles the crop box and origin; CSS sizing and device pixels never enter PDF coordinates.
export function toPdfGeometry(item, viewport) {
    const [x, y] = viewport.convertToPdfPoint(item.x * viewport.width, (item.y + item.height) * viewport.height);
    const [rightX, rightY] = viewport.convertToPdfPoint((item.x + item.width) * viewport.width, (item.y + item.height) * viewport.height);
    const [topX, topY] = viewport.convertToPdfPoint(item.x * viewport.width, item.y * viewport.height);
    return { x, y, width: Math.hypot(rightX - x, rightY - y), height: Math.hypot(topX - x, topY - y), angle: Math.atan2(rightY - y, rightX - x) * 180 / Math.PI };
}

export function mapRectangle(item, original, current) {
    const points = [[item.x, item.y], [item.x + item.width, item.y], [item.x, item.y + item.height], [item.x + item.width, item.y + item.height]];
    const mapped = points.map(([x, y]) => current.convertToViewportPoint(...original.convertToPdfPoint(x * original.width, y * original.height)));
    const xs = mapped.map((p) => p[0] / current.width);
    const ys = mapped.map((p) => p[1] / current.height);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
