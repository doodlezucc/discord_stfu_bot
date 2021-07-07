const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

/**
 * @param {String} input 
 * @param {String} output 
 */
exports.convert = async (input, output) => {
    for (const dirent of fs.readdirSync(input, { withFileTypes: true })) {
        if (dirent.isFile()) {
            let dest = dirent.name;
            if (dest.includes(".")) {
                dest = dest.substr(0, dest.lastIndexOf("."));
            }
            dest = output + dest + ".opus";

            if (!fs.existsSync(dest)) {
                await new Promise((resolve, reject) => {
                    const ff = ffmpeg()
                        .addInput(input + dirent.name)
                        .addOutput(dest)
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
