const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://aurum-wealth.vercel.app'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const OWNER_ID = process.env.TELEGRAM_CHAT_ID!

async function send(chatId: number, text: string, keyboard?: object) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }
  if (keyboard) body.reply_markup = keyboard
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`TG_ERR tok=${TOKEN?.slice(0,15)} chat=${chatId} err=${err.slice(0,80)}`)
  }
}

async function sendApp(chatId: number, text: string) {
  await send(chatId, text, {
    inline_keyboard: [[
      { text: '💰 Открыть Aurum', web_app: { url: `${APP_URL}/wealth.html` } },
    ]],
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = body?.message
    if (!message?.text) return Response.json({ ok: true })

    const chatId: number = message.chat.id
    const fromId: number = message.from?.id

    // Only respond to owner
    if (String(fromId) !== String(OWNER_ID).trim()) {
      return Response.json({ ok: true })
    }

    const text = message.text.trim().toLowerCase()

    if (text === '/start' || text === '/help') {
      await sendApp(chatId,
        `<b>Aurum</b> — личный финансовый трекер 💰\n\nНажми кнопку чтобы открыть 👇`
      )
      return Response.json({ ok: true })
    }

    if (text === '/wealth' || text === '/p') {
      await sendApp(chatId, 'Открываю портфель 📊')
      return Response.json({ ok: true })
    }

    await sendApp(chatId, `Не понимаю команду.\n\n/start — открыть приложение`)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: true })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const webhookUrl = `${APP_URL}/api/bot`
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
  return Response.json(await res.json())
}
