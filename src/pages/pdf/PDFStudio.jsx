import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    FilePlus2,
    FileText,
    RotateCcw,
    RotateCw,
    Trash2,
    Undo2,
    Redo2,
    UploadCloud,
    LayoutGrid,
    FileArchive,
} from "lucide-react";
import GlassButton from "../../components/GlassButton";
import { cx } from "../../utils/cx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

const PDFCompression = lazy(() => import("./PDFCompression"));

const initialHistory = { past: [], pages: [], future: [] };
function historyReducer(state, action) {
    if (action.type === "undo")
        return state.past.length
            ? { past: state.past.slice(0, -1), pages: state.past.at(-1), future: [state.pages, ...state.future] }
            : state;
    if (action.type === "redo")
        return state.future.length
            ? { past: [...state.past, state.pages], pages: state.future[0], future: state.future.slice(1) }
            : state;
    if (action.type === "reset") return initialHistory;
    if (action.type === "import") return { past: [], pages: [...state.pages, ...action.pages], future: [] };
    if (action.type === "change")
        return { past: [...state.past.slice(-49), state.pages], pages: action.pages, future: [] };
    return state;
}

function PageCanvas({ page, source, preview = false }) {
    const canvasRef = useRef(null);
    const [visible, setVisible] = useState(() => preview || !("IntersectionObserver" in window));
    const [status, setStatus] = useState("loading");
    useEffect(() => {
        if (preview) return;
        const element = canvasRef.current;
        if (!("IntersectionObserver" in window)) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
            rootMargin: "200px",
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [preview]);
    useEffect(() => {
        if (!visible || !source) return;
        let cancelled = false;
        let task;
        let pdfPage;
        const canvas = canvasRef.current;
        (async () => {
            try {
                pdfPage = await source.document.getPage(page.index + 1);
                if (cancelled) return;
                const rotation = (pdfPage.rotate + page.rotation + 360) % 360;
                const base = pdfPage.getViewport({ scale: 1, rotation });
                const width = preview ? 760 : 140;
                const viewport = pdfPage.getViewport({
                    scale: Math.min(width / base.width, preview ? 1.5 : 0.4),
                    rotation,
                });
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                task = pdfPage.render({ canvasContext: canvas.getContext("2d"), canvas, viewport });
                await task.promise;
                if (!cancelled) setStatus("ready");
            } catch (error) {
                if (!cancelled && error.name !== "RenderingCancelledException") setStatus("error");
            }
        })();
        return () => {
            cancelled = true;
            task?.cancel();
            pdfPage?.cleanup();
            canvas.width = 0;
            canvas.height = 0;
        };
    }, [visible, source, page.index, page.rotation, preview]);
    return (
        <div
            className={cx(
                "relative flex min-h-24 items-center justify-center overflow-hidden bg-white text-slate-500",
                preview ? "w-full shadow-lg" : "w-full rounded-md",
            )}
        >
            {status !== "ready" && (
                <span className={cx("absolute text-xs")} role="status">
                    {status === "error" ? "Preview unavailable" : "Loading preview…"}
                </span>
            )}
            <canvas
                ref={canvasRef}
                aria-label={preview ? "Selected page preview" : "Page thumbnail"}
                className={cx("block h-auto max-w-full")}
            />
        </div>
    );
}

const controlClass =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40";
function PDFStudio() {
    useDocumentTitle("PDF Studio");
    const [history, dispatch] = useReducer(historyReducer, initialHistory);
    const [selection, setSelection] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [busy, setBusy] = useState("");
    const [sources, setSources] = useState(() => new Map());
    const [message, setMessage] = useState("");
    const [dragId, setDragId] = useState(null);
    const [mode, setMode] = useState("organize");
    const inputRef = useRef(null);
    const sourcesRef = useRef(new Map());
    const pendingRef = useRef(new Set());
    const mountedRef = useRef(true);
    const operationRef = useRef(false);
    const generationRef = useRef(0);
    const urlsRef = useRef(new Map());
    useEffect(() => {
        mountedRef.current = true;
        const sources = sourcesRef.current;
        const pending = pendingRef.current;
        const urls = urlsRef.current;
        return () => {
            mountedRef.current = false;
            generationRef.current += 1;
            pending.forEach((task) => task.destroy());
            pending.clear();
            sources.forEach((source) => source.loading.destroy());
            sources.clear();
            urls.forEach((timer, url) => {
                window.clearTimeout(timer);
                URL.revokeObjectURL(url);
            });
            urls.clear();
        };
    }, []);
    const pages = history.pages;
    const selected = pages.filter((page) => selection.includes(page.id));
    const active = pages.find((page) => page.id === activeId) || selected[0] || pages[0];
    const importFiles = useCallback(async (list) => {
        if (operationRef.current) return;
        const files = Array.from(list);
        if (!files.length) return;
        operationRef.current = true;
        const generation = generationRef.current;
        setBusy("Opening PDFs…");
        setMessage("");
        const added = [];
        const errors = [];
        try {
            const { default: pdfjs } = await import("./pdfRendering");
            for (const file of files) {
                if (
                    (file.type && file.type !== "application/pdf" && file.type !== "application/octet-stream") ||
                    (!file.type && !/\.pdf$/i.test(file.name)) ||
                    (file.type === "application/octet-stream" && !/\.pdf$/i.test(file.name))
                ) {
                    errors.push(`${file.name}: select a PDF file.`);
                    continue;
                }
                let loading;
                try {
                    loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
                    if (!mountedRef.current || generation !== generationRef.current) {
                        await loading.destroy();
                        continue;
                    }
                    pendingRef.current.add(loading);
                    const document = await loading.promise;
                    pendingRef.current.delete(loading);
                    if (!mountedRef.current || generation !== generationRef.current) {
                        await loading.destroy();
                        continue;
                    }
                    const sourceId = crypto.randomUUID();
                    sourcesRef.current.set(sourceId, { file, document, loading });
                    for (let index = 0; index < document.numPages; index += 1)
                        added.push({ id: crypto.randomUUID(), sourceId, index, rotation: 0 });
                } catch {
                    if (loading) {
                        pendingRef.current.delete(loading);
                        await loading.destroy();
                    }
                    errors.push(`${file.name}: unable to open this PDF; it may be corrupt or password protected.`);
                }
            }
            if (mountedRef.current && generation === generationRef.current) {
                if (added.length) {
                    setSources(new Map(sourcesRef.current));
                    dispatch({ type: "import", pages: added });
                    setSelection([added[0].id]);
                    setActiveId(added[0].id);
                }
                setMessage(errors.join(" "));
            }
        } catch {
            if (mountedRef.current) setMessage("Could not load the PDF viewer. Please try again.");
        } finally {
            operationRef.current = false;
            if (mountedRef.current) setBusy("");
        }
    }, []);
    const change = (next) => dispatch({ type: "change", pages: next });
    const toggle = (page, event) => {
        setActiveId(page.id);
        if (event.shiftKey && active) {
            const a = pages.findIndex((item) => item.id === active.id);
            const b = pages.findIndex((item) => item.id === page.id);
            setSelection(pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((item) => item.id));
        } else if (event.ctrlKey || event.metaKey)
            setSelection((current) =>
                current.includes(page.id) ? current.filter((id) => id !== page.id) : [...current, page.id],
            );
        else setSelection([page.id]);
    };
    const move = (id, target) => {
        const from = pages.findIndex((page) => page.id === id);
        if (from < 0 || target < 0 || target >= pages.length || from === target) return;
        const next = [...pages];
        const [item] = next.splice(from, 1);
        next.splice(target, 0, item);
        change(next);
    };
    const rotate = (amount) =>
        change(
            pages.map((page) =>
                selection.includes(page.id) ? { ...page, rotation: (page.rotation + amount + 360) % 360 } : page,
            ),
        );
    const download = async (exportPages, name) => {
        if (!exportPages.length || operationRef.current) return;
        operationRef.current = true;
        setBusy(name === "extracted-pages.pdf" ? "Extracting pages…" : "Preparing PDF…");
        setMessage("");
        try {
            const { createPdf } = await import("./pdfExport");
            const bytes = await createPdf(exportPages, sourcesRef.current);
            if (!mountedRef.current) return;
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = name;
            link.click();
            const timer = window.setTimeout(() => {
                URL.revokeObjectURL(url);
                urlsRef.current.delete(url);
            }, 1000);
            urlsRef.current.set(url, timer);
        } catch {
            if (mountedRef.current) setMessage("Unable to create the PDF. The file may be unsupported or protected.");
        } finally {
            operationRef.current = false;
            if (mountedRef.current) setBusy("");
        }
    };
    const reset = () => {
        generationRef.current += 1;
        sourcesRef.current.forEach((source) => source.loading.destroy());
        sourcesRef.current.clear();
        setSources(new Map());
        dispatch({ type: "reset" });
        setSelection([]);
        setActiveId(null);
        setMessage("");
    };
    return (
        <div className={cx("mx-auto max-w-7xl space-y-5 md:pl-16")}>
            <header className={cx("space-y-1")}>
                <h1 className={cx("text-2xl font-semibold tracking-tight")}>PDF Studio</h1>
                <p className={cx("text-sm text-muted-foreground")}>
                    Merge and organize PDF pages, right in your browser.
                </p>
            </header>
            <p className={cx("text-sm text-muted-foreground")}>
                Files are processed locally in your browser and are not uploaded to the server.
            </p>
            <input
                ref={inputRef}
                className={cx("sr-only")}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(event) => {
                    importFiles(event.target.files);
                    event.target.value = "";
                }}
            />
            {message && (
                <p role="alert" className={cx("rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm")}>
                    {message}
                </p>
            )}
            {busy && (
                <p role="status" className={cx("text-sm text-muted-foreground")}>
                    {busy}
                </p>
            )}
            {!pages.length && !history.past.length ? (
                <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        importFiles(event.dataTransfer.files);
                    }}
                    className={cx(
                        "flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center",
                    )}
                >
                    <UploadCloud className={cx("size-10 text-primary")} aria-hidden="true" />
                    <div>
                        <h2 className={cx("text-lg font-semibold")}>Drop your PDFs here</h2>
                        <p className={cx("mt-1 text-sm text-muted-foreground")}>
                            Choose one or more PDF files to get started.
                        </p>
                    </div>
                    <GlassButton
                        type="button"
                        className={cx(controlClass)}
                        disabled={!!busy}
                        onClick={() => inputRef.current?.click()}
                    >
                        Choose Files
                    </GlassButton>
                    <p className={cx("text-xs text-muted-foreground")}>Merge · Extract · Organize · Rotate · Delete</p>
                </div>
            ) : (
                <>
                    <div role="group" aria-label="PDF Studio mode" className={cx("inline-flex max-w-full gap-1 rounded-2xl border border-border bg-card/60 p-1")}>
                        <GlassButton className={cx(controlClass, "border-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", mode === "organize" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40" : "text-muted-foreground")} disabled={!!busy} aria-pressed={mode === "organize"} onClick={() => setMode("organize")}><LayoutGrid size={16} aria-hidden="true" />Organize</GlassButton>
                        <GlassButton className={cx(controlClass, "border-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", mode === "compress" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40" : "text-muted-foreground")} disabled={!!busy} aria-pressed={mode === "compress"} onClick={() => setMode("compress")}><FileArchive size={16} aria-hidden="true" />Compress</GlassButton>
                    </div>
                    {mode === "compress" ? <Suspense fallback={<p role="status">Loading compression…</p>}><PDFCompression pages={pages} sources={sources} busy={busy} setBusy={setBusy} /></Suspense> : <>
                    <div
                        className={cx(
                            "flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/60 p-3",
                        )}
                    >
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy}
                            onClick={() => inputRef.current?.click()}
                        >
                            <FilePlus2 size={16} /> Add PDFs
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !history.past.length}
                            onClick={() => dispatch({ type: "undo" })}
                        >
                            <Undo2 size={16} /> Undo
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !history.future.length}
                            onClick={() => dispatch({ type: "redo" })}
                        >
                            <Redo2 size={16} /> Redo
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !selected.length}
                            onClick={() => rotate(-90)}
                        >
                            <RotateCcw size={16} /> Left
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !selected.length}
                            onClick={() => rotate(90)}
                        >
                            <RotateCw size={16} /> Right
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !selected.length}
                            onClick={() => change(pages.filter((page) => !selection.includes(page.id)))}
                        >
                            <Trash2 size={16} /> Delete
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass)}
                            disabled={!!busy || !selected.length}
                            onClick={() => download(selected, "extracted-pages.pdf")}
                        >
                            <ArrowDownToLine size={16} /> Extract
                        </GlassButton>
                        <GlassButton
                            className={cx(controlClass, "ml-auto")}
                            disabled={!!busy || !pages.length}
                            onClick={() => download(pages, "issuedesk-document.pdf")}
                        >
                            <ArrowDownToLine size={16} /> Export PDF
                        </GlassButton>
                        <GlassButton className={cx(controlClass)} disabled={!!busy} onClick={reset}>
                            Clear workspace
                        </GlassButton>
                    </div>
                    <div
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            if (event.dataTransfer.files.length) {
                                event.preventDefault();
                                importFiles(event.dataTransfer.files);
                            }
                        }}
                        className={cx("grid gap-4 lg:grid-cols-[minmax(250px,340px)_1fr]")}
                    >
                        <section
                            aria-label="PDF pages"
                            className={cx("rounded-2xl border border-border bg-card/60 p-4")}
                        >
                            <div className={cx("mb-3 flex items-center justify-between")}>
                                <h2 className={cx("font-semibold")}>
                                    Pages <span className={cx("text-muted-foreground")}>({pages.length})</span>
                                </h2>
                                <GlassButton
                                    className={cx(controlClass)}
                                    disabled={!pages.length || !!busy}
                                    onClick={() => setSelection(pages.map((page) => page.id))}
                                >
                                    Select all
                                </GlassButton>
                            </div>
                            <p className={cx("mb-3 text-xs text-muted-foreground")}>
                                Use Ctrl/⌘-click or Shift-click for multiple pages. Drag or use arrows to reorder.
                            </p>
                            <div
                                className={cx(
                                    "grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-2",
                                )}
                            >
                                {pages.map((page, index) => (
                                    <div
                                        key={page.id}
                                        draggable={!busy}
                                        onDragStart={() => setDragId(page.id)}
                                        onDragEnd={() => setDragId(null)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => {
                                            if (dragId) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                move(dragId, index);
                                                setDragId(null);
                                            }
                                        }}
                                        className={cx(
                                            "min-w-0 rounded-xl border p-2",
                                            selection.includes(page.id)
                                                ? "border-primary bg-primary/10"
                                                : "border-border bg-background/60",
                                        )}
                                    >
                                        <GlassButton
                                            type="button"
                                            aria-pressed={selection.includes(page.id)}
                                            aria-label={`Show page ${index + 1}`}
                                            className={cx("block w-full rounded-lg text-left")}
                                            onClick={(event) => toggle(page, event)}
                                        >
                                            <PageCanvas page={page} source={sources.get(page.sourceId)} />
                                            <span className={cx("mt-2 block truncate text-xs font-medium")}>
                                                {index + 1}. {sources.get(page.sourceId)?.file.name}
                                            </span>
                                        </GlassButton>
                                        <div className={cx("mt-1 flex items-center justify-between gap-1")}>
                                            <label className={cx("flex items-center gap-1 text-xs")}>
                                                <input
                                                    type="checkbox"
                                                    checked={selection.includes(page.id)}
                                                    aria-label={`Select page ${index + 1}`}
                                                    onChange={() => {
                                                        setActiveId(page.id);
                                                        setSelection((current) =>
                                                            current.includes(page.id)
                                                                ? current.filter((id) => id !== page.id)
                                                                : [...current, page.id],
                                                        );
                                                    }}
                                                />
                                                Select
                                            </label>
                                            <GlassButton
                                                className={cx(controlClass, "min-h-8 px-2")}
                                                aria-label={`Move page ${index + 1} earlier`}
                                                disabled={!!busy || index === 0}
                                                onClick={() => move(page.id, index - 1)}
                                            >
                                                <ArrowUp size={14} />
                                            </GlassButton>
                                            <GlassButton
                                                className={cx(controlClass, "min-h-8 px-2")}
                                                aria-label={`Move page ${index + 1} later`}
                                                disabled={!!busy || index === pages.length - 1}
                                                onClick={() => move(page.id, index + 1)}
                                            >
                                                <ArrowDown size={14} />
                                            </GlassButton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section
                            aria-label="Page preview"
                            className={cx(
                                "flex min-h-80 flex-col items-center gap-3 rounded-2xl border border-border bg-card/60 p-4",
                            )}
                        >
                            <div className={cx("flex w-full items-center justify-between text-sm")}>
                                <h2 className={cx("font-semibold")}>Preview</h2>
                                <span className={cx("text-muted-foreground")}>{selected.length} selected</span>
                            </div>
                            {active ? (
                                <div className={cx("w-full max-w-3xl")}>
                                    <PageCanvas
                                        key={active.id}
                                        page={active}
                                        source={sources.get(active.sourceId)}
                                        preview
                                    />
                                </div>
                            ) : (
                                <div
                                    className={cx(
                                        "m-auto flex flex-col items-center gap-2 text-sm text-muted-foreground",
                                    )}
                                >
                                    <FileText />
                                    No pages remaining. Undo or add a PDF.
                                </div>
                            )}
                        </section>
                    </div>
                    </>}
                </>
            )}
        </div>
    );
}
export default PDFStudio;
