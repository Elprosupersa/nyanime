import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_URL,
  MAX_AVATAR_STORED_LENGTH,
  MAX_AVATAR_UPLOAD_BYTES,
  computeSquareAvatarCropRect,
  isDataImageAvatar,
  isValidStoredAvatar,
  sanitizeAvatarForAuthPhotoUrl,
  sanitizeAvatarForCloud,
  validateAvatarImageFile
} from '../utils/avatarHelpers.ts';

describe('avatarHelpers - Gallery Photo Validation, Cropping & Sync Safety', () => {
  it('validates image file type and size limits cleanly', () => {
    expect(validateAvatarImageFile(null).valid).toBe(false);
    expect(validateAvatarImageFile({ type: 'image/jpeg', size: 0, name: 'a.jpg' }).valid).toBe(false);
    expect(
      validateAvatarImageFile({ type: 'image/png', size: MAX_AVATAR_UPLOAD_BYTES + 1, name: 'big.png' }).valid
    ).toBe(false);
    expect(validateAvatarImageFile({ type: 'application/pdf', size: 1024, name: 'doc.pdf' }).valid).toBe(false);

    expect(validateAvatarImageFile({ type: 'image/jpeg', size: 420_000, name: 'selfie.jpg' })).toEqual({
      valid: true
    });
    expect(validateAvatarImageFile({ type: '', size: 120_000, name: 'photo.webp' })).toEqual({
      valid: true
    });
  });

  it('computes centered square crop rectangles for landscape, portrait, and square photos', () => {
    expect(computeSquareAvatarCropRect(1200, 800, 160)).toEqual({
      sx: 200,
      sy: 0,
      sSize: 800,
      destSize: 160
    });

    expect(computeSquareAvatarCropRect(600, 1000, 160)).toEqual({
      sx: 0,
      sy: 200,
      sSize: 600,
      destSize: 160
    });

    expect(computeSquareAvatarCropRect(400, 400, 160)).toEqual({
      sx: 0,
      sy: 0,
      sSize: 400,
      destSize: 160
    });
  });

  it('validates and preserves compressed data URLs without truncating them', () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=';
    expect(isDataImageAvatar(sampleDataUrl)).toBe(true);
    expect(isValidStoredAvatar(sampleDataUrl)).toBe(true);
    expect(sanitizeAvatarForCloud(sampleDataUrl)).toBe(sampleDataUrl);

    // Unsafe data:image/svg+xml or javascript: URIs are rejected
    expect(isValidStoredAvatar('data:image/svg+xml,<svg></svg>')).toBe(false);
    expect(sanitizeAvatarForCloud('javascript:alert(1)')).toBe(DEFAULT_AVATAR_URL);

    // Oversized data URL falls back cleanly instead of producing a broken mid-base64 slice
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_AVATAR_STORED_LENGTH + 50);
    expect(sanitizeAvatarForCloud(oversized)).toBe(DEFAULT_AVATAR_URL);
  });

  it('passes only short HTTP(S) URLs to Firebase Auth photoURL and skips data URLs', () => {
    const preset = 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo';
    expect(sanitizeAvatarForAuthPhotoUrl(preset)).toBe(preset);
    expect(sanitizeAvatarForAuthPhotoUrl('data:image/jpeg;base64,/9j/4AAQ==')).toBeUndefined();
    expect(sanitizeAvatarForAuthPhotoUrl('https://example.com/' + 'a'.repeat(520))).toBeUndefined();
  });
});
