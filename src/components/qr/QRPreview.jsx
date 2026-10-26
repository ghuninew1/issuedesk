import { cx } from "../../utils/cx";
import QRDownloadActions from "./QRDownloadActions";
import { panel } from "./styles";
export default function QRPreview({ containerRef, ready, error, download, name, value, pendingLink }) {
    return (
        <section className={cx(panel, "space-y-5 text-center")}>
            <div className={cx("flex items-center justify-between")}>
                <h2 className={cx("font-semibold")}>Live Preview</h2>
                <span className={cx("rounded-full bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-300")}>
                    1024 px
                </span>
            </div>
            <div
                className={cx(
                    "relative mx-auto aspect-square w-full max-w-80 overflow-hidden rounded-2xl bg-white p-2 shadow-lg",
                )}
            >
                <div
                    ref={containerRef}
                    aria-label="QR code preview"
                    role="img"
                    className={cx("h-full w-full [&>svg]:h-full [&>svg]:w-full")}
                />
                {!ready && (
                    <div
                        className={cx(
                            "absolute inset-0 flex items-center justify-center bg-white/95 p-6 text-sm text-slate-500",
                        )}
                    >
                        {error || (value ? "Rendering…" : "Add content to preview your QR")}
                    </div>
                )}
            </div>
            <p className={cx("break-all text-xs text-muted-foreground")}>
                {pendingLink
                    ? "Save to create the Short Link and enable the final QR."
                    : value || "Your QR will appear here"}
            </p>
            <QRDownloadActions ready={ready && !pendingLink} download={download} name={name} />
            {error && (
                <p role="alert" className={cx("text-sm text-red-500")}>
                    {error}
                </p>
            )}
        </section>
    );
}
