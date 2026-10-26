import { useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
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

    const handleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
        }
    };

    const handleZoneClick = (event) => {
        if (event.target !== inputRef.current) {
            inputRef.current?.click();
        }
    };

    return (
        <div
            onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={handleZoneClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Choose images to convert"
            className={cx(
                "glass-surface flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:min-h-64",
                isDragging ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/50",
            )}
        >
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

            <span className={cx("mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary")}>
                {isDragging ? <Upload className={cx("size-7")} aria-hidden="true" /> : <ImagePlus className={cx("size-7")} aria-hidden="true" />}
            </span>

            <h2 className={cx("text-lg font-semibold md:text-xl")}>Drop images here</h2>

            <p className={cx("mt-1 text-sm text-muted-foreground")}>or click to browse files</p>

            <p className={cx("mt-4 text-xs text-muted-foreground")}>
                JPG, PNG, WebP, AVIF and other browser-supported formats
            </p>
            {rejectedFiles > 0 && (
                <p className={cx("mt-2 text-xs text-destructive")} role="status">
                    {rejectedFiles} non-image {rejectedFiles === 1 ? "file was" : "files were"} skipped.
                </p>
            )}
        </div>
    );
}

export default DropZone;
