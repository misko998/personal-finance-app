# Moj Budžet — PWA za praćenje ličnih troškova

Mobilna web aplikacija (PWA) za budžet po mesecima. Radi u browseru, može da se doda na početni ekran telefona i tada izgleda i radi kao prava aplikacija — **offline, bez naloga i bez servera**. Svi podaci se čuvaju lokalno na telefonu (IndexedDB).

- Interfejs na srpskom (latinica), valuta RSD, iznosi `155.000`, datumi `09.10.2026`
- Svetla i tamna tema (automatski po sistemu ili ručno)
- Unos troška: **+ → iznos → kategorija → labela → Sačuvaj** (4 dodira + kucanje iznosa)

---

## 1. Struktura fajlova

```
budzet-pwa/
├── index.html               Kostur stranice: gornja traka, sadržaj, donja navigacija sa + dugmetom; PWA/iOS meta tagovi
├── manifest.webmanifest     PWA manifest: ime, ikonice, boje, "standalone" režim
├── sw.js                    Service worker: keš svih fajlova => radi offline; obaveštava o novoj verziji
├── css/
│   └── styles.css           Ceo izgled: tokeni boja (svetla/tamna tema), komponente, mobile-first raspored
├── icons/
│   ├── icon.svg             Izvorna ikonica (vektor)
│   ├── icon-maskable.svg    Izvor za maskable/iPhone ikonicu (pun kvadrat)
│   ├── icon-192.png         Ikonica za Android/Chrome
│   ├── icon-512.png         Velika ikonica (splash na Androidu)
│   ├── icon-maskable-512.png  Ikonica koju Android sme da iseče u krug/kvadrat
│   └── apple-touch-icon.png Ikonica za iPhone početni ekran (180×180)
└── js/
    ├── app.js               Ulazna tačka: učitavanje podataka, ruter (#pregled, #istorija…), prompt za novi mesec, registracija service worker-a
    ├── db.js                IndexedDB omotač (rezerva: localStorage) — getAll, put, delete, replaceAll
    ├── store.js             Podaci u memoriji + sve izmene (troškovi, prilivi, meseci, kategorije, labele), export/import i validacija backup-a
    ├── calc.js              Čiste funkcije obračuna: stanje po mesecima (dinamički prenos), dnevni prosek, potrošnja po kategorijama
    ├── seed.js              Predefinisane kategorije, potkategorije i početne labele
    ├── format.js            Formatiranje iznosa (155.000), datuma (dd.MM.yyyy), naziva meseci, srpska množina
    ├── forms.js             Bottom sheet forme: unos/izmena troška i priliva, početno stanje meseca sa prenosom
    ├── charts.js            SVG grafikoni bez biblioteka: donut (kategorije) i stubičasti (meseci)
    ├── ui.js                Bottom sheet, dijalog potvrde, toast poruke, polje za iznos i datum, tema
    ├── nav.js               Stanje interfejsa (izabrani mesec, filteri) i navigacija
    ├── icons.js             SVG ikonice interfejsa
    ├── backup.js            Izvoz JSON / CSV (Share sheet na telefonu), uvoz JSON
    ├── demo.js              Primer podataka za isprobavanje (3 meseca)
    └── views/
        ├── dashboard.js     Pregled meseca: stanje, kartice, donut, detalji kategorije, lista troškova/priliva
        ├── history.js       Istorija: grafikon po mesecima + lista svih meseci
        ├── categories.js    Kategorije: dodavanje, izmena, ikonica, potkategorije, labele, arhiviranje
        └── settings.js      Podešavanja: tema, backup, skladište, brisanje podataka
```

Nema build koraka, npm-a ni spoljnih biblioteka — fajlovi se postavljaju online tačno ovakvi kakvi jesu.

### Model podataka (IndexedDB baza `moj-budzet`)

| Store | Polja |
|---|---|
| `months` | `id` (YYYY-MM), `startingBalance`, `carryOver` (da/ne) |
| `incomes` | `id`, `monthId`, `amount`, `date`, `description` |
| `categories` | `id`, `name`, `icon`, `color`, `order`, `archived` |
| `subcategories` | `id`, `categoryId`, `name`, `order`, `archived` |
| `labels` | `id`, `categoryId`, `name`, `useCount`, `lastUsed`, `lastSubcategoryId` |
| `expenses` | `id`, `categoryId`, `subcategoryId`, `label`, `amount`, `date`, `note`, `createdAt` |
| `settings` | `key`, `value` (tema, poslednji backup, CSV separator…) |

### Kako se računa stanje (`js/calc.js`)

```
početno stanje meseca = uneti iznos (plata) + (prenos uključen ? krajnje stanje prethodnog meseca : 0)
trenutno / krajnje stanje = početno stanje + prilivi − troškovi
```

Ništa od ovoga se ne čuva ručno — sve se računa iz troškova i priliva. Prenos je **dinamički**: ako izmeniš trošak iz septembra, menja se krajnje stanje septembra, a samim tim i početno stanje oktobra i svih narednih meseci sa uključenim prenosom.

---

## 2. Pokretanje lokalno i testiranje

