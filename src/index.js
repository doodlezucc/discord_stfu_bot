const Discord = require("discord.js");
const Voice = require("@discordjs/voice");

const fs = require("fs");
const converter = require("./convert");
const { Connection } = require("./wheel");
const path = require("path");

const rawDir = "audio/";
const audioDir = "audio_normalized/";
const freshDir = "audio_fresh/";
const opusDir = "audio_ready/";

const client = new Discord.Client({
    intents: [
        "Guilds",
        "GuildMessages",
        "GuildMessageReactions",
        "GuildVoiceStates",
        "MessageContent"
    ],
});

const {
    token,
    amp,
    normalize,
    random,
    cowardImg,
    statsHeader
} = require("../config.json");

const statsPath = "./stats.json";
let soundStats = {};

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

function initDirectories() {
    if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir);
    }

    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir);
    }

    if (!fs.existsSync(opusDir)) {
        fs.mkdirSync(opusDir);
    }
}

async function clearOpusFiles(dir) {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
        const direntPath = path.join(dir, dirent.name);

        if (dirent.isFile() && dirent.name.endsWith(".opus")) {
            await new Promise((resolve) => {
                fs.unlink(direntPath, () => {
                    resolve();
                });
            })
        } else if (dirent.isDirectory()) {
            await clearOpusFiles(direntPath);
        }
    }
}

async function clearConversions(clearNormalized) {
    if (clearNormalized) {
        await clearOpusFiles(audioDir);
        console.log("Cleared normalizations");
    }

    await clearOpusFiles(opusDir);
    console.log("Cleared conversions");
}

async function init() {
    const args = require("minimist")(process.argv.splice(2));
    const copyFreshFiles = args._.includes("prepare");

    const clearPreviousConversions = args["clear"];

    initDirectories();

    if (clearPreviousConversions) {
        const shouldClearAll = clearPreviousConversions === "all";
        await clearConversions(shouldClearAll);
    }

    const doNormalize = normalize ?? true;

    if (copyFreshFiles) {
        if (clearPreviousConversions) {
            await clearOpusFiles(freshDir);
        }
        await converter.normalize(rawDir, audioDir, freshDir);
        console.log(`Copied freshly normalized files to "${freshDir}"`);
        return;
    }

    if (doNormalize) {
        await converter.normalize(rawDir, audioDir);
    }

    commands = await converter.convert(audioDir, opusDir, amp, 0);

    loadStats();

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
        const content = message.content.toLowerCase();

        if (content.startsWith(cmd.folder)) {
            const query = content.substring(cmd.folder.length).trim();

            return respondPlay(message, cmd, query);
        }
    }
}

/** @param {Discord.Message} message */
async function respondStats(message) {
    const channel = message.channel;

    if (!(channel.guildId in soundStats)) {
        soundStats[channel.guildId] = {};
    }

    const channelStats = soundStats[channel.guildId];

    let maxPlays = 0;
    for (const cmd of commands) {
        if (!(cmd.folder in channelStats)) {
            channelStats[cmd.folder] = 0;
        }

        const plays = channelStats[cmd.folder];
        if (plays > maxPlays) {
            maxPlays = plays;
        }
    }

    const nameLength = commands.reduce((v, cmd) => Math.max(v, cmd.folder.length), 0);
    const maxPlaysLen = (maxPlays + "").length;

    let msg = statsHeader;
    for (const cmd of commands) {
        const plays = channelStats[cmd.folder];

        const clips = (cmd.files.length + "");
        const namePad = cmd.folder.padStart(nameLength + 1 - clips.length);
        const playsPad = ("" + plays).padStart(maxPlaysLen);
        msg += "\n`" + namePad + "(" + cmd.files.length + "): " + playsPad + "`";
    }

    channel.send(msg);
}

/** @type {Object.<string, Connection>} */
const connections = {};

function getConnection(guildId) {
    if (!(guildId in connections)) {
        connections[guildId] = new Connection();
    }
    return connections[guildId];
}

function increasePlayCount(guildId, category) {
    if (!(category in soundStats[guildId])) {
        soundStats[guildId][category] = 0;
    }
    soundStats[guildId][category]++;
    saveStats();
}

/**
 * Plays a local audio file inside a given voice channel.
 * @param {Discord.VoiceChannel} voiceChannel
 * @param {String} audioFile
 */
function playVoiceFile(voiceChannel, audioFile) {
    const guildId = voiceChannel.guildId;

    const permissions = voiceChannel.permissionsFor(client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak")) {
        throw new PermissionError();
    }

    const resource = Voice.createAudioResource(audioFile, {
        inlineVolume: true,
    });
    resource.volume.setVolume(0.12);

    const connection = Voice.joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: false,
    });

    const player = Voice.createAudioPlayer();
    player.addListener("stateChange", (_oldState, newState) => {
        if (newState.status == Voice.AudioPlayerStatus.Idle) {
            connection.disconnect();
        }
    }).addListener("error", (err) => {
        connection.disconnect();
        console.error(err);
    });

    connection.subscribe(player);
    player.play(resource);
}

/** 
 * @param {Discord.Message} message
 * @param {converter.AudioCommand} cmd
 * @param {String} query
*/
async function respondPlay(message, cmd, query) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        const reply = await message.channel.send({
            files: [cowardImg]
        });
        return setTimeout(() => {
            reply.delete();
            message.react("🖕");
        }, 3000);
    }

    const guildId = voiceChannel.guildId;

    if (!(guildId in soundStats)) {
        soundStats[guildId] = {};
    }

    const audio = getConnection(guildId).getSound(cmd, query);
    // console.log("Playing some sweet " + audio);

    try {
        playVoiceFile(voiceChannel, audio);
    } catch (err) {
        if (err instanceof PermissionError) {
            message.channel.send("need permission to join voice channels somehow.");
        }
        throw err;
    }

    increasePlayCount(guildId, cmd.folder);
}


class PermissionError extends Error {
    constructor() {
        super("Missing required permissions");

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}