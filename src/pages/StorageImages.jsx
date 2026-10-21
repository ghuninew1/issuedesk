import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Eye, ImagePlus, LoaderCircle, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { deleteStorageImage, getStorageImageUrl, getStorageImages, uploadStorageImage } from "../services/storage";
import { cx } from "../utils/cx";

function formatSize(bytes) {
    if (!Number.isFinite(Number(bytes))) return "—";
    const value = Number(bytes);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
    }).format(date);
}

function IconButton({ label, onClick, children, disabled = false, destructive = false }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className={cx(
                "inline-flex size-9 items-center justify-center rounded-lg border border-border",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                "disabled:pointer-events-none disabled:opacity-50",
            )}
        >
            {children}
        </button>
    );
}

export default function StorageImages() {
    const inputRef = useRef(null);
    const [images, setImages] = useState([]);
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [deletingId, setDeletingId] = useState("");
    const [isTruncated, setIsTruncated] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [selectedImage, setSelectedImage] = useState(null);

    useDocumentTitle("Image Storage");

    const loadImages = useCallback(async (signal) => {
        setIsLoading(true);
        setError("");
        try {
            const result = await getStorageImages({ signal });
            if (!result.success || !Array.isArray(result.files)) {
                throw new Error(result.message || "Unable to load images");
            }
            setImages(result.files);
            setIsTruncated(result.isTruncated === true);
        } catch (requestError) {
            if (requestError.name !== "AbortError") setError(requestError.message || "Unable to load images");
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => loadImages(controller.signal), 0);
        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [loadImages]);

    useEffect(() => {
        if (!selectedImage) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === "Escape") setSelectedImage(null);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedImage]);

    const filteredImages = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return images;
        return images.filter((image) => image.file_name.toLowerCase().includes(query));
    }, [images, search]);

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsUploading(true);
        setError("");
        setNotice("");
        try {
            const result = await uploadStorageImage(file);
            if (!result.success || !result.file) throw new Error(result.message || "Unable to upload image");
            setImages((current) => [result.file, ...current]);
            setNotice("อัปโหลดรูปเรียบร้อยแล้ว");
        } catch (uploadError) {
            setError(uploadError.message || "อัปโหลดรูปไม่สำเร็จ");
        } finally {
            setIsUploading(false);
        }
    };

    const handleCopy = async (image) => {
        const link = new URL(getStorageImageUrl(image.id), window.location.origin).toString();
        try {
            await navigator.clipboard.writeText(link);
            setNotice(`คัดลอกลิงก์รูป ${image.file_name} แล้ว`);
            setError("");
        } catch {
            setError("คัดลอกลิงก์ไม่ได้ กรุณาตรวจสอบสิทธิ์ Clipboard ของเบราว์เซอร์");
        }
    };

    const handleDelete = async (image) => {
        if (deletingId || !window.confirm(`ลบรูป “${image.file_name}” หรือไม่? การลบนี้ย้อนกลับไม่ได้`)) return;
        setDeletingId(image.id);
        setError("");
        setNotice("");
        try {
            const result = await deleteStorageImage(image.id);
            if (!result.success) throw new Error(result.message || "ลบรูปไม่สำเร็จ");
            setImages((current) => current.filter((item) => item.id !== image.id));
            if (selectedImage?.id === image.id) setSelectedImage(null);
            setNotice("ลบรูปเรียบร้อยแล้ว");
        } catch (deleteError) {
            setError(deleteError.message || "ลบรูปไม่สำเร็จ");
        } finally {
            setDeletingId("");
        }
    };

    return (
        <div className="mx-auto max-w-7xl animate-fadeInUp">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <ImagePlus size={22} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight">จัดการรูปภาพ</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                อัปโหลด ดูตัวอย่าง ดาวน์โหลด และคัดลอกลิงก์จาก Storage
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => loadImages()}
                        disabled={isLoading || isUploading}
                        className={cx(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input px-3",
                            "text-sm font-medium transition-colors hover:bg-muted",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                            "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
                        )}
                    >
                        <RefreshCw size={16} className={cx(isLoading && "animate-spin")} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading}
                        className={cx(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4",
                            "text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                            "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
                        )}
                    >
                        {isUploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                        {isUploading ? "กำลังอัปโหลด…" : "อัปโหลดรูป"}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        className="sr-only"
                        onChange={handleUpload}
                        aria-label="เลือกภาพเพื่ออัปโหลด"
                    />
                </div>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">รูปทั้งหมด</p>
                    <p className="mt-1 text-2xl font-semibold">{images.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">ชนิดและขนาดไฟล์</p>
                    <p className="mt-1 text-sm">JPG, PNG, WebP, GIF หรือ AVIF · ขนาดไม่เกิน 10 MB</p>
                </div>
            </div>

            {error && (
                <div
                    className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                >
                    {error}
                </div>
            )}
            {notice && (
                <div
                    className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400"
                    role="status"
                >
                    <Check size={16} aria-hidden="true" />
                    {notice}
                </div>
            )}
            {isTruncated && (
                <div
                    className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300"
                    role="status"
                >
                    Storage API ส่งรายการล่าสุดมาได้สูงสุด 100 รูป จึงอาจมีรูปเก่ากว่านี้ที่ยังไม่แสดง
                </div>
            )}

            <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="รายการรูปภาพ">
                <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-semibold">คลังรูปภาพ</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            แสดง {filteredImages.length} จาก {images.length} รูป
                        </p>
                    </div>
                    <label className="relative block w-full sm:max-w-xs">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="ค้นหาชื่อรูป…"
                            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                        />
                    </label>
                </div>

                {isLoading ? (
                    <div
                        className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"
                        role="status"
                    >
                        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                        กำลังโหลดรูปภาพ…
                    </div>
                ) : error && images.length === 0 ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                        โหลดรายการไม่ได้ กรุณาลองรีเฟรช
                    </div>
                ) : filteredImages.length === 0 ? (
                    <div className="flex flex-col items-center p-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <ImagePlus size={22} aria-hidden="true" />
                        </span>
                        <p className="mt-3 font-medium">{search ? "ไม่พบรูปที่ค้นหา" : "ยังไม่มีรูปในคลัง"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">อัปโหลดรูปแรกเพื่อเริ่มใช้งานคลังรูปภาพ</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="bg-muted/40 text-xs text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-3 font-medium">
                                        ตัวอย่าง
                                    </th>
                                    <th scope="col" className="px-4 py-3 font-medium">
                                        ชื่อรูป
                                    </th>
                                    <th scope="col" className="px-4 py-3 font-medium">
                                        รายละเอียด
                                    </th>
                                    <th scope="col" className="px-4 py-3 font-medium">
                                        อัปโหลดเมื่อ
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">
                                        จัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredImages.map((image) => (
                                    <tr key={image.id} className="transition-colors hover:bg-muted/20">
                                        <td className="w-24 px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedImage(image)}
                                                className="group relative block size-16 overflow-hidden rounded-lg border border-border bg-muted"
                                                aria-label={`ดูตัวอย่าง ${image.file_name}`}
                                            >
                                                <img
                                                    src={getStorageImageUrl(image.id)}
                                                    alt=""
                                                    loading="lazy"
                                                    className="size-full object-cover"
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                                                    <Eye size={18} aria-hidden="true" />
                                                </span>
                                            </button>
                                        </td>
                                        <td className="max-w-[260px] px-4 py-3">
                                            <p className="truncate font-medium" title={image.file_name}>
                                                {image.file_name}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-muted-foreground">{image.id}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <p>{image.mime_type}</p>
                                            <p className="mt-1">{formatSize(image.file_size)}</p>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                                            {formatDate(image.uploaded_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <IconButton label="คัดลอกลิงก์รูป" onClick={() => handleCopy(image)}>
                                                    <Copy size={16} aria-hidden="true" />
                                                </IconButton>
                                                <a
                                                    href={getStorageImageUrl(image.id, true, image.file_name)}
                                                    aria-label="ดาวน์โหลดรูป"
                                                    title="ดาวน์โหลดรูป"
                                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                                >
                                                    <Download size={16} aria-hidden="true" />
                                                </a>
                                                <IconButton
                                                    label="ลบรูป"
                                                    onClick={() => handleDelete(image)}
                                                    disabled={Boolean(deletingId)}
                                                    destructive
                                                >
                                                    {deletingId === image.id ? (
                                                        <LoaderCircle size={16} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={16} aria-hidden="true" />
                                                    )}
                                                </IconButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setSelectedImage(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`ตัวอย่าง ${selectedImage.file_name}`}
                        className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{selectedImage.file_name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {formatSize(selectedImage.file_size)} · {selectedImage.mime_type}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedImage(null)}
                                aria-label="ปิดตัวอย่าง"
                                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="flex max-h-[calc(90vh-64px)] min-h-48 items-center justify-center bg-black/5 p-3 dark:bg-black/30">
                            <img
                                src={getStorageImageUrl(selectedImage.id)}
                                alt={selectedImage.file_name}
                                className="max-h-[calc(90vh-90px)] max-w-full object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
