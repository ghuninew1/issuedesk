import { useEffect, useState } from "react";
import QRWorkspace from "../../components/qr/QRWorkspace";
import GlassButton from "../../components/GlassButton";
import { useShortLink } from "../../hooks/qr/useShortLink";
import { qrRequest, shortUrl } from "../../services/qr";
import { cx } from "../../utils/cx";
import { input, panel, button } from "../../components/qr/styles";
import { validUrl, validSlug } from "../../../shared/qr";
function LinkRow({ item, onRefresh, onError }) {
    const [destination, setDestination] = useState(item.destination_url),
        [busy, setBusy] = useState(false),
        [confirmDelete, setConfirmDelete] = useState(false);
    async function action(method, value) {
        setBusy(true);
        onError("");
        try {
            await qrRequest(`short-links/${item.id}`, method, value);
            onRefresh();
        } catch (error) {
            onError(error.message);
        } finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    }
    return (
        <article className={cx(panel, "space-y-3")}>
            <div className={cx("flex flex-wrap items-center justify-between gap-2")}>
                <a
                    href={shortUrl(item.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className={cx("break-all font-medium text-cyan-700 dark:text-cyan-300")}
                >
                    /q/{item.slug} ↗
                </a>
                <span
                    className={cx(
                        "rounded-full px-2 py-1 text-xs",
                        item.is_active
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    {item.is_active ? "Active" : "Disabled"}
                </span>
            </div>
            <label className={cx("block text-sm")}>
                Destination URL
                <input
                    className={cx(input)}
                    type="url"
                    maxLength={2048}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                />
            </label>
            <div className={cx("flex flex-wrap gap-2")}>
                <GlassButton
                    className={cx(button)}
                    disabled={busy || !validUrl(destination) || destination === item.destination_url}
                    onClick={() => action("PATCH", { destination_url: destination })}
                >
                    Update destination
                </GlassButton>
                <GlassButton
                    className={cx(button)}
                    disabled={busy}
                    onClick={() => action("PATCH", { is_active: item.is_active ? 0 : 1 })}
                >
                    {item.is_active ? "Disable" : "Enable"}
                </GlassButton>
                <GlassButton
                    className={cx(button)}
                    disabled={busy}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(shortUrl(item.slug));
                            onError("Link copied.");
                        } catch {
                            onError("Unable to copy link.");
                        }
                    }}
                >
                    Copy link
                </GlassButton>
                <GlassButton
                    className={cx(button, "text-red-500")}
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                >
                    Delete
                </GlassButton>
            </div>
            {confirmDelete && (
                <div role="alert" className={cx("rounded-xl border border-red-500/30 p-3 text-sm")}>
                    <p>Delete this Short Link? Printed links will stop working.</p>
                    <div className={cx("mt-2 flex gap-2")}>
                        <GlassButton className={cx(button)} disabled={busy} onClick={() => action("DELETE")}>
                            Confirm delete
                        </GlassButton>
                        <GlassButton className={cx(button)} onClick={() => setConfirmDelete(false)}>
                            Cancel
                        </GlassButton>
                    </div>
                </div>
            )}
        </article>
    );
}
export default function QRLinks() {
    const [form, setForm] = useState({ destination_url: "", slug: "" }),
        [busy, setBusy] = useState(false);
    const [search, setSearch] = useState(""),
        [offset, setOffset] = useState(0),
        [version, setVersion] = useState(0),
        [result, setResult] = useState(null),
        [notice, setNotice] = useState("");
    const availability = useShortLink(form.slug),
        key = `${search}:${offset}:${version}`;
    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(
            () =>
                qrRequest(
                    `short-links?${new URLSearchParams({ search, limit: "20", offset: String(offset) })}`,
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
    }, [search, offset, version, key]);
    const refresh = () => setVersion((v) => v + 1);
    async function create(e) {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
            await qrRequest("short-links", "POST", form);
            setForm({ destination_url: "", slug: "" });
            setOffset(0);
            refresh();
            setNotice("Short Link created.");
        } catch (err) {
            setNotice(err.message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <QRWorkspace>
            <div className={cx("grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]")}>
                <form onSubmit={create} className={cx(panel, "space-y-4 lg:sticky lg:top-20")}>
                    <h2 className={cx("text-lg font-semibold")}>Create Short Link</h2>
                    <label className={cx("block text-sm")}>
                        Destination URL
                        <input
                            required
                            type="url"
                            maxLength={2048}
                            className={cx(input)}
                            value={form.destination_url}
                            onChange={(e) => setForm({ ...form, destination_url: e.target.value })}
                            placeholder="https://example.com"
                        />
                    </label>
                    <label className={cx("block text-sm")}>
                        Custom slug (optional)
                        <input
                            maxLength={50}
                            className={cx(input)}
                            value={form.slug}
                            onChange={(e) => setForm({ ...form, slug: e.target.value })}
                            placeholder="office-it"
                        />
                    </label>
                    <p aria-live="polite" className={cx("text-xs text-muted-foreground")}>
                        {availability || "Leave empty to generate a slug. Slugs cannot be changed."}
                    </p>
                    <GlassButton
                        type="submit"
                        className={cx(button, "w-full bg-cyan-600 text-white")}
                        disabled={busy || !validUrl(form.destination_url) || (!!form.slug && !validSlug(form.slug))}
                    >
                        {busy ? "Creating…" : "Create link"}
                    </GlassButton>
                </form>
                <section className={cx("min-w-0 space-y-4")}>
                    <h2 className={cx("text-lg font-semibold")}>Your Short Links</h2>
                    <label className={cx("block text-sm")}>
                        Search links
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
                    {notice && (
                        <p role="status" className={cx("text-sm")}>
                            {notice}
                        </p>
                    )}
                    {result?.key !== key ? (
                        <p role="status">Loading links…</p>
                    ) : result.error ? (
                        <p role="alert">{result.error}</p>
                    ) : (
                        <>
                            {result.items.length === 0 && (
                                <p className={cx(panel, "text-sm text-muted-foreground")}>No Short Links found.</p>
                            )}
                            {result.items.map((item) => (
                                <LinkRow
                                    key={`${item.id}:${item.updated_at}`}
                                    item={item}
                                    onRefresh={refresh}
                                    onError={setNotice}
                                />
                            ))}
                            <div className={cx("flex items-center justify-between gap-3 text-sm")}>
                                <GlassButton
                                    className={cx(button)}
                                    disabled={!offset}
                                    onClick={() => setOffset(Math.max(0, offset - 20))}
                                >
                                    Previous
                                </GlassButton>
                                <span>{result.total} links</span>
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
                </section>
            </div>
        </QRWorkspace>
    );
}
