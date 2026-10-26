import { useRef, useState } from "react";
import GlassButton from "../GlassButton";
import { Images } from "lucide-react";
import { cx } from "../../utils/cx";

function DropZone({ onFiles }) {
    const inputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [rejectedFiles, setRejectedFiles] = useState(0);

    const handleFiles = (files) => {
        const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
        setRejectedFiles(files.length - imageFiles.length);

        if (imageFiles.length > 0) {
            onFiles(imageFiles);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);

        handleFiles(event.dataTransfer.files);
    };

    const handleInputChange = (event) => {
        handleFiles(event.target.files);
        event.target.value = "";
    };

    return (
        <div className={cx("space-y-3")}>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleInputChange}
                className={cx("sr-only")}
                tabIndex={-1}
                aria-hidden="true"
            />

            <GlassButton
                type="button"
                aria-label="Choose images to convert"
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
                    "flex min-h-36 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isDragging
                        ? "border-cyan-500/60 bg-cyan-500/10"
                        : "border-white/70 bg-white/30 hover:border-cyan-400/50 hover:bg-white/55 dark:border-white/10 dark:bg-white/[.02] dark:hover:bg-white/5",
                )}
            >
                <Images className={cx("mb-3 size-10 text-muted-foreground")} aria-hidden="true" />

                <span className={cx("text-sm font-medium")}>
                    คลิกเพื่อเลือกรูปภาพ หรือลากไฟล์มาวางที่นี่
                </span>

                <span className={cx("mt-2 text-xs text-muted-foreground")}>
                    JPG, PNG, WebP, AVIF และรูปแบบอื่นที่เบราว์เซอร์รองรับ · เลือกได้หลายภาพ
                </span>
            </GlassButton>

            {rejectedFiles > 0 && (
                <p className={cx("whitespace-pre-line text-sm text-destructive")} role="alert">
                    ข้าม {rejectedFiles} ไฟล์ที่ไม่ใช่รูปภาพ
                </p>
            )}
        </div>
    );
}

export default DropZone;
