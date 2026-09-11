/**
 * lib/validation.ts
 * Phase 33: Centralized Stateless Input Validation Layer
 * 
 * Strict specifications from RULES.md section 3.8:
 * - Egyptian Phone Numbers: 010/011/012/015, exactly 11 digits, progressive error keys
 * - Email format check
 * - Password: min 8 characters, at least 1 letter and 1 number, confirmation match
 * - PIN: exactly 4 numeric digits
 * - Name: at least 1 letter, not purely numbers or symbols
 * - Financial/Numeric: positive numbers (> 0 or >= 0 if specified)
 */

export type ValidationResult<T = string> =
  | {
      isValid: true;
      errorKey?: undefined;
      errorMessage?: undefined;
      value: T;
    }
  | {
      isValid: false;
      errorKey: string;
      errorMessage: string;
      value?: T;
    };

export type PhoneValidationStage = 'empty' | 'prefix_01' | 'prefix_network' | 'length' | 'too_long' | 'valid';

export type PhoneValidationResult =
  | {
      isValid: true;
      stage: 'valid';
      cleanPhone: string;
      errorKey?: undefined;
      errorMessage?: undefined;
      value: string;
    }
  | {
      isValid: false;
      stage: PhoneValidationStage;
      cleanPhone: string;
      errorKey: string;
      errorMessage: string;
      value?: string;
    };

/**
 * RULES.md 3.8: Validate Egyptian phone number with progressive dynamic stages:
 * 1. If not starting with '01' -> 'phonePrefixStart' ("رقم التليفون لازم يبدأ بـ 01")
 * 2. If starts with '01' but 3rd digit not 0/1/2/5 -> 'phonePrefixValid' ("رقم التليفون لازم يبدأ بـ 010 أو 011 أو 012 أو 015")
 * 3. If valid prefix but length < 11 -> 'phoneLength' ("رقم التليفون لازم يكون 11 رقم")
 * 4. If length === 11 and valid -> valid!
 * 5. If length > 11 -> 'phoneLength'
 */
export function validateEgyptianPhone(phone: string): PhoneValidationResult {
  const cleanPhone = (phone || '').replace(/\D/g, '').trim();

  if (!cleanPhone) {
    return {
      isValid: false,
      stage: 'empty',
      errorKey: 'phonePrefixStart',
      errorMessage: 'رقم التليفون لازم يبدأ بـ 01',
      cleanPhone: '',
    };
  }

  // Check initial 01
  if (cleanPhone.length >= 2 && !cleanPhone.startsWith('01')) {
    return {
      isValid: false,
      stage: 'prefix_01',
      errorKey: 'phonePrefixStart',
      errorMessage: 'رقم التليفون لازم يبدأ بـ 01',
      cleanPhone,
    };
  }

  if (cleanPhone.length === 1 && cleanPhone !== '0') {
    return {
      isValid: false,
      stage: 'prefix_01',
      errorKey: 'phonePrefixStart',
      errorMessage: 'رقم التليفون لازم يبدأ بـ 01',
      cleanPhone,
    };
  }

  // Check 3rd digit (network code: 0, 1, 2, 5)
  if (cleanPhone.length >= 3 && !/^01[0125]/.test(cleanPhone)) {
    return {
      isValid: false,
      stage: 'prefix_network',
      errorKey: 'phonePrefixValid',
      errorMessage: 'رقم التليفون لازم يبدأ بـ 010 أو 011 أو 012 أو 015',
      cleanPhone,
    };
  }

  // Check length
  if (cleanPhone.length < 11) {
    return {
      isValid: false,
      stage: 'length',
      errorKey: 'phoneLength',
      errorMessage: 'رقم التليفون لازم يكون 11 رقم',
      cleanPhone,
    };
  }

  if (cleanPhone.length > 11) {
    return {
      isValid: false,
      stage: 'too_long',
      errorKey: 'phoneLength',
      errorMessage: 'رقم التليفون لازم يكون 11 رقم',
      cleanPhone,
    };
  }

  // Exactly 11 digits starting with 010, 011, 012, or 015
  if (/^01[0125]\d{8}$/.test(cleanPhone)) {
    return {
      isValid: true,
      stage: 'valid',
      cleanPhone,
      value: cleanPhone,
    };
  }

  return {
    isValid: false,
    stage: 'prefix_network',
    errorKey: 'phonePrefixValid',
    errorMessage: 'رقم التليفون لازم يبدأ بـ 010 أو 011 أو 012 أو 015',
    cleanPhone,
  };
}

