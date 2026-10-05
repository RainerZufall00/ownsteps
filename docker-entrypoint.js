#!/usr/bin/env node
/**
 * Starts the Next server and first makes sure the data directory is writable.
 *
 * Background: DATA_DIR is a bind mount from the host. The `chown` from the
 * Dockerfile doesn't apply there – a mount hides the image content including
 * its ownership, and Docker creates missing host directories as root. The
 * container therefore starts as root, fixes the permissions and then switches
 * to the unprivileged user.
 *
 * If the container is started with a fixed `user:`, the switch is skipped;
 * the directory on the host must then already belong to the right user.
 */
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = process.env.DATA_DIR || "/data";
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
// Matches the "node" user in the official Node images.
const RUN_UID = Number(process.env.RUN_UID || 1000);
const RUN_GID = Number(process.env.RUN_GID || 1000);

/**
 * Hands the data directory to the unprivileged user. Runs as root, so it
 * must never follow a symlink below the top: whoever can write to the data
 * directory could otherwise plant `/data/x -> /etc/passwd` and have root give
 * that file away on the next start. Links are changed themselves (lchown),
 * never their targets, and never descended into.
 */
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
        fs.lchownSync(child, uid, gid);
      } catch {
        // Individual files may fail without preventing startup.
      }
    }
  }
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

if (isRoot) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Only walk the tree if something is off at the top – with many photos a
  // recursive pass on every start would be pure waiting time.
  const needsFix = [DATA_DIR, UPLOAD_DIR].some((dir) => {
    const stat = fs.statSync(dir);
    return stat.uid !== RUN_UID || stat.gid !== RUN_GID;
  });
  if (needsFix) {
    console.log(`[start] Fixing permissions on ${DATA_DIR} …`);
    chownRecursive(DATA_DIR, RUN_UID, RUN_GID);
  }

  // Drop root's supplementary groups first (among them GID 0) – setgid and
  // setuid alone leave them in place, and the server would keep group-root
  // access to every file that allows it.
  process.setgroups([RUN_GID]);
  process.setgid(RUN_GID);
  process.setuid(RUN_UID);

  if (process.getuid() !== RUN_UID) {
    console.error("[start] Switching to the unprivileged user failed.");
    process.exit(1);
  }
} else {
  // Fixed user given from outside: only check that writing is allowed.
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
  } catch (error) {
    console.error(
      [
        `[start] ${DATA_DIR} is not writable for user ${process.getuid?.()}.`,
        `        ${error.message}`,
        "        Fix it on the host with:",
        `          sudo chown -R ${RUN_UID}:${RUN_GID} <your-data-directory>`,
      ].join("\n"),
    );
    process.exit(1);
  }
}

require(path.join(__dirname, "server.js"));
