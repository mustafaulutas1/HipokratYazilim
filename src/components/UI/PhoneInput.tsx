import React, { useEffect, useMemo, useState } from 'react';

type CountryOption = {
  code: string; // ISO2
  name: string;
  dialCode: string; // without '+'
  flag: string; // emoji
  phoneLength: number;
};

const COUNTRIES: CountryOption[] = [
  { code: 'TR', name: 'Türkiye', dialCode: '90', flag: '🇹🇷', phoneLength: 10 },
  { code: 'US', name: 'United States', dialCode: '1', flag: '🇺🇸', phoneLength: 10 },
  { code: 'DE', name: 'Deutschland', dialCode: '49', flag: '🇩🇪', phoneLength: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', flag: '🇬🇧', phoneLength: 10 },
  { code: 'FR', name: 'France', dialCode: '33', flag: '🇫🇷', phoneLength: 9 },
];

interface PhoneInputProps {
  name: string;
  value: string; // Expecting E.164 like +905xxxxxxxxx, or empty
  onChange: (name: string, value: string) => void;
  defaultCountryCode?: string; // ISO2 e.g., 'TR'
  placeholder?: string;
  hasError?: boolean;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  name,
  value,
  onChange,
  defaultCountryCode = 'TR',
  placeholder,
  hasError,
}) => {
  const initialCountry = useMemo(() => {
    // Try to infer from value's dial code if present
    if (value && value.startsWith('+')) {
      const digits = value.replace(/\D/g, '');
      const match = COUNTRIES.find((c) => digits.startsWith(c.dialCode));
      if (match) return match;
    }
    return COUNTRIES.find((c) => c.code === defaultCountryCode) || COUNTRIES[0];
  }, [value, defaultCountryCode]);

  const [country, setCountry] = useState<CountryOption>(initialCountry);

  useEffect(() => {
    // Keep country in sync if value's dial code changes externally
    if (value && value.startsWith('+')) {
      const digits = value.replace(/\D/g, '');
      const match = COUNTRIES.find((c) => digits.startsWith(c.dialCode));
      if (match && match.code !== country.code) {
        setCountry(match);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const nationalNumber = useMemo(() => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith(country.dialCode)) {
      return digits.slice(country.dialCode.length);
    }
    // If value has a different dial code, do not show it in national field
    if (value.startsWith('+')) return '';
    return digits;
  }, [value, country]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = COUNTRIES.find((c) => c.code === e.target.value) || country;
    setCountry(selected);
    const digits = nationalNumber.replace(/\D/g, '');
    const newValue = digits ? `+${selected.dialCode}${digits}` : '';
    onChange(name, newValue);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, country.phoneLength);
    const newValue = digits ? `+${country.dialCode}${digits}` : '';
    onChange(name, newValue);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            aria-label="Ülke"
            value={country.code}
            onChange={handleCountryChange}
            className={`appearance-none w-16 px-3 py-3 bg-white border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium ${
              hasError ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>
        <div className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="text-gray-500 font-medium">+{country.dialCode}</span>
            </div>
            <input
              type="tel"
              inputMode="tel"
              value={nationalNumber}
              onChange={handleNumberChange}
              className={`w-full pl-12 pr-4 py-3 bg-white border rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                hasError ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder={placeholder || '5XX XXX XX XX'}
            />
          </div>
        </div>
      </div>
      {nationalNumber && nationalNumber.length > 0 && (
        <div className="mt-1 text-xs">
          {nationalNumber.length < country.phoneLength ? (
            <span className="text-orange-600">
              {country.phoneLength - nationalNumber.length} tane daha numara girmelisin
            </span>
          ) : nationalNumber.length > country.phoneLength ? (
            <span className="text-red-600">
              {nationalNumber.length - country.phoneLength} tane fazla numara girdin
            </span>
          ) : (
            <span className="text-green-600">✓ Geçerli numara</span>
          )}
        </div>
      )}
    </div>
  );
};

export default PhoneInput;