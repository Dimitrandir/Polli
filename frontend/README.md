# SIS Esthetics – фронтенд за резервации

Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 + Motion. Говори с Django API-то от главната папка.

## Страници

- `/` – начална страница с бутон „Запази час“
- `/rezervacia` – резервация в 4 стъпки: услуги → специалист (и „едновременно“) → дата и час → данни
- `/rezervacia/<token>` – преглед на резервацията, добавяне в календара (.ics) и отказ до 24 ч. преди часа
- `/poveritelnost` – място за политиката за поверителност (текстът предстои)

Часовете винаги се показват във времето на салона (Europe/Sofia), независимо от устройството.
Поддържа светла и тъмна тема и може да се инсталира като приложение (PWA manifest).

## Локално

```bash
# 1) backend на http://localhost:8000 (виж README-то в главната папка)
# 2) фронтенд:
cd frontend
npm install
npm run dev          # http://localhost:3000
```

`/api/*` се пренасочва към Django (`BACKEND_URL`, по подразбиране `http://localhost:8000`), така че не е нужен CORS.

Проверки: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Структура

- `src/lib/api.ts` – типизиран клиент за API-то
- `src/lib/booking-state.ts` – състоянието на резервацията (reducer)
- `src/lib/format.ts` – цени, продължителност, дати и часове на български
- `src/components/booking/` – стъпките, обобщението и страницата за управление
