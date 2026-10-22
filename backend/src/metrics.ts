import client from 'prom-client';

// Khởi tạo Registry Prometheus
export const register = new client.Registry();

// Bật các metrics mặc định (CPU, Memory Heap, Event Loop Lag, Active Handles)
client.collectDefaultMetrics({
  register,
  prefix: 'eventify_',
});

// 1. Metric đếm tổng số HTTP requests
export const httpRequestCounter = new client.Counter({
  name: 'eventify_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestCounter);

// 2. Metric Histogram đo độ trễ (latency) của request
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'eventify_http_request_duration_seconds',
  help: 'Histogram of HTTP request durations in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDurationHistogram);

// 3. Metric đếm số lượng đăng ký vé thành công và thất bại
export const ticketRegistrationCounter = new client.Counter({
  name: 'eventify_ticket_registrations_total',
  help: 'Total ticket registrations attempts',
  labelNames: ['status', 'tier'],
});
register.registerMetric(ticketRegistrationCounter);

// 4. Metric Gauge đếm số lượng người tham dự hiện tại
export const activeAttendeesGauge = new client.Gauge({
  name: 'eventify_active_attendees_count',
  help: 'Current total count of confirmed attendees',
});
register.registerMetric(activeAttendeesGauge);
