// Feature support only. Routes must independently enforce app/project ownership.
export const GARAGE_CAPABILITIES = Object.freeze({
  list: true, stat: true, upload: true, download: true, preview: false,
  createFolder: false, rename: false, move: false, copy: true,
  trash: false, restore: false, permanentDelete: true, share: false,
  rangeRead: false, readOnly: false,
})
