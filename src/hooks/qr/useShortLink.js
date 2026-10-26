import { useEffect, useState } from "react";
import { qrRequest } from "../../services/qr";
import { validSlug } from "../../../shared/qr";
export function useShortLink(slug, enabled = true) {
    const [result, setResult] = useState(null);
    useEffect(() => {
        if (!enabled || !slug || !validSlug(slug)) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            qrRequest(`short-links/check?slug=${encodeURIComponent(slug)}`, "GET", undefined, controller.signal)
                .then((data) => {
                    if (!controller.signal.aborted) setResult({ slug, available: data.available });
                })
                .catch((error) => {
                    if (!controller.signal.aborted) setResult({ slug, error: error.message });
                });
        }, 450);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [slug, enabled]);
    if (!enabled || !slug) return "";
    if (!validSlug(slug))
        return "Use 3–50 lowercase letters, digits and single hyphens. Reserved names are unavailable.";
    if (result?.slug !== slug) return "Checking availability…";
    return result.error || (result.available ? "Available" : "This slug is already in use");
}
