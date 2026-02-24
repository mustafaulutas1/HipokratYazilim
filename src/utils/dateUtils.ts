/**
 * Yerel saat dilimine göre ISO string döndürür.
 * new Date().toISOString() UTC döndürdüğü için Türkiye'de (UTC+3)
 * gece yarısı ile 03:00 arasında tarih 1 gün geri görünüyor.
 * Bu fonksiyon yerel saati kullanarak bu sorunu çözer.
 */
export const nowISO = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, -1);
};

/**
 * Bugünün tarihini yerel saat dilimine göre YYYY-MM-DD formatında döndürür.
 * new Date().toISOString().split('T')[0] UTC tarihini alır,
 * bu fonksiyon yerel tarihi döndürür.
 */
export const todayLocalDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