/**
 * Format Egyptian phone number to international E.164 format (+201...)
 */
export function formatEgyptianPhoneToInternational(phone: string): string {
  const clean = phone.replace(/\D/g, '').trim();
  if (clean.startsWith('01') && clean.length === 11) {
    return `+20${clean.slice(1)}`;
  }
  if (clean.startsWith('201') && clean.length === 12) {
    return `+${clean}`;
  }
  return clean.startsWith('+') ? clean : `+${clean}`;
}

/**
 * RULES.md 3.8: Validate standard email format
 */
export function validateEmail(email: string): ValidationResult<string> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      isValid: false,
      errorKey: 'emailInvalid',
      errorMessage: 'برجاء إدخال بريد إلكتروني صحيح',
    };
  }

  // Standard RFC 5322 compatible practical regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(cleanEmail)) {
    return {
      isValid: false,
      errorKey: 'emailInvalid',
      errorMessage: 'برجاء إدخال بريد إلكتروني صحيح',
      value: cleanEmail,
    };
  }

  return {
    isValid: true,
    value: cleanEmail,
  };
}

/**
 * RULES.md 3.8: Validate password:
 * 1. At least 8 characters
 * 2. At least one letter and one number
 */
export function validatePassword(password: string): ValidationResult<string> {
  const str = password || '';
  if (str.length < 8) {
    return {
      isValid: false,
      errorKey: 'passwordMinLength',
      errorMessage: 'يجب ألا تقل كلمة المرور عن 8 خانات',
    };
  }

  const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(str);
  const hasNumber = /\d/.test(str);

  if (!hasLetter || !hasNumber) {
    return {
      isValid: false,
      errorKey: 'passwordRequirements',
      errorMessage: 'يجب أن تحتوي كلمة المرور على رقم واحد وحرف واحد على الأقل',
    };
  }

  return {
    isValid: true,
    value: str,
  };
}

/**
 * RULES.md 3.8: Validate password confirmation matches password
 */
export function validatePasswordConfirmation(password: string, confirmPassword: string): ValidationResult<string> {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      errorKey: 'passwordMismatch',
      errorMessage: 'كلمتا المرور غير متطابقتين',
    };
  }

  return {
    isValid: true,
    value: confirmPassword,
  };
}

/**
 * RULES.md 3.8: Validate PIN (exactly 4 numeric digits)
 */
export function validatePin(pin: string): ValidationResult<string> {
  const cleanPin = (pin || '').replace(/\D/g, '').trim();
  if (cleanPin.length !== 4) {
    return {
      isValid: false,
      errorKey: 'pinLength',
      errorMessage: 'الرمز السري (PIN) يجب أن يكون 4 أرقام بالضبط',
      value: cleanPin,
    };
  }

  return {
    isValid: true,
    value: cleanPin,
  };
}

/**
 * RULES.md 3.8: Validate name (must contain at least one letter, not only numbers/symbols)
 */
export function validateName(name: string): ValidationResult<string> {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      errorKey: 'nameRequired',
      errorMessage: 'برجاء إدخال اسم صحيح',
    };
  }

  // Unicode letter check (Arabic, Latin, etc.)
  const hasLetter = /\p{L}/u.test(trimmed);
  if (!hasLetter) {
    return {
      isValid: false,
      errorKey: 'nameRequired',
      errorMessage: 'برجاء إدخال اسم صحيح',
    };
  }

  return {
    isValid: true,
    value: trimmed,
  };
}

/**
 * RULES.md 3.8: Validate financial / points / rates / limit fields (> 0 or >= 0 if allowed)
 */
export function validatePositiveNumber(
  value: number | string,
  allowZero: boolean = false
): ValidationResult<number> {
  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) {
    return {
      isValid: false,
      errorKey: 'positiveNumber',
      errorMessage: 'يجب إدخال رقم موجب أكبر من الصفر',
    };
  }

  if (allowZero ? num < 0 : num <= 0) {
    return {
      isValid: false,
      errorKey: 'positiveNumber',
      errorMessage: 'يجب إدخال رقم موجب أكبر من الصفر',
    };
  }

  return {
    isValid: true,
    value: num,
  };
}
