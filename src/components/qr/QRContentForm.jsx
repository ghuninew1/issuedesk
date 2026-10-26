import { cx } from "../../utils/cx";
import { input, panel } from "./styles";
export default function QRContentForm({ type, value, onType, onValue, link, onLink, availability, locked }) {
    return (
        <section className={cx(panel, "space-y-4")}>
            <h2 className={cx("text-lg font-semibold")}>01 · Content</h2>
            <label className={cx("block text-sm")}>
                Content type
                <select className={cx(input)} value={type} onChange={(e) => onType(e.target.value)}>
                    <option value="url">URL</option>
                    <option value="short-link">Short Link</option>
                    <option value="text">Text</option>
                </select>
            </label>
            {type === "short-link" ? (
                <>
                    <label className={cx("block text-sm")}>
                        Destination URL
                        <input
                            type="url"
                            maxLength={2048}
                            className={cx(input)}
                            value={link.destination_url}
                            onChange={(e) => onLink({ ...link, destination_url: e.target.value })}
                            placeholder="https://example.com"
                        />
                    </label>
                    <label className={cx("block text-sm")}>
                        Custom slug <span className={cx("text-muted-foreground")}>(optional)</span>
                        <input
                            className={cx(input)}
                            maxLength={50}
                            value={link.slug}
                            disabled={locked}
                            onChange={(e) => onLink({ ...link, slug: e.target.value })}
                            placeholder="office-it"
                        />
                    </label>
                    <p aria-live="polite" className={cx("text-xs text-muted-foreground")}>
                        {locked
                            ? "Slug is fixed. Destination changes also affect every QR using this link."
                            : availability || "Leave empty to generate a unique slug when saving."}
                    </p>
                </>
            ) : (
                <label className={cx("block text-sm")}>
                    {type === "text" ? "Text" : "Website URL"}
                    {type === "text" ? (
                        <textarea
                            className={cx(input, "min-h-28 resize-y")}
                            value={value}
                            maxLength={2000}
                            onChange={(e) => onValue(e.target.value)}
                            placeholder="Write something to share…"
                        />
                    ) : (
                        <input
                            type="url"
                            className={cx(input)}
                            value={value}
                            maxLength={2048}
                            onChange={(e) => onValue(e.target.value)}
                            placeholder="https://example.com"
                        />
                    )}
                </label>
            )}
        </section>
    );
}
