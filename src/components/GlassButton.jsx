import { cx } from "../utils/cx";
import { glassHover } from "../utils/utils";

/** Shared native button with the app's Liquid Glass hover treatment. */
const GlassButton = ({ className, onPointerMove, ...props }) => {
    const glassPositionOverride = className?.split(/\s+/).includes("absolute") ? "!absolute" : null;
    const buttonClassName =
        typeof className === "string"
            ? className
                  .split(/\s+/)
                  .filter((classToken) => !/(^|:)hover:/.test(classToken))
                  .join(" ")
            : className;

    const handlePointerMove = (event) => {
        if (event.pointerType === "mouse") {
            const bounds = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
            event.currentTarget.style.setProperty("--my", `${event.clientY - bounds.top}px`);
        }

        onPointerMove?.(event);
    };

    return (
        <button
            {...props}
            onPointerMove={handlePointerMove}
            className={cx("glass-button", glassHover, glassPositionOverride, buttonClassName)}
        />
    );
};

export default GlassButton;
