# OwnSteps

Ein Reisetagebuch für den eigenen Server: Fotos hochladen, Text dazu schreiben,
alles landet automatisch auf einer Karte und in einer Timeline. Wer mitlesen
soll, bekommt einen geheimen Link – ohne Account, ohne Registrierung.

- **Mobil zuerst** – zum Hochladen unterwegs genauso wie zum Lesen auf dem Sofa.
- **Ort und Zeit automatisch** – kommen aus den EXIF-Daten der Fotos.
- **Fotos bleiben bei dir** – nichts wird an Dritte ausgeliefert, Bilder sind
  nur mit Anmeldung oder gültigem Share-Link abrufbar.
- **Ein Container, eine Datei** – SQLite plus Bilderordner, das war's.

## Schnellstart

```bash
git clone <dein-repo> ownsteps && cd ownsteps
cp .env.example .env
```

Danach `.env` anpassen – mindestens `PUBLIC_URL` und `MAPTILER_KEY`. Dann:

```bash
docker compose up -d --build
```

Die App läuft auf Port 2555. Beim ersten Aufruf führt `/setup` durch das
Anlegen des ersten Accounts (entfällt, wenn `ADMIN_EMAIL` und
`ADMIN_PASSWORD` in der `.env` stehen oder die Anmeldung über OIDC läuft).

## Karte einrichten

OwnSteps nutzt MapTiler als Kartenquelle. Der kostenlose Tarif reicht für
privaten Gebrauch bequem aus:

1. Auf [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/) einen Key anlegen.
2. `MAPTILER_KEY=...` in die `.env` eintragen.

Der Key bleibt auf dem Server: Alle Kartenabrufe laufen über `/api/map`, damit
er nicht in geteilten Links auftaucht. Ohne Key zeigt die App eine einfache
OpenStreetMap-Karte – funktioniert, sieht aber deutlich schlichter aus.

## Anmeldung über Pocket ID

In Pocket ID einen OIDC-Client anlegen mit der Callback-URL:

```
https://deine-domain.de/api/auth/oidc/callback
```

Dann `OIDC_ISSUER`, `OIDC_CLIENT_ID` und `OIDC_CLIENT_SECRET` in die `.env`
eintragen. Auf der Anmeldeseite erscheint daraufhin der Button
„Mit Pocket ID anmelden".

Wer sich per OIDC anmeldet und dieselbe E-Mail-Adresse wie ein vorhandener
Account nutzt, landet automatisch in diesem Account. Der Passwort-Login bleibt
als Rückfallebene aktiv, falls Pocket ID mal nicht erreichbar ist.

Soll nicht jeder aus deiner Pocket-ID-Instanz Zugang bekommen, hilft
`OIDC_ALLOWED_EMAILS=du@beispiel.de,partnerin@beispiel.de`.

## Reverse Proxy

Hinter Caddy, Traefik oder nginx den Port in `docker-compose.yml` auf
`127.0.0.1:${HOST_PORT:-2555}:2555` beschränken, damit der Container nicht
direkt aus dem Netz erreichbar ist. Beispiel für Caddy:

```
reisen.beispiel.de {
    reverse_proxy 127.0.0.1:2555
}
```

Im Container läuft die App fest auf 2555; `HOST_PORT` in der `.env` ändert nur
den Port nach außen. `PORT` gehört dort **nicht** hinein – das würde den
Container-Port verstellen, während das Mapping unverändert bliebe.

**`PUBLIC_URL` auf die öffentliche Adresse setzen.** Daraus entstehen die
Share-Links, die Vorschaubilder und die OIDC-Callback-URL. Ohne den Wert
leitet OwnSteps die Adresse aus dem `Host`-Header ab – hinter einem Proxy
landet dann leicht eine interne Adresse in einem Link, den du verschickst.

Als Ziel im Proxy **nie die Container-IP** aus `docker inspect` eintragen: Die
ändert sich bei jedem Neustart, und die Weiterleitung ist danach tot. Je nach
Aufbau des Proxys gibt es zwei saubere Wege:

**Proxy oder Tunnel-Client im Host-Netz** (z.B. Pangolins `newt`, oder Caddy
und nginx direkt auf dem Server): Ziel ist `127.0.0.1:2555`, also der auf dem
Host gemappte Port. Dann in der `.env` zusätzlich

```
BIND_ADDRESS=127.0.0.1
```

setzen, damit der Port nur lokal und nicht offen im Netz erreichbar ist.

**Proxy als Container in einem Bridge-Netz** (Traefik, nginx-proxy-manager):
beide Container ins gleiche Netz hängen und als Ziel den Containernamen
`http://ownsteps:2555` verwenden. Das Gerüst dafür steht auskommentiert in
`docker-compose.yml`. Containernamen lassen sich nur innerhalb von
Bridge-Netzen auflösen – für einen Proxy im Host-Netz funktioniert das nicht.

Wichtig: `X-Forwarded-Proto` muss durchgereicht werden (Caddy und Traefik
machen das von sich aus), damit Share-Links mit `https://` erzeugt werden.
Alternativ `PUBLIC_URL` fest setzen – das hat immer Vorrang.

Für große Fotos sollte der Proxy Uploads bis 25 MB erlauben (nginx:
`client_max_body_size 25m;`).

## Wie es sich bedient

1. **Reise anlegen** – nur ein Name nötig.
2. **Beitrag hinzufügen** – Fotos auswählen, fertig. Ort und Zeitpunkt kommen
   aus den Bildern; der Beitrag ist ab dem ersten Foto gespeichert, auch wenn
   der Text erst später dazukommt.
