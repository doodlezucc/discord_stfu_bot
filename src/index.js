const Discord = require("discord.js");
const fs = require("fs");
const converter = require("./convert");

const audioDir = "audio/";
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
    return console.error("No audio files available!");
}

const opusDir = "opus/";
if (!fs.existsSync(opusDir)) {
    fs.mkdirSync(opusDir);
}

const files = [];
const client = new Discord.Client();

let previousAudio;


async function clearConversions() {
    for (const dirent of fs.readdirSync(opusDir, { withFileTypes: true })) {
        if (dirent.isFile() && dirent.name.endsWith(".opus")) {
            await new Promise((resolve) => {
                fs.unlink(opusDir + dirent.name, () => {
                    resolve();
                });
            })
        }
    }
}

async function init() {
    await clearConversions();
    console.log("Cleared conversions");

    try {
        await converter.convert(audioDir, opusDir, 32, 0, true);
    } catch (err) {
        return console.error(err);
    }

    for (const dirent of fs.readdirSync(opusDir, { withFileTypes: true })) {
        if (dirent.isFile() && dirent.name.endsWith(".opus")) {
            files.push(dirent.name);
        }
    }

    const { token } = require("../config.json");

    client.login(token);

    client.once("ready", () => {
        console.log("Ready!");

        client.user.setPresence({
            status: "invisible"
        });
    });
    client.on("reconnecting", () => {
        console.log("Reconnecting!");
    });
    client.on("disconnect", () => {
        console.log("Disconnect!");
    });

    client.on("message", async message => {
        if (message.author.bot) return;

        handleMessage(message);
    });
}

init();

/** @param {Discord.Message} message */
function handleMessage(message) {
    if (message.content === "stfu") {
        respondPlay(message);
    }
}

/** @param {Discord.Message} message */
async function respondPlay(message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        const msg = await message.channel.send("", {
            files: ["https://i.redd.it/yb7dlj86tiv61.png"]
        });
        return setTimeout(() => {
            msg.delete();
            message.react("🖕");
        }, 3000);
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("need permission to join voice channels somehow.");
    }

    // Join voice channel
    const connection = await voiceChannel.join();

    let index = Math.floor(Math.random() * files.length);
    while (files.length > 1 && index == previousAudio) {
        index = Math.floor(Math.random() * files.length);
    }
    previousAudio = index;

    const audio = files[index];
    console.log("Playing some sweet " + audio);

    const dispatcher = connection.play(opusDir + audio, {
        volume: 0.7,
    })
        .on("finish", async () => {
            connection.disconnect();
        })
        .on("error", (error) => {
            connection.disconnect();
            return console.error(error);
        });
}
