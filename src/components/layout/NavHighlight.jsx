import { cx } from "../../utils/cx";

export function NavHighlight({ highlight }) {
    return <span aria-hidden="true" className={cx("pointer-events-none absolute left-0 top-0 rounded-xl bg-[color-mix(in_oklch,var(--sidebar-accent-foreground)_20%,transparent)] dark:bg-white/10 transition-[transform,width,height,opacity] duration-300 ease-out motion-reduce:transition-none")} style={{ width: highlight?.width ?? 0, height: highlight?.height ?? 0, transform: `translate(${highlight?.x ?? 0}px, ${highlight?.y ?? 0}px)`, opacity: highlight?.visible ? 1 : 0 }} />;
}
