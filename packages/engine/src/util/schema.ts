/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import Ajv, { ErrorObject } from 'ajv';
import type { JSONSchema7 } from '../types';

// Separate Ajv instance for strict schema validation
const strictAjv = new Ajv({ 
  allErrors: true, 
  verbose: true,
  strict: true,
  strictSchema: true,
  strictTypes: true,
  strictNumbers: true,
  strictTuples: true,
  strictRequired: true,
  logger: false // Suppress console output
});

export interface SchemaValidationError {
  valid: boolean;
  errors?: Array<{
    instancePath: string;
    schemaPath: string;
    keyword: string;
    params: Record<string, unknown>;
    message: string;
  }>;
}

export function validateSchema(schema: JSONSchema7): SchemaValidationError {
  const errors: Array<{
    instancePath: string;
    schemaPath: string;
    keyword: string;
    params: Record<string, unknown>;
    message: string;
  }> = [];

  // Manual validation checks for common issues
  // Check if schema has properties but no type (strict mode requirement)
  if (schema.properties && !schema.type) {
    errors.push({
      instancePath: '',
      schemaPath: '#',
      keyword: 'strictTypes',
      params: {},
      message: 'missing type "object" for keyword "properties"'
    });
  }

  // Check if schema has items but no type (for arrays)
  if (schema.items && !schema.type) {
    errors.push({
      instancePath: '',
      schemaPath: '#',
      keyword: 'strictTypes',
      params: {},
      message: 'missing type "array" for keyword "items"'
    });
  }

  // Validate type values
  if (schema.type) {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'null', 'object', 'array'];
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    for (const type of types) {
      if (typeof type === 'string' && !validTypes.includes(type)) {
        errors.push({
          instancePath: '',
          schemaPath: '#/type',
          keyword: 'type',
          params: { type },
          message: `invalid type "${type}"`
        });
      }
    }
  }

  // Validate property types
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        if (propSchema.type) {
          const validTypes = ['string', 'number', 'integer', 'boolean', 'null', 'object', 'array'];
          const types = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
          for (const type of types) {
            if (typeof type === 'string' && !validTypes.includes(type)) {
              errors.push({
                instancePath: `/${propName}`,
                schemaPath: `#/properties/${propName}/type`,
                keyword: 'type',
                params: { type },
                message: `invalid type "${type}" for property "${propName}"`
              });
            }
          }
        }
      }
    }
  }

  // If we found manual errors, return them
  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  // Reset errors before Ajv validation
  strictAjv.errors = null;
  
  try {
    // Use validateSchema if available, otherwise compile
    let valid: boolean;
    if (typeof strictAjv.validateSchema === 'function') {
      valid = strictAjv.validateSchema(schema) as boolean;
    } else {
      // Fallback to compile
      strictAjv.compile(schema);
      valid = true;
    }
    
    // Check for Ajv errors
    if (!valid || (strictAjv.errors && (strictAjv.errors as ErrorObject[])?.length > 0)) {
      const ajvErrors = strictAjv.errors || [];
      return {
        valid: false,
        errors: ajvErrors.map((err: ErrorObject) => ({
          instancePath: err.instancePath || '',
          schemaPath: err.schemaPath || '',
          keyword: err.keyword || '',
          params: err.params || {},
          message: err.message || 'Unknown validation error'
        }))
      };
    }
    
    return { valid: true };
  } catch (error: unknown) {
    // If validation throws, check for errors in ajv
    if (strictAjv.errors && (strictAjv.errors as ErrorObject[]).length > 0) {
      return {
        valid: false,
        errors: (strictAjv.errors  as ErrorObject[]).map((err: ErrorObject) => ({
          instancePath: err.instancePath || '',
          schemaPath: err.schemaPath || '',
          keyword: err.keyword || '',
          params: err.params || {},
          message: err.message || 'Unknown validation error'
        }))
      };
    }
    
    // Fallback to error message
    return {
      valid: false,
      errors: [{
        instancePath: '',
        schemaPath: '',
        keyword: 'unknown',
        params: {},
        message: error instanceof Error ? error.message : 'Schema validation failed'
      }]
    };
  }
}

export function hasJsonKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('json') ||
    lower.includes('{') ||
    lower.includes('[') ||
    lower.includes('"')
  );
}

export function hasProseAfterJsonPattern(text: string): boolean {
  const patterns = [
    /add\s+(?:notes|commentary|explanation|discussion)\s+(?:after|following|below)/i,
    /include\s+(?:notes|commentary|explanation|discussion)\s+(?:after|following|below)/i,
    /output\s+json\s+(?:and|then|followed\s+by)/i,
    /json\s+(?:and|then|followed\s+by)\s+(?:notes|commentary|explanation)/i
  ];
  return patterns.some((p) => p.test(text));
}

