import { cx } from "../../utils/cx";
import GlassButton from "../GlassButton";

function formatFileSize(bytes) {
    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));

    const size = bytes / 1024 ** index;

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getStatusLabel(status) {
    const labels = {
        waiting: "Waiting",
        converting: "Converting...",
        done: "Done",
        cancelled: "Cancelled",
        error: "Error",
    };

    return labels[status] || "Waiting";
}

function calculateSizeReduction(originalSize, outputSize) {
    if (!originalSize || !outputSize) {
        return 0;
    }

    return Math.round(((originalSize - outputSize) / originalSize) * 100);
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileItem({ file, onRemove, disabled = false }) {
    const reduction = calculateSizeReduction(file.size, file.outputSize);

    const outputFilename = file.outputFormat ? `${file.name.replace(/\.[^/.]+$/, "")}.${file.outputFormat}` : "";

    return (
        <div className={cx("flex flex-col justify-center gap-4 rounded-xl border border-border/70 bg-background/35 p-4 md:flex-row md:items-center md:justify-between")}>
            <img src={file.preview} alt={file.name} className={cx("mx-auto h-16 w-auto max-w-32 rounded-lg object-contain md:mx-0 md:h-20")} />

            <div className={cx("min-w-0 flex-1 text-center md:text-left")}>
                <p className={cx("truncate font-medium text-sm md:text-base")}>{file.name}</p>

                <div className={cx("mt-1 text-xs text-muted-foreground md:text-sm")}>
                    <p>Original: {formatFileSize(file.size)}</p>

                    <p>
                        {file.width} × {file.height} px
                    </p>
                </div>
            </div>
            {file.outputBlob && (
                <div className={cx("mt-2 flex flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm md:ml-4 md:mt-0 md:text-base")}>
                    <p className={cx("text-xs font-medium text-muted-foreground md:text-sm")}>Converted</p>

                    <p className={cx("mt-1 text-muted-foreground")}>
                        {file.outputWidth} × {file.outputHeight} px
                    </p>

                    <div className={cx("mt-1 flex items-center gap-2 text-sm md:text-base")}>
                        <span className={cx("text-muted-foreground")}>{formatFileSize(file.outputSize)}</span>

                        <span className={cx("font-medium", reduction >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                            {reduction >= 0 ? "-" : "+"}
                            {Math.abs(reduction)}%
                        </span>
                    </div>
                </div>
            )}
            <div className={cx("flex shrink-0 flex-col items-center justify-center gap-2 md:ml-4 md:flex-row")}>
                <span
                    className={cx(
                        "text-xs md:text-base font-medium",
                        file.status === "waiting" && "text-amber-600 dark:text-amber-400",
                        file.status === "converting" && "text-primary",
                        file.status === "done" && "text-emerald-600 dark:text-emerald-400",
                        file.status === "cancelled" && "text-muted-foreground",
                        file.status === "error" && "text-destructive",
                    )}
                >
                   {getStatusLabel(file.status)}
                </span>

                <div className={cx("mt-2 flex w-full shrink-0 flex-col items-center justify-center gap-2 md:ml-2 md:mt-0 md:w-auto md:flex-row")}>
                    {file.outputBlob && (
                        <GlassButton
                            type="button"
                            onClick={() => downloadFile(file.outputBlob, outputFilename)}
                            disabled={disabled}
                            className={cx("w-full rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto")}
                        >
                            Download
                        </GlassButton>
                    )}

                    <GlassButton
                        type="button"
                        onClick={() => onRemove(file.id)}
                        disabled={disabled || file.status === "converting"}
                        className={cx("w-full rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto")}
                    >
                        Remove
                    </GlassButton>
                </div>
            </div>
        </div>
    );
}

export default FileItem;
