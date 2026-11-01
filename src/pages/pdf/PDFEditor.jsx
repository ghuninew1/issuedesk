import { useEffect, useRef, useState } from "react";
import { Info, Type, Square, ImagePlus, MousePointer2, Trash2, Undo2, Redo2, Download } from "lucide-react";
import GlassButton from "../../components/GlassButton";
import { cx } from "../../utils/cx";
import { mapRectangle } from "./editorCoordinates";

const btn =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40";
const field = "min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm";
function ImageObject({ file }) {
    const imageRef = useRef(null);
    useEffect(() => {
        const url = URL.createObjectURL(file);
        const image = imageRef.current;
        image.src = url;
        return () => {
            image.removeAttribute("src");
            URL.revokeObjectURL(url);
        };
    }, [file]);
    return <img ref={imageRef} alt="" draggable="false" className={cx("h-full w-full object-fill")} />;
}
export default function PDFEditor({
    pages,
    sources,
    active,
    setActiveId,
    change,
    history,
    undo,
    redo,
    download,
    busy,
}) {
    const [tool, setTool] = useState("select");
    const [selectedId, setSelectedId] = useState(null);
    const [error, setError] = useState("");
    const [view, setView] = useState(null);
    const [draft, setDraft] = useState(null);
    const canvasRef = useRef(null);
    const surfaceRef = useRef(null);
    const imageInput = useRef(null);
    const dragRef = useRef(null);
    const page = active || pages[0];
    const source = page && sources.get(page.sourceId);
    const pageId = page?.id;
    const pageIndex = page?.index;
    const pageRotation = page?.rotation;
    const objects = page?.objects || [];
    const selected = objects.find((item) => item.id === selectedId);
    useEffect(() => {
        if (!pageId || !source) return;
        let cancelled = false;
        let task;
        let pdfPage;
        const canvas = canvasRef.current;
        (async () => {
            try {
                pdfPage = await source.document.getPage(pageIndex + 1);
                if (cancelled) return;
                const rotation = (pdfPage.rotate + pageRotation + 360) % 360;
                const viewport = pdfPage.getViewport({ scale: 1, rotation });
                const renderViewport = pdfPage.getViewport({ scale: Math.min(1.5, 1000 / viewport.width), rotation });
                setView({ pdfPage, viewport, rotation });
                canvas.width = Math.ceil(renderViewport.width);
                canvas.height = Math.ceil(renderViewport.height);
                task = pdfPage.render({ canvasContext: canvas.getContext("2d"), canvas, viewport: renderViewport });
                await task.promise;
            } catch (cause) {
                if (!cancelled && cause.name !== "RenderingCancelledException") setError("Unable to render this page.");
            }
        })();
        return () => {
            cancelled = true;
            task?.cancel();
            pdfPage?.cleanup();
            canvas.width = 0;
            canvas.height = 0;
        };
    }, [pageId, pageIndex, pageRotation, source]);
    const updateObjects = (next) =>
        change(pages.map((item) => (item.id === page.id ? { ...item, objects: next } : item)));
    const replace = (item) => updateObjects(objects.map((old) => (old.id === item.id ? item : old)));
    const boxFor = (item) =>
        view
            ? mapRectangle(item, view.pdfPage.getViewport({ scale: 1, rotation: item.rotation }), view.viewport)
            : item;
    const currentPoint = (event) => {
        const rect = surfaceRef.current.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        };
    };
    const add = (type, extra = {}) => {
        if (!view || !page) return;
        const object = {
            id: crypto.randomUUID(),
            type,
            x: 0.12,
            y: 0.12,
            width: 0.32,
            height: type === "text" ? 0.07 : 0.14,
            rotation: view.rotation,
            ...extra,
        };
        updateObjects([...objects, object]);
        setSelectedId(object.id);
        setTool("select");
    };
    const addImage = async (file) => {
        if (!file) return;
        if (!["image/png", "image/jpeg"].includes(file.type)) {
            setError("Choose a PNG or JPEG image.");
            return;
        }
        try {
            const bitmap = await createImageBitmap(file);
            const ratio = bitmap.width / bitmap.height;
            bitmap.close();
            if (!Number.isFinite(ratio) || !ratio || !view) throw new Error();
            const width = Math.min(0.32, (0.65 * view.viewport.height * ratio) / view.viewport.width);
            add("image", {
                file,
                aspectRatio: ratio,
                width,
                height: (width * view.viewport.width) / (view.viewport.height * ratio),
            });
            setError("");
        } catch {
            setError("Unable to read this image. Choose a valid PNG or JPEG.");
        }
    };
    const startDrag = (event, item, resizing) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = boxFor(item);
        setSelectedId(item.id);
        dragRef.current = { item, rect, start: currentPoint(event), resizing };
    };
    const moveDrag = (event) => {
        const drag = dragRef.current;
        if (!drag || !view) return;
        const point = currentPoint(event);
        const dx = point.x - drag.start.x;
        const dy = point.y - drag.start.y;
        let box = { ...drag.rect };
        if (drag.resizing) {
            box.width = Math.max(0.04, Math.min(1 - box.x, box.width + dx));
            box.height = Math.max(0.03, Math.min(1 - box.y, box.height + dy));
            if (drag.item.type === "image") {
                const ratio = (drag.rect.width * view.viewport.width) / (drag.rect.height * view.viewport.height);
                const h = (box.width * view.viewport.width) / (ratio * view.viewport.height);
                if (h <= 1 - box.y) box.height = h;
                else {
                    box.height = 1 - box.y;
                    box.width = (box.height * ratio * view.viewport.height) / view.viewport.width;
                }
            }
        } else {
            box.x = Math.max(0, Math.min(1 - box.width, box.x + dx));
            box.y = Math.max(0, Math.min(1 - box.height, box.y + dy));
        }
        const originalViewport = view.pdfPage.getViewport({ scale: 1, rotation: drag.item.rotation });
        setDraft({ ...drag.item, ...mapRectangle(box, view.viewport, originalViewport) });
    };
    const endDrag = () => {
        if (draft && dragRef.current) replace(draft);
        dragRef.current = null;
        setDraft(null);
    };
    if (!page) return <p className={cx("text-sm text-muted-foreground")}>Add a PDF page to edit.</p>;
    return (
        <div className={cx("space-y-4")}>
            <div className={cx("rounded-2xl border border-border bg-card/60 p-4")}>
                <h2 className={cx("text-lg font-semibold")}>Edit PDF</h2>
                <p className={cx("mt-1 text-sm text-muted-foreground")}>
                    Add visual elements without changing the original file.
                </p>
                <p className={cx("mt-3 flex gap-2 text-sm text-muted-foreground")}>
                    <Info className={cx("mt-0.5 size-4 shrink-0")} />
                    Whiteout visually covers content but does not securely remove sensitive information. Text supports
                    standard Latin characters; Thai is not supported.
                </p>
            </div>
            <div className={cx("flex flex-wrap gap-2")}>
                <GlassButton
                    className={cx(btn, tool === "select" && "bg-primary/15 text-primary")}
                    onClick={() => setTool("select")}
                >
                    <MousePointer2 size={16} />
                    Select
                </GlassButton>
                <GlassButton
                    className={cx(btn)}
                    onClick={() => add("text", { text: "New text", color: "#000000", fontSize: 18 })}
                >
                    <Type size={16} />
                    Add Text
                </GlassButton>
                <GlassButton
                    className={cx(btn)}
                    onClick={() => add("whiteout", { fillColor: "#ffffff", borderColor: "#000000", borderWidth: 0 })}
                >
                    <Square size={16} />
                    Whiteout
                </GlassButton>
                <input
                    ref={imageInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className={cx("sr-only")}
                    onChange={(event) => {
                        addImage(event.target.files[0]);
                        event.target.value = "";
                    }}
                />
                <GlassButton className={cx(btn)} onClick={() => imageInput.current?.click()}>
                    <ImagePlus size={16} />
                    Add Image
                </GlassButton>
                <GlassButton
                    className={cx(btn)}
                    disabled={!selected}
                    onClick={() => {
                        updateObjects(objects.filter((item) => item.id !== selectedId));
                        setSelectedId(null);
                    }}
                >
                    <Trash2 size={16} />
                    Delete
                </GlassButton>
                <GlassButton className={cx(btn)} disabled={!history.past.length} onClick={undo}>
                    <Undo2 size={16} />
                    Undo
                </GlassButton>
                <GlassButton className={cx(btn)} disabled={!history.future.length} onClick={redo}>
                    <Redo2 size={16} />
                    Redo
                </GlassButton>
                <GlassButton
                    className={cx(btn, "bg-primary text-primary-foreground")}
                    disabled={!!busy || !pages.length}
                    onClick={() => download(pages, "issuedesk-document.pdf")}
                >
                    <Download size={16} />
                    Export PDF
                </GlassButton>
            </div>
            {error && (
                <p role="alert" className={cx("rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm")}>
                    {error}
                </p>
            )}
            <div className={cx("grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]")}>
                <div className={cx("space-y-3 rounded-2xl border border-border bg-card/60 p-4")}>
                    <label className={cx("flex flex-wrap items-center gap-2 text-sm")}>
                        Page
                        <select
                            className={cx(field)}
                            value={page.id}
                            onChange={(event) => {
                                setActiveId(event.target.value);
                                setSelectedId(null);
                            }}
                        >
                            {pages.map((item, index) => (
                                <option key={item.id} value={item.id}>
                                    Page {index + 1} · {sources.get(item.sourceId)?.file.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div
                        ref={surfaceRef}
                        className={cx("relative mx-auto w-full max-w-3xl bg-white shadow-lg")}
                        onPointerDown={() => setSelectedId(null)}
                        style={{
                            containerType: "inline-size",
                            aspectRatio: view ? `${view.viewport.width} / ${view.viewport.height}` : "1 / 1.414",
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            className={cx("block h-full w-full")}
                            aria-label="PDF editing preview"
                        />
                        {view &&
                            objects.map((original) => {
                                const item = draft?.id === original.id ? draft : original;
                                const box = boxFor(item);
                                const delta = (view.rotation - item.rotation + 360) % 360;
                                const swapped = delta === 90 || delta === 270;
                                const physicalRatio =
                                    (box.height * view.viewport.height) / (box.width * view.viewport.width);
                                return (
                                    <div
                                        key={item.id}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                setSelectedId(item.id);
                                            }
                                        }}
                                        onPointerDown={(event) => startDrag(event, item, false)}
                                        onPointerMove={moveDrag}
                                        onPointerUp={endDrag}
                                        onPointerCancel={() => {
                                            dragRef.current = null;
                                            setDraft(null);
                                        }}
                                        style={{
                                            left: `${box.x * 100}%`,
                                            top: `${box.y * 100}%`,
                                            width: `${box.width * 100}%`,
                                            height: `${box.height * 100}%`,
                                            touchAction: "none",
                                        }}
                                        className={cx(
                                            "absolute cursor-move overflow-visible",
                                            selectedId === item.id && "outline-2 outline-offset-1 outline-cyan-500",
                                        )}
                                        aria-label={`${item.type} object`}
                                    >
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: "50%",
                                                top: "50%",
                                                width: swapped ? `${physicalRatio * 100}%` : "100%",
                                                height: swapped ? `${100 / physicalRatio}%` : "100%",
                                                transform: `translate(-50%, -50%) rotate(${delta}deg)`,
                                            }}
                                        >
                                            {item.type === "whiteout" && (
                                                <div
                                                    className={cx("h-full w-full")}
                                                    style={{
                                                        backgroundColor: item.fillColor || "#ffffff",
                                                        boxShadow: `inset 0 0 0 ${((item.borderWidth || 0) / view.viewport.width) * 50}cqw ${item.borderColor || "#000000"}, 0 0 0 ${((item.borderWidth || 0) / view.viewport.width) * 50}cqw ${item.borderColor || "#000000"}`,
                                                    }}
                                                />
                                            )}
                                            {item.type === "image" && <ImageObject file={item.file} />}
                                            {item.type === "text" && (
                                                <div
                                                    className={cx("h-full w-full overflow-hidden whitespace-pre")}
                                                    style={{
                                                        color: item.color,
                                                        fontSize: `${(item.fontSize / view.viewport.width) * 100}cqw`,
                                                        fontFamily: "Arial, sans-serif",
                                                        lineHeight: 1,
                                                    }}
                                                >
                                                    {item.text}
                                                </div>
                                            )}
                                        </div>
                                        {selectedId === item.id && (
                                            <GlassButton
                                                type="button"
                                                aria-label="Resize selected object"
                                                className={cx("absolute -bottom-2 -right-2 size-5 rounded bg-cyan-500")}
                                                onPointerDown={(event) => startDrag(event, item, true)}
                                                onPointerMove={moveDrag}
                                                onPointerUp={endDrag}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
                <aside className={cx("space-y-3 rounded-2xl border border-border bg-card/60 p-4")}>
                    <h3 className={cx("font-semibold")}>Selected item</h3>
                    {selected?.type === "text" ? (
                        <>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Text
                                <input
                                    className={cx(field)}
                                    value={selected.text}
                                    onChange={(event) => replace({ ...selected, text: event.target.value })}
                                />
                            </label>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Font size
                                <input
                                    className={cx(field)}
                                    type="number"
                                    min="6"
                                    max="120"
                                    value={selected.fontSize}
                                    onChange={(event) =>
                                        replace({
                                            ...selected,
                                            fontSize: Math.max(6, Math.min(120, Number(event.target.value) || 6)),
                                        })
                                    }
                                />
                            </label>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Text color
                                <input
                                    className={cx("h-11 w-full rounded-xl border border-border bg-background p-1")}
                                    type="color"
                                    value={selected.color}
                                    onChange={(event) => replace({ ...selected, color: event.target.value })}
                                />
                            </label>
                        </>
                    ) : selected?.type === "whiteout" ? (
                        <>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Fill color
                                <input
                                    className={cx("h-11 w-full rounded-xl border border-border bg-background p-1")}
                                    type="color"
                                    value={selected.fillColor || "#ffffff"}
                                    onChange={(event) => replace({ ...selected, fillColor: event.target.value })}
                                />
                            </label>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Border color
                                <input
                                    className={cx("h-11 w-full rounded-xl border border-border bg-background p-1")}
                                    type="color"
                                    value={selected.borderColor || "#000000"}
                                    onChange={(event) => replace({ ...selected, borderColor: event.target.value })}
                                />
                            </label>
                            <label className={cx("flex flex-col gap-1 text-sm")}>
                                Border width (pt)
                                <input
                                    className={cx(field)}
                                    type="number"
                                    min="0"
                                    max="20"
                                    step="0.5"
                                    value={selected.borderWidth ?? 0}
                                    onChange={(event) =>
                                        replace({
                                            ...selected,
                                            borderWidth: Math.max(0, Math.min(20, Number(event.target.value) || 0)),
                                        })
                                    }
                                />
                            </label>
                        </>
                    ) : (
                        <p className={cx("text-sm text-muted-foreground")}>
                            {selected
                                ? "Drag to move. Use the corner handle to resize."
                                : "Select an item to edit or delete it."}
                        </p>
                    )}
                </aside>
            </div>
        </div>
    );
}
