export const BANNED_COMMANDS = [
  "cmd",
  "powershell",
  "format",
  "del",
  "rm",
  "rmdir",
  "reg",
  "net",
  "taskkill",
  "msconfig",
  "diskpart",
  "vssadmin",
  "wbadmin",
  "bcdedit",
  "icacls",
  "takeown",
];

export const BANNED_APPS = [
  "cmd.exe",
  "powershell.exe",
  "regedit.exe",
  "taskmgr.exe",
  "msconfig.exe",
];

export class PermissionManager {
  static isCommandAllowed(command) {
    if (!command) return false;
    const lowerCmd = command.toLowerCase();

    // Check against banned commands
    for (const banned of BANNED_COMMANDS) {
      if (
        lowerCmd === banned ||
        lowerCmd.startsWith(banned + " ") ||
        lowerCmd.includes(" " + banned + " ")
      ) {
        return false;
      }
    }

    // Check against banned apps
    for (const bannedApp of BANNED_APPS) {
      if (lowerCmd.includes(bannedApp)) {
        return false;
      }
    }

    return true;
  }

  static isAppAllowed(appName) {
    if (!appName) return false;
    const lowerApp = appName.toLowerCase();

    for (const bannedApp of BANNED_APPS) {
      if (lowerApp.includes(bannedApp) || lowerApp.includes(bannedApp.replace('.exe', ''))) {
        return false;
      }
    }

    return true;
  }
}
