const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

/**
 * @param {String} input
 * @param {String} output
 * @param {Number} amplify
 * @param {Number} bassboost
 * @param {Boolean} overwrite
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

    for (const dirent of fs.readdirSync(input, { withFileTypes: true })) {
        if (dirent.isFile()) {
            let dest = dirent.name;
            if (dest.includes(".")) {
                dest = dest.substr(0, dest.lastIndexOf("."));
            }
            dest = output + dest + ".opus";

            if (overwrite || !fs.existsSync(dest)) {
                await new Promise((resolve, reject) => {
                    const ff = ffmpeg()
                        .addInput(input + dirent.name)
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
                console.log("Converted " + dirent.name);
            }
        }
    }
}
