#!/usr/bin/env node
// Fills an OwnSteps instance with three demo trips through /api/v1 – for the
// App Store screenshots and the App Review demo instance (D25 in
// docs/ROADMAP.md). The photos come from Unsplash (Unsplash License, credited
// below and in the README); they're downloaded once into a cache folder.
//
//   node scripts/seed-demo.mjs --server http://localhost:2555 \
//     --email demo@example.com --password '…' [--lang de] [--cache .demo-photos]
//
// Run it against an empty instance: it adds trips, it doesn't replace any.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    server: { type: "string", default: "http://localhost:2555" },
    email: { type: "string" },
    password: { type: "string" },
    lang: { type: "string", default: "en" },
    cache: { type: "string", default: ".demo-photos" },
  },
});
if (!args.email || !args.password) {
  console.error("Usage: node scripts/seed-demo.mjs --server URL --email EMAIL --password PASSWORD [--lang en|de]");
  process.exit(1);
}
const lang = args.lang === "de" ? "de" : "en";
const server = args.server.replace(/\/$/, "");

// Unsplash photo → [id, path on images.unsplash.com, photographer].
const P = {
  lisbonTram: ["2N0PVuB0byQ", "photo-1590941761838-60179f0ed248", "Paulo Evangelista"],
  lisbonView: ["xmVC-K5U268", "photo-1653580978823-2f087049fa04", "Lisha Riabinina"],
  lisbonSunset: ["cnzxmWR8FL8", "photo-1609146615277-937384bb2126", "Polina Kocheva"],
  nata: ["mhhOBO9pfuE", "photo-1716360806681-b4defdfba134", "Magdalena Raczka"],
  pena: ["ar9jizD0V88", "photo-1740607392547-e05ecb1a196f", "Dmitry Voronov"],
  penaGate: ["tDIU7h2swns", "photo-1650462817648-106f4640e636", "Pedro Souto"],
  roca: ["Ndrr2-f5pFA", "photo-1543163480-b7868f961533", "Benjamin Voros"],
  rocaCliffs: ["etbzVIrn1nc", "photo-1568128727717-c033c9a2f440", "Josè Maria Sava"],
  obidosWall: ["JVT0Dj_8VhA", "photo-1696535201883-c1d76a6b22cc", "Andrey Masiero"],
  obidosStreet: ["zrS1BMZjvyM", "photo-1697394491967-c6faf458ced7", "Hasmik Ghazaryan Olson"],
  nazareFort: ["UKiWegFZLD4", "photo-1696535201405-f66ca8ce2c5b", "Andrey Masiero"],
  nazareLight: ["IEtkp2m8QxA", "photo-1591032347857-021138055749", "Helio Dilolwa"],
  portoBridge: ["g3O3xWspoN4", "photo-1569959220744-ff553533f492", "Daniel Seßler"],
  portoBoats: ["6ckFibuzLAU", "photo-1555881400-89d5a9c86668", "Nick Karvounis"],
  portoRibeira: ["mVq5nE3Yahw", "photo-1591040973846-61888c2de010", "Ekin-Fidel Tanriverdi"],
  douroBend: ["DSB4TyuHLr0", "photo-1693318827518-0c8ccbc59593", "Thimo van Leeuwen"],
  douroTerraces: ["3nYTPpTSbPE", "photo-1630509802685-d073f8f4e006", "Bruno Ferreira"],
  piedade: ["WJQ39Q1rpgA", "photo-1703194887679-406a9b5e7cf6", "Sokmean Nou"],
  piedadeStairs: ["kaFx7IHy-WA", "photo-1703028408757-a95781e09832", "Tobias Pfeifer"],
  piedadeRocks: ["WYP8K_YNuN0", "photo-1593897810048-0195fd308ee6", "Shreyas Nair"],
  reykjavik: ["geYUKmAKZp0", "photo-1606130503037-6a8ef67c9d2d", "Einar H. Reynis"],
  reykjavikRoofs: ["N1ONXKUAiGU", "photo-1608468716860-5566b7671ea3", "Tom Podmore"],
  seljalandsfoss: ["ycWERAjwEAQ", "photo-1619165822682-0bc1739fceba", "Pavol Svantner"],
  seljalandsfossGreen: ["zNN6ubHmruI", "photo-1476610182048-b716b8518aae", "Robert Lukeman"],
  vik: ["BoEA8INz7jQ", "photo-1540327032271-a2861b78eb89", "Shadman Sakib"],
  vikColumns: ["IT6MIkeDr3o", "photo-1680345540388-0f78ec6eaf2a", "With Paul"],
  jokulsarlon: ["_H_0NxohRqU", "photo-1564309288025-c391d89444eb", "Ankit Sood"],
  jokulsarlonIce: ["PiI8ahvjRI8", "photo-1627731130149-4933d251871d", "Lisa Hanly"],
  kirkjufell: ["t1N6iM0U9zc", "photo-1595742744735-415fc20ef88f", "Yves Alarie"],
  aurora: ["Hn8N4I4eHA0", "photo-1509529711801-deac231925ac", "Joshua Earle"],
  braies: ["T7K4aEPoGGk", "photo-1501785888041-af3ef285b470", "Pietro De Grandi"],
  braiesBoat: ["O453M2Liufs", "photo-1476514525535-07fb3b4ae5f1", "Luca Bravo"],
  treCime: ["1o4Z1EwCkaY", "photo-1533135404995-a618910b7b6f", "Neil Rosenstech"],
  seceda: ["NRh3WekkeOA", "photo-1707234287177-39914cab66f0", "Luca"],
};