ES moduli i service worker ne rade kad se `index.html` otvori duplim klikom (`file://`), pa je potreban mali lokalni server.

**Korak 1 — raspakuj ZIP** u folder, npr. `Documents/budzet-pwa`.

**Korak 2 — pokreni server** iz tog foldera (izaberi jedno):

```bash
# Python (Windows/macOS/Linux)
cd budzet-pwa
python -m http.server 8080        # na Windows-u može i: py -m http.server 8080

# ili Node.js
npx serve -l 8080 .
```

Ili u VS Code-u instaliraj ekstenziju **Live Server** → desni klik na `index.html` → *Open with Live Server*.

**Korak 3 — otvori** `http://localhost:8080` u Chrome-u ili Edge-u.

**Korak 4 — testiraj kao telefon:** F12 → ikonica telefona (*Toggle device toolbar*) → izaberi *iPhone 14 Pro*. Korisni tabovi u DevTools-u:

- *Application → Manifest* — proveri ikonice i da je aplikacija instalabilna
- *Application → Service workers* — status offline keša (opcija *Offline* za test bez interneta)
- *Application → IndexedDB → moj-budzet* — vidiš sačuvane podatke

**Brzo isprobavanje:** Podešavanja → *Učitaj primer podataka* (dostupno samo dok je aplikacija prazna). Kasnije: Podešavanja → *Obriši sve podatke*.

**Na telefonu u istoj Wi-Fi mreži:** pronađi IP računara (`ipconfig` na Windows-u, `ifconfig`/`ip a` na macOS/Linux-u) i na telefonu otvori `http://192.168.x.x:8080`. Aplikacija radi, ali offline režim i instalacija traže HTTPS — za pravu instalaciju postavi je online (sledeći korak).

---

## 3. Besplatno postavljanje online

Sve tri opcije daju HTTPS adresu, što je uslov za instalaciju i offline rad.

### Opcija A — GitHub Pages (preporuka)

