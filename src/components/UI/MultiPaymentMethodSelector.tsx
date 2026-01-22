import React, { useState, useEffect } from 'react';

export interface PaymentMethodEntry {
  method: string;
  amount: number;
}

interface PaymentMethodOption {
  value: string;
  label: string;
  icon: string;
}

interface MultiPaymentMethodSelectorProps {
  totalAmount: number;
  value: PaymentMethodEntry[];
  onChange: (methods: PaymentMethodEntry[]) => void;
  disabled?: boolean;
  showValidation?: boolean;
  allowedMethods?: string[];
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'nakit', label: 'Nakit', icon: '💵' },
  { value: 'kartkredi', label: 'Kredi Kartı', icon: '💳' },
  { value: 'kartdebit', label: 'Banka Kartı', icon: '💳' },
  { value: 'havale', label: 'Havale/EFT', icon: '🏦' },
  { value: 'cek', label: 'Çek', icon: '📝' },
];

const PHARMACY_PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'nakit', label: 'Nakit', icon: '💵' },
  { value: 'kredi_karti', label: 'Kredi Kartı', icon: '💳' },
  { value: 'banka_karti', label: 'Banka Kartı', icon: '💳' },
  { value: 'havale', label: 'Havale/EFT', icon: '🏦' },
  { value: 'cari', label: 'Cari', icon: '📋' },
];

export const getPaymentMethodLabel = (method: string): string => {
  const allMethods = [...DEFAULT_PAYMENT_METHODS, ...PHARMACY_PAYMENT_METHODS];
  const found = allMethods.find(m => m.value === method);
  return found ? found.label : method;
};

export const formatPaymentMethods = (methods: PaymentMethodEntry[] | undefined, singleMethod?: string, totalAmount?: number): string => {
  if (methods && methods.length > 0) {
    return methods.map(m => `${getPaymentMethodLabel(m.method)}: ${m.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`).join(', ');
  }
  if (singleMethod) {
    const amount = totalAmount ? `: ${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : '';
    return `${getPaymentMethodLabel(singleMethod)}${amount}`;
  }
  return '-';
};

const MultiPaymentMethodSelector: React.FC<MultiPaymentMethodSelectorProps> = ({
  totalAmount,
  value,
  onChange,
  disabled = false,
  showValidation = true,
  allowedMethods,
}) => {
  const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set());

  // Determine which payment methods to show
  const paymentMethods = allowedMethods
    ? (allowedMethods.includes('cari') ? PHARMACY_PAYMENT_METHODS : DEFAULT_PAYMENT_METHODS).filter(m => allowedMethods.includes(m.value))
    : DEFAULT_PAYMENT_METHODS;

  // Initialize selected methods from value prop
  useEffect(() => {
    if (value && value.length > 0) {
      setSelectedMethods(new Set(value.map(v => v.method)));
    } else {
      // Default to nakit if no value
      setSelectedMethods(new Set(['nakit']));
      onChange([{ method: 'nakit', amount: totalAmount || 0 }]);
    }
  }, []);

  // Update amounts when totalAmount changes and only one method is selected
  useEffect(() => {
    if (value.length === 1 && totalAmount > 0) {
      const currentTotal = value.reduce((sum, v) => sum + v.amount, 0);
      if (currentTotal !== totalAmount) {
        onChange([{ method: value[0].method, amount: totalAmount }]);
      }
    }
  }, [totalAmount]);

  const handleToggleMethod = (method: string) => {
    if (disabled) return;

    const newSelected = new Set(selectedMethods);

    if (newSelected.has(method)) {
      // Don't allow removing if it's the last method
      if (newSelected.size === 1) return;
      newSelected.delete(method);
    } else {
      newSelected.add(method);
    }

    setSelectedMethods(newSelected);

    // Update value array
    const newValue: PaymentMethodEntry[] = [];
    const existingTotal = value.reduce((sum, v) => newSelected.has(v.method) ? sum + v.amount : sum, 0);
    const remainingAmount = Math.max(0, totalAmount - existingTotal);

    newSelected.forEach(m => {
      const existing = value.find(v => v.method === m);
      if (existing) {
        newValue.push(existing);
      } else {
        // New method gets the remaining amount
        newValue.push({ method: m, amount: remainingAmount });
      }
    });

    onChange(newValue);
  };

  const handleAmountChange = (method: string, amount: number) => {
    if (disabled) return;

    const newValue = value.map(v =>
      v.method === method ? { ...v, amount: Math.max(0, amount) } : v
    );
    onChange(newValue);
  };

  const handleFillRemaining = (method: string) => {
    if (disabled) return;

    const otherTotal = value.reduce((sum, v) => v.method !== method ? sum + v.amount : sum, 0);
    const remainingAmount = Math.max(0, totalAmount - otherTotal);

    const newValue = value.map(v =>
      v.method === method ? { ...v, amount: remainingAmount } : v
    );
    onChange(newValue);
  };

  const currentTotal = value.reduce((sum, v) => sum + v.amount, 0);
  const difference = totalAmount - currentTotal;
  const isValid = Math.abs(difference) < 0.01;

  return (
    <div className="space-y-4">
      {/* Method Selection Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ödeme Yöntemi Seçin
        </label>
        <div className="flex flex-wrap gap-2">
          {paymentMethods.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => handleToggleMethod(method.value)}
              disabled={disabled}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                selectedMethods.has(method.value)
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{method.icon}</span>
              <span>{method.label}</span>
              {selectedMethods.has(method.value) && (
                <span className="ml-1 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Amount Inputs for Selected Methods */}
      {value.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Tutar Dağılımı
          </label>
          {value.map((entry) => {
            const methodInfo = paymentMethods.find(m => m.value === entry.method) ||
                             { value: entry.method, label: entry.method, icon: '💰' };
            return (
              <div key={entry.method} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <span className="text-lg">{methodInfo.icon}</span>
                  <span className="font-medium text-gray-800">{methodInfo.label}</span>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={entry.amount || ''}
                    onChange={(e) => handleAmountChange(entry.method, parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-gray-500 font-medium">TL</span>
                </div>
                {value.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleFillRemaining(entry.method)}
                    disabled={disabled}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Kalan tutarı bu yönteme ata"
                  >
                    Kalanı Doldur
                  </button>
                )}
                {value.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleToggleMethod(entry.method)}
                    disabled={disabled}
                    className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Bu yöntemi kaldır"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Validation Summary */}
      {showValidation && totalAmount > 0 && (
        <div className={`p-3 rounded-lg border ${
          isValid
            ? 'bg-green-50 border-green-200'
            : difference > 0
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Ödeme Tutarı:</span>
            <span className="font-medium text-gray-900">
              {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
            </span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Girilen Toplam:</span>
            <span className={`font-medium ${isValid ? 'text-green-600' : difference > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
              {currentTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
            </span>
          </div>
          {!isValid && (
            <div className="flex justify-between items-center text-sm mt-1 pt-1 border-t border-gray-200">
              <span className={difference > 0 ? 'text-yellow-700' : 'text-red-700'}>
                {difference > 0 ? 'Eksik:' : 'Fazla:'}
              </span>
              <span className={`font-bold ${difference > 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                {Math.abs(difference).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
              </span>
            </div>
          )}
          {isValid && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-green-200">
              <span className="text-green-600">✓</span>
              <span className="text-green-700 text-sm font-medium">Tutarlar eşleşiyor</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiPaymentMethodSelector;