// Texts per language: [en, de].
const t = (en, de) => (lang === "de" ? de : en);

const trips = [
  {
    title: t("Iceland Ring Road", "Island – Ringstraße"),
    summary: t("Ten days, one camper, Route 1 all the way round.", "Zehn Tage, ein Camper, einmal die Route 1 rundherum."),
    startDate: "2025-08-10",
    endDate: "2025-08-20",
    steps: [
      { place: "Reykjavík", lat: 64.1466, lon: -21.9426, at: "2025-08-10T18:30:00Z",
        body: t("Landed, picked up the camper and went straight up Hallgrímskirkja. The light at ten in the evening is unreal.",
                "Gelandet, Camper abgeholt und direkt auf die Hallgrímskirkja. Das Licht um zehn Uhr abends ist unwirklich."),
        photos: [P.reykjavik, P.reykjavikRoofs] },
      { place: "Seljalandsfoss", lat: 63.6156, lon: -19.9886, at: "2025-08-11T15:10:00Z",
        body: t("You can walk behind the waterfall. Rain jacket on, completely soaked anyway.",
                "Man kann hinter den Wasserfall laufen. Regenjacke an, trotzdem klatschnass."),
        photos: [P.seljalandsfoss, P.seljalandsfossGreen] },
      { place: "Vík", lat: 63.4043, lon: -19.0446, at: "2025-08-12T11:00:00Z",
        body: t("Black sand, basalt columns and a lot of wind. Kept a respectful distance from the sneaker waves.",
                "Schwarzer Sand, Basaltsäulen und sehr viel Wind. Von den Sneaker Waves haben wir respektvoll Abstand gehalten."),
        photos: [P.vik, P.vikColumns] },
      { place: "Jökulsárlón", lat: 64.0784, lon: -16.2306, at: "2025-08-14T09:40:00Z",
        body: t("Icebergs drifting out to sea, seals in between. We stayed three hours instead of one.",
                "Eisberge treiben aufs Meer hinaus, dazwischen Robben. Aus einer Stunde wurden drei."),
        photos: [P.jokulsarlon, P.jokulsarlonIce] },
      { place: "Kirkjufell", lat: 64.9416, lon: -23.3066, at: "2025-08-19T23:30:00Z",
        body: t("Last night, and the sky put on a show. Northern lights over Kirkjufell – no words.",
                "Letzte Nacht, und der Himmel legt los. Polarlichter über dem Kirkjufell – sprachlos."),
        photos: [P.kirkjufell, P.aurora] },
    ],
  },
  {
    title: t("Dolomites", "Dolomiten"),
    summary: t("A long weekend of hiking in South Tyrol.", "Ein langes Wanderwochenende in Südtirol."),
    startDate: "2026-07-03",
    endDate: "2026-07-06",
    steps: [
      { place: "Lago di Braies", lat: 46.6946, lon: 12.0855, at: "2026-07-03T06:45:00Z",
        body: t("Up at five to beat the crowds. Worth it: the lake all to ourselves for an hour.",
                "Um fünf aufgestanden, um vor den Massen da zu sein. Hat sich gelohnt: eine Stunde lang der See ganz für uns."),
        photos: [P.braies, P.braiesBoat] },
      { place: "Tre Cime di Lavaredo", lat: 46.6186, lon: 12.3027, at: "2026-07-04T20:30:00Z",
        body: t("Night at the Rifugio Locatelli. Milky Way right above the three peaks.",
                "Nacht auf dem Rifugio Locatelli. Die Milchstraße direkt über den drei Zinnen."),
        photos: [P.treCime] },
      { place: "Seceda", lat: 46.6006, lon: 11.7243, at: "2026-07-05T10:15:00Z",
        body: t("The famous ridge. Clouds came and went every five minutes.",
                "Der berühmte Grat. Alle fünf Minuten kamen und gingen die Wolken."),
        photos: [P.seceda] },
    ],
  },
  {
    title: t("Portugal Roadtrip", "Roadtrip Portugal"),
    summary: t("Two weeks along the coast, from Lisbon up to Porto and down to the Algarve.",
               "Zwei Wochen die Küste entlang, von Lissabon hoch nach Porto und runter an die Algarve."),
    startDate: "2026-09-05",
    endDate: "2026-09-19",
    share: true,
    steps: [
      { place: t("Lisbon", "Lissabon"), lat: 38.7139, lon: -9.1335, at: "2026-09-05T17:20:00Z",
        body: t("Landed, dropped the bags and took tram 28 up to the Miradouro. First pastel de nata within the hour – the trip has officially started.",
                "Gelandet, Taschen abgestellt und mit der 28 hoch zum Miradouro. Das erste Pastel de Nata nach einer Stunde – der Urlaub hat offiziell begonnen."),
        photos: [[...P.lisbonTram, t("Tram 28, of course", "Natürlich die 28")], P.lisbonView,
                 [...P.nata, t("Still warm, with cinnamon", "Noch warm, mit Zimt")], P.lisbonSunset] },
      { place: "Sintra", lat: 38.7876, lon: -9.3906, at: "2026-09-07T11:30:00Z",
        body: t("Pena Palace looks like someone mixed every colour in the box. Went early, glad we did.",
                "Der Palácio da Pena sieht aus, als hätte jemand alle Farben aus dem Kasten gemischt. Früh hin – zum Glück."),
        photos: [P.pena, P.penaGate] },
      { place: "Cabo da Roca", lat: 38.7804, lon: -9.4989, at: "2026-09-07T18:40:00Z",
        body: t("The westernmost point of mainland Europe. Next stop: America.",
                "Der westlichste Punkt des europäischen Festlands. Nächster Halt: Amerika."),
        photos: [P.roca, P.rocaCliffs] },
      { place: "Óbidos", lat: 39.3606, lon: -9.1571, at: "2026-09-09T15:00:00Z",
        body: t("Walked once around the town wall. Ginjinha in a chocolate cup at the end.",
                "Einmal auf der Stadtmauer rundherum. Zum Schluss Ginjinha im Schokobecher."),
        photos: [P.obidosWall, P.obidosStreet] },
      { place: "Nazaré", lat: 39.6046, lon: -9.0857, at: "2026-09-10T17:50:00Z",
        body: t("No giant waves in September, but the light at the lighthouse made up for it.",
                "Keine Riesenwellen im September, aber das Licht am Leuchtturm hat alles wettgemacht."),
        photos: [P.nazareFort, P.nazareLight] },
      { place: "Porto", lat: 41.1408, lon: -8.6111, at: "2026-09-12T19:10:00Z",
        body: t("Francesinha for lunch, port tasting in Gaia, sunset on the Dom Luís I bridge. Best day so far.",
                "Francesinha zum Mittag, Portweinprobe in Gaia, Sonnenuntergang auf der Dom-Luís-Brücke. Bester Tag bisher."),
        photos: [P.portoBridge, [...P.portoBoats, t("Rabelo boats in Gaia", "Rabelo-Boote in Gaia")], P.portoRibeira] },
      { place: t("Douro Valley", "Douro-Tal"), lat: 41.1923, lon: -7.5466, at: "2026-09-14T14:20:00Z",
        body: t("Terraced vineyards as far as you can see. The harvest is on, everyone's busy.",
                "Weinterrassen, so weit das Auge reicht. Gerade ist Weinlese, alle sind beschäftigt."),
        photos: [P.douroBend, P.douroTerraces] },
      { place: "Lagos", lat: 37.0801, lon: -8.6692, at: "2026-09-17T10:30:00Z",
        body: t("Down the 182 steps at Ponta da Piedade and out by kayak through the arches. Water as clear as a pool.",
                "Die 182 Stufen an der Ponta da Piedade runter und mit dem Kajak durch die Felsbögen. Wasser klar wie im Pool."),
        photos: [P.piedade, P.piedadeStairs, P.piedadeRocks] },
    ],
    readers: [
      { name: t("Mum", "Mama"), comments: { 0: t("Have the first nata for me too! ❤️", "Iss ein Nata für mich mit! ❤️"),
                                           5: t("Porto looks wonderful. Send us a bottle 🍷", "Porto sieht wunderbar aus. Schickt uns eine Flasche 🍷") } },
      { name: "Lena", comments: { 7: t("I'm so jealous. Those arches! 😍", "Ich bin so neidisch. Diese Felsbögen! 😍") } },
      { name: t("Grandpa", "Opa"), comments: { 2: t("We were there in 1978. Nothing has changed!", "Da waren wir 1978. Hat sich nichts verändert!") } },
      { name: "Tom", comments: {} },
      { name: "Sophie", comments: {} },
    ],
  },
];

