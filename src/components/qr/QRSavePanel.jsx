import { cx } from "../../utils/cx";
import GlassButton from "../GlassButton";
import { panel, input, button } from "./styles";
export default function QRSavePanel({ name, onName, onSave, saving, editing, message, error, disabled }) {
    return (
        <section className={cx(panel, "space-y-4")}>
            <h2 className={cx("text-lg font-semibold")}>03 · Save QR Code</h2>
            <label className={cx("block text-sm")}>
                QR name
                <input
                    className={cx(input)}
                    maxLength={100}
                    value={name}
                    onChange={(e) => onName(e.target.value)}
                    placeholder="Office IT"
                />
            </label>
            <GlassButton
                className={cx(button, "w-full bg-cyan-600 text-white")}
                disabled={saving || disabled}
                onClick={onSave}
            >
                {saving ? "Saving…" : editing ? "Save changes" : "Save QR Code"}
            </GlassButton>
            {message && (
                <p role="status" className={cx("text-sm text-emerald-600 dark:text-emerald-400")}>
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" className={cx("text-sm text-red-500")}>
                    {error}
                </p>
            )}
        </section>
    );
}
