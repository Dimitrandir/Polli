# Сайтът на постоянно включен компютър с Windows (Docker + Cloudflare тунел)

Всичко (база данни, Django, сайтът, напомнянията по имейл и тунелът) върви в Docker с една команда.
Не се инсталират Python, Node.js и PostgreSQL на Windows.

Образите се билдват в GitHub: при всеки push в `main` GitHub Actions (`.github/workflows/docker.yml`) ги публикува в
`ghcr.io/dimitrandir/polli-backend` и `ghcr.io/dimitrandir/polli-frontend`. Компютърът само ги дърпа и пуска, без да
билдва нищо.

## 1. Еднократна подготовка на Windows

1. **Захранване:** Настройки → Система → Захранване → „Заспиване“ = **Никога**. Компютърът трябва да не заспива.
2. **WSL2:** PowerShell като администратор → `wsl --install` → рестарт.
3. **Docker Desktop:** https://www.docker.com/products/docker-desktop/ → инсталирайте (с WSL 2). След това в
   Docker Desktop → Settings → General включете **„Start Docker Desktop when you sign in“**.
4. **Git:** https://git-scm.com/download/win (настройките по подразбиране са наред).
5. **Автоматичен вход след рестарт** (Docker Desktop тръгва, когато потребителят е влязъл): `Win + R` →
   `netplwiz` → махнете отметката „Users must enter a user name and password“. Ако я няма: Настройки → Акаунти →
   Опции за влизане → изключете „Windows Hello вход“ и опитайте пак.

## 2. Изтегляне на проекта

В PowerShell:

```powershell
cd $HOME
git clone https://github.com/Dimitrandir/Polli.git
cd Polli
copy .env.example .env
notepad .env
```

В `.env` сменете поне:

- `DJANGO_SECRET_KEY=` дълъг произволен текст (напр. 50 случайни знака);
- `POSTGRES_PASSWORD=` своя парола (сменете я **преди** първото пускане, после остава в базата);
- по желание `ANTHROPIC_API_KEY` (AI асистентът), `VAPID_*` (push известия, виж т. 5), Brevo за истински имейли.

`DJANGO_DEBUG`, `POSTGRES_HOST`, `DJANGO_ALLOWED_HOSTS` и `DJANGO_CSRF_TRUSTED_ORIGINS` не ги пипайте: Docker ги
задава сам.

## 3. Пускане

Ако репото в GitHub е **частно**, образите също са частни и Docker трябва да влезе в ghcr.io веднъж:

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token
   (classic) → отметка само на **`read:packages`**, срок по избор → копирайте токена (`ghp_…`).
2. В PowerShell: `docker login ghcr.io -u Dimitrandir` и при „Password“ поставете токена.

Docker Desktop го помни, второ влизане не трябва. (Ако репото е публично, пропуснете тази стъпка.)

```powershell
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

Първия път изтеглянето трае няколко минути. После, еднократно, съдържанието и потребител за админа:

```powershell
docker compose -f docker-compose.server.yml exec backend python manage.py import_site_content
docker compose -f docker-compose.server.yml exec backend python manage.py createsuperuser
```

- Сайтът: http://localhost:3000, календарът на персонала: http://localhost:3000/personal
- Админ: http://localhost:8000/admin/ (отваря се само от този компютър)

## 4. Публичният линк (тунел)

```powershell
docker compose -f docker-compose.server.yml logs tunnel
```

Търсете ред с `https://….trycloudflare.com`. Това е адресът за телефона и за салона. Пренасочване на портове в
рутера не трябва.

Линкът се сменя при всяко рестартиране на компютъра или на тунела. За постоянен адрес вижте т. 7.

## 5. Push известия (по желание)

```powershell
docker compose -f docker-compose.server.yml run --rm backend python manage.py generate_vapid_keys
```

Сложете двата реда в `.env` и рестартирайте (т. 6). Push работи само през https адреса на тунела.

## 6. Ежедневна работа

| Какво | Команда |
|---|---|
| Нова версия от GitHub | `powershell -ExecutionPolicy Bypass -File deploy\update.ps1` |
| Връщане на стара версия | в `.env` `IMAGE_TAG=sha-1a2b3c4` (първите 7 знака на commit от `main`), после `update.ps1`; празно = най-новата |
| Билд тук вместо от GitHub | `docker compose -f docker-compose.server.yml up -d --build` |
| След промяна в `.env` | `docker compose -f docker-compose.server.yml up -d` |
| Какво върви | `docker compose -f docker-compose.server.yml ps` |
| Грешки на сървъра | `docker compose -f docker-compose.server.yml logs -f backend` |
| Спиране | `docker compose -f docker-compose.server.yml down` (данните остават) |
| Архив на базата | `cmd /c "docker compose -f docker-compose.server.yml exec -T db pg_dump -U sis sis > backup.sql"` |

`update.ps1` прави `git pull`, `docker compose pull` и `up -d`: рестартират се само контейнерите с нов образ, а
миграциите на базата минават сами при старта на backend. Новият образ е готов около 5 минути след сливане в `main`
(GitHub → Actions → „Docker images“).

**Автоматично обновяване на всеки 10 минути** (веднъж, в PowerShell от папката `Polli`):

```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PWD\deploy\update.ps1`""
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName "Polli update" -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew)
```

Кога е минало последно: `deploy\update.log`. Спиране: `Unregister-ScheduledTask -TaskName "Polli update"`.

Базата и качените снимки са в Docker томове (`pgdata`, `media`) и остават при спиране и обновяване.
**Не пускайте** `down -v`: то изтрива и тях.

## 7. Постоянен адрес (когато е нужен)

Трябва домейн в Cloudflare (напр. поддомейн `test.sisesthetics.com`, ако DNS на домейна се прехвърли в Cloudflare,
или евтин отделен домейн). Cloudflare → Zero Trust → Networks → Tunnels → Create tunnel (Cloudflared) → копирайте
токена → Public hostname: вашият адрес, Service `http://frontend:3000`. В `.env`:

```
TUNNEL_ARGS=tunnel --no-autoupdate run --token <токенът>
SITE_URL=https://test.sisesthetics.com
```

`SITE_URL` отива в линковете в имейлите и в разрешените адреси за формите.

## Вход на клиенти без имейл

Докато Brevo не е настроен, кодовете за вход не стигат до клиентите (виждат се в
`docker compose -f docker-compose.server.yml logs backend`). Само за тест може `LOGIN_ANY_CODE=true` в `.env`:
тогава всеки 6-цифрен код влиза в **който и да е** профил, затова не го оставяйте, когато линкът стане публично
известен.
