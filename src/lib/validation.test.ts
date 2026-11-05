import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  createVehicleSchema,
  createDriverSchema,
} from './validation';

describe('Validation Schemas', () => {
  describe('createUserSchema', () => {
    it('rejects invalid email', () => {
      const result = createUserSchema.safeParse({
        email: 'invalid-email',
        name: 'John Doe',
        phone: '1234567890',
        password: 'password123',
        role_id: 'role_123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.email).toBeDefined();
      }
    });

    it('rejects password shorter than 8 characters', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        phone: '1234567890',
        password: 'short',
        role_id: 'role_123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.password).toBeDefined();
      }
    });

    it('rejects missing role_id and roleId', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        phone: '1234567890',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid input with role_id', () => {
      const result = createUserSchema.safeParse({
        email: 'valid@example.com',
        name: 'John Doe',
        phone: '1234567890',
        password: 'password123',
        role_id: 'role_123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createVehicleSchema', () => {
    it('rejects negative or zero seating capacity', () => {
      const result = createVehicleSchema.safeParse({
        plate_number: '29A-123.45',
        brand: 'Toyota',
        model: 'Camry',
        vehicle_type: 'SEDAN',
        seating_capacity: 0,
      });
      expect(result.success).toBe(false);

      const resultNegative = createVehicleSchema.safeParse({
        plate_number: '29A-123.45',
        brand: 'Toyota',
        model: 'Camry',
        vehicle_type: 'SEDAN',
        seating_capacity: -4,
      });
      expect(resultNegative.success).toBe(false);
    });

    it('normalizes plate_number to uppercase', () => {
      const result = createVehicleSchema.safeParse({
        plate_number: '30h-999.88',
        brand: 'Ford',
        model: 'Transit',
        vehicle_type: 'VAN',
        seating_capacity: 16,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.plateNumber).toBe('30H-999.88');
      }
    });

    it('rejects invalid vehicle type', () => {
      const result = createVehicleSchema.safeParse({
        plate_number: '29A-123.45',
        brand: 'Toyota',
        model: 'Camry',
        vehicle_type: 'SPORTS_CAR',
        seating_capacity: 4,
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid uploaded image paths and URLs', () => {
      const uploadedResult = createVehicleSchema.safeParse({
        plateNumber: 'B-1234-KCIC',
        brand: 'Toyota',
        model: 'HiAce',
        vehicleType: 'VAN',
        seatingCapacity: 10,
        imageUrl: '/uploads/vehicles/vehicle-123-abc.jpg',
      });
      expect(uploadedResult.success).toBe(true);
      if (uploadedResult.success) {
        expect(uploadedResult.data.imageUrl).toBe('/uploads/vehicles/vehicle-123-abc.jpg');
      }

      const httpsResult = createVehicleSchema.safeParse({
        plateNumber: 'B-1235-KCIC',
        brand: 'Toyota',
        model: 'Innova',
        vehicleType: 'MPV',
        seatingCapacity: 7,
        imageUrl: 'https://example.com/innova.png',
      });
      expect(httpsResult.success).toBe(true);

      const invalidResult = createVehicleSchema.safeParse({
        plateNumber: 'B-1236-KCIC',
        brand: 'Toyota',
        model: 'Innova',
        vehicleType: 'MPV',
        seatingCapacity: 7,
        imageUrl: 'javascript:alert(1)',
      });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('createDriverSchema', () => {
    it('rejects missing license number', () => {
      const result = createDriverSchema.safeParse({
        email: 'driver@example.com',
        name: 'Driver Bob',
        phone: '0987654321',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email and short password', () => {
      const result = createDriverSchema.safeParse({
        email: 'bademail',
        name: 'Driver Bob',
        phone: '0987654321',
        password: '123',
        license_number: 'B2-998877',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid driver input', () => {
      const result = createDriverSchema.safeParse({
        email: 'driver@example.com',
        name: 'Driver Bob',
        phone: '0987654321',
        password: 'password123',
        license_number: 'B2-998877',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.licenseNumber).toBe('B2-998877');
        expect(result.data.status).toBe('OFFLINE');
      }
    });
  });
});
