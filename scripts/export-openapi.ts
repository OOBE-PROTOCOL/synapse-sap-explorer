#!/usr/bin/env node

/**
 * OpenAPI Schema Export
 * 
 * Generates OpenAPI 3.1 specification from cached tool schemas.
 * Exports to /public/openapi/v1.tools.json
 * 
 * Usage:
 *   pnpm tsx scripts/export-openapi.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_PATH = join(process.cwd(), 'public', 'openapi', 'v1.tools.json');

interface ToolSchema {
  toolPda: string;
  toolName: string;
  schemaJson: Record<string, unknown>;
  httpMethod: string;
  category: string;
}

interface OpenAPIPath {
  post?: {
    operationId: string;
    summary: string;
    description?: string;
    tags: string[];
    requestBody: {
      required: boolean;
      content: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    };
    responses: {
      '200': {
        description: string;
        content: {
          'application/json': {
            schema: Record<string, unknown>;
          };
        };
      };
      '400': {
        description: string;
      };
      '401': {
        description: string;
      };
    };
  };
}

function generateOpenAPI(schemas: ToolSchema[]) {
  const openapi: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: 'SAP Tool Registry',
      version: '1.0.0',
      description: 'Auto-generated OpenAPI specification from on-chain tool schemas',
      contact: {
        name: 'Synapse Protocol',
        url: 'https://synapse.oobeprotocol.ai',
      },
    },
    servers: [
      {
        url: 'https://us-1-mainnet.oobeprotocol.ai',
        description: 'Mainnet US',
      },
      {
        url: 'https://staging.oobeprotocol.ai',
        description: 'Mainnet EU',
      },
    ],
    tags: [
      {
        name: 'Tools',
        description: 'SAP Tool endpoints',
      },
    ],
    paths: {} as Record<string, OpenAPIPath>,
    components: {
      schemas: {} as Record<string, Record<string, unknown>>,
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'query',
          name: 'api_key',
        },
      },
    },
    security: [{ apiKey: [] }],
  };

  // Generate paths from schemas
  schemas.forEach((tool) => {
    const path = `/api/execute/${tool.toolPda}`;
    const operationId = `execute_${tool.toolName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    
    openapi.paths![path] = {
      post: {
        operationId,
        summary: `Execute ${tool.toolName}`,
        description: tool.schemaJson.description as string || `Execute the ${tool.toolName} tool`,
        tags: ['Tools', tool.category],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: tool.schemaJson,
            },
          },
        },
        responses: {
          '200': {
            description: 'Successful execution',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    result: { type: 'object' },
                    signature: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid parameters',
          },
          '401': {
            description: 'Invalid API key',
          },
        },
      },
    };

    // Add schema to components
    openapi.components!.schemas![tool.toolName] = tool.schemaJson;
  });

  return openapi;
}

async function exportOpenAPI() {
  console.log('📝 Generating OpenAPI specification...');
  
  try {
    // Fetch schemas from API
    const response = await fetch('http://localhost:3001/api/sap/tools/schemas');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch schemas: ${response.statusText}`);
    }

    const data: { schemas: Array<{ toolPda: string; schemaJson: Record<string, unknown> }> } = await response.json();
    
    // We need tool names from the tools API
    const toolsResponse = await fetch('http://localhost:3001/api/sap/tools');
    const toolsData: { tools: Array<{ pda: string; descriptor?: { toolName?: string; httpMethod?: Record<string, unknown>; category?: Record<string, unknown> }> } } = await toolsResponse.json();
    
    // Merge schemas with tool metadata
    const schemas: ToolSchema[] = data.schemas.map((schema) => {
      const tool = toolsData.tools.find((t) => t.pda === schema.toolPda);
      return {
        toolPda: schema.toolPda,
        toolName: tool?.descriptor?.toolName || 'Unknown Tool',
        schemaJson: schema.schemaJson,
        httpMethod: tool?.descriptor?.httpMethod ? Object.keys(tool.descriptor.httpMethod)[0] : 'POST',
        category: tool?.descriptor?.category ? Object.keys(tool.descriptor.category)[0] : 'Custom',
      };
    });

    const openapi = generateOpenAPI(schemas);

    // Ensure output directory exists
    const dir = join(OUTPUT_PATH, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write OpenAPI spec
    writeFileSync(OUTPUT_PATH, JSON.stringify(openapi, null, 2));

    console.log(`✅ OpenAPI spec generated successfully!`);
    console.log(`📄 Output: ${OUTPUT_PATH}`);
    console.log(`📊 Tools exported: ${schemas.length}`);
    console.log('');
    console.log('🌐 View at:');
    console.log(`   - Swagger UI: http://localhost:3001/swagger/?url=/openapi/v1.tools.json`);
    console.log(`   - Raw JSON: http://localhost:3001/openapi/v1.tools.json`);
    
    return openapi;
  } catch (error) {
    console.error('❌ OpenAPI export failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  exportOpenAPI();
}

export { generateOpenAPI, exportOpenAPI };
