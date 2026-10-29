const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Assistance Schedule Autopost REST API',
    version: '1.0.0',
    description:
      'Modular Multi-Niche Autopost Service with Database-backed Prompts, Editorial Poster Generation, and Telegram Bot Integration.',
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server',
    },
  ],
  tags: [
    {
      name: 'Posts',
      description: 'Article autopost triggers, execution logs, retries, and deletion',
    },
    {
      name: 'Niches',
      description: 'Multi-niche management and metadata',
    },
    {
      name: 'Prompts',
      description: 'Database-backed AI prompt templates, versioning, reset, and preview test',
    },
    {
      name: 'System',
      description: 'Health checks, runtime configuration telemetry, and post statistics',
    },
    {
      name: 'Bot Configuration',
      description: 'Telegram bot tokens and allowed user registries',
    },
  ],
  paths: {
    '/api/v1/system/status': {
      get: {
        tags: ['System'],
        summary: 'Get system health and configuration status',
        description: 'Returns health status of the database connection, API integrations, and process runtime telemetry.',
        operationId: 'getSystemStatus',
        responses: {
          200: {
            description: 'System status retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/SystemStatus' },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/system/stats': {
      get: {
        tags: ['System'],
        summary: 'Get aggregate system and post statistics',
        description: 'Aggregates total posts, publication statuses, posts created today, and per-niche metrics.',
        operationId: 'getSystemStats',
        responses: {
          200: {
            description: 'System statistics retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/SystemStats' },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches': {
      get: {
        tags: ['Niches'],
        summary: 'List all niches',
        description: 'Retrieves all registered niches alongside their prompt counts and post log counts.',
        operationId: 'listNiches',
        responses: {
          200: {
            description: 'List of niches retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Niche' },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Niches'],
        summary: 'Create a new niche',
        description: 'Creates a new unique niche topic and seeds its baseline prompt configuration.',
        operationId: 'createNiche',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateNicheRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Niche created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Niche' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error: Missing required fields',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          409: {
            description: 'Conflict: Niche code already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches/{code}': {
      get: {
        tags: ['Niches'],
        summary: 'Get niche details by code',
        description: 'Fetches details of a niche including its active prompt templates.',
        operationId: 'getNicheByCode',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
        ],
        responses: {
          200: {
            description: 'Niche details retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Niche' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Niches'],
        summary: 'Update niche metadata',
        description: 'Updates display name, description, or active status for a niche.',
        operationId: 'updateNiche',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateNicheRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Niche updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Niche' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Niches'],
        summary: 'Deactivate or permanently delete a niche',
        description: 'Deactivates a niche by default. If permanent=true query parameter is supplied, hard deletes the record.',
        operationId: 'deleteNiche',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
          {
            name: 'permanent',
            in: 'query',
            required: false,
            description: 'Hard delete the niche if set to "true"',
            schema: { type: 'boolean', default: false },
          },
        ],
        responses: {
          200: {
            description: 'Niche deactivated or deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Niche deactivated successfully' },
                    data: { $ref: '#/components/schemas/Niche' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches/{nicheCode}/prompts': {
      get: {
        tags: ['Prompts'],
        summary: 'List active prompts for a niche',
        description: 'Retrieves all active prompt templates (entity extraction, visual poster layout, caption) for the given niche.',
        operationId: 'listPrompts',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
        ],
        responses: {
          200: {
            description: 'Prompts retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Prompt' },
                    },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches/{nicheCode}/prompts/{type}': {
      get: {
        tags: ['Prompts'],
        summary: 'Get prompt by type',
        description: 'Retrieves active prompt definition for a specific niche and prompt type.',
        operationId: 'getPromptByType',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
          {
            name: 'type',
            in: 'path',
            required: true,
            description: 'Prompt type identifier',
            schema: {
              type: 'string',
              enum: ['entity_extraction', 'visual_image', 'caption_template'],
              example: 'entity_extraction',
            },
          },
        ],
        responses: {
          200: {
            description: 'Prompt retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Prompt' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Prompt or niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Prompts'],
        summary: 'Update prompt configuration',
        description: 'Updates prompt template text or AI parameters, deactivating previous version and incrementing version number.',
        operationId: 'updatePrompt',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
          {
            name: 'type',
            in: 'path',
            required: true,
            description: 'Prompt type identifier',
            schema: {
              type: 'string',
              enum: ['entity_extraction', 'visual_image', 'caption_template'],
              example: 'entity_extraction',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdatePromptRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Prompt updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Prompt' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Prompt or niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches/{nicheCode}/prompts/{type}/reset': {
      post: {
        tags: ['Prompts'],
        summary: 'Reset prompt to baseline template',
        description: 'Reverts the prompt to its hardcoded baseline definition and increments the version counter.',
        operationId: 'resetPrompt',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
          {
            name: 'type',
            in: 'path',
            required: true,
            description: 'Prompt type identifier',
            schema: {
              type: 'string',
              enum: ['entity_extraction', 'visual_image', 'caption_template'],
              example: 'entity_extraction',
            },
          },
        ],
        responses: {
          200: {
            description: 'Prompt successfully reset to baseline',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Prompt "entity_extraction" for niche "finance" reset to baseline' },
                    data: { $ref: '#/components/schemas/Prompt' },
                  },
                },
              },
            },
          },
          400: {
            description: 'No baseline prompt found for specified type',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/niches/{nicheCode}/prompts/test': {
      post: {
        tags: ['Prompts'],
        summary: 'Test prompt configuration without persisting',
        description:
          'Simulates prompt execution against sample article text or entities without saving changes to the database.',
        operationId: 'testPrompt',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TestPromptRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Prompt test executed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', example: 'entity_extraction' },
                        preview: { type: 'string' },
                        entities: { type: 'object' },
                        result: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error or AI inference failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/posts': {
      get: {
        tags: ['Posts'],
        summary: 'List post execution logs',
        description: 'Retrieves paginated post execution logs with filtering by niche, status, and title search.',
        operationId: 'listPosts',
        parameters: [
          {
            name: 'page',
            in: 'query',
            required: false,
            description: 'Page number (1-based index)',
            schema: { type: 'integer', default: 1, minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Number of records per page (max 100)',
            schema: {
              type: 'integer',
              default: 20,
              minimum: 1,
              maximum: 100,
            },
          },
          {
            name: 'nicheCode',
            in: 'query',
            required: false,
            description: 'Filter posts by unique niche code',
            schema: { type: 'string', example: 'finance' },
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            description: 'Filter posts by pipeline execution status',
            schema: {
              type: 'string',
              enum: ['pending', 'extracting', 'generating', 'ready', 'publishing', 'published', 'failed'],
              example: 'published',
            },
          },
          {
            name: 'search',
            in: 'query',
            required: false,
            description: 'Search string matching article title or source',
            schema: { type: 'string', example: 'Bank Indonesia' },
          },
        ],
        responses: {
          200: {
            description: 'Post logs retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        items: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/PostLog' },
                        },
                        total: { type: 'integer', example: 42 },
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 20 },
                        totalPages: { type: 'integer', example: 3 },
                      },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Posts'],
        summary: 'Trigger article autopost pipeline',
        description:
          'Triggers the full processing pipeline: scrapes/parses input, extracts structured entities via OpenAI, renders poster graphic, and publishes via Zernio.',
        operationId: 'createPost',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePostRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Post pipeline executed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error: Missing required input',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error or pipeline execution failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/posts/{id}': {
      get: {
        tags: ['Posts'],
        summary: 'Get post log by ID',
        description: 'Retrieves complete record of a post execution log, including AI outputs, poster path, and Zernio platform response.',
        operationId: 'getPostById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Numeric ID of the post log',
            schema: { type: 'integer', example: 1 },
          },
        ],
        responses: {
          200: {
            description: 'Post log retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/PostLog' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Post log not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Posts'],
        summary: 'Delete a post log record',
        description: 'Permanently deletes a post log entry from the database.',
        operationId: 'deletePost',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Numeric ID of the post log',
            schema: { type: 'integer', example: 1 },
          },
        ],
        responses: {
          200: {
            description: 'Post log deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Post log deleted successfully' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Post log not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/posts/{id}/retry': {
      post: {
        tags: ['Posts'],
        summary: 'Retry post processing pipeline',
        description: 'Re-runs the extraction, generation, and publishing pipeline for an existing post log record.',
        operationId: 'retryPost',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Numeric ID of the post log to retry',
            schema: { type: 'integer', example: 1 },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RetryPostRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Post retry pipeline executed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Cannot retry post: Missing article input on record',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          404: {
            description: 'Post log not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error or pipeline retry failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/bot-configs': {
      get: {
        tags: ['Bot Configuration'],
        summary: 'List Telegram bot configurations',
        description: 'Retrieves Telegram bot configurations across all niches with bot tokens masked for security.',
        operationId: 'getBotConfigs',
        responses: {
          200: {
            description: 'Bot configurations retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/BotConfig' },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/bot-configs/{nicheCode}': {
      put: {
        tags: ['Bot Configuration'],
        summary: 'Update or create Telegram bot configuration for a niche',
        description: 'Configures Telegram bot credentials, username, and allowed user ID whitelist for a specific niche.',
        operationId: 'updateBotConfig',
        parameters: [
          {
            name: 'nicheCode',
            in: 'path',
            required: true,
            description: 'Unique niche slug/code',
            schema: { type: 'string', example: 'finance' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateBotConfigRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Bot configuration updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/BotConfig' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Niche not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardError' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      StandardError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Resource not found' },
              code: { type: 'string', example: 'NOT_FOUND' },
              statusCode: { type: 'integer', example: 404 },
            },
            required: ['message', 'statusCode'],
          },
        },
        required: ['success', 'error'],
      },
      Niche: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          code: { type: 'string', example: 'finance' },
          name: { type: 'string', example: 'Financial News' },
          description: {
            type: 'string',
            nullable: true,
            example: 'Indonesian stock and macro financial news autopost',
          },
          isActive: { type: 'boolean', example: true },
          promptCount: { type: 'integer', example: 3 },
          postCount: { type: 'integer', example: 15 },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
        },
      },
      Prompt: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nicheId: { type: 'integer', example: 1 },
          type: {
            type: 'string',
            enum: ['entity_extraction', 'visual_image', 'caption_template'],
            example: 'entity_extraction',
          },
          name: { type: 'string', example: 'Entity Extraction Prompt' },
          systemPrompt: {
            type: 'string',
            example: 'You are a professional financial news analyst and editor...',
          },
          userPromptTemplate: {
            type: 'string',
            nullable: true,
            example: 'Extract entities from this article: {{input}}',
          },
          config: {
            type: 'object',
            example: { model: 'gpt-4o-mini', temperature: 0.2 },
          },
          version: { type: 'integer', example: 1 },
          isActive: { type: 'boolean', example: true },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
        },
      },
      PostLog: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nicheId: { type: 'integer', example: 1 },
          articleTitle: {
            type: 'string',
            nullable: true,
            example: 'Bank Indonesia Naikkan Suku Bunga Acuan 25 bps Jadi 6,25%',
          },
          articleSource: {
            type: 'string',
            nullable: true,
            example: 'CNBC Indonesia',
          },
          articleUrl: {
            type: 'string',
            nullable: true,
            example: 'https://cnbcindonesia.com/market/20250101-bi-rate-naik',
          },
          articleContent: {
            type: 'string',
            nullable: true,
            example: 'Rapat Dewan Gubernur Bank Indonesia memutuskan...',
          },
          extractedData: {
            type: 'object',
            nullable: true,
            example: {
              category: 'MAKRO',
              headline: 'BI NAIKKAN SUKU BUNGA 25 BPS',
              subtitle: 'Menjaga stabilitas nilai tukar Rupiah',
            },
          },
          generatedPrompt: { type: 'string', nullable: true },
          imagePath: {
            type: 'string',
            nullable: true,
            example: 'output/finance/finance_1710000000.png',
          },
          caption: {
            type: 'string',
            nullable: true,
            example: 'Bank Indonesia menaikkan suku bunga acuan...',
          },
          zernioPostId: {
            type: 'string',
            nullable: true,
            example: 'zn_post_987654',
          },
          zernioStatus: {
            type: 'string',
            nullable: true,
            example: 'success',
          },
          zernioPlatformPostUrl: {
            type: 'string',
            nullable: true,
            example: 'https://instagram.com/p/C3XYZ123',
          },
          zernioResponse: { type: 'object', nullable: true },
          status: {
            type: 'string',
            enum: ['pending', 'extracting', 'generating', 'ready', 'publishing', 'published', 'failed'],
            example: 'published',
          },
          error: { type: 'string', nullable: true },
          triggeredBy: { type: 'string', nullable: true, example: 'api' },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T00:00:00.000Z',
          },
          niche: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              code: { type: 'string', example: 'finance' },
              name: { type: 'string', example: 'Financial News' },
            },
          },
        },
      },
      BotConfig: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nicheId: { type: 'integer', example: 1 },
          botToken: {
            type: 'string',
            example: '1234...wxyz',
            description: 'Masked bot token string',
          },
          botUsername: {
            type: 'string',
            nullable: true,
            example: 'FinanceNewsPostBot',
          },
          allowedUsers: {
            type: 'string',
            nullable: true,
            example: '12345678,87654321',
          },
          isActive: { type: 'boolean', example: true },
          hasToken: { type: 'boolean', example: true },
          niche: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              code: { type: 'string', example: 'finance' },
              name: { type: 'string', example: 'Financial News' },
            },
          },
        },
      },
      SystemStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['ok', 'degraded'],
            example: 'ok',
          },
          database: { type: 'string', example: 'connected' },
          openaiConfigured: { type: 'boolean', example: true },
          zernioConfigured: { type: 'boolean', example: true },
          activeNiche: { type: 'string', example: 'finance' },
          nodeVersion: { type: 'string', example: 'v20.18.0' },
          uptime: {
            type: 'integer',
            example: 3600,
            description: 'Uptime in seconds',
          },
          environment: { type: 'string', example: 'development' },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-01T12:00:00.000Z',
          },
        },
      },
      SystemStats: {
        type: 'object',
        properties: {
          totalPosts: { type: 'integer', example: 42 },
          publishedPosts: { type: 'integer', example: 38 },
          failedPosts: { type: 'integer', example: 3 },
          pendingPosts: { type: 'integer', example: 1 },
          postsToday: { type: 'integer', example: 5 },
          byNiche: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'finance' },
                name: { type: 'string', example: 'Financial News' },
                total: { type: 'integer', example: 42 },
                published: { type: 'integer', example: 38 },
              },
            },
          },
        },
      },
      CreatePostRequest: {
        type: 'object',
        properties: {
          nicheCode: {
            type: 'string',
            default: 'finance',
            example: 'finance',
            description: 'Niche code for prompts and configuration',
          },
          input: {
            type: 'string',
            description: 'Article web URL to scrape or direct raw article content',
            example: 'https://finance.detik.com/bursa-dan-valas/d-7234567/ihsg-menguat-ke-level-7300',
          },
          dryRun: {
            type: 'boolean',
            default: false,
            description: 'Run pipeline without publishing to Zernio',
          },
          skipPublish: {
            type: 'boolean',
            default: false,
            description: 'Skip publishing step, generating poster and caption only',
          },
        },
        required: ['input'],
      },
      CreateNicheRequest: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            example: 'crypto',
            description: 'Unique identifier slug for the niche',
          },
          name: {
            type: 'string',
            example: 'Crypto & Web3 Daily',
            description: 'Human-readable display name',
          },
          description: {
            type: 'string',
            example: 'Cryptocurrency market highlights and DeFi trends',
          },
          isActive: {
            type: 'boolean',
            default: true,
          },
        },
        required: ['code', 'name'],
      },
      UpdateNicheRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Crypto & Web3 News' },
          description: { type: 'string', example: 'Updated niche description' },
          isActive: { type: 'boolean', example: true },
        },
      },
      UpdatePromptRequest: {
        type: 'object',
        properties: {
          systemPrompt: {
            type: 'string',
            example: 'You are an expert financial journalist...',
          },
          userPromptTemplate: {
            type: 'string',
            example: 'Analyze and extract key information from this news text: {{input}}',
          },
          config: {
            type: 'object',
            example: { model: 'gpt-4o', temperature: 0.3 },
          },
        },
      },
      TestPromptRequest: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['entity_extraction', 'visual_image', 'caption_template'],
            default: 'entity_extraction',
            example: 'entity_extraction',
          },
          text: {
            type: 'string',
            example: 'Bank Indonesia menaikkan suku bunga 25 bps menjadi 6,25% demi memperkuat stabilitas nilai tukar Rupiah.',
          },
          systemPrompt: {
            type: 'string',
            example: 'Optional override for the system prompt during this preview test',
          },
          config: {
            type: 'object',
            example: { model: 'gpt-4o-mini' },
          },
          sampleEntities: {
            type: 'object',
            example: {
              category: 'MAKRO',
              headline: 'BANK INDONESIA NAIKKAN SUKU BUNGA ACUAN 25 BPS JADI 6,25%',
              subtitle: 'Langkah moneter ditempuh untuk memitigasi tekanan inflasi.',
              person: { name: 'Perry Warjiyo', role: 'Gubernur Bank Indonesia' },
              stocks: [{ ticker: 'BBCA', name: 'Bank Central Asia' }],
              composition_mode: 'both',
            },
          },
        },
      },
      UpdateBotConfigRequest: {
        type: 'object',
        properties: {
          botToken: {
            type: 'string',
            example: '1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ',
            description: 'Telegram Bot API Token from @BotFather',
          },
          botUsername: {
            type: 'string',
            example: 'FinanceNewsAutopostBot',
          },
          allowedUsers: {
            type: 'string',
            example: '12345678,87654321',
            description: 'Comma-separated Telegram user IDs allowed to interact with the bot',
          },
          isActive: { type: 'boolean', example: true },
        },
      },
      RetryPostRequest: {
        type: 'object',
        properties: {
          dryRun: {
            type: 'boolean',
            default: false,
            description: 'Run pipeline retry without publishing to Zernio',
          },
          skipPublish: {
            type: 'boolean',
            default: false,
            description: 'Skip publishing step during retry',
          },
        },
      },
    },
  },
};

Object.defineProperty(swaggerSpec, 'swaggerSpec', {
  value: swaggerSpec,
  enumerable: false,
  writable: false,
  configurable: false,
});

module.exports = swaggerSpec;