3. **Teilen** – unter „Teilen" den Schalter umlegen und den Link verschicken.
   Optional zusätzlich mit Passwort. Ein neuer Link macht den alten ungültig.

Neben Fotos lassen sich auch **Videos** hochladen (bis 400 MB). Das Standbild
entsteht dabei im Browser; die Datei selbst wird unverändert gespeichert, es
wird also nichts umgerechnet.

Die 400 MB sind eine Speicher- und keine Formatgrenze: Der Server liest die
Datei am Stück ein und braucht dafür kurzzeitig etwa das Doppelte an
Arbeitsspeicher. Auf einem kleinen VPS ist das die eigentliche Grenze. Größere
Dateien lehnt der Editor gleich beim Auswählen ab, statt sie erst hochzuladen.
Steht ein Reverse Proxy davor, muss der große Uploads durchlassen – bei nginx
etwa `client_max_body_size 400m;`; bricht ein Upload ohne Eintrag im
Container-Log ab, liegt es fast immer an ihm.

Wer den Link hat, kann **kommentieren** – Name eintippen, Text schreiben, ohne
Account. Löschen können Kommentare nur angemeldete Autoren.

In der Timeline steht der **Ort** als Überschrift; eine eigene Überschrift gibt
es nicht. Pro Foto **und pro Video** lässt sich eine **Bildunterschrift**
hinterlegen, die in der Vollbildansicht unter dem Medium erscheint. Dort
blättert ein Tippen auf die rechte bzw. linke Seite weiter, ein Doppeltipp oder
zwei Finger zoomen.

Bei einem **Video** gehört der Tipp dem Abspielen. Weiter geht es dort durch
Wischen über das Bild oder über die Pfeile links und rechts, die bei Videos auf
jedem Gerät eingeblendet werden. Gesten auf der Bedienleiste des Videos bleiben
dem Spulen vorbehalten. Wird das Video über den Vollbildknopf in die Ansicht
des Browsers übergeben, zeigt dieser nur das Video – Unterschrift und Pfeile
sind dann erst nach dem Verlassen wieder da.

Die **Kartenansicht** hat unten eine Leiste, über die man die Stationen
durchblättert – die Karte zieht mit. Ein zweites Antippen springt zum Beitrag.

Fotos ohne GPS-Daten bekommen keinen automatischen Ort. Im Editor gibt es dafür
drei Wege: **„Mein Standort"** übernimmt die Position vom Gerät, das **Ortsfeld
sucht** beim Tippen (Vorschläge antippen setzt Ort und Kartenausschnitt), und
notfalls setzt ein Antippen der Karte den Punkt.

Eine Reise lässt sich nur löschen, wenn ihr Name zur Bestätigung eingetippt
wird – Fotos und Beiträge sind danach weg.

Beide Accounts arbeiten gemeinsam an allen Reisen; es gibt bewusst keine
Rechteverwaltung.

## Datensicherung

Alles Wichtige liegt im Ordner `data/`:

```
data/
├── ownsteps.db      # Reisen, Beiträge, Accounts
├── .secret          # Signiergeheimnis der Share-Links
└── uploads/         # Fotos in allen Größen
```

Ein Backup ist ein Kopieren dieses Ordners – am besten bei gestopptem
Container, damit die Datenbank in Ruhe ist:

```bash
docker compose stop
tar czf ownsteps-backup-$(date +%F).tar.gz data/
docker compose start
```

Jedes Foto wird als `thumb` (480px), `medium` (1280px) und `large` (2400px)
im WebP-Format abgelegt, dazu unverändert das Original. Die App zeigt immer
die Web-Größen; das Original liegt nur als Sicherung unter
`data/uploads/<id>/original` und lässt sich von dort kopieren. Wer Platz
sparen will, setzt `KEEP_ORIGINALS=false` – dann bleiben nur die Web-Größen.

## Aktualisieren

```bash
./deploy.sh
```

Das Skript holt die Änderungen, baut das Image neu und wartet, bis der
Container als gesund gemeldet wird; andernfalls gibt es die letzten Logzeilen
aus. Von Hand geht es genauso:

```bash
git pull && docker compose up -d --build
```

Schema-Änderungen werden beim Start automatisch angewendet. `.env` und `data/`
liegen nicht im Repository und bleiben bei einem Update unangetastet.

## Entwicklung

```bash
npm install
cp .env.example .env
npm run dev
```

Ohne `DATA_DIR` landen Datenbank und Fotos im Ordner `./data`.

## Technik

Next.js 16 (App Router) · SQLite über Drizzle · sharp für die Bildgrößen ·
exifr für GPS und Aufnahmezeit · MapLibre GL für die Karte · Tailwind CSS v4.

Wer am Code weiterarbeitet, findet in **[docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)**
das Datenmodell, die Abläufe hinter Upload, Zugriffsschutz und Anmeldung sowie
die Begründung zu allen getroffenen Entscheidungen.

## Bekannte Eigenheiten

- **HEIC vom iPhone:** Safari wandelt Fotos beim Hochladen meist automatisch in
  JPEG um. Klappt das nicht, hilft auf dem iPhone unter *Einstellungen →
  Kamera → Formate* die Einstellung „Maximale Kompatibilität".
- **Kein Geocoding ohne MapTiler-Key:** Ortsnamen wie „Bergen, Norwegen" werden
  über MapTiler ermittelt. Ohne Key bleibt das Feld leer und kann von Hand
  ausgefüllt werden.
