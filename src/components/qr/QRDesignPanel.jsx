import { cx } from "../../utils/cx";
import QRLogoUploader from "./QRLogoUploader";
import { input, panel } from "./styles";
export default function QRDesignPanel({ design, onChange, onLogo, onRemoveLogo }) {
    const change = (key, value) => onChange({ ...design, [key]: value });
    return (
        <section className={cx(panel, "space-y-5")}>
            <h2 className={cx("text-lg font-semibold")}>02 · Design</h2>
            <div className={cx("grid grid-cols-2 gap-4")}>
                {[
                    ["foreground", "Foreground"],
                    ["background", "Background"],
                ].map(([key, label]) => (
                    <label key={key} className={cx("block text-sm")}>
                        {label}
                        <input
                            aria-label={label}
                            type="color"
                            className={cx(input, "h-12 cursor-pointer p-1.5")}
                            value={design[key]}
                            onChange={(e) => change(key, e.target.value)}
                        />
                        <span className={cx("mt-1 block font-mono text-xs text-muted-foreground")}>{design[key]}</span>
                    </label>
                ))}
            </div>
            <label className={cx("block text-sm")}>
                Error correction
                <select
                    className={cx(input)}
                    value={design.errorCorrection}
                    onChange={(e) => change("errorCorrection", e.target.value)}
                >
                    <option value="M">M · Medium</option>
                    <option value="Q">Q · Quartile</option>
                    <option value="H">H · High (recommended with logo)</option>
                </select>
            </label>
            <QRLogoUploader logo={design.logo} onSelect={onLogo} onRemove={onRemoveLogo} />
            <label className={cx("block text-sm")}>
                Logo size · {Math.round(design.logoSize * 100)}%
                <input
                    aria-label="Logo size"
                    className={cx("mt-3 block w-full accent-cyan-500")}
                    type="range"
                    min="0.05"
                    max="0.4"
                    step="0.01"
                    value={design.logoSize}
                    onChange={(e) => change("logoSize", Number(e.target.value))}
                />
            </label>
            <label className={cx("flex items-center gap-2 text-sm")}>
                <input
                    type="checkbox"
                    className={cx("size-4 accent-cyan-500")}
                    checked={design.logoBackground}
                    onChange={(e) => change("logoBackground", e.target.checked)}
                />
                Solid background behind logo
            </label>
            <p className={cx("text-xs text-muted-foreground")}>
                Keep strong color contrast and test a scan before printing. Large logos can reduce readability.
            </p>
        </section>
    );
}
