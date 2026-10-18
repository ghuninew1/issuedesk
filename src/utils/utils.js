
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