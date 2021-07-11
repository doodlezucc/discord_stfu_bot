const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const { join } = require("path");

class AudioCommand {
    constructor(folder) {
        this.folder = folder;

        /** @type {string[]} */
        this.files = [];

        /** @type {number} */
        this.previousAudio = -1;
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
    let filters = [
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
                        dest = dest.substr(0, dest.lastIndexOf("."));
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
