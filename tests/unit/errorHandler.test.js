const { describe, test, expect } = require('@jest/globals');
const { 
  AppError, 
  ValidationError, 
  AuthenticationError,
  validateRequired,
  validateEmail,
  validateLength 
} = require('../../backend/src/utils/errorHandler');

describe('Error Classes', () => {
  describe('AppError', () => {
    test('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', { field: 'test' });
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });
  });

  describe('ValidationError', () => {
    test('should create ValidationError with field information', () => {
      const error = new ValidationError('Email is required', 'email', null);
      
      expect(error.message).toBe('Email is required');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.field).toBe('email');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('AuthenticationError', () => {
    test('should create AuthenticationError with default message', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should create AuthenticationError with custom message', () => {
      const error = new AuthenticationError('Invalid token');
      
      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });
  });
});

describe('Validation Functions', () => {
  describe('validateRequired', () => {
    test('should pass for valid values', () => {
      expect(() => validateRequired('test', 'field')).not.toThrow();
      expect(() => validateRequired(123, 'field')).not.toThrow();
      expect(() => validateRequired([], 'field')).not.toThrow();
    });

    test('should throw ValidationError for empty values', () => {
      expect(() => validateRequired('', 'field')).toThrow(ValidationError);
      expect(() => validateRequired(null, 'field')).toThrow(ValidationError);
      expect(() => validateRequired(undefined, 'field')).toThrow(ValidationError);
    });

    test('should include field name in error message', () => {
      expect(() => validateRequired('', 'email')).toThrow('email is required');
    });
  });

  describe('validateEmail', () => {
    test('should pass for valid email addresses', () => {
      expect(() => validateEmail('test@example.com')).not.toThrow();
      expect(() => validateEmail('user.name+tag@example.co.uk')).not.toThrow();
    });

    test('should throw ValidationError for invalid email addresses', () => {
      expect(() => validateEmail('invalid-email')).toThrow(ValidationError);
      expect(() => validateEmail('test@')).toThrow(ValidationError);
      expect(() => validateEmail('@example.com')).toThrow(ValidationError);
      expect(() => validateEmail('test.example.com')).toThrow(ValidationError);
    });

    test('should throw error with specific message', () => {
      expect(() => validateEmail('invalid')).toThrow('Invalid email format');
    });
  });

  describe('validateLength', () => {
    test('should pass for strings within length limits', () => {
      expect(() => validateLength('test', 'field', 1, 10)).not.toThrow();
      expect(() => validateLength('a', 'field', 1, 1)).not.toThrow();
    });

    test('should throw ValidationError for strings outside limits', () => {
      expect(() => validateLength('', 'field', 1, 10)).toThrow(ValidationError);
      expect(() => validateLength('toolongtext', 'field', 1, 5)).toThrow(ValidationError);
    });

    test('should include length requirements in error message', () => {
      expect(() => validateLength('', 'password', 8, 50)).toThrow('password must be between 8 and 50 characters');
    });
  });
});