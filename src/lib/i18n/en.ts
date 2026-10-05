import type { ErrorCode } from "@/lib/errors";

/**
 * English UI texts – the default language and the reference: `de.ts` must
 * have exactly the same keys, which the `Dictionary` type enforces.
 *
 * Placeholders are `{name}` (see `fill()`), plurals `{ one, other }` (see
 * `plural()`).
 */
export const en = {
  meta: {
    description: "Travel journal with map, timeline and photos – self-hosted.",
    manifestDescription: "Travel journal with map, timeline and photos.",
  },

  common: {
    allTrips: "All trips",
    cancel: "Cancel",
    close: "Close",
    remove: "Remove",
    save: "Save",
    saving: "Saving …",
    saved: "Saved.",
    optional: "(optional)",
    moment: "One moment …",
    name: "Name",
    email: "Email",
    password: "Password",
    emailPlaceholder: "you@example.com",
    passwordMinLength: "at least {passwordMin} characters",
    from: "From",
    to: "To",
    settings: "Settings",
    openInApp: "Open in the app",
    language: "Language",
  },

  counts: {
    trips: { one: "{count} trip", other: "{count} trips" },
    steps: { one: "{count} step", other: "{count} steps" },
    photos: { one: "{count} photo", other: "{count} photos" },
  },

  range: {
    noSteps: "No steps yet",
  },

  login: {
    title: "Sign in",
    tagline: "Your trips, your photos, your server.",
    withProvider: "Sign in with {provider}",
    orPassword: "or with password",
    nothingConfigured:
      "No sign-in is set up: PASSWORD_LOGIN is turned off, but OIDC is not configured.",
    submit: "Sign in",
    pending: "Signing in …",
    failed: "Sign-in failed.",
    errors: {
      oidc_unreachable: "The sign-in service can't be reached right now.",
      oidc_expired: "Signing in took too long. Please try again.",
      oidc_state: "The sign-in could not be matched. Please try again.",
      oidc_denied: "Sign-in was cancelled.",
      oidc_not_allowed: "This account is not allowed to use OwnSteps.",
      oidc_unverified:
        "The sign-in service hasn't confirmed your email address. Confirm it there and try again.",
      oidc_failed: "Sign-in failed.",
      oidc_disabled: "Sign-in via the provider is not active.",
    } as Record<string, string>,
  },

  setup: {
    title: "Initial setup",
    welcome: "Welcome to {site}",
    intro: "Create your account – afterwards this page is locked.",
    yourName: "Your name",
    namePlaceholder: "Alex",
    submit: "Create account",
    pending: "Creating …",
  },

  trips: {
    heading: "Your trips",
    empty: "Nothing on the road yet.",
    newTrip: "New trip",
    firstTitle: "Your first trip is waiting",
    firstText:
      "Create a trip, upload photos along the way and share the link with family and friends.",
    create: "Create trip",
    shared: "shared",
  },

  newTrip: {
    title: "New trip",
    intro: "Only the name is required – everything else happens along the way.",
    nameLabel: "Trip name",
    namePlaceholder: "Norway in the camper van",
    summaryLabel: "In short",
    summaryPlaceholder: "Three weeks from Oslo to the North Cape.",
    coverLabel: "Cover image",
    coverHint:
      "The trip's showpiece – it appears in the overview and in the link preview. Unlike all other photos it is publicly visible.",
    coverTooLarge: "The cover image is larger than {maxImageMb} MB.",
    failed: "The trip could not be created.",
    pending: "Creating …",
    submit: "Create trip",
  },

  trip: {
    fallbackTitle: "Trip",
    share: "Share",
    shared: "Shared",
    addStep: "Add step",
  },

  timeline: {
    timeline: "Timeline",
    map: "Map",
    emptyTitle: "No steps yet",
    emptyAuthor:
      "Upload your first photo – OwnSteps takes place and time straight from the image.",
    emptyReader: "Steps appear here as soon as the trip gets going.",
    day: "Day {day}",
    edit: "Edit",
    noPlaces: "No places yet – photos with GPS data set the markers automatically.",
    tapToRead: "Tap to read",
    marker: "Step {number}",
    openPhoto: "Open photo {index} of {count}",
  },

  lightbox: {
    label: "Media",
    resetZoom: "Reset zoom",
    previous: "Previous item",
    next: "Next item",
  },

  comments: {
    delete: "Delete comment",
    namePlaceholder: "Your name",
    bodyLabel: "Comment",
    bodyPlaceholder: "What would you like to say?",
    send: "Send",
    sending: "Sending …",
    write: "Write a comment",
    writeMore: "Say something too",
  },

  stepEditor: {
    title: "Step",
    back: "Back to trip",
    delete: "Delete step",
    editHeading: "Edit step",
    newHeading: "New step",
    intro: "Place and time come from the photos automatically.",
    photos: "Photos",
    captionLabel: "Caption",
    captionPlaceholder: "Caption (optional)",
    cover: "Cover image",
    coverSet: "Cover image ✓",
    addMedia: "Add photos or videos",
    progress: "{done} of {total} uploaded …",
    preparingVideo: "Preparing video …",
    tooLarge: "{name}: {size} MB – {limit} MB allowed.",
    connectionLost: "Connection lost",
    uploadFailed: "Upload failed",
    bodyLabel: "What happened?",
    bodyPlaceholder: "Tell us about this day …",
    date: "Date",
    place: "Place",
    placePlaceholder: "Search for a place, e.g. Lisbon",
    searching: "searching …",
    myLocation: "My location",
    removePlace: "Remove place",
    noPlace: "No place set – tap the map.",
    noGeolocation: "This device doesn't provide a location.",
    locating: "Getting your location …",
    locationDenied: "Access to the location was denied.",
    locationFailed: "The location could not be determined.",
    thisStep: "This step",
  },

  tripSettings: {
    title: "Manage trip",
    shareHeading: "Sharing",
    followHeading: "Follow in the app",
    followText:
      "Scan with the camera or send the link. Whoever has the OwnSteps app follows the trip there, everyone else in the browser.",
    openHere: "Open in the app on this device",
    qrLabel: "QR code of the link",
    readersHeading: "Readers in the app",
    readersText:
      "Who opened the link in the app. A new link or a new password signs them all out; with sharing off, they see nothing anymore.",
    noReaders: "Nobody yet.",
    readerSince: "since {date}",
    readerLastSeen: " · last seen {date}",
    removeAll: "Remove all",
    detailsHeading: "Name, dates, description",
    deleteHeading: "Delete trip",
    deleteText:
      "Removes all steps and photos of this trip from the server for good. There's no way back – except from a backup.",
  },

  shareSettings: {
    toggle: "Share trip via link",
    toggleHint: "Anyone with the link can follow along – no account, no search engine.",
    shareLink: "Share link",
    copied: "Copied!",
    view: "View",
    passwordLabel: "Additional password",
    passwordNew: "Set a new password",
    passwordNone: "No password",
    passwordHint:
      "At least {sharePasswordMin} characters. A new password signs out everyone following the trip in the app.",
    removePassword: "Remove password protection",
    submit: "Save settings",
  },

  rotateShare: {
    action: "Create a new link",
    hint: "The current link stops working afterwards.",
    confirmTitle: "Create a new link?",
    confirmText:
      "The current link stops working immediately. Everyone you sent it to can't get in anymore – and whoever follows the trip in the app is signed out. You'd have to send them the new link again.",
    pending: "Creating …",
  },

  tripDetails: {
    description: "Description",
    rangeHint:
      "Without dates, the display follows the steps. Day 1 of the trip counts from the start set here.",
  },

  deleteTrip: {
    action: "Delete trip",
    confirmBefore: "Type ",
    confirmAfter: " to confirm",
    pending: "Deleting …",
    submit: "Delete for good",
  },

  settings: {
    title: "Settings",
    signedInAs: "Signed in as {name} ({email})",
    accountsHeading: "Who can write",
    accountsText: "All accounts here have the same rights and work together on all trips.",
    addAccount: "Add another account",
    accountCreated: "Account created.",
    create: "Create",
    creating: "Creating …",
    oidcHeading: "Sign-in with {provider}",
    oidcText:
      "Is active. Whoever signs in there with the same email address lands in the matching account automatically.",
    devicesHeading: "Signed-in devices",
    devicesText:
      "Where you're signed in to the OwnSteps app. Signing out takes effect immediately – for example when a phone got lost.",
    noDevices: "None yet.",
    deviceSince: "signed in on {date}",
    deviceLastUsed: " · last active {date}",
    signOutDevice: "Sign out",
    passwordHeading: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    passwordChanged: "Password changed. Other browsers and your app devices are now signed out.",
    changePassword: "Change password",
    setPassword: "Set password",
    languageText: "Without a choice here, the browser's language applies.",
    signOut: "Sign out",
  },

  share: {
    lockedTitle: "Protected trip",
    lockedText: "This trip is protected with a password.",
    notFound: "Not found",
    description: { one: "A trip with {count} step.", other: "A trip with {count} steps." },
    unlock: "View trip",
    unlocking: "Checking …",
  },

  place: {
    unknown: "Unknown place",
  },

  errors: {
    not_signed_in: "Not signed in.",
    trip_not_found: "Trip not found.",
    step_not_found: "Step not found.",
    photo_not_found: "Photo not found.",
    share_link_invalid: "This link is no longer valid.",
    trip_not_shared: "This trip is not shared.",
    trip_title_required: "The trip needs a name.",
    trip_title_too_long: "The trip's name is too long.",
    trip_summary_too_long: "The description is too long.",
    trip_dates_reversed: "The trip ends before it starts.",
    date_invalid: "Please enter a valid date.",
    trip_delete_confirmation: "To delete, please type “{title}” exactly.",
    step_empty: "Please add a place, text or a photo.",
    share_password_too_short: "The password needs at least {sharePasswordMin} characters.",
    share_password_wrong: "The password is wrong.",
    email_invalid: "Please enter a valid email address.",
    email_taken: "This email address is already in use.",
    password_too_short: "The password needs at least {passwordMin} characters.",
    current_password_wrong: "The current password is wrong.",
    account_exists: "An account already exists.",
    credentials_missing: "Please enter email and password.",
    credentials_invalid: "Email or password is wrong.",
    comment_name_missing: "Please enter a name.",
    comment_name_too_long: "The name is too long.",
    comment_empty: "The comment is empty.",
    comment_too_long: "The comment is too long.",
    comment_rate_limited: "Please wait a moment and send again.",
    no_file: "No file received.",
    image_too_large: "The file is larger than {maxImageMb} MB.",
    video_too_large: "The video is larger than {maxVideoMb} MB.",
    unsupported_format: "Not a supported format.",
    poster_missing: "Preview image missing – the video could not be read.",
    media_unprocessable:
      "The image could not be processed (for iPhone photos, the “Most Compatible” format helps).",
    invalid_request: "Invalid request.",
    author_only: "Only for signed-in authors.",
    auth_code_invalid: "The sign-in has expired. Please try again.",
    password_login_disabled: "Sign-in with password is turned off.",
    oidc_disabled: "Sign-in via OIDC is not set up.",
    too_many_attempts: "Too many attempts. Please wait a moment.",
    comment_not_found: "Comment not found.",
    viewer_not_found: "Reader device not found.",
  } satisfies Record<ErrorCode, string>,
};

export type Dictionary = typeof en;
