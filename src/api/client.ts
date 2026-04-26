import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { invalidateTokenCache } from '../auth/bearer.js';

const USER_AGENT = 'uplup-mcp/0.1 (+https://uplup.com)';

export class UplupApiClient {
  private readonly http: AxiosInstance;

  constructor(bearerToken: string, baseURL: string = process.env.UPLUP_API_BASE_URL ?? 'https://api.uplup.com') {
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });

    // If upstream rejects the bearer token mid-session, drop it from the
    // bearer-auth validity cache so the next /mcp request triggers an
    // HTTP 401 + WWW-Authenticate response — that's the signal the MCP
    // client SDK uses to refresh tokens via OAuth and retry transparently.
    this.http.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401) {
          invalidateTokenCache(bearerToken);
        }
        return Promise.reject(err);
      },
    );
  }

  async get<T = unknown>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.get<T>(path, config);
    return res.data;
  }

  async post<T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.post<T>(path, body ?? {}, config);
    return res.data;
  }

  async patch<T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.patch<T>(path, body ?? {}, config);
    return res.data;
  }

  async put<T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.put<T>(path, body ?? {}, config);
    return res.data;
  }

  async delete<T = unknown>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.delete<T>(path, config);
    return res.data;
  }
}
