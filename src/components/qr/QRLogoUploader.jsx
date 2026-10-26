import { useId, useState } from "react";
import { cx } from "../../utils/cx";
import GlassButton from "../GlassButton";
import { LOGO_TYPES, MAX_LOGO_SIZE } from "../../../shared/qr";
import { button, input } from "./styles";
export default function QRLogoUploader({ logo, onSelect, onRemove }) {
    const id = useId(),
        [error, setError] = useState("");
    function select(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!LOGO_TYPES.includes(file.type) || !file.size || file.size > MAX_LOGO_SIZE) {
            setError("Choose PNG, JPEG or WebP, at most 2 MB.");
            return;
        }
        setError("");
        onSelect(file);
    }
    return (
        <div className={cx("space-y-2")}>
            <label htmlFor={id} className={cx("block text-sm")}>
                Center logo
                <input
                    id={id}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={cx(input)}
                    onChange={select}
                />
            </label>
            <p className={cx("text-xs text-muted-foreground")}>
                PNG, JPEG, WebP · max 2 MB · uploaded only when you save.
            </p>
            {logo && (
                <div className={cx("flex items-center gap-3")}>
                    <img
                        src={logo}
                        alt="Selected logo"
                        className={cx("size-14 rounded-lg border border-border object-contain")}
                    />
                    <GlassButton type="button" className={cx(button)} onClick={onRemove}>
                        Remove logo
                    </GlassButton>
                </div>
            )}
            {error && (
                <p role="alert" className={cx("text-sm text-red-500")}>
                    {error}
                </p>
            )}
        </div>
    );
}
