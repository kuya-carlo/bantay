"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Service to send out-of-band notifications via ntfy.kuyacarlo.dev
 */
class NotificationService {
    baseURL;
    auth;
    constructor(config) {
        this.baseURL = config.baseURL || "https://ntfy.kuyacarlo.dev";
        this.auth = Buffer.from(`${config.user}:${config.pass}`).toString("base64");
    }
    /**
     * Sends an alert to the specified topic
     * @param topic ntfy topic name
     * @param message Alert message body
     * @param actions Optional action buttons (approve/deny)
     */
    async sendAlert(topic, message, actions) {
        const url = `${this.baseURL}/${topic}`;
        const headers = {
            "Authorization": `Basic ${this.auth}`,
            "Title": "🛡️ Git Guardian Security Alert",
            "Priority": "4", // High
            "Tags": "warning,shield",
        };
        if (actions && actions.length > 0) {
            // ntfy Action buttons format: "view, label, url; view, label, url"
            // We use 'view' for simple URLs or 'http' for POSTs (Auth0 CIBA usually requires POST)
            // Let's use 'view' for the dashboard/approval link for MVP
            const ntfyActions = actions.map(a => `${a.type || 'view'}, ${a.label}, ${a.url}`).join("; ");
            headers["Actions"] = ntfyActions;
        }
        try {
            await axios_1.default.post(url, message, { headers });
            console.log(`[ntfy] Alert sent to topic: ${topic}`);
        }
        catch (error) {
            console.error(`[ntfy] Failed to send alert: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=ntfy.js.map