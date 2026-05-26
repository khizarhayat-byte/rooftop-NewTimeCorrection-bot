const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const https = require('https');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID        = process.env.CLIENT_ID;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
const ALLOWED_CHANNELS = ['tech-support'];

// Apps Script requires following redirects manually
function postToSheet(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    function doRequest(url) {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, res => {
        // Follow redirect (Apps Script returns 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response: ' + data));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    }

    doRequest(APPS_SCRIPT_URL);
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
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
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
