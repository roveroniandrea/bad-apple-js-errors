import { fork } from 'child_process';
import { readFile, readdir, unlink, writeFile } from 'fs/promises';


/** Giving bytes in little endian, returns the corresponding integer value */
function littleEndianToInt(bytes) {
    let res = 0;

    for (let i = bytes.length - 1; i >= 0; i--) {
        res = res << 8;

        res += bytes[i];
    }

    return res;
}

/** Reads all bitmap frames and parses them */
async function readFrames() {
    console.log(`Reading bmp frames`);

    const files = await readdir("frames")
        .then(content => {
            // Files have a suffix with their order
            // Suffix length depends on how many frames have been generated
            // For example, the entire video at 60fps generates around 13k frames
            // So they are ordered from 00000 to 13000, 5 digits
            const digits = content.length.toString().length;

            return content.sort((c1, c2) => {
                const i1 = c1.slice(4, 4 + digits);
                const i2 = c2.slice(4, 4 + digits);

                return parseInt(i1) - parseInt(i2);
            });
        });

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

        let byteIndex = startingAddress;
        while (byteIndex < buffer.length) {
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

                // Increment to the next pixel
                byteIndex += bytesPerPixel;
            }
            else {
                // Otherwise this is the first padding byte in the row, increment by the number of padding bytes, in order not to skip some non-padding bytes
                // For example, if paddingBytesInRow = 2 and bytesPerPixel = 3, I have to skip two bytes, not 3
                byteIndex += paddingBytesInRow;
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

function getErrorBodyFunction(frameIndex) {
    const errors = [
        // Cannot read prop of undefined
        'return undefined.badApple;',
        // property is not a function
        `let badApple = ''; return badApple();`,
        // property is not defined
        `badApple += 2;`,
        // property is not iterable
        `let badApple = 42; let [...el] = badApple; return e;`,
        // Cannot access property before initialization
        `return (() => {badApple(); let badApple = 42})();`,
        // What is Rick doing here?
        `throw new Error("Never gonna give you up");`,
        // Bad apple as JSFuck syntax
        `throw new Error([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]][([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]((!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+([][[]]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+!+[]]+(+[![]]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+!+[]]]+(!![]+[])[!+[]+!+[]+!+[]]+(+(!+[]+!+[]+!+[]+[+!+[]]))[(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([]+[])[([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]][([][[]]+[])[+!+[]]+(![]+[])[+!+[]]+((+[])[([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]+[])[+!+[]+[+!+[]]]+(!![]+[])[!+[]+!+[]+!+[]]]](!+[]+!+[]+!+[]+[!+[]+!+[]])+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]])()([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]][([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]((!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+([][[]]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+!+[]]+([]+[])[(![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(!![]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]()[+!+[]+[!+[]+!+[]]]+((!![]+[])[+[]]+[!+[]+!+[]+!+[]+!+[]]+[!+[]+!+[]+!+[]+!+[]+!+[]+!+[]+!+[]]+(!![]+[])[+[]]+[+!+[]]+[!+[]+!+[]+!+[]+!+[]]+[!+[]+!+[]]+(![]+[])[+!+[]]+([][[]]+[])[!+[]+!+[]]+(!![]+[])[+[]]+[+!+[]]+[+[]]+[+!+[]]+(!![]+[])[+[]]+[+!+[]]+[!+[]+!+[]+!+[]+!+[]+!+[]+!+[]]+[+[]]+(!![]+[])[+[]]+[+!+[]]+[!+[]+!+[]+!+[]+!+[]+!+[]+!+[]]+[+[]]+(![]+[])[!+[]+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+[!+[]+!+[]+!+[]+!+[]]+[!+[]+!+[]+!+[]+!+[]+!+[]+!+[]+!+[]])[(![]+[])[!+[]+!+[]+!+[]]+(+(!+[]+!+[]+[+!+[]]+[+!+[]]))[(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([]+[])[([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]][([][[]]+[])[+!+[]]+(![]+[])[+!+[]]+((+[])[([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]+[])[+!+[]+[+!+[]]]+(!![]+[])[!+[]+!+[]+!+[]]]](!+[]+!+[]+!+[]+[+!+[]])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]]((!![]+[])[+[]])[([][(!![]+[])[!+[]+!+[]+!+[]]+([][[]]+[])[+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([![]]+[][[]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]](([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]][([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]((!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+([][[]]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+!+[]]+(![]+[+[]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]]+![]+(![]+[+[]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]])()[([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]((![]+[+[]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]])+[])[+!+[]])+([]+[])[(![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(!![]+[])[+[]]+([][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]()[+!+[]+[!+[]+!+[]]])()));`
    ];

    // Return the same error for some iterations, just to make it readable
    return errors[Math.floor(frameIndex / 300) % errors.length];
}

/** Given a decoded frame, converts to the corresponding JS "frame" file */
async function writeFrame(frame, index) {
    const totalRows = frame.length;

    let prevFunctionName = null;

    const frameData =
        // This property allows to specify how meny entries will have the error stack trace
        [`Error.stackTraceLimit = ${totalRows};`]
            .concat(
                frame.map((row, i) => {
                    // Each pixel needs to be two characters wide in order to preserve aspect ratio
                    // Also, rows might have the same pixel values, so in order to have unique function names, the row index is added at the ends
                    const functionName = `${row.map(el => (el > (255 / 2)) ? '$$' : '__').join('')}__${i}`;

                    const rowFunction = `function ${functionName}(){ ${!prevFunctionName ? getErrorBodyFunction(index) : `${prevFunctionName}();`} }`;

                    prevFunctionName = functionName;

                    return rowFunction;
                }))
            // Each frame waits for a starting message from the parent process
            .concat(`\nprocess.on('message', () => ${prevFunctionName}());`)
            .join('\n');

    const frameName = `fr_${index}.js`;
    await writeFile(`js-frames/${frameName}`, frameData);

    return frameName;
}

/** Runs all the js frames */
async function runAll(frameNames, fps) {

    /** Forks a process, piping only stderr */
    const forkProcess = (frameName) => {
        return fork(`js-frames/${frameName}`, {
            // I don't actually know what ipc is applied to, but seems required otherwise error
            // `forked processes must have an ipc channel missing value 'ipc' in options.stdio`
            stdio: ['ignore', 'ignore', 'pipe', 'ipc']
        });
    }

    console.log(`Running Bad Apple!`);

    // Forking a process takes some time, so a queue is used in order to allow forked process to completely start
    // After each child is started, it will wait for a message from the parent
    const queueSize = Math.min(10, frameNames.length);
    const processQueue = new Array(queueSize).fill(null).map((_, i) => forkProcess(frameNames[i]));

    // Await a certain time to allow for child process in queue to actually start
    await new Promise((res, _) => {
        setTimeout(() => res(), 300);
    });

    // this is the optimal time between each frame to keep the desired fps
    // Hovewer, in practice there are some other delays, maybe caused by printing on the terminal, passing messages or something else
    const millisBetweenFrames = Math.round((1 / fps) * 1000);

    // Keep some stats regarding timing
    const frameTimes = [];
    const initRunAllTime = new Date().getTime();

    for (let i = 0; i < frameNames.length; i++) {
        const start = new Date().getTime();

        // Pick the first available child process
        const child = processQueue.shift();

        if (!child) {
            throw new Error("Child pool empty");
        }

        // Clearing data at first stderr chunk from the forked process
        // I'm not completely happy about this approach, because I don't know if console is immediately cleared or might also clear some incoming stderr. Seems not happening
        child.stderr.once('data', () => console.clear());

        // Piping stderr from child process to parent stderr
        child.stderr.pipe(process.stderr);

        // Child is awaiting a message in order to start executing its functions
        child.send('start');

        // On child exit, proceed with next iteration
        await new Promise((res, _) => {
            child.on('exit', function (code) {
                // Pushing a new process if there are still more frames than the current queue size
                if (i + queueSize < frameNames.length) {
                    processQueue.push(fork(`js-frames/${frameNames[i + queueSize]}`, {
                        silent: true
                    }));
                }

                // Forking is syncronous, so I actually have to measure total time after spawning the new process
                const end = new Date().getTime();
                const elapsedMillis = end - start;
                frameTimes.push(elapsedMillis);

                // From my observations, this delay not only affects fps (as expected)
                // but also how flickering the animation will appear
                // printing on console is done by chunks and takes some times, so if this delay is too small
                // the current frame might not be able to print entirely before being cleared by the next one, resulting in flickering
                // For a 50x50 frame, awaiting 50ms (so, going 20fps) seems ok to not have any flickering
                setTimeout(() => {
                    res();
                }, Math.max(millisBetweenFrames - elapsedMillis, 0));
            });
        })
    }

    const endRunAllTime = new Date().getTime();

    return {
        frameTimes: frameTimes,
        totalTime: endRunAllTime - initRunAllTime
    };
}

/** Clears frames generated on previous execution */
async function clean() {
    console.log(`Cleaning data`);
    const jsFilesToDelete = await readdir("js-frames");

    await Promise.all(jsFilesToDelete.map(file => unlink(`js-frames/${file}`)));
}

clean()
    .then(() => readFrames())
    .then(frames => {
        console.log(`Writing js frames`);
        return Promise.all(frames.map((frame, i) => writeFrame(frame, i)));
    })
    .then(async (frameNames) => {
        // Adjust according to converted video's fps
        return runAll(frameNames, 20);
    })
    .then(({ frameTimes, totalTime }) => {
        // Excpected fps
        const expectedAvg = frameTimes.reduce((acc, el) => acc + el, 0) / (frameTimes.length || 1);
        console.log(`Average expected millis between frames: ${expectedAvg.toFixed(2)}, ${(1000 / expectedAvg).toFixed(2)} fps`);

        // Vs actual fps
        const actualAvg = totalTime / (frameTimes.length || 1);
        console.log(`Total time taken: ${totalTime}ms for ${frameTimes.length} frames. Avg actual fps: ${(1000 / actualAvg).toFixed(2)}`);
    });
