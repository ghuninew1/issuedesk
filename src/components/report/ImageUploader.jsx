import { useEffect, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import heic2any from "heic2any";
import { Images } from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

const isAcceptedImage = (file) => ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.test(file.name);

const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ImagePreview = ({ file }) => {
    const [previewUrl, setPreviewUrl] = useState("");
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let objectUrl = "";

        const createPreview = async () => {
            setPreviewUrl("");
            setHasError(false);

            try {
                const isHeic =
                    /\.(heic|heif)$/i.test(file.name) || ["image/heic", "image/heif"].includes(file.type.toLowerCase());

                let previewFile = file;

                if (isHeic) {
                    const converted = await heic2any({
                        blob: file,
                        toType: "image/jpeg",
                        quality: 0.8,
                    });

                    previewFile = Array.isArray(converted) ? converted[0] : converted;
                }

                if (cancelled) {
                    return;
                }

                objectUrl = URL.createObjectURL(previewFile);
                setPreviewUrl(objectUrl);
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to create image preview:", error);
                    setHasError(true);
                }
            }
        };

        createPreview();

        return () => {
            cancelled = true;

            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [file]);

    if (hasError) {
        return (
            <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                ไม่สามารถแสดงตัวอย่างภาพได้
            </div>
        );
    }

    if (!previewUrl) {
        return (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground" role="status">
                กำลังโหลดภาพ...
            </div>
        );
    }

    return <img src={previewUrl} alt={`Preview ${file.name}`} className="size-full object-cover" />;
};

const ImageUploader = ({ files, onChange, disabled = false }) => {
    const inputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState("");

    const addFiles = (fileList) => {
        if (disabled) {
            return;
        }

        const selectedFiles = Array.from(fileList);
        const nextFiles = [...files];
        const messages = [];

        for (const file of selectedFiles) {
            if (!isAcceptedImage(file)) {
                messages.push(`${file.name}: รองรับเฉพาะ JPG, PNG, WebP, HEIC และ HEIF`);
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                messages.push(`${file.name}: ไฟล์ต้องมีขนาดไม่เกิน 5 MB`);
                continue;
            }

            const isDuplicate = nextFiles.some(
                (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
            );

            if (isDuplicate) {
                continue;
            }

            if (nextFiles.length >= MAX_FILES) {
                messages.push("แนบรูปภาพได้สูงสุด 5 ภาพ");
                break;
            }

            nextFiles.push(file);
        }

        onChange(nextFiles);
        setError(messages.join("\n"));
    };

    const removeFile = (index) => {
        onChange(files.filter((_, fileIndex) => fileIndex !== index));
        setError("");
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);

        addFiles(event.dataTransfer.files);
    };

    return (
        <div className="space-y-3">
            <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                }}
            />

            <button
                type="button"
                disabled={disabled || files.length >= MAX_FILES}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                        setIsDragging(false);
                    }
                }}
                onDrop={handleDrop}
                className={cx(
                    "flex min-h-36 w-full flex-col items-center justify-center",
                    "rounded-xl border-2 border-dashed p-6 text-center",
                    "transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    isDragging ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]",
                )}
            >
                <Images className="mb-3 size-10 text-muted-foreground" />

                <span className="text-sm font-medium">คลิกเพื่อเลือกรูปภาพ หรือลากไฟล์มาวางที่นี่</span>

                <span className="mt-2 text-xs text-muted-foreground">
                    JPG, PNG, WebP, HEIC หรือ HEIF · สูงสุด 5 ภาพ · ภาพละไม่เกิน 5 MB
                </span>
            </button>

            {error && (
                <p role="alert" className="whitespace-pre-line text-sm text-destructive">
                    {error}
                </p>
            )}

            {files.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {files.map((file, index) => (
                        <div
                            key={`${file.name}-${file.lastModified}-${index}`}
                            className="overflow-hidden rounded-lg border border-border bg-background"
                        >
                            <div className="relative aspect-square bg-muted">
                                <ImagePreview file={file} />

                                <button
                                    type="button"
                                    aria-label={`ลบภาพ ${file.name}`}
                                    title="ลบภาพ"
                                    onClick={() => removeFile(index)}
                                    disabled={disabled}
                                    className={cx(
                                        "absolute right-2 top-2 flex size-8 items-center justify-center",
                                        "rounded-full bg-black/70 text-white",
                                        "transition-colors hover:bg-black",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                        "disabled:cursor-not-allowed disabled:opacity-50",
                                    )}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="size-4"
                                        aria-hidden="true"
                                    >
                                        <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-1 p-3">
                                <p className="truncate text-xs font-medium">{file.name}</p>

                                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                เลือกแล้ว {files.length}/{MAX_FILES} ภาพ
            </p>
        </div>
    );
};

export default ImageUploader;
