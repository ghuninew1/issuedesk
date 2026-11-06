import { useState } from "react";
import { cx } from "../../utils/cx";
import { Settings2 } from "lucide-react";
import ToolSelect from "./ToolSelect";

function ConverterSettings({ settings, onChange }) {
    const [preset, setPreset] = useState("balanced");
    const handleChange = (event) => {
        const { name, value, type, checked } = event.target;

        if (name === "quality") setPreset("custom");
        onChange({
            [name]: type === "checkbox" ? checked : value,
        });
    };

    const presets = { best: 100, balanced: 85, small: 60 };

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

                    <ToolSelect
                        id="format"
                        name="format"
                        value={settings.format}
                        onChange={handleChange}
                        className={cx("w-full")}
                    >
                        <option value="webp">WebP</option>
                        <option value="avif">AVIF</option>
                        <option value="jpeg">JPG</option>
                        <option value="png">PNG</option>
                    </ToolSelect>
                </div>

                <div>
                    <label htmlFor="preset" className={cx("mb-2 block font-medium text-sm")}>Quality Preset</label>
                    <ToolSelect id="preset" value={preset} onChange={(event) => {
                        const nextPreset = event.target.value;
                        setPreset(nextPreset);
                        if (nextPreset !== "custom") onChange({ quality: presets[nextPreset] });
                    }} className={cx("w-full")}>
                        <option value="best">Best Quality</option>
                        <option value="balanced">Balanced — Recommended</option>
                        <option value="small">Small File</option>
                        <option value="custom">Custom</option>
                    </ToolSelect>
                    <p className={cx("mt-2 text-xs text-muted-foreground")}>{isPng ? "PNG is lossless; quality does not apply." : `Quality: ${settings.quality}%`}</p>
                </div>

                <div className={cx("sm:col-span-2")}>
                    <p className={cx("mb-2 font-medium text-sm")}>Resolution</p>
                    <p className={cx("text-sm text-muted-foreground")}>Leave dimensions empty to keep the original size.</p>
                    <label className={cx("mt-3 flex cursor-pointer items-center gap-3 text-sm")}>
                        <input type="checkbox" name="keepAspectRatio" checked={settings.keepAspectRatio} onChange={handleChange} className={cx("size-4 accent-primary")} />
                        <span className={cx("font-medium")}>Keep Aspect Ratio</span>
                    </label>
                </div>
            </div>

            <details className={cx("mt-5 rounded-xl border border-border/70 bg-background/30 p-4")} open={preset === "custom" ? true : undefined}>
                <summary className={cx("cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Advanced Settings · Quality and dimensions</summary>
                <div className={cx("mt-4 grid gap-5 sm:grid-cols-3")}>
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
            </details>
        </section>
    );
}

export default ConverterSettings;
