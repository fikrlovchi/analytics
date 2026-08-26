# buyodashboard — Kassa analitika dashboardi

`buyodashboard.fikrlovchi.uz` uchun analitika paneli (Node/Express + EJS + better-sqlite3,
`fikrlovchi_project_panel` uslubida). AppSheet DB va Kassa (qo'lda jadval) ma'lumotini
Google Sheets'dan **SQLite'ga sinxronlaydi** va tez o'qiydigan grafik/jadvallar bilan ko'rsatadi.

Bu **moneyReport 2-bosqichi**. 1-bosqich — Telegram bot (`../`).

## Imkoniyatlar

- **KPI**: tanlangan davr uchun Приход / Расход / Итого / operatsiyalar soni
- **Расход по категориям** — doughnut grafik + jadval
- **Динамика по дням** — kunlik приход/расход bar grafik
- **Расход по сотрудникам** — top-10 xodim
- **Средние по категориям** — oy (30 kun) va hafta (7 kun) bo'yicha o'rtacha/max/min
- **Сверка AppSheet ↔ Касса** — kunlik solishtiruv, nomuvofiq kunlar qizil belgilanadi
- **Filtrlar**: sana oralig'i (+ 7/30/90 kun presetlari), **ko'p tanlovli** kategoriya va xodim
- **Kategoriya blok filtrga bo'ysunadi** — tanlangan kategoriyalargina doughnut/jadvalda
- **Drill-down** — kategoriya qatoriga yoki xodim grafigi ustuniga bosilsa, agregatsiyani
  tashkil etgan aynan operatsiyalar ochiladi (`/api/category-ops`, `/api/employee-ops`)
- **Yozuvlarni tanlash (Категории)** — ochilgan yozuvlar oldida checkbox. Belgilanganlar
  yig'indisi (Расход / Приход / Итого) ekran pastidagi suzuvchi panelda ko'rinadi;
  tanlov bir nechta kategoriya bo'ylab yig'iladi va kategoriya yopilib-ochilsa saqlanadi.
  Sarlavhadagi checkbox — kategoriyadagi hammasini belgilash
- **Tanlanganlarni yuklab olish** — panel'dagi «⬇ .xlsx» faqat belgilangan yozuvlarni
  Excel qilib beradi (`POST /export/selection.xlsx`, pastda «ИТОГО» qatori bilan)
- **.xlsx eksport** — har bir blok uchun formatlangan Excel (`/export/:block.xlsx`, exceljs;
  bloklar: categories, trend, employees, stats, reconciliation), fayl nomlari **rus tilida**
- **To'liq yuklama** — «Выгрузить (AppSheet + Касса)» tugmasi filtrlangan ma'lumotni ikki
  varaqli xlsx qilib beradi (AppSheet операции + Касса)
- **Mavzu** — Light (qaymoqrang) / Dark (AMOLED qora) toggle, localStorage'da saqlanadi.
  Native kalendar/scrollbar ham mavzuga mos (`color-scheme`)
- **Mavzu foni** — «🖼 Фон» orqali har bir mavzu (light/dark) uchun alohida fon rasmini
  yuklash (fayl tanlash yoki drag-drop). Serverда `data/backgrounds/` da saqlanadi
- **Sana formati** — hamma joyda `dd.mm.yyyy` (maxsus 📅 widget, native picker showPicker bilan)
- **Login** bilan himoyalangan (session + bcrypt), 5 marta xato → 5 daq blok

## Ma'lumot oqimi

Google Sheets → (googleapis, service-account) → **SQLite** (`data/dashboard.db`) → EJS/Chart.js.
Sinxronizatsiya: server ishga tushganda + har `SYNC_INTERVAL_MIN` daqiqada + topbar'dagi
«Синхронизировать» tugmasi orqali qo'lda. Kassa summalari ming so'mda → ×1000.

## Mahalliy ishga tushirish

```bash
cd dashboard
npm install
# better-sqlite3 native binary muammosi bo'lsa:
npm rebuild better-sqlite3
cp .env.example .env      # to'ldiring (pastga qarang)
npm run sync              # bir marta sinxronlab ko'rish (ixtiyoriy)
npm start                 # http://localhost:4043
```

Standart test login: **admin / buyo2026** — `ADMIN_PASSWORD_HASH` ni almashtiring:
```bash
npm run hash-password "yangi_parol"    # natijani .env ga qo'ying
```

## `.env`

| O'zgaruvchi | Izoh |
|-------------|------|
| `PORT` | Server porti (default 4043) |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `COOKIE_SECURE` | serverда (nginx TLS) `true`, mahalliy HTTP test uchun `false` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | login va bcrypt hash |
| `OAUTH_FILE` | oauth.json yo'li (uzbuyo@gmail.com OAuth). **Loyihaning o'zida** tursin: `oauth.json` (= `/root/analytics/oauth.json`) |
| `APPSHEET_SPREADSHEET_ID` / `MANUAL_SPREADSHEET_ID` | Sheets ID'lari |
| `SYNC_INTERVAL_MIN` | Avto-sinxronlash oralig'i (daqiqa) |
| `KASSA_SYNC_DAYS` | Kassa uchun necha kunlik listlar sinxronlanadi (default 90) |
| `MANUAL_UNIT_SCALE` | Kassa ming→so'm koeffitsienti (1000) |

## Serverга o'rnatish (git orqali, analytics.fikrlovchi.uz, port 4043)

GitHub repo: `git@github.com:fikrlovchi/analytics.git`. Serverда `/root/analytics` papkasiga
klonlanadi. `.env` va `credentials.json` git'ga KIRMAYDI — ularni qo'lda joylaymiz.

```bash
# --- serverда ---
cd /root
git clone git@github.com:fikrlovchi/analytics.git analytics
cd analytics
npm install --omit=dev
npm rebuild better-sqlite3            # Node 20 LTS uchun tayyor binary yuklaydi

# Google Sheets — uzbuyo@gmail.com OAuth.
# oauth.json ni analytics'ning O'ZIGA nusxalang (boshqa loyihaga yo'l bermang):
npm run import-oauth                       # ma'lum yo'llardan avtomatik topadi
# yoki aniq manba bilan:
npm run import-oauth -- /root/mcorders/oauth.json

# .env yarating (COOKIE_SECURE=true, PORT=4043, OAUTH_FILE=...)
cp .env.example .env && nano .env
node src/scripts/hash-password.js "parol"   # ADMIN_PASSWORD_HASH uchun

# systemd
sudo cp deploy/analytics.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now analytics
sudo systemctl status analytics
journalctl -u analytics -f            # boshlang'ich sync loglari

# nginx (4043 -> analytics.fikrlovchi.uz)
sudo cp deploy/nginx-analytics.fikrlovchi.uz.conf /etc/nginx/sites-available/analytics.fikrlovchi.uz.conf
sudo ln -s /etc/nginx/sites-available/analytics.fikrlovchi.uz.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS
sudo certbot --nginx -d analytics.fikrlovchi.uz
# .env da COOKIE_SECURE=true bo'lsin, so'ng: sudo systemctl restart analytics
```

Keyingi yangilanishlar: `cd /root/analytics && git pull && npm install --omit=dev && sudo systemctl restart analytics`

### `oauth.json` — faqat analytics ichida

Kalit fayl **shu loyihaning ildizida** turishi kerak: `/root/analytics/oauth.json`.
Ilgari `.env` da `OAUTH_FILE=/root/uzumOrderToMC/oauth.json` turgan edi; o'sha loyiha
`mcorders` ga almashtirilgach sinxronizatsiya `ENOENT: ... /root/uzumOrderToMC/oauth.json`
xatosi bilan to'xtab qolgan. Tuzatish:

```bash
cd /root/analytics
npm run import-oauth -- /root/mcorders/oauth.json   # yoki argumentsiz: avtomatik qidiradi
sed -i 's|^OAUTH_FILE=.*|OAUTH_FILE=oauth.json|' .env
sudo systemctl restart analytics
journalctl -u analytics -n 30 --no-pager            # "[sheets] OAuth fayl: ..." qatorini tekshiring
```

Zaxira sifatida `src/config.js` dagi `OAUTH_CANDIDATES` ro'yxati bo'ylab ham qidiriladi
(`<ROOT>/oauth.json` → `/root/mcorders` → `/root/uzumPDFs` → eski `/root/uzumOrderToMC`),
shuning uchun bitta loyiha ko'chirilsa ham panel ishlashda davom etadi.

DNS: `analytics.fikrlovchi.uz` → server IP (A-record) qo'shilgan.

## Fayllar

| Yo'l | Vazifasi |
|------|----------|
| `src/server.js` | Express + session + davriy sync |
| `src/sheets/{client,parse,sync}.js` | Google Sheets → SQLite |
| `src/services/analytics.js` | SQLite agregatsiya so'rovlari |
| `src/routes/*` | auth, dashboard, sync |
| `src/views/*` | login, dashboard (EJS) |
| `public/{style.css,app.js,vendor/chart.umd.min.js}` | frontend + grafiklar |
| `src/db/migrations/001_init.sql` | SQLite sxema |
| `src/scripts/import-oauth.js` | oauth.json ni loyiha ichiga nusxalash (`npm run import-oauth`) |
