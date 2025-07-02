import axios, { AxiosInstance } from 'axios';
import { AuthRequest, AuthResponse, InitiateHandshakeRequest, InitiateHandshakeResponse, MessageReceiveRequest, MessageReceiveResponse, RequestPassCodeResponse, SendMessageRequest, SendMessageResponse } from './type';

export interface OpenMsgClientConfig {
    domain: string;
    sandbox?: boolean;
    timeout?: number;
    baseURL?: string;
}

export class OpenMsgClient {
    private httpClient: AxiosInstance;
    private domain: string;
    private sandbox: boolean;
    private baseURL: string;

    constructor(config: OpenMsgClientConfig) {
        this.domain = config.domain;
        this.sandbox = config.sandbox ?? true;
        this.baseURL = config.baseURL ?? `https://${this.domain}`;

        const basePath = this.sandbox ? '/openmsg/sandbox' : '/openmsg';

        this.httpClient = axios.create({
            baseURL: `${this.baseURL}${basePath}`,
            timeout: config.timeout ?? 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Request a pass code for handshake initiation
     */
    async requestPassCode(selfOpenmsgAddress: string): Promise<RequestPassCodeResponse> {
        try {
            const response = await this.httpClient.post<RequestPassCodeResponse>(
                '/setup/request-pass-code',
                { self_openmsg_address: selfOpenmsgAddress }
            );
            return response.data;
        } catch (error) {
            return {
                error: true,
                error_message: `Request failed: ${(error as Error).message}`
            };
        }
    }

    /**
     * Initiate a handshake with another OpenMsg address
     */
    async initiateHandshake(request: InitiateHandshakeRequest): Promise<InitiateHandshakeResponse> {
        try {
            const response = await this.httpClient.post<InitiateHandshakeResponse>(
                '/setup/initiate-handshake',
                request
            );
            return response.data;
        } catch (error) {
            return {
                error: true,
                message: `Handshake failed: ${(error as Error).message}`
            };
        }
    }

    /**
     * Send a message to another OpenMsg address
     */
    async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
        try {
            const response = await this.httpClient.post<SendMessageResponse>(
                '/setup/send-message',
                request
            );
            return response.data;
        } catch (error) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Message send failed: ${(error as Error).message}`
            };
        }
    }

    /**
     * Handle incoming authentication request (for server implementations)
     */
    async handleAuth(request: AuthRequest): Promise<AuthResponse> {
        try {
            const response = await this.httpClient.post<AuthResponse>('/auth', request);
            return response.data;
        } catch (error) {
            return {
                error: true,
                error_message: `Auth failed: ${(error as Error).message}`
            };
        }
    }

    /**
     * Handle incoming message (for server implementations)
     */
    async receiveMessage(request: MessageReceiveRequest): Promise<MessageReceiveResponse> {
        try {
            const response = await this.httpClient.post<MessageReceiveResponse>(
                '/message/receive',
                request
            );
            return response.data;
        } catch (error) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Message receive failed: ${(error as Error).message}`
            };
        }
    }

    /**
     * Get protocol information
     */
    async getInfo(): Promise<any> {
        try {
            const response = await this.httpClient.get('/info');
            return response.data;
        } catch (error) {
            throw new Error(`Info request failed: ${(error as Error).message}`);
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<any> {
        try {
            const response = await axios.get(`${this.baseURL}/health`);
            return response.data;
        } catch (error) {
            throw new Error(`Health check failed: ${(error as Error).message}`);
        }
    }

    /**
     * Update client configuration
     */
    updateConfig(config: Partial<OpenMsgClientConfig>): void {
        if (config.domain) this.domain = config.domain;
        if (config.sandbox !== undefined) this.sandbox = config.sandbox;
        if (config.baseURL) this.baseURL = config.baseURL;

        const basePath = this.sandbox ? '/openmsg/sandbox' : '/openmsg';
        this.httpClient = axios.create({
            baseURL: `${this.baseURL}${basePath}`,
            timeout: config.timeout ?? 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
} 