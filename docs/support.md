# Support – OwnSteps

[English](#english) · [Deutsch](#deutsch)

---

## English

OwnSteps is a travel journal for your own server: photos and a few lines go
onto a map and into a timeline, and family and friends follow along through
a link. The app is free, has no in-app purchases, no ads and no tracking.

### Contact

- **Email:** [feedback@mail.mueller.ad](mailto:feedback@mail.mueller.ad) – usually answered within a few days
- **Bug reports and ideas:** [GitHub issues](https://github.com/RainerZufall00/ownsteps/issues)

### Getting started

**Writing about your own trips**

1. Set up an OwnSteps server – one Docker container, see the
   [quick start](https://github.com/RainerZufall00/ownsteps#-quick-start).
2. Open the app, enter the server's address, e.g. `trips.example.com`, and sign in.
3. Tap **+** to create a trip, then add steps with photos.

**Following someone else's trip**

Tap **Follow a trip with a link** on the welcome screen and paste the link the
travellers sent you, or simply open the link on your iPhone. You don't need an
account or a server of your own.

### Frequently asked questions

**Do I need my own server?**
To write: yes. OwnSteps keeps your photos on a server you control instead of
handing them to a company. It runs on a NAS, a Raspberry Pi or a small virtual
server. To read along: no, a link is enough.

**The app can't connect to my server.**
Open the same address in Safari on your iPhone. If that doesn't work either,
the server isn't reachable from where you are – check the reverse proxy and
`PUBLIC_URL`. The app needs HTTPS; plain HTTP only works inside your home
network.

**Where do place and time come from?**
From the photos' EXIF data. If a photo has no location, use **My location** or
**On the map** when writing the step.

**I don't get notifications.**
There is no push service: the app checks your servers in the background when
iOS allows it. Open the app now and then, or look at the bell – it lists
everything new since your last visit.

**Is my data shared with the developer?**
No. The app only talks to the servers you enter. See the
[Privacy Policy](privacy).

---

## Deutsch

OwnSteps ist ein Reisetagebuch für deinen eigenen Server: Fotos und ein paar
Zeilen landen auf einer Karte und in einer Zeitleiste, Familie und Freunde
lesen per Link mit. Die App ist kostenlos, ohne In-App-Käufe, Werbung oder
Tracking.

### Kontakt

- **E-Mail:** [feedback@mail.mueller.ad](mailto:feedback@mail.mueller.ad) – Antwort meist innerhalb weniger Tage
- **Fehler melden und Ideen:** [GitHub-Issues](https://github.com/RainerZufall00/ownsteps/issues)

### Erste Schritte

**Über eigene Reisen schreiben**

1. Einen OwnSteps-Server einrichten – ein Docker-Container, siehe
   [Schnellstart](https://github.com/RainerZufall00/ownsteps#-quick-start).
2. App öffnen, die Adresse des Servers eingeben, z. B. `trips.example.com`, und anmelden.
3. Mit **+** eine Reise anlegen und Beiträge mit Fotos hinzufügen.

**Der Reise von jemand anderem folgen**

Tippe auf dem Startbildschirm auf **Einer Reise per Link folgen** und füge den
Link der Reisenden ein – oder öffne den Link einfach auf dem iPhone. Ein
eigenes Konto oder einen eigenen Server brauchst du nicht.

### Häufige Fragen

**Brauche ich einen eigenen Server?**
Zum Schreiben ja. OwnSteps legt deine Fotos auf einen Server, den du
kontrollierst, statt sie einer Firma zu geben. Er läuft auf einem NAS, einem
Raspberry Pi oder einem kleinen virtuellen Server. Zum Mitlesen nein, da
reicht ein Link.

**Die App verbindet sich nicht mit meinem Server.**
Öffne dieselbe Adresse in Safari auf dem iPhone. Klappt das auch nicht, ist
der Server von dort aus nicht erreichbar – prüfe Reverse Proxy und
`PUBLIC_URL`. Die App braucht HTTPS; einfaches HTTP geht nur im Heimnetz.

**Woher kommen Ort und Zeit?**
Aus den EXIF-Daten der Fotos. Hat ein Foto keinen Ort, nimm beim Schreiben
**Mein Standort** oder **Auf der Karte**.

**Ich bekomme keine Mitteilungen.**
Es gibt keinen Push-Dienst: Die App fragt deine Server im Hintergrund ab, wenn
iOS es zulässt. Öffne die App ab und zu oder schau auf die Glocke – dort steht
alles Neue seit deinem letzten Besuch.

**Werden meine Daten mit dem Entwickler geteilt?**
Nein. Die App spricht nur mit den Servern, die du angibst. Siehe die
[Datenschutzerklärung](privacy).
