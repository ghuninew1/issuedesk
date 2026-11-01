import { useEffect, useRef, useState } from "react";
import GlassButton from "../../components/GlassButton";
import { cx } from "../../utils/cx";

const PRESETS = {
    high: { label: "High Quality", scale: 2, quality: 0.9 },
    balanced: { label: "Balanced", scale: 1.5, quality: 0.76 },
    small: { label: "Small File", scale: 1, quality: 0.6 },
};
const button = "min-h-10 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-40";
const field = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm";
const formatSize = (size) =>
    size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;

function send(worker, data, transfer = []) {
    return new Promise((resolve, reject) => {
        worker.onmessage = ({ data: response }) =>
            response.type === "error" ? reject(new Error(response.message)) : resolve(response);
        worker.onerror = () => reject(new Error("Compression worker failed."));
        worker.postMessage(data, transfer);
    });
}

export default function PDFCompression({ pages, sources, busy, setBusy }) {
    const [preset, setPreset] = useState("balanced");
    const [target, setTarget] = useState("");
    const [unit, setUnit] = useState("MB");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const workerRef = useRef(null);
    const renderRef = useRef(null);
    const cancelledRef = useRef(false);
    const urlsRef = useRef(new Map());
    useEffect(
        () => () => {
            cancelledRef.current = true;
            renderRef.current?.cancel();
            workerRef.current?.terminate();
            urlsRef.current.forEach((timer, url) => {
                window.clearTimeout(timer);
                URL.revokeObjectURL(url);
            });
            urlsRef.current.clear();
        },
        [],
    );
    const start = async () => {
        if (!pages.length || busy) return;
        const targetBytes = target ? Number(target) * (unit === "MB" ? 1048576 : 1024) : null;
        if (target && (!Number.isFinite(targetBytes) || targetBytes <= 0)) {
            setError("Enter a positive target size.");
            return;
        }
        if (!("OffscreenCanvas" in window) || !("createImageBitmap" in window)) {
            setError("This browser does not support the canvas features needed for compression.");
            return;
        }
        cancelledRef.current = false;
        setResult(null);
        setError("");
        setBusy("Preparing compression…");
        let worker;
        try {
            const { default: CompressionWorker } = await import("./compression.worker.js?worker");
            if (cancelledRef.current) return;
            worker = new CompressionWorker();
            workerRef.current = worker;
            const files = [...new Set(pages.map((page) => page.sourceId))].map((id) => ({
                id,
                file: sources.get(id).file,
            }));
            const { size: originalSize } = await send(worker, { type: "baseline", pages, files });
            const config = PRESETS[preset];
            const attempts = targetBytes
                ? [
                      { scale: config.scale, quality: config.quality },
                      { scale: config.scale, quality: Math.max(0.5, config.quality - 0.18) },
                      { scale: Math.max(0.75, config.scale * 0.8), quality: 0.5 },
                      { scale: Math.max(0.65, config.scale * 0.65), quality: 0.45 },
                  ]
                : [config];
            let best = null;
            for (let attempt = 0; attempt < attempts.length; attempt += 1) {
                const settings = attempts[attempt];
                await send(worker, { type: "start" });
                for (let index = 0; index < pages.length; index += 1) {
                    if (cancelledRef.current) return;
                    setBusy(
                        `Compressing page ${index + 1} of ${pages.length} · pass ${attempt + 1} of ${attempts.length}…`,
                    );
                    const entry = pages[index];
                    const pdfPage = await sources.get(entry.sourceId).document.getPage(entry.index + 1);
                    const rotation = (pdfPage.rotate + entry.rotation + 360) % 360;
                    const base = pdfPage.getViewport({ scale: 1, rotation });
                    const safeScale = Math.min(
                        settings.scale,
                        4096 / Math.max(base.width, base.height),
                        Math.sqrt(16000000 / (base.width * base.height)),
                    );
                    const viewport = pdfPage.getViewport({ scale: safeScale, rotation });
                    const canvas = document.createElement("canvas");
                    try {
                        canvas.width = Math.ceil(viewport.width);
                        canvas.height = Math.ceil(viewport.height);
                        const ctx = canvas.getContext("2d", { alpha: false });
                        ctx.fillStyle = "white";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        renderRef.current = pdfPage.render({ canvasContext: ctx, canvas, viewport });
                        await renderRef.current.promise;
                        renderRef.current = null;
                        if (cancelledRef.current) return;
                        const bitmap = await createImageBitmap(canvas);
                        if (cancelledRef.current) {
                            bitmap.close();
                            return;
                        }
                        await send(
                            worker,
                            { type: "page", bitmap, width: base.width, height: base.height, quality: settings.quality },
                            [bitmap],
                        );
                    } finally {
                        canvas.width = 0;
                        canvas.height = 0;
                        pdfPage.cleanup();
                    }
                }
                const { bytes } = await send(worker, { type: "finish" });
                if (!best || bytes.byteLength < best.byteLength) best = bytes;
                if (!targetBytes || best.byteLength <= targetBytes) break;
            }
            if (!cancelledRef.current) setResult({ bytes: best, originalSize, targetBytes });
        } catch (cause) {
            if (!cancelledRef.current)
                setError(
                    `Unable to compress this PDF. ${cause.message || "The document may be unsupported or too large for available memory."}`,
                );
        } finally {
            worker?.terminate();
            workerRef.current = null;
            renderRef.current = null;
            if (!cancelledRef.current) setBusy("");
        }
    };
    const download = () => {
        const url = URL.createObjectURL(new Blob([result.bytes], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "compressed.pdf";
        link.click();
        const timer = window.setTimeout(() => {
            URL.revokeObjectURL(url);
            urlsRef.current.delete(url);
        }, 1000);
        urlsRef.current.set(url, timer);
    };
    return (
        <section className={cx("space-y-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-6")}>
            <div>
                <h2 className={cx("text-lg font-semibold")}>Compress PDF</h2>
                <p className={cx("mt-1 text-sm text-muted-foreground")}>
                    Compress the current ordered workspace locally, one page at a time.
                </p>
            </div>
            <p className={cx("rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm")}>
                Compression flattens pages into images. Selectable text, links, form fields, annotations, signatures and
                interactive content may be lost. Original files are unchanged.
            </p>
            <div className={cx("flex flex-wrap items-end gap-3")}>
                <label className={cx("flex flex-col gap-1 text-sm")}>
                    Quality
                    <select
                        className={cx(field)}
                        value={preset}
                        onChange={(event) => setPreset(event.target.value)}
                        disabled={!!busy}
                    >
                        {Object.entries(PRESETS).map(([key, value]) => (
                            <option value={key} key={key}>
                                {value.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={cx("flex flex-col gap-1 text-sm")}>
                    Target size (optional, best effort)
                    <input
                        className={cx(field, "w-36")}
                        type="number"
                        min="0.01"
                        step="any"
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                        placeholder="e.g. 2"
                        disabled={!!busy}
                    />
                </label>
                <label className={cx("flex flex-col gap-1 text-sm")}>
                    Unit
                    <select
                        className={cx(field)}
                        value={unit}
                        onChange={(event) => setUnit(event.target.value)}
                        disabled={!!busy}
                    >
                        <option>MB</option>
                        <option>KB</option>
                    </select>
                </label>
                <GlassButton className={cx(button)} disabled={!pages.length || !!busy} onClick={start}>
                    Compress
                </GlassButton>
            </div>
            {error && (
                <p role="alert" className={cx("text-sm text-destructive")}>
                    {error}
                </p>
            )}
            {result && (
                <div
                    role="status"
                    className={cx("space-y-2 rounded-xl border border-border bg-background/60 p-4 text-sm")}
                >
                    <p>
                        Original workspace: {formatSize(result.originalSize)} · Result:{" "}
                        {formatSize(result.bytes.byteLength)} ·{" "}
                        {result.bytes.byteLength <= result.originalSize
                            ? `${Math.round((1 - result.bytes.byteLength / result.originalSize) * 100)}% reduction`
                            : "Larger than original — keep the original recommended."}
                    </p>
                    {result.targetBytes && (
                        <p>
                            Target: ≤ {formatSize(result.targetBytes)} ·{" "}
                            {result.bytes.byteLength <= result.targetBytes
                                ? "Target met"
                                : "Target not met within the quality floor."}
                        </p>
                    )}
                    <GlassButton className={cx(button)} onClick={download}>
                        Download compressed PDF
                    </GlassButton>
                </div>
            )}
        </section>
    );
}
