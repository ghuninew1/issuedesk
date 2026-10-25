import { cx } from "./cx";
export const ucfirst = (text="") => {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
};

export const readableBytes = (bytes=null, divider = 1024) => {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(divider)));

  return `${(bytes / Math.pow(divider, i)).toFixed(1)} ${sizes[i]}`;
};

export const handleError = (err=null) => {
  if (err) {
    console.error(err);
  }
};

export const copyToClipboard = async (text="") => {
  let textArea;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      textArea = document.createElement("textarea");
      textArea.value = text;

      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";

      document.body.prepend(textArea);
      textArea.select();
      document.execCommand("copy");
    }

    console.log("Copied to clipboard");
  } catch (err) {
    handleError(err);
  } finally {
    textArea?.remove();
  }
};

export const glassHover = cx(
    "relative isolate overflow-hidden [--mx:50%] [--my:50%]",
    "transition-[background-color,box-shadow,transform,color] duration-300",
    "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
    "hover:bg-white/20 dark:hover:bg-white/10",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.18),0_6px_20px_-6px_rgba(0,0,0,0.25)]",
    // แสงสะท้อนเฉียงเดิม
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
    "before:opacity-0 before:transition-opacity before:duration-300",
    "before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.15)_100%)]",
    "hover:before:opacity-100",
    // แสงที่ตามเมาส์
    "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit]",
    "after:opacity-0 after:transition-opacity after:duration-300",
    "after:bg-[radial-gradient(90px_circle_at_var(--mx)_var(--my),rgba(255,255,255,0.45),rgba(255,255,255,0.12)_45%,transparent_75%)]",
    "dark:after:bg-[radial-gradient(90px_circle_at_var(--mx)_var(--my),rgba(255,255,255,0.28),rgba(255,255,255,0.08)_45%,transparent_75%)]",
    "hover:after:opacity-100",
    "active:scale-[0.97]",
);