async function api(path, { token, method = "GET", json, form } = {}) {
  const response = await fetch(`${server}/api/v1${path}`, {
    method,
    headers: {
      "accept-language": lang,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(json ? { "content-type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : form,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function photoFile([id, path]) {
  await mkdir(args.cache, { recursive: true });
  const file = join(args.cache, `${id}.jpg`);
  if (!existsSync(file)) {
    const response = await fetch(`https://images.unsplash.com/${path}?w=2400&q=80&fm=jpg`);
    if (!response.ok) throw new Error(`Unsplash ${id}: ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return new Blob([await readFile(file)], { type: "image/jpeg" });
}

const { token } = await api("/auth/token", {
  method: "POST",
  json: { email: args.email, password: args.password, deviceName: "seed-demo" },
});

for (const trip of trips) {
  const created = await api("/trips", {
    token,
    method: "POST",
    json: { title: trip.title, summary: trip.summary, startDate: trip.startDate, endDate: trip.endDate },
  });
  console.log(`${created.title} (#${created.id})`);

  const stepIds = [];
  for (const step of trip.steps) {
    const s = await api(`/trips/${created.id}/steps`, {
      token,
      method: "POST",
      json: { body: step.body, placeName: step.place, lat: step.lat, lon: step.lon, occurredAt: step.at },
    });
    stepIds.push(s.id);
    for (const photo of step.photos) {
      const form = new FormData();
      form.append("file", await photoFile(photo), `${photo[0]}.jpg`);
      if (photo[3]) form.append("caption", photo[3]);
      await api(`/steps/${s.id}/media`, { token, method: "POST", form });
    }
    console.log(`  ${step.place}: ${step.photos.length} photos`);
  }

  if (!trip.share) continue;
  const shared = await api(`/trips/${created.id}`, { token, method: "PATCH", json: { shareEnabled: true } });
  for (const reader of trip.readers ?? []) {
    const { token: viewerToken } = await api("/viewers/redeem", {
      method: "POST",
      json: { shareLink: shared.share.url, name: reader.name, deviceName: "iPhone" },
    });
    await api(`/trips/${created.id}/views`, { token: viewerToken, method: "POST", json: { stepIds } });
    for (const [index, body] of Object.entries(reader.comments)) {
      await api(`/steps/${stepIds[index]}/comments`, { token: viewerToken, method: "POST", json: { body } });
    }
  }
  console.log(`  shared: ${shared.share.url}`);
}
