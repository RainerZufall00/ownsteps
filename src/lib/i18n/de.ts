import type { Dictionary } from "./en";

/** German UI texts. Keys and placeholders mirror `en.ts`. */
export const de: Dictionary = {
  meta: {
    description: "Reisetagebuch mit Karte, Timeline und Fotos – selbst gehostet.",
    manifestDescription: "Reisetagebuch mit Karte, Timeline und Fotos.",
  },

  common: {
    allTrips: "Alle Reisen",
    cancel: "Abbrechen",
    close: "Schließen",
    remove: "Entfernen",
    save: "Speichern",
    saving: "Speichern …",
    saved: "Gespeichert.",
    optional: "(optional)",
    moment: "Moment …",
    name: "Name",
    email: "E-Mail",
    password: "Passwort",
    emailPlaceholder: "du@beispiel.de",
    passwordMinLength: "mindestens {passwordMin} Zeichen",
    from: "Von",
    to: "Bis",
    settings: "Einstellungen",
    openInApp: "In der App öffnen",
    language: "Sprache",
  },

  counts: {
    trips: { one: "{count} Reise", other: "{count} Reisen" },
    steps: { one: "{count} Station", other: "{count} Stationen" },
    photos: { one: "{count} Foto", other: "{count} Fotos" },
  },

  range: {
    noSteps: "Noch keine Beiträge",
  },

  login: {
    title: "Anmelden",
    tagline: "Deine Reisen, deine Fotos, dein Server.",
    withProvider: "Mit {provider} anmelden",
    orPassword: "oder mit Passwort",
    nothingConfigured:
      "Es ist keine Anmeldung eingerichtet: PASSWORD_LOGIN ist abgeschaltet, aber OIDC nicht konfiguriert.",
    submit: "Anmelden",
    pending: "Anmelden …",
    failed: "Die Anmeldung ist fehlgeschlagen.",
    errors: {
      oidc_unreachable: "Der Anmelde-Dienst ist gerade nicht erreichbar.",
      oidc_expired: "Die Anmeldung hat zu lange gedauert. Bitte noch einmal.",
      oidc_state: "Die Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal.",
      oidc_denied: "Die Anmeldung wurde abgebrochen.",
      oidc_not_allowed: "Dieser Account ist für OwnSteps nicht freigegeben.",
      oidc_unverified:
        "Der Anmelde-Dienst hat deine E-Mail-Adresse nicht bestätigt. Bestätige sie dort und versuch es noch einmal.",
      oidc_failed: "Die Anmeldung ist fehlgeschlagen.",
      oidc_disabled: "Die Anmeldung über den Anbieter ist nicht aktiv.",
    },
  },

  setup: {
    title: "Ersteinrichtung",
    welcome: "Willkommen bei {site}",
    intro: "Lege deinen Account an – danach ist diese Seite gesperrt.",
    yourName: "Dein Name",
    namePlaceholder: "Matze",
    submit: "Account anlegen",
    pending: "Wird angelegt …",
  },

  trips: {
    heading: "Deine Reisen",
    empty: "Noch nichts unterwegs.",
    newTrip: "Neue Reise",
    firstTitle: "Die erste Reise wartet",
    firstText:
      "Lege eine Reise an, lade unterwegs Fotos hoch und teile den Link mit Familie und Freunden.",
    create: "Reise anlegen",
    shared: "geteilt",
  },

  newTrip: {
    title: "Neue Reise",
    intro: "Nur der Name ist nötig – alles andere entsteht unterwegs.",
    nameLabel: "Name der Reise",
    namePlaceholder: "Norwegen mit dem Bulli",
    summaryLabel: "Kurz beschrieben",
    summaryPlaceholder: "Drei Wochen von Oslo bis zum Nordkap.",
    coverLabel: "Titelbild",
    coverHint:
      "Das Aushängeschild der Reise – erscheint in der Übersicht und in der Link-Vorschau. Anders als die übrigen Fotos ist es öffentlich sichtbar.",
    coverTooLarge: "Das Titelbild ist größer als {maxImageMb} MB.",
    failed: "Die Reise konnte nicht angelegt werden.",
    pending: "Wird angelegt …",
    submit: "Reise anlegen",
  },

  trip: {
    fallbackTitle: "Reise",
    share: "Teilen",
    shared: "Geteilt",
    addStep: "Beitrag hinzufügen",
  },

  timeline: {
    emptyTitle: "Noch keine Stationen",
    emptyAuthor:
      "Lade dein erstes Foto hoch – Ort und Zeit holt sich OwnSteps direkt aus dem Bild.",
    emptyReader: "Hier erscheinen die Beiträge, sobald die Reise losgeht.",
    day: "Tag {day}",
    edit: "Bearbeiten",
    noPlaces: "Noch keine Orte – Fotos mit GPS-Daten setzen die Marker automatisch.",
    tapToRead: "Antippen zum Lesen",
    marker: "Station {number}",
    openPhoto: "Foto {index} von {count} öffnen",
    views: { one: "{count} Aufruf", other: "{count} Aufrufe" },
    viewsHint:
      "Leser, die diese Station gesehen haben, jeder einmal gezählt – in der App und über den Freigabe-Link. Sehen nur die Autoren.",
  },

  tripScreen: {
    about: "Über diese Reise",
    wholeTrip: "Ganze Reise zeigen",
    steps: "Stationen",
    progress: "Reiseverlauf",
    openStep: "Öffnet die Station",
  },

  story: {
    label: "Stationen als Storys",
    close: "Schließen",
    previousStep: "Vorherige Station",
    nextStep: "Nächste Station",
    previousPhoto: "Vorheriges Foto",
    nextPhoto: "Nächstes Foto",
    photo: "Foto {index} von {count}",
    video: "Video {index} von {count}",
    more: "mehr",
    readMore: "Ganzen Text lesen",
    comments: "Kommentare",
    commentCount: { one: "{count} Kommentar", other: "{count} Kommentare" },
    noComments: "Noch keine Kommentare.",
    showOnMap: "Auf der Karte zeigen",
    fullScreen: "Vollbild",
    soundOn: "Ton an",
    soundOff: "Ton aus",
    play: "Video abspielen",
  },

  lightbox: {
    label: "Medien",
    resetZoom: "Zoom zurücksetzen",
    previous: "Vorheriges Medium",
    next: "Nächstes Medium",
  },

  comments: {
    delete: "Kommentar löschen",
    namePlaceholder: "Dein Name",
    bodyLabel: "Kommentar",
    bodyPlaceholder: "Was möchtest du sagen?",
    send: "Absenden",
    sending: "Wird gesendet …",
    write: "Kommentar schreiben",
    writeMore: "Auch etwas sagen",
  },

  stepEditor: {
    title: "Beitrag",
    back: "Zur Reise",
    delete: "Beitrag löschen",
    editHeading: "Beitrag bearbeiten",
    newHeading: "Neuer Beitrag",
    intro: "Ort und Zeitpunkt kommen automatisch aus den Fotos.",
    photos: "Fotos",
    captionLabel: "Bildunterschrift",
    captionPlaceholder: "Bildunterschrift (optional)",
    cover: "Titelbild",
    coverSet: "Titelbild ✓",
    addMedia: "Fotos oder Videos hinzufügen",
    progress: "{done} von {total} hochgeladen …",
    preparingVideo: "Video wird vorbereitet …",
    tooLarge: "{name}: {size} MB – erlaubt sind {limit} MB.",
    connectionLost: "Verbindung unterbrochen",
    uploadFailed: "Upload fehlgeschlagen",
    bodyLabel: "Was ist passiert?",
    bodyPlaceholder: "Erzähl von diesem Tag …",
    date: "Datum",
    place: "Ort",
    placePlaceholder: "Ort suchen, z.B. Ulm",
    searching: "sucht …",
    myLocation: "Mein Standort",
    removePlace: "Ort entfernen",
    noPlace: "Kein Ort gesetzt – tippe auf die Karte.",
    noGeolocation: "Dieses Gerät gibt keinen Standort her.",
    locating: "Standort wird ermittelt …",
    locationDenied: "Zugriff auf den Standort wurde abgelehnt.",
    locationFailed: "Standort konnte nicht ermittelt werden.",
    thisStep: "Dieser Beitrag",
  },

  tripSettings: {
    title: "Reise verwalten",
    shareHeading: "Teilen",
    followHeading: "In der App folgen",
    followText:
      "Mit der Kamera scannen oder den Link verschicken. Wer die OwnSteps-App hat, folgt der Reise dort, alle anderen im Browser.",
    openHere: "Auf diesem Gerät in der App öffnen",
    qrLabel: "QR-Code des Links",
    readersHeading: "Lesende in der App",
    readersText:
      "Wer den Link in der App geöffnet hat. Ein neuer Link oder ein neues Passwort meldet alle ab; ist das Teilen aus, sehen sie nichts mehr.",
    noReaders: "Noch niemand.",
    readerSince: "seit {date}",
    readerLastSeen: " · zuletzt da {date}",
    removeAll: "Alle entfernen",
    detailsHeading: "Name, Zeitraum, Beschreibung",
    deleteHeading: "Reise löschen",
    deleteText:
      "Entfernt alle Beiträge und Fotos dieser Reise unwiderruflich vom Server. Es gibt danach kein Zurück – außer über eine Sicherung.",
  },

  shareSettings: {
    toggle: "Reise über Link teilen",
    toggleHint: "Wer den Link hat, kann mitlesen – ohne Account, ohne Suchmaschine.",
    shareLink: "Link teilen",
    copied: "Kopiert!",
    view: "Ansehen",
    passwordLabel: "Zusätzliches Passwort",
    passwordNew: "Neues Passwort setzen",
    passwordNone: "Kein Passwort",
    passwordHint:
      "Mindestens {sharePasswordMin} Zeichen. Ein neues Passwort meldet alle ab, die der Reise in der App folgen.",
    removePassword: "Passwortschutz aufheben",
    submit: "Einstellungen speichern",
  },

  rotateShare: {
    action: "Neuen Link erzeugen",
    hint: "Der bisherige Link funktioniert danach nicht mehr.",
    confirmTitle: "Neuen Link erzeugen?",
    confirmText:
      "Der bisherige Link wird sofort ungültig. Alle, denen du ihn geschickt hast, kommen dann nicht mehr hinein – auch wer der Reise in der App folgt, wird abgemeldet. Du müsstest ihnen den neuen Link noch einmal schicken.",
    pending: "Wird erzeugt …",
  },

  tripDetails: {
    description: "Beschreibung",
    rangeHint:
      "Ohne Zeitraum richtet sich die Anzeige nach den Beiträgen. Der erste Reisetag zählt ab dem hier gesetzten Beginn.",
  },

  deleteTrip: {
    action: "Reise löschen",
    confirmBefore: "Zum Bestätigen ",
    confirmAfter: " eintippen",
    pending: "Wird gelöscht …",
    submit: "Endgültig löschen",
  },

  settings: {
    title: "Einstellungen",
    signedInAs: "Angemeldet als {name} ({email})",
    accountsHeading: "Wer schreiben darf",
    accountsText:
      "Alle Accounts hier haben dieselben Rechte und arbeiten gemeinsam an allen Reisen.",
    addAccount: "Weiteren Account anlegen",
    accountCreated: "Account angelegt.",
    create: "Anlegen",
    creating: "Anlegen …",
    oidcHeading: "Anmeldung über {provider}",
    oidcText:
      "Ist aktiv. Wer sich dort anmeldet und dieselbe E-Mail-Adresse nutzt, landet automatisch im passenden Account.",
    devicesHeading: "Angemeldete Geräte",
    devicesText:
      "Wo du in der OwnSteps-App angemeldet bist. Abmelden wirkt sofort – etwa wenn ein Handy verloren gegangen ist.",
    noDevices: "Noch keine.",
    deviceSince: "angemeldet am {date}",
    deviceLastUsed: " · zuletzt aktiv {date}",
    signOutDevice: "Abmelden",
    passwordHeading: "Passwort ändern",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    passwordChanged:
      "Passwort geändert. Andere Browser und deine App-Geräte sind jetzt abgemeldet.",
    changePassword: "Passwort ändern",
    setPassword: "Passwort setzen",
    languageText: "Ohne Auswahl hier gilt die Sprache des Browsers.",
    signOut: "Abmelden",
  },

  exportTrip: {
    heading: "Aufbewahren",
    text: "Nimm die Reise mit – als Album, das in jedem Browser aufgeht, auch offline, oder in deine Immich-Mediathek.",
    album: "Album herunterladen",
    albumHint:
      "Eine ZIP-Datei mit einer Seite und allen Fotos und Videos, den Texten, Bildbeschreibungen und einer Karte der Route. Entpacken und index.html öffnen.",
    immich: "An Immich senden",
    immichHint:
      "Legt in Immich ein Album an. Jedes Foto behält seine Beschreibung; Tag und Ort stehen an jedem Foto, der Tagestext am ersten des Tages.",
    immichNotConnected: "Verbinde zuerst Immich in den Einstellungen.",
    immichConnect: "Zu den Einstellungen",
    immichRunning: "Sende {done} von {total} …",
    immichStarting: "Wird gestartet …",
    immichDone: "Fertig – {total} Fotos und Videos sind in Immich.",
    immichOpen: "Album in Immich öffnen",
    immichAgain: "Erneut senden",
    immichFailed: "Das hat nicht geklappt: {error}",
  },

  album: {
    exportedOn: "Aus OwnSteps exportiert am {date}.",
    days: { one: "{count} Tag", other: "{count} Tage" },
    comments: "Kommentare",
    mapCredit: "Karte",
    noSteps: "Diese Reise hat noch keine Stationen.",
  },

  immich: {
    heading: "Immich",
    text: "Verbinde deinen Immich-Server, um Reisen dorthin als Alben zu senden – mit Bildbeschreibungen und dem Tagestext in der Beschreibung jedes Fotos.",
    url: "Immich-Adresse",
    urlPlaceholder: "https://fotos.example.com",
    apiKey: "API-Schlüssel",
    apiKeyHint:
      "Erstellst du in Immich unter Kontoeinstellungen → API-Schlüssel. Er muss Medien hochladen, ändern und Alben verwalten dürfen – „Alle“ ist am einfachsten.",
    connect: "Verbinden",
    connecting: "Wird geprüft …",
    connected: "Verbunden mit {url} als {name}.",
    disconnect: "Trennen",
    keyStored: "Der Schlüssel wird verschlüsselt auf diesem Server gespeichert.",
  },

  share: {
    lockedTitle: "Geschützte Reise",
    lockedText: "Diese Reise ist mit einem Passwort geschützt.",
    notFound: "Nicht gefunden",
    description: {
      one: "Eine Reise mit {count} Station.",
      other: "Eine Reise mit {count} Stationen.",
    },
    unlock: "Reise ansehen",
    unlocking: "Wird geprüft …",
  },

  place: {
    unknown: "Unbekannter Ort",
  },

  errors: {
    immich_not_connected: "Immich ist noch nicht verbunden.",
    immich_url_invalid: "Das ist keine Web-Adresse (https://…).",
    immich_unreachable: "Immich ist unter dieser Adresse nicht erreichbar.",
    immich_key_invalid: "Immich hat den API-Schlüssel nicht akzeptiert – oder ihm fehlen Rechte.",
    immich_failed: "Immich hat mit einem Fehler geantwortet ({status}).",
    not_signed_in: "Nicht angemeldet.",
    trip_not_found: "Reise nicht gefunden.",
    step_not_found: "Beitrag nicht gefunden.",
    photo_not_found: "Foto nicht gefunden.",
    share_link_invalid: "Dieser Link ist nicht mehr gültig.",
    trip_not_shared: "Diese Reise ist nicht freigegeben.",
    trip_title_required: "Die Reise braucht einen Namen.",
    trip_title_too_long: "Der Name der Reise ist zu lang.",
    trip_summary_too_long: "Die Beschreibung ist zu lang.",
    trip_dates_reversed: "Das Ende der Reise liegt vor ihrem Beginn.",
    date_invalid: "Bitte ein gültiges Datum angeben.",
    trip_delete_confirmation: "Zum Löschen bitte „{title}“ genau so eintippen.",
    step_empty: "Bitte einen Ort, Text oder ein Foto hinzufügen.",
    share_password_too_short: "Das Passwort braucht mindestens {sharePasswordMin} Zeichen.",
    share_password_wrong: "Das Passwort stimmt nicht.",
    email_invalid: "Bitte eine gültige E-Mail angeben.",
    email_taken: "Diese E-Mail-Adresse wird bereits verwendet.",
    password_too_short: "Das Passwort braucht mindestens {passwordMin} Zeichen.",
    current_password_wrong: "Das aktuelle Passwort stimmt nicht.",
    account_exists: "Es existiert bereits ein Account.",
    credentials_missing: "Bitte E-Mail und Passwort eingeben.",
    credentials_invalid: "E-Mail oder Passwort stimmt nicht.",
    comment_name_missing: "Bitte einen Namen angeben.",
    comment_name_too_long: "Der Name ist zu lang.",
    comment_empty: "Der Kommentar ist leer.",
    comment_too_long: "Der Kommentar ist zu lang.",
    comment_rate_limited: "Bitte einen Moment warten und dann erneut senden.",
    no_file: "Keine Datei erhalten.",
    image_too_large: "Datei ist größer als {maxImageMb} MB.",
    video_too_large: "Video ist größer als {maxVideoMb} MB.",
    unsupported_format: "Kein unterstütztes Format.",
    poster_missing: "Vorschaubild fehlt – Video konnte nicht gelesen werden.",
    media_unprocessable:
      "Bild konnte nicht verarbeitet werden (bei iPhone-Fotos hilft das Format „Maximale Kompatibilität“).",
    invalid_request: "Ungültige Anfrage.",
    author_only: "Nur für angemeldete Autoren.",
    auth_code_invalid: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
    password_login_disabled: "Die Anmeldung mit Passwort ist abgeschaltet.",
    oidc_disabled: "Die Anmeldung über OIDC ist nicht eingerichtet.",
    too_many_attempts: "Zu viele Versuche. Bitte einen Moment warten.",
    comment_not_found: "Kommentar nicht gefunden.",
    viewer_not_found: "Lesegerät nicht gefunden.",
  },
};
