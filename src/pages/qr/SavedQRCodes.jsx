import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRWorkspace from "../../components/qr/QRWorkspace";
import GlassButton from "../../components/GlassButton";
import { qrRequest } from "../../services/qr";
import { cx } from "../../utils/cx";
import { button, input, panel } from "../../components/qr/styles";
export default function SavedQRCodes() {
    const [search, setSearch] = useState(""),
        [type, setType] = useState(""),
        [offset, setOffset] = useState(0),
        [version, setVersion] = useState(0);
    const [result, setResult] = useState(null),
        [error, setError] = useState(""),
        [deleting, setDeleting] = useState(null),
        [busy, setBusy] = useState(false);
    const key = `${search}:${type}:${offset}:${version}`;
    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(
            () =>
                qrRequest(
                    `qr-codes?${new URLSearchParams({ search, type, offset: String(offset), limit: "20" })}`,
                    "GET",
                    undefined,
                    controller.signal,
                )
                    .then((data) => {
                        if (!controller.signal.aborted) setResult({ ...data, key });
                    })
                    .catch((err) => {
                        if (!controller.signal.aborted) setResult({ key, error: err.message });
                    }),
            250,
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [search, type, offset, version, key]);
    async function remove(id) {
        setBusy(true);
        setError("");
        try {
            await qrRequest(`qr-codes/${id}`, "DELETE");
            setDeleting(null);
            setVersion((v) => v + 1);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <QRWorkspace>
            <div className={cx("mb-5 flex flex-wrap items-end gap-4")}>
                <label className={cx("min-w-0 flex-1 text-sm")}>
                    Search QR Codes
                    <input
                        className={cx(input)}
                        type="search"
                        maxLength={100}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setOffset(0);
                        }}
                    />
                </label>
                <label className={cx("text-sm")}>
                    Type
                    <select
                        className={cx(input)}
                        value={type}
                        onChange={(e) => {
                            setType(e.target.value);
                            setOffset(0);
                        }}
                    >
                        <option value="">All types</option>
                        <option value="url">URL</option>
                        <option value="short-link">Short Link</option>
                        <option value="text">Text</option>
                    </select>
                </label>
            </div>
            {error && (
                <p role="alert" className={cx("mb-4 text-sm text-red-500")}>
                    {error}
                </p>
            )}
            {result?.key !== key ? (
                <p role="status">Loading QR Codes…</p>
            ) : result.error ? (
                <p role="alert">{result.error}</p>
            ) : (
                <>
                    {result.items.length === 0 && (
                        <div className={cx(panel, "py-12 text-center")}>
                            <h2 className={cx("font-semibold")}>No QR Codes found</h2>
                            <p className={cx("mt-2 text-sm text-muted-foreground")}>
                                Save a code in Create QR to keep its design here.
                            </p>
                            <Link to="/qr-studio" className={cx("mt-4 inline-block text-sm text-cyan-600")}>
                                Create your first QR →
                            </Link>
                        </div>
                    )}
                    <div className={cx("grid gap-4 sm:grid-cols-2 xl:grid-cols-3")}>
                        {result.items.map((item) => (
                            <article key={item.id} className={cx(panel, "flex flex-col gap-3")}>
                                <div
                                    className={cx("text-xs uppercase tracking-wider text-cyan-700 dark:text-cyan-300")}
                                >
                                    {item.type}
                                </div>
                                <h2 className={cx("break-words text-lg font-semibold")}>{item.name}</h2>
                                <p className={cx("line-clamp-2 break-all text-sm text-muted-foreground")}>
                                    {item.slug
                                        ? `/q/${item.slug}${item.link_active ? "" : " · Disabled"}`
                                        : item.content}
                                </p>
                                <p className={cx("text-xs text-muted-foreground")}>
                                    Saved {item.created_at?.slice(0, 10)}
                                </p>
                                <div className={cx("mt-auto flex flex-wrap items-center gap-3")}>
                                    <Link
                                        className={cx("text-sm text-cyan-700 dark:text-cyan-300")}
                                        to={`/qr-studio?edit=${encodeURIComponent(item.id)}`}
                                    >
                                        Edit / Download →
                                    </Link>
                                    <GlassButton
                                        className={cx(button, "text-red-500")}
                                        onClick={() => setDeleting(item.id)}
                                    >
                                        Delete
                                    </GlassButton>
                                </div>
                                {deleting === item.id && (
                                    <div role="alert" className={cx("space-y-2 text-sm")}>
                                        <p>Delete this QR? Its Short Link will remain.</p>
                                        <GlassButton
                                            className={cx(button)}
                                            disabled={busy}
                                            onClick={() => remove(item.id)}
                                        >
                                            Confirm delete
                                        </GlassButton>
                                        <GlassButton className={cx(button)} onClick={() => setDeleting(null)}>
                                            Cancel
                                        </GlassButton>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                    <div className={cx("mt-5 flex items-center justify-between gap-3 text-sm")}>
                        <GlassButton
                            className={cx(button)}
                            disabled={!offset}
                            onClick={() => setOffset(Math.max(0, offset - 20))}
                        >
                            Previous
                        </GlassButton>
                        <span>{result.total} QR Codes</span>
                        <GlassButton
                            className={cx(button)}
                            disabled={offset + 20 >= result.total}
                            onClick={() => setOffset(offset + 20)}
                        >
                            Next
                        </GlassButton>
                    </div>
                </>
            )}
        </QRWorkspace>
    );
}
