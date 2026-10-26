import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import QRWorkspace from "../../components/qr/QRWorkspace";
import QRContentForm from "../../components/qr/QRContentForm";
import QRDesignPanel from "../../components/qr/QRDesignPanel";
import QRPreview from "../../components/qr/QRPreview";
import QRSavePanel from "../../components/qr/QRSavePanel";
import { useQRCode } from "../../hooks/qr/useQRCode";
import { useShortLink } from "../../hooks/qr/useShortLink";
import { qrRequest, shortUrl, uploadQRLogo } from "../../services/qr";
import { validUrl, validSlug } from "../../../shared/qr";
import { cx } from "../../utils/cx";
const initialQR = {
    name: "",
    type: "url",
    content: { value: "" },
    design: {
        foreground: "#111827",
        background: "#FFFFFF",
        errorCorrection: "Q",
        logo: null,
        logoSize: 0.2,
        logoBackground: true,
    },
};
function fromSaved(item) {
    return {
        name: item.name,
        type: item.type,
        content: { value: item.content || "" },
        design: {
            foreground: item.foreground_color,
            background: item.background_color,
            errorCorrection: item.error_correction,
            logo: item.logo_url,
            logoSize: item.logo_size,
            logoBackground: !!item.logo_background,
        },
    };
}
function StudioEditor({ item, existingLink, onNew }) {
    const [qr, setQR] = useState(() => (item ? fromSaved(item) : initialQR));
    const [id, setId] = useState(item?.id || null);
    const [link, setLink] = useState(existingLink || { id: null, slug: "", destination_url: "" });
    const [localLogo, setLocalLogo] = useState(null),
        uploaded = useRef(null),
        logoSuggested = useRef(!!item?.logo_url);
    const [saving, setSaving] = useState(false),
        [error, setError] = useState(""),
        [message, setMessage] = useState("");
    useEffect(
        () => () => {
            if (localLogo) URL.revokeObjectURL(localLogo.url);
        },
        [localLogo],
    );
    const design = useMemo(() => ({ ...qr.design, logo: localLogo?.url || qr.design.logo }), [qr.design, localLogo]);
    const pendingLink = qr.type === "short-link" && !link.id;
    const validContent =
        qr.type === "text"
            ? !!qr.content.value.trim() && qr.content.value.length <= 2000
            : qr.type === "url"
              ? validUrl(qr.content.value)
              : validUrl(link.destination_url) && (!!link.id || !link.slug || validSlug(link.slug));
    const value = !validContent
        ? ""
        : qr.type === "short-link"
          ? link.id
              ? shortUrl(link.slug)
              : link.destination_url
          : qr.content.value;
    const { containerRef, ready, error: renderError, download } = useQRCode(value, design);
    const availability = useShortLink(link.slug, qr.type === "short-link" && !link.id);
    function selectLogo(file) {
        setLocalLogo({ file, url: URL.createObjectURL(file) });
        uploaded.current = null;
        if (!logoSuggested.current) {
            logoSuggested.current = true;
            setQR((previous) => ({ ...previous, design: { ...previous.design, errorCorrection: "H" } }));
        }
    }
    function removeLogo() {
        setLocalLogo(null);
        uploaded.current = null;
        setQR((previous) => ({ ...previous, design: { ...previous.design, logo: null } }));
    }
    async function save() {
        if (saving) return;
        setSaving(true);
        setError("");
        setMessage("");
        try {
            let savedLink = link;
            if (qr.type === "short-link") {
                if (!link.id) {
                    savedLink = (
                        await qrRequest("short-links", "POST", {
                            destination_url: link.destination_url,
                            slug: link.slug,
                        })
                    ).item;
                    setLink(savedLink);
                } else {
                    savedLink = (
                        await qrRequest(`short-links/${link.id}`, "PATCH", { destination_url: link.destination_url })
                    ).item;
                    setLink(savedLink);
                }
            }
            let logoUrl = qr.design.logo;
            if (localLogo) {
                if (uploaded.current?.file !== localLogo.file)
                    uploaded.current = { file: localLogo.file, url: (await uploadQRLogo(localLogo.file)).logo_url };
                logoUrl = uploaded.current.url;
            }
            const payload = {
                name: qr.name,
                type: qr.type,
                content: qr.content.value,
                short_link_id: qr.type === "short-link" ? savedLink.id : null,
                foreground_color: qr.design.foreground,
                background_color: qr.design.background,
                error_correction: qr.design.errorCorrection,
                logo_url: logoUrl,
                logo_size: qr.design.logoSize,
                logo_background: qr.design.logoBackground ? 1 : 0,
            };
            const saved = await qrRequest(id ? `qr-codes/${id}` : "qr-codes", id ? "PATCH" : "POST", payload);
            setId(saved.item.id);
            setQR((previous) => ({ ...previous, design: { ...previous.design, logo: logoUrl } }));
            setLocalLogo(null);
            uploaded.current = null;
            setMessage("QR Code saved. Ready to download or find in My QR Codes.");
        } catch (err) {
            setError(
                `${err.message}${qr.type === "short-link" ? " Any link already created remains in Short Links; retrying reuses it." : ""}`,
            );
        } finally {
            setSaving(false);
        }
    }
    return (
        <>
            <div className={cx("grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]")}>
                <div className={cx("order-first min-w-0 lg:order-last lg:sticky lg:top-20")}>
                    <QRPreview
                        containerRef={containerRef}
                        ready={ready}
                        error={renderError}
                        download={download}
                        name={qr.name}
                        value={value}
                        pendingLink={pendingLink}
                    />
                </div>
                <fieldset disabled={saving} className={cx("min-w-0 space-y-5")}>
                    <QRContentForm
                        type={qr.type}
                        value={qr.content.value}
                        onType={(type) => setQR({ ...qr, type })}
                        onValue={(value) => setQR({ ...qr, content: { value } })}
                        link={link}
                        onLink={setLink}
                        availability={availability}
                        locked={!!link.id}
                    />
                    <QRDesignPanel
                        design={design}
                        onChange={(next) => setQR({ ...qr, design: { ...next, logo: qr.design.logo } })}
                        onLogo={selectLogo}
                        onRemoveLogo={removeLogo}
                    />
                    <QRSavePanel
                        name={qr.name}
                        onName={(name) => setQR({ ...qr, name })}
                        onSave={save}
                        saving={saving}
                        editing={!!id}
                        message={message}
                        error={error}
                        disabled={!validContent || !qr.name.trim() || !ready}
                    />
                </fieldset>
            </div>
            {id && (
                <div className={cx("mt-5 flex flex-wrap gap-5 text-sm text-cyan-700 dark:text-cyan-300")}>
                    <Link to="/qr-studio/saved">View My QR Codes →</Link>
                    <Link to="/qr-studio" onClick={onNew}>
                        Create another QR →
                    </Link>
                </div>
            )}
        </>
    );
}
export default function QRCodeStudio() {
    const [query] = useSearchParams(),
        id = query.get("edit");
    const [loaded, setLoaded] = useState(null);
    const [newVersion, setNewVersion] = useState(0);
    const reset = () => setNewVersion((version) => version + 1);
    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        qrRequest(`qr-codes/${encodeURIComponent(id)}`, "GET", undefined, controller.signal)
            .then(async ({ item }) => {
                const link = item.short_link_id
                    ? (await qrRequest(`short-links/${item.short_link_id}`, "GET", undefined, controller.signal)).item
                    : null;
                if (!controller.signal.aborted) setLoaded({ id, item, link });
            })
            .catch((err) => {
                if (!controller.signal.aborted) setLoaded({ id, error: err.message });
            });
        return () => controller.abort();
    }, [id]);
    return (
        <QRWorkspace>
            {!id ? (
                <StudioEditor key={`new-${newVersion}`} onNew={reset} />
            ) : loaded?.id !== id ? (
                <p role="status">Loading QR Code…</p>
            ) : loaded.error ? (
                <p role="alert">{loaded.error}</p>
            ) : (
                <StudioEditor key={id} item={loaded.item} existingLink={loaded.link} onNew={reset} />
            )}
        </QRWorkspace>
    );
}
