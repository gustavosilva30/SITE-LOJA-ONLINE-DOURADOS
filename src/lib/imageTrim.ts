/**
 * Trims transparent pixels from an image.
 * @param url Image URL or DataURL
 * @returns Promise with trimmed DataURL
 */
export async function trimImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            let found = false;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        found = true;
                    }
                }
            }

            if (!found) {
                resolve(url); // Return original if empty
                return;
            }

            const trimmedWidth = maxX - minX + 1;
            const trimmedHeight = maxY - minY + 1;

            const trimmedCanvas = document.createElement("canvas");
            trimmedCanvas.width = trimmedWidth;
            trimmedCanvas.height = trimmedHeight;
            const trimmedCtx = trimmedCanvas.getContext("2d");
            if (!trimmedCtx) {
                reject(new Error("Could not get trimmed canvas context"));
                return;
            }

            trimmedCtx.drawImage(img, minX, minY, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
            resolve(trimmedCanvas.toDataURL());
        };
        img.onerror = reject;
        img.src = url;
    });
}
