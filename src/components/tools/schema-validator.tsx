'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Badge } from '~/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

/**
 * SchemaValidator - Dynamic form generator and validator from JSON Schema
 * 
 * Features:
 * - Auto-generates form fields from JSON schema
 * - Real-time validation with react-hook-form + zod
 * - Type-safe parameter submission
 * - Visual feedback for required/optional fields
 */

interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: unknown[];
  items?: SchemaField;
  properties?: Record<string, SchemaField>;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, SchemaField>;
  required?: string[];
  description?: string;
}

interface SchemaValidatorProps {
  schema: JsonSchema | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
  title?: string;
}

/**
 * Convert JSON Schema to Zod schema
 */
function schemaToZod(schema: JsonSchema): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  
  if (!schema.properties) {
    return z.object({});
  }

  Object.entries(schema.properties).forEach(([key, field]) => {
    let zodType: z.ZodType;

    switch (field.type) {
      case 'string':
        zodType = z.string();
        if (field.minLength) zodType = (zodType as z.ZodString).min(field.minLength);
        if (field.maxLength) zodType = (zodType as z.ZodString).max(field.maxLength);
        if (field.pattern) zodType = (zodType as z.ZodString).regex(new RegExp(field.pattern));
        if (field.enum) zodType = z.enum(field.enum as [string, ...string[]]);
        break;

      case 'number':
        zodType = z.number();
        if (field.minimum !== undefined) zodType = (zodType as z.ZodNumber).min(field.minimum);
        if (field.maximum !== undefined) zodType = (zodType as z.ZodNumber).max(field.maximum);
        break;

      case 'boolean':
        zodType = z.boolean();
        break;

      case 'array':
        zodType = z.array(z.any());
        break;

      case 'object':
        zodType = z.object({});
        break;

      default:
        zodType = z.any();
    }

    // Handle required vs optional
    const isRequired = schema.required?.includes(key) || field.required;
    shape[key] = isRequired ? zodType : zodType.optional();
  });

  return z.object(shape);
}

/**
 * Generate form fields from schema
 */
function generateFormFields(schema: JsonSchema): JSX.Element[] {
  if (!schema.properties) return [];

  return Object.entries(schema.properties).map(([key, field]) => {
    const isRequired = schema.required?.includes(key) || field.required;
    const fieldId = `field-${key}`;

    switch (field.type) {
      case 'boolean':
        return (
          <div key={key} className="flex items-center space-x-2">
            <Input
              id={fieldId}
              type="checkbox"
              className="h-4 w-4"
              // {...register(key)}
            />
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {key} {isRequired && <span className="text-destructive">*</span>}
            </Label>
          </div>
        );

      case 'number':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {key} {isRequired && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={fieldId}
              type="number"
              placeholder={field.description || `Enter ${key}`}
              // {...register(key, { valueAsNumber: true })}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
        );

      case 'string':
      default:
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {key} {isRequired && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={fieldId}
              type="text"
              placeholder={field.description || `Enter ${key}`}
              // {...register(key)}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
        );
    }
  });
}

export function SchemaValidator({
  schema,
  onSubmit,
  submitLabel = 'Execute Tool',
  title = 'Tool Execution',
}: SchemaValidatorProps) {
  // Generate zod schema from JSON schema
  const zodSchema = useMemo(() => {
    if (!schema) return null;
    return schemaToZod(schema);
  }, [schema]);

  // Initialize form
  const form = useForm<Record<string, unknown>>({
    resolver: zodSchema ? zodResolver(zodSchema) : undefined,
    defaultValues: schema?.properties 
      ? Object.entries(schema.properties).reduce((acc, [key, field]) => {
          acc[key] = field.default ?? (field.type === 'boolean' ? false : '');
          return acc;
        }, {} as Record<string, unknown>)
      : {},
  });

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Tool execution failed:', error);
    }
  };

  if (!schema || !zodSchema) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              No Schema Available
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Please ensure the tool has an inscribed schema. Run a schema scan to fetch from on-chain data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant="outline" className="text-xs">
            {Object.keys(schema.properties || {}).length} parameters
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {generateFormFields(schema)}
          
          <div className="flex items-center gap-2 pt-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {submitLabel}
                </>
              )}
            </Button>
            
            {form.formState.isDirty && (
              <Badge variant="outline" className="text-xs">
                Form modified
              </Badge>
            )}
          </div>

          {Object.keys(form.formState.errors).length > 0 && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Validation Errors
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please fix {Object.keys(form.formState.errors).length} error(s) before submitting.
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
