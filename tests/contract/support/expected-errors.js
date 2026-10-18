/** The exact error objects Ajv reports for the failures the contract tests provoke, so each test states the full expected `errors` array. */
export class ExpectedErrors {
  static required(property) {
    return {
      instancePath: '',
      schemaPath: '#/required',
      keyword: 'required',
      params: { missingProperty: property },
      message: `must have required property '${property}'`,
    };
  }

  static constant(path, allowedValue) {
    return {
      instancePath: path,
      schemaPath: `#/properties/${path.slice(1)}/const`,
      keyword: 'const',
      params: { allowedValue },
      message: 'must be equal to constant',
    };
  }

  static type(path, type) {
    return {
      instancePath: path,
      schemaPath: `#/properties/${path.slice(1)}/type`,
      keyword: 'type',
      params: { type },
      message: `must be ${type}`,
    };
  }

  static maximum(path, limit) {
    return {
      instancePath: path,
      schemaPath: `#/properties/${path.slice(1)}/maximum`,
      keyword: 'maximum',
      params: { comparison: '<=', limit },
      message: `must be <= ${limit}`,
    };
  }

  static minimum(path, schemaPath, limit) {
    return {
      instancePath: path,
      schemaPath,
      keyword: 'minimum',
      params: { comparison: '>=', limit },
      message: `must be >= ${limit}`,
    };
  }

  static exclusiveMinimum(path, limit) {
    return {
      instancePath: path,
      schemaPath: `#/properties/${path.slice(1)}/exclusiveMinimum`,
      keyword: 'exclusiveMinimum',
      params: { comparison: '>', limit },
      message: `must be > ${limit}`,
    };
  }

  static pattern(path, pattern) {
    return {
      instancePath: path,
      schemaPath: `#/properties/${path.slice(1)}/pattern`,
      keyword: 'pattern',
      params: { pattern },
      message: `must match pattern "${pattern}"`,
    };
  }
}
