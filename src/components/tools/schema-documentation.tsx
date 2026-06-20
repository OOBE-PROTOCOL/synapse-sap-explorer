'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { BookOpen, CheckCircle2, AlertCircle, Code, FileJson } from 'lucide-react';
import { cn } from '~/lib/utils';

interface JsonSchema {
  type?: string;
  properties?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    enum?: unknown[];
  }>;
  required?: string[];
  description?: string;
}

interface SchemaDocumentationProps {
  schema: JsonSchema | null;
  toolName?: string;
  compact?: boolean;
}

/**
 * SchemaDocumentation - Auto-generated documentation from JSON Schema
 * 
 * Features:
 * - Visual parameter list with types
 * - Required/optional indicators
 * - Default values display
 * - Constraints (min/max, patterns)
 * - Copy-to-clipboard for examples
 */

export function SchemaDocumentation({
  schema,
  toolName,
  compact = false,
}: SchemaDocumentationProps) {
  const params = useMemo(() => {
    if (!schema?.properties) return [];
    
    return Object.entries(schema.properties).map(([key, field]) => ({
      name: key,
      type: field.type || 'any',
      description: field.description,
      required: schema.required?.includes(key) || field.required || false,
      default: field.default,
      constraints: {
        minLength: field.minLength,
        maxLength: field.maxLength,
        minimum: field.minimum,
        maximum: field.maximum,
        pattern: field.pattern,
        enum: field.enum,
      },
    }));
  }, [schema]);

  if (!schema) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              No Schema Documentation
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The tool may not have an inscribed schema. Check if the schema has been scanned from on-chain data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn(compact ? 'p-3' : 'p-6')}>
      <CardHeader className={cn(compact ? 'p-0' : 'p-0 mb-4')}>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          <span>Schema Documentation</span>
          {toolName && (
            <Badge variant="outline" className="text-xs ml-auto">
              {toolName}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className={cn(compact ? 'p-0 mt-2' : 'p-0')}>
        {schema.description && (
          <p className="text-sm text-muted-foreground mb-4">
            {schema.description}
          </p>
        )}

        <div className="space-y-3">
          {params.map((param) => (
            <div
              key={param.name}
              className="rounded-lg border border-border/40 bg-muted/30 p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-semibold text-foreground">
                    {param.name}
                  </code>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      'text-xs',
                      param.type === 'string' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
                      param.type === 'number' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      param.type === 'boolean' && 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
                      param.type === 'array' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                    )}
                  >
                    {param.type}
                  </Badge>
                  {param.required ? (
                    <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                      Required
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                      Optional
                    </Badge>
                  )}
                </div>
              </div>

              {param.description && (
                <p className="text-xs text-muted-foreground mb-2">
                  {param.description}
                </p>
              )}

              {param.default !== undefined && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Default: </span>
                  <code className="bg-background px-1.5 py-0.5 rounded">
                    {String(param.default)}
                  </code>
                </div>
              )}

              {(param.constraints.minLength !== undefined || 
                param.constraints.maxLength !== undefined ||
                param.constraints.minimum !== undefined ||
                param.constraints.maximum !== undefined ||
                param.constraints.pattern !== undefined) && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Code className="h-3 w-3" />
                    <span>Constraints:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {param.constraints.minLength !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Min length: {param.constraints.minLength}
                      </Badge>
                    )}
                    {param.constraints.maxLength !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Max length: {param.constraints.maxLength}
                      </Badge>
                    )}
                    {param.constraints.minimum !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Min: {param.constraints.minimum}
                      </Badge>
                    )}
                    {param.constraints.maximum !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Max: {param.constraints.maximum}
                      </Badge>
                    )}
                    {param.constraints.pattern !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Pattern: {param.constraints.pattern}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {param.constraints.enum && (
                <div className="mt-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <FileJson className="h-3 w-3" />
                    <span>Allowed values:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {param.constraints.enum.map((val, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {String(val)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {params.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No parameters defined in schema
          </p>
        )}
      </CardContent>
    </Card>
  );
}