1. Napravi nalog na [github.com](https://github.com) (ako ga nemaš).
2. **New repository** → ime `budzet-pwa` → *Public* → *Create repository*.
3. Klikni *uploading an existing file* i prevuci **sadržaj** foldera `budzet-pwa` (da `index.html` bude u korenu repozitorijuma, ne u podfolderu) → *Commit changes*.
   Ili preko terminala:
   ```bash
   cd budzet-pwa
   git init
   git add .
   git commit -m "Moj Budžet v1.0.0"
   git branch -M main
   git remote add origin https://github.com/TVOJE-IME/budzet-pwa.git
   git push -u origin main
   ```
4. Repozitorijum → **Settings → Pages** → *Source: Deploy from a branch* → *Branch: main*, folder */ (root)* → *Save*.
5. Posle 1–2 minuta aplikacija je na `https://TVOJE-IME.github.io/budzet-pwa/`.

> Sve putanje u aplikaciji su relativne, pa radi i u podfolderu `/budzet-pwa/`.
> Napomena: kod na javnom repozitorijumu je javan, ali **tvoji podaci nisu** — oni ostaju samo na telefonu.

### Opcija B — Netlify Drop (najbrže, bez git-a)

1. Otvori [app.netlify.com/drop](https://app.netlify.com/drop) i prijavi se (besplatno).
2. Prevuci ceo folder `budzet-pwa` na stranicu.
3. Dobijaš adresu tipa `https://nesto-nasumicno.netlify.app` — u *Site configuration → Change site name* promeni je npr. u `moj-budzet-misko`.
4. Za novu verziju: *Deploys* → prevuci folder ponovo.

### Opcija C — Vercel

1. Postavi kod na GitHub (koraci 1–3 iz opcije A).
2. Na [vercel.com](https://vercel.com) → *Add New → Project* → izaberi repozitorijum.
3. *Framework Preset: Other*; *Build Command* i *Output Directory* ostavi prazne (služe se fajlovi iz korena) → *Deploy*.
   (Alternativa iz terminala: `npx vercel` u folderu projekta.)

### Objavljivanje nove verzije

Kad promeniš bilo koji fajl, **povećaj `VERSION` u `sw.js`** (npr. `1.0.0` → `1.0.1`) pa ponovo postavi fajlove. Aplikacija na telefonu će pri sledećem otvaranju prikazati *„Dostupna je nova verzija → Osveži"*. Bez promene verzije telefon nastavlja da koristi staru verziju iz keša. Ako dodaš novi `.js` fajl, dodaj ga i u listu `ASSETS` u `sw.js`.

---

## 4. Instalacija na telefon

### iPhone (Safari)

1. Otvori adresu aplikacije u **Safari-ju** (na iOS 16.4+ radi i iz Chrome-a/Edge-a preko istog Share menija).
2. Dodirni dugme **Podeli** (kvadrat sa strelicom nagore) u donjoj traci.
3. Skroluj i izaberi **Dodaj na početni ekran** (*Add to Home Screen*).
4. Ime ostavi „Budžet" → **Dodaj**.
5. Otvaraj aplikaciju **isključivo preko ikonice** na početnom ekranu.

> **Važno za iPhone:** aplikacija na početnom ekranu ima **odvojeno skladište** od Safari taba. Ako si već unosio podatke u Safari-ju, tamo uradi *Podešavanja → Izvezi backup*, pa u instaliranoj aplikaciji *Uvezi backup*. iOS briše podatke sajtova koji se ne otvaraju nekoliko nedelja; za aplikaciju na početnom ekranu računa se samo vreme kad je zaista koristiš, pa uz redovno korišćenje podaci ostaju. Ipak, backup je jedina sigurna zaštita.

### Android (Chrome)

1. Otvori adresu u **Chrome-u**.
2. Pojaviće se *„Instaliraj aplikaciju"* — ili meni **⋮ → Instaliraj aplikaciju** (*Install app* / *Add to Home screen*).
3. Potvrdi **Instaliraj**. Ikonica se pojavljuje na početnom ekranu i u listi aplikacija.

### Prelazak na novi telefon

Stari telefon: *Podešavanja → Izvezi backup (JSON)* → sačuvaj u Fajlove/iCloud/Google Drive ili pošalji sebi mejlom.
Novi telefon: instaliraj aplikaciju → *Podešavanja → Uvezi backup (JSON)*.

---

## 5. Pretpostavke

- **Mesec je kalendarski** (1. do poslednjeg dana), id `YYYY-MM`.
- **Iznosi su u celim dinarima** (bez para), do 10 cifara.
- **Prenos ostatka je dinamički** i nudi se samo ako postoji prethodni mesec; prvi mesec je bez prenosa. Prenos može biti i negativan (ako je prethodni mesec završen u minusu) — tada je to jasno označeno.
- **Preskočen mesec** (bez unetog početnog stanja) ima osnovu 0 i ostatak se „propušta" u sledeći mesec.
- **Trošak pre prvog meseca** (npr. septembarski račun uneseš u oktobru, a septembar nije podešen) beleži se u taj mesec; umesto upozorenja o minusu prikazuje se da početno stanje nije uneto.
- **Labela nije obavezna** (zbog brzine unosa). U listi se prikazuje labela, a ako je nema — potkategorija ili kategorija.
- Labela **pamti poslednju potkategoriju** (izbor „Kirija" sam izabere potkategoriju Kirija), a predlozi su sortirani po učestalosti.
- **Preimenovanje labele** menja tekst i u svim troškovima te kategorije (ako novo ime već postoji, labele se spajaju). **Brisanje labele** je samo uklanja iz brzih izbora; postojeći troškovi zadržavaju tekst.
- Pravilo „ne briše se ako ima troškove, već se arhivira" primenjeno je i na **potkategorije**.
- **% potrošenog budžeta** = potrošeno / (početno stanje + prilivi).
- **Prosečna dnevna potrošnja** = potrošeno / protekli dani (uključujući danas); **„Možeš dnevno"** = trenutno stanje / preostali dani (uključujući danas).
- **Uvoz JSON-a zamenjuje** sve postojeće podatke (nema spajanja) — pre zamene se traži potvrda.
- **CSV** sadrži samo troškove; separator `;` (Excel na srpskom) ili `,` (Excel na engleskom) bira se u Podešavanjima; iznos je čist broj da bi ga Excel sabirao.
- Donut prikazuje najviše 7 kategorija, ostale spaja u „Ostale kategorije"; stubičasti grafikon prikazuje poslednjih 12 meseci.
- Pitanje za novi mesec pojavljuje se **kad otvoriš aplikaciju** u novom mesecu (PWA na iPhone-u ne može pouzdano da šalje podsetnike u tačno vreme).
- Ikonice kategorija su emoji (mogu da se promene ili ukucaju po želji).
- Podržani su iOS/Safari 15+ i aktuelni Chrome, Edge i Firefox.

---

## 6. Ideje za sledeću verziju

1. **Ponavljajući troškovi** — kirija, internet, teretana se automatski dodaju svakog meseca (uz potvrdu).
2. **Limit po kategoriji** — npr. Prodavnice 40.000 RSD mesečno, sa upozorenjem na 80% i 100%.
3. **Skeniranje QR koda sa fiskalnog računa** — kamera čita QR kod računa (e-fiskalizacija), pa se iznos, datum i prodavnica popunjavaju sami.
4. **Pretraga i filteri** — po labeli, napomeni, iznosu i periodu (npr. „koliko sam potrošio u Lidl-u ove godine").
5. **Isključivanje kategorije iz dnevnog proseka** — da kirija ne kvari „koliko mogu dnevno".
6. **Spajanje pri uvozu** (merge) umesto zamene, i podsetnik za backup na X dana.
7. **Više novčanika** — keš, tekući račun, kartica, štednja, sa prenosima između njih.
8. **Sinhronizacija između uređaja** — opcioni nalog (npr. Supabase ili Firebase) za telefon + računar.
9. **Godišnji izveštaj** — poređenje kategorija mesec-na-mesec i godina-na-godinu.
10. **Zaključavanje PIN-om ili Face ID-om** (WebAuthn).
11. **Promena redosleda kategorija** prevlačenjem.
12. **Više valuta** (EUR) sa kursom NBS za putovanja.
