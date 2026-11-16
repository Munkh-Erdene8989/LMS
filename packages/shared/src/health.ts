/** API-ийн `GET /health` хариуны хэлбэр. Web болон API хоёулаа ашиглана. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  brand: string;
  time: string;
}
