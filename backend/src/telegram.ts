import TelegramBot from "node-telegram-bot-api";

let bot: TelegramBot | null = null;
let chatId = "";
let dashboardUrl = "";

export function initTelegram(): void {
  chatId = process.env.TELEGRAM_CHAT_ID || "";
  dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:5173";
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set — notifications disabled");
    return;
  }
  if (!chatId) {
    console.log("[Telegram] No TELEGRAM_CHAT_ID set — notifications disabled");
    return;
  }
  bot = new TelegramBot(token, { polling: false });
  console.log(`[Telegram] Bot initialized — chat: ${chatId}`);
}

const severityEmoji: Record<string, string> = {
  critical: "\u{1F534}",
  warning: "\u{1F7E1}",
  info: "\u{1F535}",
};

export async function sendAlert(alert: {
  id: string;
  agentId: string;
  type: string;
  severity: string;
  message: string;
}): Promise<void> {
  if (!bot || !chatId) return;

  const emoji = severityEmoji[alert.severity] || "\u{26A0}\u{FE0F}";
  const text = [
    `${emoji} *ClaWatch Alert*`,
    ``,
    `*Type:* ${alert.type}`,
    `*Severity:* ${alert.severity.toUpperCase()}`,
    `*Agent:* \`${alert.agentId}\``,
    ``,
    alert.message,
  ].join("\n");

  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "View Agent",
              url: `${dashboardUrl}/agents/${alert.agentId}`,
            },
            {
              text: "View Alerts",
              url: `${dashboardUrl}/alerts`,
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("[Telegram] Failed to send alert:", err);
  }
}
