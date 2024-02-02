import { spawn, fork } from 'child_process';
import { readFile, readdir, writeFile, unlink } from 'fs/promises';



function littleEndianToInt(bytes) {
    let res = 0;

    for (let i = bytes.length - 1; i >= 0; i--) {
        res = res << 8;

        res += bytes[i];
    }

    return res;
}

async function readFrames() {
    const files = await readdir("frames")
        .then(content => content.sort((c1, c2) => {
            const i1 = c1.slice(4, 8);
            const i2 = c2.slice(4, 8);

            return parseInt(i1) - parseInt(i2);
        }));

    const fileContents = await Promise.all(files.map(async file => {
        const buffer = await readFile(`frames/${file}`);

        // The offset, i.e. starting address, of the byte where the bitmap image data (pixel array) can be found
        const startingAddress = littleEndianToInt(buffer.subarray(10, 10 + 4));

        // the bitmap width in pixels (signed integer)
        const widthInPixels = littleEndianToInt(buffer.subarray(18, 18 + 4));
        // the bitmap height in pixels (signed integer)
        const heightInPixels = littleEndianToInt(buffer.subarray(22, 22 + 4));

        // the number of bits per pixel, which is the color depth of the image
        const bpp = littleEndianToInt(buffer.subarray(28, 28 + 2));

        // Each row of pixels must have a number of bytes multiple of 4
        // So I calculate the total number of data bytes in a row, then using the reminder to get the padding ones
        const bytesPerPixel = (bpp / 8);
        const dataBytesInRow = (bytesPerPixel * widthInPixels);
        const paddingBytesInRow = dataBytesInRow % 4;

        // This is the total number of bytes used for a single color channel of a pixel
        const bytesPerChannel = bytesPerPixel / 3;

        // Frame consists in array of rows, each with grey pixels in range of [0-255]
        let frame = [];

        for (let byteIndex = startingAddress; byteIndex < buffer.length; byteIndex += bytesPerPixel) {

            // The X coordinate is calculated from the byte index (starting address-based) and the total bytes in a row, consisting in data and padding
            // After that, the byte x is divided by the total bytes per pixel, in order to retrieve the correct pixel X, not byte X
            const pixelX = Math.floor(((byteIndex - startingAddress) % (dataBytesInRow + paddingBytesInRow)) / bytesPerPixel);

            // Elaborate the byte only if it's not a padding one
            if (pixelX < widthInPixels) {
                // The Y coordinate is calculated from the byte index and the total bytes in a row
                // Differently from X, there's no need to convert bytes into pixels
                // Also, bpp format starts from bottom-left corner, so it needs to be inverted
                const pixelY = heightInPixels - 1 - Math.floor((byteIndex - startingAddress) / (dataBytesInRow + paddingBytesInRow));

                // The next two bytes are surely not padding, because each pixel must have both three rgb channels
                const [r, g, b] = new Array(3).fill(null).map((_, chIndex) => {
                    const start = byteIndex + (bytesPerChannel * chIndex);
                    const end = byteIndex + (bytesPerChannel * (chIndex + 1));

                    const channelValue = littleEndianToInt(buffer.subarray(start, end));

                    return channelValue;
                });

                // Calculating avg value in range [0-255]
                const avg = Math.floor((r + g + b) / 3);

                if (!frame[pixelY]) {
                    frame[pixelY] = [];
                }

                frame[pixelY][pixelX] = avg;
            }

        }

        return {
            file: file,
            buffer: buffer,
            frame: frame
        };
    }));


    return fileContents.map(c => c.frame);
}


async function writeFrame(frame, index) {

    const totalRows = frame.length;

    let prevFunctionName = null;

    const frameData =
        [`Error.stackTraceLimit = ${totalRows};`]
            .concat(
                frame.map((row, i) => {
                    const functionName = `${row.map(el => (el > (255 / 2)) ? '$$' : '__').join('')}__${i}`;

                    const rowFunction = `function ${functionName}(){ ${!prevFunctionName ? 'return null.badApple;' : `${prevFunctionName}();`} }`;

                    prevFunctionName = functionName;

                    return rowFunction;
                }))
            .concat(`\nprocess.on('message', () => ${prevFunctionName}());`)
            .join('\n');

    const frameName = `fr_${index}.js`;
    await writeFile(`js-frames/${frameName}`, frameData);

    return frameName;
}


async function runAll(frameNames, fps) {
    const queueSize = Math.min(10, frameNames.length);

    const processes = new Array(queueSize).fill(null).map((_, i) => fork(`js-frames/${frameNames[i]}`, {
        silent: true
    }));

    const millisBetweenFrames = Math.round((1 / fps) * 1000);

    const frameTimes = [];

    for (let i = 0; i < frameNames.length; i++) {
        const start = new Date().getTime();
        const child = processes.shift();

        if (!child) {
            throw new Error("Child pool empty");
        }

        child.stderr.once('data', () => console.clear());

        child.stderr.pipe(process.stderr);

        child.send('start');

        await new Promise((res, _) => {
            child.on('exit', function (code) {
                const end = new Date().getTime();

                const elapsedMillis = end - start;

                frameTimes.push(elapsedMillis);

                if (i + queueSize < frameNames.length) {
                    processes.push(fork(`js-frames/${frameNames[i + queueSize]}`, {
                        silent: true
                    }));
                }

                setTimeout(() => {
                    res();
                }, Math.max(millisBetweenFrames - elapsedMillis, 0));
            });
        })
    }

    return frameTimes;
}


async function clean() {
    const jsFilesToDelete = await readdir("js-frames");

    await Promise.all(jsFilesToDelete.map(file => unlink(`js-frames/${file}`)));
}

clean()
    .then(() => readFrames())
    .then(frames => {
        return Promise.all(frames.map((frame, i) => writeFrame(frame, i)));
    })
    .then(async (frameNames) => {
        return runAll(frameNames, 60);
    })
    .then(frameTimes => {
        const avg = frameTimes.reduce((acc, el) => acc + el, 0) / (frameTimes.length || 1);

        console.log(frameTimes);
        console.log(`Average millis between frames: ${avg.toFixed(2)}, ${(1000 / avg).toFixed(2)} fps`);
    });
