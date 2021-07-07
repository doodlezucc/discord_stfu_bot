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

async function init() {
    try {
        await converter.convert(audioDir, opusDir);
    } catch (err) {
        return console.error(err);
    }

    for (const dirent of fs.readdirSync(opusDir, { withFileTypes: true })) {
        if (dirent.isFile() && dirent.name.endsWith(".opus")) {
            files.push(dirent.name);
        }
    }

    const { token } = require("../config.json");

    const client = new Discord.Client();
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
async function handleMessage(message) {
    respondPlay(message);
}

/** @param {Discord.Message} message */
async function respondPlay(message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        message.channel.send("join a voice channel first");
        return setTimeout(() => {
            message.channel.send("cunt");
        }, 1000);
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(smiley(sad) + " somebody pls give me permission to join voice channels.");
    }

    // Join voice channel
    const connection = await voiceChannel.join();

    const audio = files[Math.floor(Math.random() * files.length)];
    console.log("Playing some sweet " + audio);

    const dispatcher = connection.play(opusDir + audio, {
        volume: 0.8,
    })
        .on("finish", async () => {
            connection.disconnect();
        })
        .on("error", (error) => {
            connection.disconnect();
            return console.error(error);
        });
}
