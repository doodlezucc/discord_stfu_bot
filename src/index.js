const Discord = require("discord.js");
const Voice = require("@discordjs/voice");

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

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MESSAGE_REACTIONS",
        "GUILD_VOICE_STATES",
    ],
});

const {
    token,
    amp,
    cowardImg,
    statsHeader
} = require("../config.json");

const statsPath = "./stats.json";
let soundStats = {}

function loadStats() {
    if (fs.existsSync(statsPath)) {
        soundStats = JSON.parse(fs.readFileSync(statsPath));
    }
}

function saveStats() {
    fs.writeFile(statsPath, JSON.stringify(soundStats), () => { });
}


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
    //await clearConversions();
    //console.log("Cleared conversions");

    try {
        commands = await converter.convert(audioDir, opusDir, amp, 8, false); // TODO false -> true
    } catch (err) {
        return console.error(err);
    }

    loadStats();
    console.log(soundStats);

    client.login(token);

    client.once("ready", () => {
        console.log("Ready!");

        client.user.setPresence({
            status: "online"
        });
    });
    client.on("reconnecting", () => {
        console.log("Reconnecting!");
    });
    client.on("disconnect", () => {
        console.log("Disconnect!");
    });

    client.on("messageCreate", async message => {
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

/** @param {Discord.Message} message */
async function respondStats(message) {
    const channel = message.channel;

    if (!(channel.guildId in soundStats)) {
        soundStats[channel.guildId] = {};
    }

    let msg = statsHeader;
    for (const cmd of commands) {
        let count = 0;

        if (cmd.folder in soundStats[channel.guildId]) {
            count = soundStats[channel.guildId][cmd.folder];
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
    let changeNick = true;
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

    const members = voiceChannel.members;

    function nextNick(index, instant) {
        if (!changeNick) return;

        setTimeout(async () => {
            const guild = voiceChannel.guild;
            const mem = members.at(index % members.size);
            const nick = mem.nickname ?? mem.displayName;
            console.log(nick);
            await guild.members.edit(client.user, {
                nick: nick
            });
            nextNick(index + 1, false);
        }, instant ? 0 : 500);
    }

    nextNick(Math.floor(Math.random() * members.size), true);


    if (!(voiceChannel.guildId in soundStats)) {
        soundStats[voiceChannel.guildId] = {};
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("need permission to join voice channels somehow.");
    }

    const files = cmd.files;

    let index = Math.floor(Math.random() * files.length);
    while (files.length > 1 && index == cmd.previousAudio) {
        index = Math.floor(Math.random() * files.length);
    }
    cmd.previousAudio = index;

    const audio = files[index];
    console.log("Playing some sweet " + audio);

    const resource = Voice.createAudioResource(audio, {
        inlineVolume: true,
    });
    resource.volume.setVolume(0.15);

    const connection = Voice.joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: false,
    });

    const player = Voice.createAudioPlayer();
    player.addListener("stateChange", (_oldState, newState) => {
        if (newState.status == Voice.AudioPlayerStatus.Idle) {
            connection.disconnect();
            changeNick = false;

            if (!(cmd.folder in soundStats[voiceChannel.guildId])) {
                soundStats[voiceChannel.guildId][cmd.folder] = 0;
            }
            soundStats[voiceChannel.guildId][cmd.folder]++;

            saveStats();
        }
    }).addListener("error", (err) => {
        connection.disconnect();
        console.error(err);
    });

    connection.subscribe(player);
    player.play(resource);
}
