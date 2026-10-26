import FileItem from "./FileItem";
import GlassButton from "../GlassButton";
import { Trash2 } from "lucide-react";
import { cx } from "../../utils/cx";

function FileList({ files, onRemove, onClear, disabled = false }) {
    if (files.length === 0) {
        return null;
    }

    return (
        <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
            <div className={cx("mb-4 flex items-center justify-between gap-4")}>
                <div>
                    <h2 className={cx("font-semibold")}>Selected Images</h2>

                    <p className={cx("mt-1 text-sm text-muted-foreground")}>
                        {files.length} image{files.length > 1 ? "s" : ""}
                    </p>
                </div>

                <GlassButton type="button" onClick={onClear} disabled={disabled} className={cx("inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50")}>
                    <Trash2 className={cx("size-4")} aria-hidden="true" />
                    Clear All
                </GlassButton>
            </div>

            <div className={cx("space-y-3")}>
                {files.map((file) => (
                    <FileItem key={file.id} file={file} onRemove={onRemove} disabled={disabled} />
                ))}
            </div>
        </section>
    );
}

export default FileList;
