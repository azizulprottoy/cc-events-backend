// Hand-written OpenAPI spec for the public ingestion API — the actual
// integration surface startups build against. Dashboard/admin APIs are
// internal to the eventfrontend app and not documented here.
module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'MarcoPolo Ingestion API',
    version: '1.0.0',
    description: 'Public API for tracking events, identifying users, and fetching recommendations.',
  },
  servers: [{ url: '/v1' }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
      ApiSecretAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Secret',
      },
    },
    schemas: {
      TrackEvent: {
        type: 'object',
        required: ['externalId', 'event'],
        properties: {
          externalId: { type: 'string', description: "Your own user id", example: 'user_123' },
          event: { type: 'string', example: 'AddToCart' },
          properties: { type: 'object', additionalProperties: true },
          timestamp: { type: 'string', format: 'date-time' },
          sessionId: { type: 'string' },
          source: { type: 'string', enum: ['web', 'mobile', 'server'] },
          context: {
            type: 'object',
            properties: {
              ip: { type: 'string' },
              userAgent: { type: 'string' },
              url: { type: 'string' },
              deviceInfo: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      Identify: {
        type: 'object',
        required: ['externalId'],
        properties: {
          externalId: { type: 'string' },
          traits: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              phone: { type: 'string' },
              pushToken: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [], ApiSecretAuth: [] }],
  paths: {
    '/events': {
      post: {
        summary: 'Track a single event',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TrackEvent' } } },
        },
        responses: { 201: { description: 'Event stored' }, 400: { description: 'Validation error' }, 401: { description: 'Invalid API key/secret' } },
      },
    },
    '/events/batch': {
      post: {
        summary: 'Track multiple events in one call',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'array', items: { $ref: '#/components/schemas/TrackEvent' } },
            },
          },
        },
        responses: { 201: { description: 'Batch processed (partial failures reported per-item)' } },
      },
    },
    '/identify': {
      post: {
        summary: 'Create or update an end-user profile',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Identify' } } },
        },
        responses: { 200: { description: 'End-user upserted' } },
      },
    },
    '/recommendations/{externalId}': {
      get: {
        summary: "Fetch an end-user's current recommendation list",
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Recommendation list (empty items array if none generated yet)' } },
      },
    },
  },
};
