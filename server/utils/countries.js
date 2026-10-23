/* The two-letter codes in a comma-separated list, uppercased, unique and sorted. Pure. */
export const parseCountries = text => [...new Set(String(text ?? '').split(',').map(code => code.trim().toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code)))].sort();
