export function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);

            resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
            });
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);

            reject(new Error(`Failed to read image: ${file.name}`));
        };

        image.src = url;
    });
}
