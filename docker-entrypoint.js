#!/usr/bin/env node
/**
 * Startet den Next-Server und sorgt vorher dafür, dass das Datenverzeichnis
 * beschreibbar ist.
 *
 * Hintergrund: DATA_DIR ist ein Bind-Mount vom Host. Das `chown` aus dem
 * Dockerfile greift dort nicht – ein Mount verdeckt den Image-Inhalt samt
 * seiner Besitzverhältnisse, und Docker legt fehlende Host-Verzeichnisse als
 * root an. Der Container startet deshalb als root, richtet die Rechte und
 * wechselt anschließend auf den unprivilegierten Nutzer.
 *
 * Wird der Container mit festem `user:` gestartet, entfällt der Wechsel; dann
 * muss das Verzeichnis auf dem Host bereits dem passenden Benutzer gehören.
 */
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = process.env.DATA_DIR || "/data";
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
// Entspricht dem Benutzer "node" in den offiziellen Node-Images.
const RUN_UID = Number(process.env.RUN_UID || 1000);
const RUN_GID = Number(process.env.RUN_GID || 1000);

function chownRecursive(target, uid, gid) {
  fs.chownSync(target, uid, gid);
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) chownRecursive(child, uid, gid);
    else {
      try {
        fs.chownSync(child, uid, gid);
      } catch {
        // Einzelne Dateien dürfen scheitern, ohne den Start zu verhindern.
      }
    }
  }
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

if (isRoot) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Nur durchlaufen, wenn oben etwas nicht stimmt – bei vielen Fotos wäre ein
  // rekursiver Lauf bei jedem Start sonst pure Wartezeit.
  const needsFix = [DATA_DIR, UPLOAD_DIR].some((dir) => {
    const stat = fs.statSync(dir);
    return stat.uid !== RUN_UID || stat.gid !== RUN_GID;
  });
  if (needsFix) {
    console.log(`[start] Rechte auf ${DATA_DIR} werden gesetzt …`);
    chownRecursive(DATA_DIR, RUN_UID, RUN_GID);
  }

  process.setgid(RUN_GID);
  process.setuid(RUN_UID);

  if (process.getuid() !== RUN_UID) {
    console.error("[start] Wechsel auf den unprivilegierten Benutzer schlug fehl.");
    process.exit(1);
  }
} else {
  // Fester Benutzer von außen vorgegeben: nur prüfen, ob geschrieben werden darf.
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
  } catch (error) {
    console.error(
      [
        `[start] ${DATA_DIR} ist für Benutzer ${process.getuid?.()} nicht beschreibbar.`,
        `        ${error.message}`,
        "        Auf dem Host beheben mit:",
        `          sudo chown -R ${RUN_UID}:${RUN_GID} <dein-data-Verzeichnis>`,
      ].join("\n"),
    );
    process.exit(1);
  }
}

require(path.join(__dirname, "server.js"));
