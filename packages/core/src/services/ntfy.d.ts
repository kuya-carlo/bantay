/**
 * Service to send out-of-band notifications via ntfy.kuyacarlo.dev
 */
export declare class NotificationService {
    private baseURL;
    private auth;
    constructor(config: {
        baseURL: string;
        user: string;
        pass: string;
    });
    /**
     * Sends an alert to the specified topic
     * @param topic ntfy topic name
     * @param message Alert message body
     * @param actions Optional action buttons (approve/deny)
     */
    sendAlert(topic: string, message: string, actions?: any[]): Promise<void>;
}
//# sourceMappingURL=ntfy.d.ts.map