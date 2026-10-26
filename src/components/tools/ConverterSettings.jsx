import { cx } from "../../utils/cx";
import { Settings2 } from "lucide-react";

function ConverterSettings({ settings, onChange }) {
    const handleChange = (event) => {
        const { name, value, type, checked } = event.target;

        onChange({
            [name]: type === "checkbox" ? checked : value,
        });
    };

    const isPng = settings.format === "png";

    return (
        <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
            <div className={cx("flex items-center gap-3")}>
                <span className={cx("flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary")}>
                    <Settings2 className={cx("size-4")} aria-hidden="true" />
                </span>
                <h2 className={cx("font-semibold text-lg")}>Conversion Settings</h2>
            </div>

            <div className={cx("mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4")}>
                <div>
                    <label htmlFor="format" className={cx("mb-2 block font-medium text-sm")}>
                        Output Format
                    </label>

                    <select
                        id="format"
                        name="format"
                        value={settings.format}
                        onChange={handleChange}
                        className={cx("w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/30")}
                    >
                        <option value="webp">WebP</option>
                        <option value="avif">AVIF</option>
                        <option value="jpeg">JPG</option>
                        <option value="png">PNG</option>
                    </select>
                </div>

                <div>
                    <label htmlFor="quality" className={cx("mb-2 block font-medium text-sm")}>
                        Quality
                    </label>

                    <div className={cx("flex items-center gap-3")}>
                        <input
                            id="quality"
                            name="quality"
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={settings.quality}
                            onChange={handleChange}
                            disabled={isPng}
                            className={cx("flex-1", isPng && "cursor-not-allowed opacity-40")}
                        />

                        <span className={cx("w-12 text-right text-sm text-muted-foreground")}>
                            {isPng ? "—" : `${settings.quality}%`}
                        </span>
                    </div>

                    <p className={cx("mt-2 text-xs text-muted-foreground")}>
                        {isPng ? "Not applicable for PNG (Lossless)" : "Higher quality produces larger files."}
                    </p>
                </div>

                <div>
                    <label htmlFor="width" className={cx("mb-2 block font-medium text-sm")}>
                        Width
                    </label>

                    <input
                        id="width"
                        name="width"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={settings.width}
                        onChange={handleChange}
                        placeholder="Original"
                        className={cx("w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30")}
                    />
                </div>

                <div>
                    <label htmlFor="height" className={cx("mb-2 block font-medium text-sm")}>
                        Height
                    </label>

                    <input
                        id="height"
                        name="height"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={settings.height}
                        onChange={handleChange}
                        placeholder="Original"
                        className={cx("w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30")}
                    />
                </div>
            </div>

            <label className={cx("mt-6 flex cursor-pointer items-center gap-3 text-sm")}>
                <input
                    type="checkbox"
                    name="keepAspectRatio"
                    checked={settings.keepAspectRatio}
                    onChange={handleChange}
                    className={cx("size-4 accent-primary")}
                />

                <span className={cx("font-medium")}>Keep Aspect Ratio</span>
            </label>
        </section>
    );
}

export default ConverterSettings;
