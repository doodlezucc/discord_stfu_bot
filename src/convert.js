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
 * @param {String} input
 * @param {String} output
 * @param {Number} amplify
 * @param {Number} bassboost
 * @param {Boolean} overwrite
 * @returns {Promise<AudioCommand[]>}
 */
exports.convert = async (input, output, amplify, bassboost, overwrite) => {
    const filters = [
        "loudnorm",
    ];
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
            const cmd = new AudioCommand(dir.name);

            for (const audio of fs.readdirSync(join(input, cmd.folder), { withFileTypes: true })) {
                if (audio.isFile()) {
                    let dest = audio.name;
                    if (dest.includes(".")) {
                        dest = dest.substring(0, dest.lastIndexOf("."));
                    }
                    dest = output + dest + ".opus";

                    if (overwrite || !fs.existsSync(dest)) {
                        await new Promise((resolve, reject) => {
                            const ff = ffmpeg()
                                .addInput(join(input, cmd.folder, audio.name))
                                .addOutput(dest)
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
                        console.log("Converted " + audio.name);
                    }

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
    for (const dir of fs.readdirSync(input, { withFileTypes: true })) {
        if (!dir.isFile()) {
            const dirPath = join(input, dir.name);
            const dirPathOut = join(output, dir.name);

            if (!fs.existsSync(dirPathOut)) {
                fs.mkdirSync(dirPathOut, { recursive: true });
            }

            for (const audio of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (audio.isFile()) {
                    const fileName = join(dirPath, audio.name);

                    // Replace file extension with .opus
                    let name = audio.name;
                    if (name.includes(".")) {
                        name = name.substring(0, name.lastIndexOf("."));
                    }
                    name += ".opus";

                    const dest = join(dirPathOut, name);

                    if (overwrite || !fs.existsSync(dest)) {
                        const process = spawn("ffmpeg-normalize", [
                            fileName,
                            "--video-disable",
                            "-c:a",
                            "libopus",
                            "--print-stats",
                            "--quiet",
                            "--normalization-type",
                            "peak",
                            "-f",
                            "-o",
                            dest
                        ]);

                        let peakResult;
                        process.stdout.on("data", (chunk) => {
                            const logged = "" + chunk;
                            peakResult = JSON.parse(logged);
                        });

                        await new Promise((res, rej) => {
                            process.on("exit", res);
                            process.on("error", rej);
                        });

                        const { mean, max } = peakResult[0];
                        const maxString = max.toFixed(1);

                        console.log("Normalized " + audio.name + " (previously at " + maxString + " dB)");
                    }
                }
            }
        }
    }
}
