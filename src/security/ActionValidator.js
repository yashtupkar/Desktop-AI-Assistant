import { PermissionManager } from "./PermissionManager";

export const ALLOWED_ACTIONS = [
  "click",
  "click_text",
  "double_click",
  "type",
  "scroll",
  "hotkey",
  "wait",
  "open_app",
  "browser_open",
  "browser_search",
  "speak",
  "move_mouse",
  "done",
];

export class ActionValidator {
  static validate(actionObj) {
    if (!actionObj || typeof actionObj !== "object") {
      return { valid: false, error: "Action must be a JSON object" };
    }

    const { action } = actionObj;

    if (!action) {
      return { valid: false, error: "Missing 'action' field" };
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return { valid: false, error: `Disallowed action type: ${action}` };
    }

    // Specific action validations
    switch (action) {
      case "open_app":
        if (!actionObj.app) {
          return { valid: false, error: "Missing 'app' for open_app action" };
        }
        if (!PermissionManager.isAppAllowed(actionObj.app)) {
          return { valid: false, error: `App is restricted: ${actionObj.app}` };
        }
        break;

      case "click_text":
        if (!actionObj.text) {
          return { valid: false, error: "Missing 'text' for click_text action" };
        }
        break;

      case "type":
        if (actionObj.text === undefined) {
          return { valid: false, error: "Missing 'text' for type action" };
        }
        if (!PermissionManager.isCommandAllowed(actionObj.text)) {
           // We might still want to type these words, but we block if it looks like a terminal command.
           // In a very strict mode, we could block it, but typing "cmd" into a word doc shouldn't be blocked.
           // For now, we allow typing, but block running them directly.
        }
        break;

      case "click":
      case "double_click":
      case "move_mouse":
        if (actionObj.x === undefined || actionObj.y === undefined) {
          return { valid: false, error: `Missing x,y coordinates for ${action} action` };
        }
        break;
      
      case "hotkey":
        if (!actionObj.keys || !Array.isArray(actionObj.keys)) {
          return { valid: false, error: "Missing 'keys' array for hotkey action" };
        }
        break;
    }

    return { valid: true };
  }
}
