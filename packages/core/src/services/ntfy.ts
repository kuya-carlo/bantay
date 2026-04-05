import axios from "axios";

/**
 * Service to send out-of-band notifications via ntfy.kuyacarlo.dev
 */
export class NotificationService {
  private baseURL: string;
  private auth: string | null;

  constructor(config?: { baseURL?: string, user?: string, pass?: string }) {
    this.baseURL = config?.baseURL
      || process.env.NTFY_URL
      || "https://ntfy.sh";

    const user = config?.user || process.env.NTFY_USERNAME;
    const pass = config?.pass || process.env.NTFY_PASSWORD;

    if (!user || !pass) {
      console.warn("[ntfy] Warning: No authentication configured. Publishing without auth — topic must be public.");
      this.auth = null;
    } else {
      this.auth = Buffer.from(`${user}:${pass}`).toString("base64");
    }
  }

  /**
   * Sends an alert to the specified topic
   * @param topic ntfy topic name
   * @param message Alert message body
   * @param actions Optional action buttons (approve/deny)
   */
  async sendAlert(topic: string, message: string, actions?: any[]) {
    const url = `${this.baseURL}/${topic}`;

    const headers: Record<string, string> = {
      "Title": "Bantay Security Alert",
      "Tags": "warning,shield,rotating_light",
      "Priority": "4", // High
    };

    if (this.auth) {
      headers["Authorization"] = `Basic ${this.auth}`;
    }

    if (actions && actions.length > 0) {
      // ntfy Action buttons format: "view, label, url; view, label, url"
      // We use 'view' for simple URLs or 'http' for POSTs (Auth0 CIBA usually requires POST)
      // Let's use 'view' for the dashboard/approval link for MVP
      const ntfyActions = actions.map(a => `${a.type || 'view'}, ${a.label}, ${a.url}`).join("; ");
      headers["Actions"] = ntfyActions;
    }

    try {
      await axios.post(url, message, { headers });
      console.log(`[ntfy] Alert sent to topic: ${topic}`);
    } catch (error) {
      console.error(`[ntfy] Failed to send alert: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Verifies connectivity to the ntfy server
   * @param topic Optional topic to verify access to
   */
  // async checkConnection(topic?: string) {
  //   const url = topic ? `${this.baseURL}/${topic}` : this.baseURL;
  //   const headers: Record<string, string> = {};
  //   if (this.auth) {
  //     headers["Authorization"] = `Basic ${this.auth}`;
  //   }

  //   try {
  //     // Use a short timeout for the connectivity check
  //     await axios.get(url, { headers, timeout: 5000, validateStatus: (status) => status < 400 });
  //     console.log(`[ntfy] Connection verified: ${url}`);
  //   } catch (error) {
  //     console.error(`[ntfy] Connection check failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  //     throw new Error(`ntfy server unreachable or authentication failed at ${url}`);
  //   }
  // }
}
