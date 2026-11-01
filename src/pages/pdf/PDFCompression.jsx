import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, FileArchive, Info, LoaderCircle, Sparkles, Minimize2, ScanLine } from "lucide-react";
import GlassButton from "../../components/GlassButton";
import { cx } from "../../utils/cx";

const PRESETS = {
    high: { label: "High Quality", scale: 2, quality: 0.9 },
    balanced: { label: "Balanced", scale: 1.5, quality: 0.76 },
    small: { label: "Small File", scale: 1, quality: 0.6 },
};
const button = "min-h-10 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-40";
const field = "min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const presetPresentation = {
    high: { description: "Best quality · Less compression", icon: Sparkles, color: "text-emerald-700 dark:text-emerald-300", selected: "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/50" },
    balanced: { description: "Good quality and file size", icon: ScanLine, color: "text-cyan-700 dark:text-cyan-300", selected: "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/50" },
    small: { description: "Smallest file · More compression", icon: Minimize2, color: "text-amber-700 dark:text-amber-300", selected: "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50" },
};
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
    const editedLoadingRef = useRef(null);
    const renderRef = useRef(null);
    const cancelledRef = useRef(false);
    const urlsRef = useRef(new Map());
    useEffect(
        () => () => {
            cancelledRef.current = true;
            renderRef.current?.cancel();
            workerRef.current?.terminate();
            editedLoadingRef.current?.destroy();
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
        let editedLoading;
        try {
            let compressionPages = pages;
            let compressionSources = sources;
            if (pages.some((page) => page.objects?.length)) {
                const [{ createPdf }, { default: pdfjs }] = await Promise.all([import("./pdfExport"), import("./pdfRendering")]);
                const bytes = await createPdf(pages, sources);
                if (cancelledRef.current) return;
                const file = new File([bytes], "workspace.pdf", { type: "application/pdf" });
                editedLoading = pdfjs.getDocument({ data: bytes });
                editedLoadingRef.current = editedLoading;
                const document = await editedLoading.promise;
                if (cancelledRef.current) return;
                compressionPages = pages.map((page, index) => ({ ...page, sourceId: "edited-workspace", index, rotation: 0, objects: [] }));
                compressionSources = new Map([["edited-workspace", { file, document }]]);
            }
            const { default: CompressionWorker } = await import("./compression.worker.js?worker");
            if (cancelledRef.current) return;
            worker = new CompressionWorker();
            workerRef.current = worker;
            const files = [...new Set(compressionPages.map((page) => page.sourceId))].map((id) => ({
                id,
                file: compressionSources.get(id).file,
            }));
            const { size: originalSize } = await send(worker, { type: "baseline", pages: compressionPages, files });
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
                    const entry = compressionPages[index];
                    const pdfPage = await compressionSources.get(entry.sourceId).document.getPage(entry.index + 1);
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
            editedLoading?.destroy();
            editedLoadingRef.current = null;
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
    const isSmaller = result && result.bytes.byteLength < result.originalSize;
    const isLarger = result && result.bytes.byteLength > result.originalSize;
    const targetMet = result?.targetBytes && result.bytes.byteLength <= result.targetBytes;
    return (
        <section className={cx("space-y-6 rounded-2xl border border-border bg-card/60 p-4 sm:p-6")}>
            <div>
                <h2 className={cx("text-xl font-semibold tracking-tight")}>Compress PDF</h2>
                <p className={cx("mt-1 text-sm text-muted-foreground")}>Reduce the size of your current PDF workspace on this device.</p>
            </div>

            <fieldset disabled={!!busy} className={cx("space-y-3")}>
                <legend className={cx("mb-3 text-sm font-semibold")}>Compression level</legend>
                <div className={cx("grid gap-3 sm:grid-cols-3")}>
                    {Object.entries(PRESETS).map(([key, value]) => {
                        const presentation = presetPresentation[key];
                        const Icon = presentation.icon;
                        return (
                            <label key={key} className={cx("relative flex min-h-28 cursor-pointer flex-col gap-2 rounded-2xl border bg-background/60 p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary", preset === key ? presentation.selected : "border-border", busy && "cursor-not-allowed opacity-60")}>
                                <input className={cx("sr-only")} type="radio" name="compression-level" value={key} checked={preset === key} onChange={() => setPreset(key)} />
                                <span className={cx("flex items-center gap-2", presentation.color)}><Icon className={cx("size-4 shrink-0")} aria-hidden="true" /><span className={cx("font-semibold")}>{value.label}</span>{preset === key && <Check className={cx("ml-auto size-4 shrink-0")} aria-hidden="true" />}</span>
                                <span className={cx("text-xs text-muted-foreground")}>{presentation.description}</span>
                                {key === "balanced" && <span className={cx("w-fit rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:text-cyan-300")}>Recommended</span>}
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <div className={cx("space-y-3 rounded-2xl border border-border bg-background/40 p-4")}>
                <div className={cx("flex items-center justify-between gap-3")}><h3 className={cx("text-sm font-semibold")}>Target file size</h3><span className={cx("text-xs text-muted-foreground")}>Optional</span></div>
                <div className={cx("flex flex-wrap gap-2")}>
                    <label className={cx("sr-only")} htmlFor="pdf-compression-target">Target file size</label>
                    <input id="pdf-compression-target" className={cx(field, "w-36 max-w-full")} type="number" min="0.01" step="any" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 2" disabled={!!busy} />
                    <label className={cx("sr-only")} htmlFor="pdf-compression-unit">Target size unit</label>
                    <select id="pdf-compression-unit" className={cx(field)} value={unit} onChange={(event) => setUnit(event.target.value)} disabled={!!busy}><option>MB</option><option>KB</option></select>
                </div>
                <p className={cx("text-xs text-muted-foreground")}>{target && Number(target) > 0 ? `Try to keep the compressed PDF at or below ${target} ${unit}.` : "No target set — compression uses the selected quality preset."} Best effort — some PDFs may not reach the requested size.</p>
            </div>

            <div className={cx("flex gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm")}>
                <Info className={cx("mt-0.5 size-4 shrink-0 text-muted-foreground")} aria-hidden="true" />
                <div className={cx("space-y-1")}><h3 className={cx("font-medium")}>About compression</h3><p className={cx("text-muted-foreground")}>Pages are flattened into images, so selectable text, links, forms, annotations and signatures may be lost. Your original PDF is never modified.</p></div>
            </div>

            {error && <p role="alert" className={cx("rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive")}>{error}</p>}
            <div className={cx("flex justify-end")}>
                <GlassButton className={cx("inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto")} disabled={!pages.length || !!busy} onClick={start}>
                    {busy ? <LoaderCircle className={cx("size-4 animate-spin")} aria-hidden="true" /> : <FileArchive className={cx("size-4")} aria-hidden="true" />}{busy ? "Compressing…" : "Compress PDF"}
                </GlassButton>
            </div>

            {result && (
                <div role="status" className={cx("space-y-4 rounded-2xl border p-4 sm:p-5", isSmaller ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background/60")}>
                    <div className={cx("flex flex-wrap items-center justify-between gap-2")}><h3 className={cx("font-semibold")}>Compression result</h3>{isSmaller && <span className={cx("rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300")}>{Math.round((1 - result.bytes.byteLength / result.originalSize) * 100)}% smaller</span>}</div>
                    <div className={cx("flex flex-wrap items-center gap-4 sm:gap-8")}><div className={cx("min-w-0")}><p className={cx("text-xs text-muted-foreground")}>Original workspace</p><p className={cx("break-words text-xl font-semibold sm:text-2xl")}>{formatSize(result.originalSize)}</p></div><ArrowRight className={cx("size-5 shrink-0 text-muted-foreground")} aria-hidden="true" /><div className={cx("min-w-0")}><p className={cx("text-xs text-muted-foreground")}>Compressed</p><p className={cx("break-words text-xl font-semibold sm:text-2xl")}>{formatSize(result.bytes.byteLength)}</p></div></div>
                    {isLarger && <p className={cx("text-sm text-muted-foreground")}>The compressed file is larger than the original. We recommend keeping the original.</p>}
                    {result.targetBytes && <p className={cx("text-sm", targetMet ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{targetMet ? `Target reached: ≤ ${formatSize(result.targetBytes)}` : `Target not reached: ${formatSize(result.targetBytes)} could not be reached at the allowed quality.`}</p>}
                    <GlassButton className={cx(button, "inline-flex items-center justify-center gap-2 font-medium")} onClick={download}><ArrowDownToLine className={cx("size-4")} aria-hidden="true" />Download PDF</GlassButton>
                </div>
            )}
        </section>
    );
}
