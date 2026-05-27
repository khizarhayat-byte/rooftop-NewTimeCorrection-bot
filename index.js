const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const https = require('https');
const http  = require('http');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID        = process.env.CLIENT_ID;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
const ALLOWED_CHANNELS = ['tech-support'];

function postToSheet(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    function doRequest(urlStr, redirectCount) {
      if (redirectCount > 10) return reject(new Error('Too many redirects'));

      const url     = new URL(urlStr);
      const lib     = url.protocol === 'https:' ? https : http;
      const options = {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'Node.js'
        }
      };

      const req = lib.request(options, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          // Drain the response before following redirect
          res.resume();
          // GET on redirect (Apps Script pattern)
          return doGet(location, redirectCount + 1);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(body);
      req.end();
    }

    // After redirect Apps Script expects GET
    function doGet(urlStr, redirectCount) {
      if (redirectCount > 10) return reject(new Error('Too many redirects'));

      const url  = new URL(urlStr);
      const lib  = url.protocol === 'https:' ? https : http;
      const opts = {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'GET',
        headers:  { 'User-Agent': 'Node.js' }
      };

      const req = lib.request(opts, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          return doGet(res.headers.location, redirectCount + 1);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
      req.end();
    }

    doRequest(APPS_SCRIPT_URL, 0);
  });
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('start')
      .setDescription('Log start of your tech issue')
      .addStringOption(opt =>
        opt.setName('issue')
          .setDescription('Describe the issue e.g. internet dropped, platform crash')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('end')
      .setDescription('Log end of your tech issue')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('✅ Slash commands registered: /start /end');
}

client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const cmd         = interaction.commandName;
  const channelName = interaction.channel.name;

  if (cmd !== 'start' && cmd !== 'end') return;

  if (!ALLOWED_CHANNELS.includes(channelName)) {
    return interaction.reply({
      content: `❌ This command only works in **#tech-support**.`,
      ephemeral: true
    });
  }

  const agentName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const discordId = interaction.user.id;

  await interaction.deferReply();

  try {
    if (cmd === 'start') {
      const issue = interaction.options.getString('issue');
      const data  = await postToSheet({ action: 'start', agentName, discordId, issue });

      if (data.status === 'ok') {
        await interaction.editReply(
          `🟡 **Tech issue started**\n` +
          `👤 **Agent:** ${agentName}\n` +
          `🕐 **Time:** ${data.startTime} CST\n` +
          `⚠️ **Issue:** ${issue}\n\n` +
          `_Type \`/end\` once your issue is resolved._`
        );
      } else {
        await interaction.editReply(`❌ Error: ${data.message}`);
      }
    }

    if (cmd === 'end') {
      const data = await postToSheet({ action: 'end', agentName, discordId });

      if (data.status === 'ok') {
        await interaction.editReply(
          `✅ **Tech issue closed**\n` +
          `👤 **Agent:** ${agentName}\n` +
          `🕐 **${data.startTime} → ${data.endTime} CST**\n` +
          `⏱️ **Duration:** ${data.duration} mins\n\n` +
          `_Entry saved to the Time Correction sheet._`
        );
      } else if (data.status === 'no_open') {
        await interaction.editReply(`⚠️ No open issue found for you. Use \`/start\` first.`);
      } else {
        await interaction.editReply(`❌ Error: ${data.message}`);
      }
    }

  } catch (err) {
    console.error('postToSheet error:', err.message);
    await interaction.editReply(`❌ Could not reach the logging server: ${err.message}`);
  }
});

client.login(DISCORD_TOKEN);
