// Облачное состояние Aurum — единая точка синхронизации телефон/ноутбук.
// GET  → вернуть сохранённое состояние пользователя
// POST → сохранить (upsert) состояние пользователя
//
// Безопасность: каждый запрос обязан содержать заголовок x-telegram-init-data
// с подписью Telegram WebApp. Подпись проверяется через HMAC по TELEGRAM_BOT_TOKEN —
// так сервер достоверно знает Telegram ID и не пускает чужих.
// Данные хранятся в Supabase, доступ к таблице — только через service_role (RLS закрыт).

import crypto from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://rryvfjbwqjeydzfdrhal.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const OWNER_ID = (process.env.TELEGRAM_CHAT_ID ?? '5488684822').trim()

// Проверка подписи Telegram WebApp initData. Возвращает Telegram user id или null.
function verifyInitData(initData: string): string | null {
  if (!initData || !BOT_TOKEN) return null
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n')

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    // Сравнение постоянного времени, чтобы исключить тайминг-атаки
    const a = Buffer.from(calcHash, 'hex')
    const b = Buffer.from(hash, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

    const userRaw = params.get('user')
    if (!userRaw) return null
    const user = JSON.parse(userRaw)
    return user?.id ? String(user.id) : null
  } catch {
    return null
  }
}

function sb(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
}

function auth(request: Request): string | null {
  const initData = request.headers.get('x-telegram-init-data') || ''
  const userId = verifyInitData(initData)
  if (!userId) return null
  // Личное приложение: пускаем только владельца
  if (OWNER_ID && userId !== OWNER_ID) return null
  return userId
}

export async function GET(request: Request) {
  if (!SERVICE_KEY) return Response.json({ error: 'cloud_not_configured' }, { status: 503 })
  const userId = auth(request)
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const res = await sb(
    `wealth_state?user_id=eq.${encodeURIComponent(userId)}&select=data,client_updated_at,updated_at`,
  )
  if (!res.ok) return Response.json({ error: 'db_error' }, { status: 502 })
  const rows = await res.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ data: null })
  }
  return Response.json({
    data: rows[0].data,
    updatedAt: rows[0].client_updated_at ?? 0,
    serverUpdatedAt: rows[0].updated_at,
  })
}

export async function POST(request: Request) {
  if (!SERVICE_KEY) return Response.json({ error: 'cloud_not_configured' }, { status: 503 })
  const userId = auth(request)
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { data?: unknown; updatedAt?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }
  if (body.data == null || typeof body.data !== 'object') {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  const row = {
    user_id: userId,
    data: body.data,
    client_updated_at: Number(body.updatedAt) || Date.now(),
    updated_at: new Date().toISOString(),
  }

  const res = await sb('wealth_state?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const err = await res.text()
    return Response.json({ error: 'db_error', detail: err.slice(0, 200) }, { status: 502 })
  }
  return Response.json({ ok: true })
}
