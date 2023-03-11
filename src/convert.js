const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const { join } = require("path");

class AudioCommand {
    constructor(folder) {
        /** @type {string} */
        this.folder = folder;

        /** @type {string[]} */
        this.files = [];
    }
}

exports.AudioCommand = AudioCommand;

/**
 * Runs ffmpeg with specified filters and converts from `input` to `output` (opus format).
 * @param {String} input
 * @param {String} output
 * @param {() => any} onWrite
 * @param {String[]} filters
 * @returns {Promise<String>}
 */
async function runFFmpegOpus(input, output, filters, onWrite, overwrite = false) {
    // Replace file extension with .opus
    let outOpus = output;
    if (outOpus.includes(".")) {
        outOpus = outOpus.substring(0, outOpus.lastIndexOf("."));
    }
    outOpus += ".opus";

    if (overwrite || !fs.existsSync(outOpus)) {
        await new Promise((resolve, reject) => {
            const ff = ffmpeg()
                .addInput(input)
                .addOutput(outOpus)
                .audioFilter(filters)
                .format("opus")
                .on("error", (err) => {
                    return reject(new Error(err));
                })
                .on('end', () => {
                    resolve();
                });

            ff.run();
        });
        onWrite();
    }

    return outOpus;
}

/**
 * @param {String} input
 * @param {String} output
 * @param {Number} amplify
 * @param {Number} bassboost
 * @param {Boolean} overwrite
 * @returns {Promise<AudioCommand[]>}
 */
exports.convert = async (input, output, amplify, bassboost, overwrite) => {
    const filters = [];
    if (bassboost != 0) {
        filters.push("firequalizer=gain_entry='entry(0,0);entry(100," + bassboost + ");entry(350,0)'");
    }
    if (amplify != 0) {
        filters.push("volume=" + amplify + "dB");
    }

    /** @type {AudioCommand[]} */
    const out = [];

    for (const dir of fs.readdirSync(input, { withFileTypes: true })) {
        if (!dir.isFile()) {
            const dirPath = join(input, dir.name);

            const cmd = new AudioCommand(dir.name);

            for (const audio of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (audio.isFile()) {
                    const fileIn = join(dirPath, audio.name);
                    const fileOut = join(output, audio.name);

                    const dest = await runFFmpegOpus(
                        fileIn, fileOut, filters,
                        () => {
                            console.log("Converted " + audio.name);
                        },
                        overwrite,
                    );

                    cmd.files.push(dest);
                }
            }

            out.push(cmd);
        }
    }

    return out;
}

/**
 * @param {String} input
 * @param {String} output
 * @param {Boolean} overwrite
 */
exports.normalize = async (input, output, overwrite = false) => {
    const filters = [
        "speechnorm=e=40:c=40:t=1:i=1:l=1"
    ];

    for (const dir of fs.readdirSync(input, { withFileTypes: true })) {
        if (!dir.isFile()) {
            const dirPath = join(input, dir.name);
            const dirPathOut = join(output, dir.name);

            if (!fs.existsSync(dirPathOut)) {
                fs.mkdirSync(dirPathOut, { recursive: true });
            }

            for (const audio of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (audio.isFile()) {
                    const fileIn = join(dirPath, audio.name);
                    const fileOut = join(dirPathOut, audio.name);

                    await runFFmpegOpus(fileIn, fileOut, filters,
                        () => {
                            console.log("Normalized " + audio.name);
                        },
                        overwrite,
                    );
                }
            }
        }
    }
}
