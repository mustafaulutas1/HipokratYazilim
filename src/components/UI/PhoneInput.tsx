import React, { useEffect, useMemo, useState } from 'react';

type CountryOption = {
  code: string; // ISO2
  name: string;
  dialCode: string; // without '+'
  flag: string; // emoji
};

const COUNTRIES: CountryOption[] = [
  { code: 'TR', name: 'Türkiye', dialCode: '90', flag: '🇹🇷' },
  { code: 'US', name: 'United States', dialCode: '1', flag: '🇺🇸' },
  { code: 'DE', name: 'Deutschland', dialCode: '49', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', flag: '🇬🇧' },
  { code: 'FR', name: 'France', dialCode: '33', flag: '🇫🇷' },
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
    const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
    const newValue = digits ? `+${country.dialCode}${digits}` : '';
    onChange(name, newValue);
  };

  return (
    <div className="flex w-full gap-2">
      <div className="flex items-center">
        <select
          aria-label="Ülke"
          value={country.code}
          onChange={handleCountryChange}
          className={`px-3 py-3 bg-gray-50 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            hasError ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} (+{c.dialCode})
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 flex items-center">
        <div className={`px-3 py-3 bg-gray-100 border-y border-l rounded-l-xl text-gray-700 ${
          hasError ? 'border-red-500' : 'border-gray-300'
        }`}>
          +{country.dialCode}
        </div>
        <input
          type="tel"
          inputMode="tel"
          value={nationalNumber}
          onChange={handleNumberChange}
          className={`w-full px-4 py-3 bg-gray-50 border rounded-r-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            hasError ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder={placeholder || '5XX XXX XX XX'}
        />
      </div>
    </div>
  );
};

export default PhoneInput;


