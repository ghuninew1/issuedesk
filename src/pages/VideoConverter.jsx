import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Video, Sparkles, Settings2, Trash2, Download } from "lucide-react";
import GlassButton from "../components/GlassButton";
import { createZip } from "../utils/createZip";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const presets = { best: { mp4: 18, webm: 20 }, balanced: { mp4: 23, webm: 32 }, small: { mp4: 28, webm: 42 } };
const control =
    "w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const action =
    "rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const size = (bytes) => {
    const i = bytes ? Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
    return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${["B", "KB", "MB", "GB"][i]}`;
};
const download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function metadata(file) {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        const finish = (data) => {
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(url);
            resolve(data);
        };
        video.preload = "metadata";
        video.onloadedmetadata = () =>
            finish({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        video.onerror = () => finish({});
        video.src = url;
    });
}

function Field({ label, children }) {
    return (
        <label className={cx("block text-sm font-medium")}>
            <span className={cx("mb-2 block")}>{label}</span>
            {children}
        </label>
    );
}

export default function VideoConverter() {
    useDocumentTitle("Video Converter");
    const [files, setFiles] = useState([]);
    const [settings, setSettings] = useState({
        format: "mp4",
        quality: "balanced",
        resolution: "original",
        audio: "keep",
        fps: "original",
        bitrate: "",
        audioBitrate: "auto",
        width: "",
        height: "",
        aspect: true,
    });
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [message, setMessage] = useState("");
    const [overall, setOverall] = useState(null);
    const input = useRef(null);
    const engine = useRef(null);
    const removed = useRef(new Set());
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            engine.current?.terminate();
            engine.current = null;
        };
    }, []);
    const change = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
    const add = async (list) => {
        const accepted = Array.from(list).filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f.name));
        setMessage(
            accepted.length === list.length ? "" : "Some files were skipped. Choose MP4, MOV, WebM or MKV videos.",
        );
        const entries = await Promise.all(
            accepted.map(async (file) => ({
                id: crypto.randomUUID(),
                file,
                status: "queued",
                progress: 0,
                ...(await metadata(file)),
            })),
        );
        if (alive.current) setFiles((current) => [...current, ...entries]);
    };
    const update = (id, values) => {
        if (alive.current) setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...values } : f)));
    };
    const convert = async () => {
        const queue = files.filter((f) => f.status !== "completed");
        if (!queue.length || busy) return;
        const { width, height, aspect, resolution, bitrate } = settings;
        if (
            resolution === "custom" &&
            ((!width && !height) ||
                (!aspect && (!width || !height)) ||
                [width, height].some((n) => n && (!Number.isInteger(Number(n)) || Number(n) < 2 || Number(n) > 8192)))
        ) {
            setMessage("Enter valid custom dimensions from 2 to 8192 pixels.");
            return;
        }
        if (bitrate && (!Number.isInteger(Number(bitrate)) || Number(bitrate) < 1 || Number(bitrate) > 100000)) {
            setMessage("Video bitrate must be between 1 and 100000 kbps.");
            return;
        }
        setMessage("");
        setBusy(true);
        setOverall({ done: 0, total: queue.length });
        let ffmpeg;
        try {
            const [{ FFmpeg }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
                import("@ffmpeg/ffmpeg"),
                import("@ffmpeg/core?url"),
                import("@ffmpeg/core/wasm?url"),
            ]);
            if (!alive.current) return;
            ffmpeg = engine.current || new FFmpeg();
            engine.current = ffmpeg;
            if (!ffmpeg.loaded) {
                let wasm = wasmURL;
                if (Array.isArray(wasmURL)) {
                    const chunks = await Promise.all(
                        wasmURL.map(async (url) => {
                            const response = await fetch(url);
                            if (!response.ok) throw new Error("Failed to load converter");
                            return response.blob();
                        }),
                    );
                    wasm = URL.createObjectURL(new Blob(chunks, { type: "application/wasm" }));
                }
                try {
                    await ffmpeg.load({ coreURL, wasmURL: wasm });
                } finally {
                    if (wasm !== wasmURL) URL.revokeObjectURL(wasm);
                }
            }
        } catch {
            if (alive.current) {
                setMessage(
                    "The video converter could not load. Check your connection or browser resources and try again.",
                );
                setBusy(false);
            }
            return;
        }
        for (let index = 0; index < queue.length && alive.current; index++) {
            const item = queue[index];
            if (removed.current.has(item.id)) {
                setOverall({ done: index + 1, total: queue.length });
                continue;
            }
            const ext = item.file.name.split(".").pop().toLowerCase();
            const source = `input.${ext}`;
            const output = `output.${settings.format}`;
            update(item.id, { status: "loading", progress: 0 });
            const onProgress = ({ progress }) =>
                update(item.id, { progress: Math.max(0, Math.min(100, Math.round(progress * 100))) });
            ffmpeg.on("progress", onProgress);
            try {
                await ffmpeg.writeFile(source, new Uint8Array(await item.file.arrayBuffer()));
                update(item.id, { status: "converting" });
                const args = ["-i", source, "-map", "0:v:0", "-map", "0:a:0?"];
                let scale;
                if (resolution !== "original" && resolution !== "custom")
                    scale = `scale=-2:${resolution}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
                if (resolution === "custom") {
                    if (aspect)
                        scale = `scale=${width || -2}:${height || -2}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
                    else scale = `scale=${width}:${height}:force_divisible_by=2`;
                }
                if (scale) args.push("-vf", scale);
                if (settings.fps !== "original") args.push("-r", settings.fps);
                args.push("-c:v", settings.format === "mp4" ? "libx264" : "libvpx-vp9", "-pix_fmt", "yuv420p");
                if (settings.quality === "custom" && bitrate) args.push("-b:v", `${bitrate}k`);
                else {
                    args.push("-crf", String((presets[settings.quality] || presets.balanced)[settings.format]));
                    if (settings.format === "webm") args.push("-b:v", "0");
                }
                if (settings.audio === "mute") args.push("-an");
                else {
                    args.push("-c:a", settings.format === "mp4" ? "aac" : "libopus");
                    if (settings.audioBitrate !== "auto") args.push("-b:a", `${settings.audioBitrate}k`);
                }
                args.push(output);
                const code = await ffmpeg.exec(args);
                if (code !== 0) throw new Error("Conversion failed");
                const data = await ffmpeg.readFile(output);
                const blob = new Blob([data], { type: settings.format === "mp4" ? "video/mp4" : "video/webm" });
                update(item.id, {
                    status: "completed",
                    progress: 100,
                    blob,
                    outputName: `${item.file.name.replace(/\.[^.]+$/, "")}.${settings.format}`,
                });
            } catch {
                update(item.id, {
                    status: "failed",
                    error: "This video could not be converted. It may be damaged, unsupported, or too large for this browser.",
                });
            } finally {
                ffmpeg.off("progress", onProgress);
                try {
                    await ffmpeg.deleteFile(source);
                } catch {
                    /* File may not exist. */
                }
                try {
                    await ffmpeg.deleteFile(output);
                } catch {
                    /* File may not exist. */
                }
            }
            if (alive.current) setOverall({ done: index + 1, total: queue.length });
        }
        if (alive.current) setBusy(false);
    };
    const completed = files.filter((f) => f.blob);
    const original = completed.reduce((n, f) => n + f.file.size, 0);
    const converted = completed.reduce((n, f) => n + f.blob.size, 0);
    return (
        <section className={cx("mx-auto max-w-6xl animate-fadeInUp")}>
            <header
                className={cx(
                    "mb-6 flex flex-col gap-4 rounded-2xl p-5 glass-surface sm:flex-row sm:items-center sm:justify-between md:p-6",
                )}
            >
                <div className={cx("flex items-start gap-4")}>
                    <span
                        className={cx(
                            "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary",
                        )}
                    >
                        <Video className={cx("size-6")} aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className={cx("text-2xl font-semibold tracking-tight md:text-3xl")}>Video Converter</h1>
                        <p className={cx("mt-1 text-sm text-muted-foreground")}>
                            Convert and optimize videos directly in your browser.
                        </p>
                    </div>
                </div>
                <div className={cx("flex items-center gap-2 text-xs text-muted-foreground")}>
                    <Sparkles className={cx("size-4 text-primary")} aria-hidden="true" />
                    Your files stay on this device.
                </div>
            </header>
            <nav aria-label="Converter tools" className={cx("mb-6 flex flex-wrap gap-2")}>
                <Link
                    to="/image-converter"
                    className={cx(
                        "rounded-xl border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:text-foreground",
                    )}
                >
                    Image Converter
                </Link>
                <span
                    aria-current="page"
                    className={cx(
                        "rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary",
                    )}
                >
                    Video Converter
                </span>
            </nav>
            <input
                ref={input}
                type="file"
                accept=".mp4,.mov,.webm,.mkv"
                multiple
                className={cx("sr-only")}
                tabIndex={-1}
                onChange={(e) => {
                    add(e.target.files);
                    e.target.value = "";
                }}
            />
            <GlassButton
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!busy) add(e.dataTransfer.files);
                }}
                className={cx(
                    "flex min-h-36 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    dragging
                        ? "border-primary bg-primary/15"
                        : "border-white/70 bg-white/30 hover:border-primary/50 dark:border-white/10 dark:bg-white/[.02]",
                )}
            >
                <Video className={cx("mb-3 size-10 text-muted-foreground")} aria-hidden="true" />
                <span className={cx("text-sm font-medium")}>Drop videos here</span>
                <span className={cx("mt-1 text-sm text-muted-foreground")}>or click to browse</span>
                <span className={cx("mt-2 text-xs text-muted-foreground")}>
                    MP4 • MOV • WebM • MKV · Multiple files supported
                </span>
            </GlassButton>
            <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
                <h2 className={cx("flex items-center gap-3 text-lg font-semibold")}>
                    <Settings2 className={cx("size-5 text-primary")} />
                    Conversion Settings
                </h2>
                <fieldset disabled={busy} className={cx("mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>
                    <Field label="Output Format">
                        <select
                            className={cx(control)}
                            value={settings.format}
                            onChange={(e) => change("format", e.target.value)}
                        >
                            <option value="mp4">MP4</option>
                            <option value="webm">WebM</option>
                        </select>
                    </Field>
                    <Field label="Quality">
                        <select
                            className={cx(control)}
                            value={settings.quality}
                            onChange={(e) => change("quality", e.target.value)}
                        >
                            <option value="best">Best Quality</option>
                            <option value="balanced">Balanced — Recommended</option>
                            <option value="small">Small File</option>
                            <option value="custom">Custom</option>
                        </select>
                    </Field>
                    <Field label="Resolution">
                        <select
                            className={cx(control)}
                            value={settings.resolution}
                            onChange={(e) => change("resolution", e.target.value)}
                        >
                            <option value="original">Original</option>
                            <option value="1080">1080p</option>
                            <option value="720">720p</option>
                            <option value="480">480p</option>
                            <option value="custom">Custom</option>
                        </select>
                    </Field>
                    <Field label="Audio">
                        <select
                            className={cx(control)}
                            value={settings.audio}
                            onChange={(e) => change("audio", e.target.value)}
                        >
                            <option value="keep">Keep Audio</option>
                            <option value="mute">Mute</option>
                        </select>
                    </Field>
                </fieldset>
                <details className={cx("mt-5 border-t border-border pt-4")}>
                    <summary className={cx("cursor-pointer text-sm font-medium")}>Advanced Settings</summary>
                    <fieldset disabled={busy} className={cx("mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>
                        <Field label="Video Codec">
                            <input
                                className={cx(control)}
                                value={settings.format === "mp4" ? "H.264" : "VP9"}
                                readOnly
                            />
                        </Field>
                        <Field label="Frame Rate">
                            <select
                                className={cx(control)}
                                value={settings.fps}
                                onChange={(e) => change("fps", e.target.value)}
                            >
                                <option value="original">Original</option>
                                <option value="60">60 FPS</option>
                                <option value="30">30 FPS</option>
                                <option value="24">24 FPS</option>
                            </select>
                        </Field>
                        <Field label="Video Bitrate (kbps)">
                            <input
                                className={cx(control)}
                                type="number"
                                min="1"
                                max="100000"
                                placeholder="Auto"
                                value={settings.bitrate}
                                onChange={(e) => {
                                    change("bitrate", e.target.value);
                                    change("quality", "custom");
                                }}
                            />
                        </Field>
                        <Field label="Audio Codec">
                            <input
                                className={cx(control)}
                                value={settings.format === "mp4" ? "AAC" : "Opus"}
                                readOnly
                            />
                        </Field>
                        <Field label="Audio Bitrate">
                            <select
                                className={cx(control)}
                                disabled={settings.audio === "mute"}
                                value={settings.audioBitrate}
                                onChange={(e) => change("audioBitrate", e.target.value)}
                            >
                                <option value="auto">Auto</option>
                                <option value="128">128 kbps</option>
                                <option value="192">192 kbps</option>
                                <option value="256">256 kbps</option>
                            </select>
                        </Field>
                        {settings.resolution === "custom" && (
                            <>
                                <Field label="Width (px)">
                                    <input
                                        className={cx(control)}
                                        type="number"
                                        min="2"
                                        max="8192"
                                        value={settings.width}
                                        onChange={(e) => change("width", e.target.value)}
                                    />
                                </Field>
                                <Field label="Height (px)">
                                    <input
                                        className={cx(control)}
                                        type="number"
                                        min="2"
                                        max="8192"
                                        value={settings.height}
                                        onChange={(e) => change("height", e.target.value)}
                                    />
                                </Field>
                                <label className={cx("flex items-center gap-2 text-sm")}>
                                    <input
                                        type="checkbox"
                                        checked={settings.aspect}
                                        onChange={(e) => change("aspect", e.target.checked)}
                                    />
                                    Keep Aspect Ratio
                                </label>
                            </>
                        )}
                    </fieldset>
                </details>
                {settings.resolution === "custom" && (
                    <p className={cx("mt-3 text-xs text-muted-foreground")}>
                        Set custom dimensions in Advanced Settings.
                    </p>
                )}
            </section>
            <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
                <div className={cx("flex flex-wrap items-center justify-between gap-3")}>
                    <div>
                        <h2 className={cx("font-semibold")}>Selected Videos</h2>
                        <p className={cx("text-sm text-muted-foreground")}>
                            {files.length} videos • {size(files.reduce((n, f) => n + f.file.size, 0))}
                        </p>
                    </div>
                    <GlassButton
                        type="button"
                        className={cx(action)}
                        disabled={busy || !files.length}
                        onClick={() => {
                            setFiles([]);
                            setOverall(null);
                        }}
                    >
                        Clear All
                    </GlassButton>
                </div>
                <ul className={cx("mt-4 space-y-3")}>
                    {files.map((f) => (
                        <li key={f.id} className={cx("min-w-0 rounded-xl border border-border/60 p-3")}>
                            <div className={cx("flex items-start justify-between gap-3")}>
                                <div className={cx("min-w-0")}>
                                    <p className={cx("truncate text-sm font-medium")} title={f.file.name}>
                                        {f.file.name}
                                    </p>
                                    <p className={cx("mt-1 text-xs text-muted-foreground")}>
                                        {f.width ? `${f.width} × ${f.height} • ` : ""}
                                        {Number.isFinite(f.duration)
                                            ? `${Math.floor(f.duration / 60)}:${String(Math.floor(f.duration % 60)).padStart(2, "0")} • `
                                            : ""}
                                        {f.file.name.split(".").pop().toUpperCase()} • {size(f.file.size)} · {f.status}
                                    </p>
                                    {f.error && (
                                        <p role="alert" className={cx("mt-1 text-xs text-destructive")}>
                                            {f.error}
                                        </p>
                                    )}
                                </div>
                                <div className={cx("flex shrink-0 gap-2")}>
                                    {f.blob && (
                                        <GlassButton
                                            type="button"
                                            className={cx(action)}
                                            onClick={() => download(f.blob, f.outputName)}
                                            aria-label={`Download ${f.outputName}`}
                                        >
                                            <Download className={cx("size-4")} />
                                        </GlassButton>
                                    )}
                                    <GlassButton
                                        type="button"
                                        disabled={busy && f.status !== "queued"}
                                        className={cx(action)}
                                        onClick={() => {
                                            removed.current.add(f.id);
                                            setFiles((current) => current.filter((item) => item.id !== f.id));
                                        }}
                                        aria-label={`Remove ${f.file.name}`}
                                    >
                                        <Trash2 className={cx("size-4")} />
                                    </GlassButton>
                                </div>
                            </div>
                            {f.status === "converting" && (
                                <div className={cx("mt-3")}>
                                    <p className={cx("text-xs text-muted-foreground")}>{f.progress}%</p>
                                    <progress
                                        className={cx("w-full accent-primary")}
                                        max="100"
                                        value={f.progress}
                                        aria-label={`Progress for ${f.file.name}`}
                                    />
                                </div>
                            )}
                            {f.blob && (
                                <p className={cx("mt-2 text-xs text-muted-foreground")}>
                                    {f.outputName} • {size(f.blob.size)}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
            {message && (
                <p role="alert" className={cx("mt-4 text-sm text-destructive")}>
                    {message}
                </p>
            )}
            {busy && overall && (
                <p role="status" className={cx("mt-4 text-sm text-muted-foreground")}>
                    {overall.done} / {overall.total} videos processed
                </p>
            )}
            <GlassButton
                type="button"
                disabled={busy || !files.some((f) => f.status !== "completed")}
                onClick={convert}
                className={cx(
                    "mt-6 w-full rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50",
                )}
            >
                {busy
                    ? `Converting ${Math.min(overall.done + 1, overall.total)} of ${overall.total}...`
                    : `Convert ${files.length || ""} Videos to ${settings.format.toUpperCase()}`}
            </GlassButton>
            {completed.length > 0 && (
                <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
                    <h2 className={cx("font-semibold")}>Conversion complete · {completed.length} videos converted</h2>
                    <div className={cx("mt-4 grid gap-3 text-sm sm:grid-cols-3")}>
                        <p>Original: {size(original)}</p>
                        <p>Converted: {size(converted)}</p>
                        <p>
                            {original >= converted ? "Saved" : "Size increase"}: {size(Math.abs(original - converted))}{" "}
                            ({original ? Math.round((Math.abs(original - converted) / original) * 100) : 0}%)
                        </p>
                    </div>
                    {completed.length > 1 && (
                        <GlassButton
                            type="button"
                            className={cx(action, "mt-4")}
                            onClick={async () => {
                                try {
                                    download(
                                        await createZip(completed.map((f) => ({ name: f.outputName, blob: f.blob }))),
                                        "converted-videos.zip",
                                    );
                                } catch {
                                    setMessage("Could not create the ZIP. Download each video individually instead.");
                                }
                            }}
                        >
                            Download All
                        </GlassButton>
                    )}
                </section>
            )}
        </section>
    );
}
