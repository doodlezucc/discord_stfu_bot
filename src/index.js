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

const client = new Discord.Client();
const {
    token,
    amp,
    cowardImg,
    statsHeader
} = require("../config.json");


/** @type {converter.AudioCommand[]} */
let commands;

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
        commands = await converter.convert(audioDir, opusDir, amp, 8, true);
    } catch (err) {
        return console.error(err);
    }

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
    if (message.content === "soundstats") {
        return respondStats(message);
    }

    for (const cmd of commands) {
        if (message.content === cmd.folder) {
            return respondPlay(message, cmd);
        }
    }
}

/** @param {Discord.TextChannel} channel */
async function lots_of_messages_getter(channel, limit = 500) {
    const sum_messages = [];
    let last_id;

    while (true) {
        const options = { limit: 100 };
        if (last_id) {
            options.before = last_id;
        }

        const messages = await channel.messages.fetch(options);
        sum_messages.push(...messages.array());
        last_id = messages.last().id;

        if (messages.size != 100 || sum_messages >= limit) {
            break;
        }
    }

    return sum_messages;
}

/** @param {Discord.Message} message */
async function respondStats(message) {
    const channel = message.channel;

    // `m` is a message object that will be passed through the filter function
    const messages = await lots_of_messages_getter(channel, 3000);

    let msg = statsHeader;
    for (const cmd of commands) {
        let count = 0;

        for (const m of messages) {
            if (m.content === cmd.folder) {
                count++;
            }
        }

        msg += "\n" + cmd.folder + ": " + count;
    }

    channel.send(msg);
}

/** 
 * @param {Discord.Message} message
 * @param {converter.AudioCommand} cmd
*/
async function respondPlay(message, cmd) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        const msg = await message.channel.send("", {
            files: [cowardImg]
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
    const files = cmd.files;

    let index = Math.floor(Math.random() * files.length);
    while (files.length > 1 && index == cmd.previousAudio) {
        index = Math.floor(Math.random() * files.length);
    }
    cmd.previousAudio = index;

    const audio = files[index];
    console.log("Playing some sweet " + audio);

    const dispatcher = connection.play(audio, {
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
