const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID        = process.env.CLIENT_ID;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
const ALLOWED_CHANNELS = ['tech-support'];

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

      const res  = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', agentName, discordId, issue })
      });
      const data = await res.json();

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
      const res  = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', agentName, discordId })
      });
      const data = await res.json();

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
    console.error(err);
    await interaction.editReply(`❌ Could not reach the logging server. Try again.`);
  }
});

client.login(DISCORD_TOKEN);
