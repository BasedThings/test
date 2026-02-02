# Railway Deployment Guide

## Архитектура

Проект состоит из двух сервисов:
- **API** (`apps/api`) - Backend с парсингом рынков и поиском арбитража
- **Web** (`apps/web`) - Frontend React приложение

## Шаг 1: Создание проекта в Railway

1. Зайди на [railway.app](https://railway.app)
2. Создай новый проект
3. Выбери "Deploy from GitHub repo"
4. Подключи репозиторий

## Шаг 2: Добавление PostgreSQL

1. В проекте нажми "New" → "Database" → "PostgreSQL"
2. Railway автоматически создаст переменную `DATABASE_URL`

## Шаг 3: Добавление Redis

1. Нажми "New" → "Database" → "Redis"
2. Railway автоматически создаст переменную `REDIS_URL`

## Шаг 4: Деплой API сервиса

1. Нажми "New" → "GitHub Repo" → выбери репозиторий
2. В настройках сервиса:
   - **Root Directory**: `apps/api`
   - **Build Command**: `pnpm install && pnpm db:generate && pnpm build`
   - **Start Command**: `npx prisma migrate deploy && node dist/server.js`

3. Добавь переменные окружения (Settings → Variables):
```
NODE_ENV=production
ENABLE_POLYMARKET=true
ENABLE_KALSHI=true
ENABLE_PREDICTIT=false
```

4. Привяжи PostgreSQL и Redis к этому сервису:
   - Settings → Shared Variables → выбери DATABASE_URL и REDIS_URL

## Шаг 5: Деплой Web сервиса

1. Нажми "New" → "GitHub Repo" → выбери тот же репозиторий
2. В настройках сервиса:
   - **Root Directory**: `apps/web`
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `npx serve dist -l $PORT`

3. Добавь переменную окружения:
```
VITE_API_URL=https://[твой-api-сервис].railway.app/api/v1
```

## Шаг 6: Настройка домена

1. Для каждого сервиса зайди в Settings → Networking
2. Нажми "Generate Domain" для публичного доступа

## Переменные окружения API

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DATABASE_URL` | PostgreSQL URL (автоматически) | - |
| `REDIS_URL` | Redis URL (автоматически) | - |
| `NODE_ENV` | Окружение | production |
| `ENABLE_POLYMARKET` | Включить Polymarket | true |
| `ENABLE_KALSHI` | Включить Kalshi | true |
| `ENABLE_PREDICTIT` | Включить PredictIt | false |
| `KALSHI_API_EMAIL` | Email для Kalshi API | - |
| `KALSHI_API_PASSWORD` | Пароль для Kalshi API | - |

## Проверка работы

После деплоя проверь:
- API Health: `https://[api-domain].railway.app/health`
- API Status: `https://[api-domain].railway.app/status`
- Web: `https://[web-domain].railway.app`

## Troubleshooting

### Ошибка "DATABASE_URL is required"
Убедись что PostgreSQL добавлен и привязан к API сервису через Shared Variables.

### Ошибка "Cannot connect to Redis"
Убедись что Redis добавлен и привязан к API сервису.

### Build падает
Проверь логи билда. Часто проблема в:
- Неправильный Root Directory
- Отсутствующие зависимости
