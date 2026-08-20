import { getCountries, getCountryCallingCode, type Country } from 'react-phone-number-input';
import en from 'react-phone-number-input/locale/en.json';
import { getTimezonesForCountry } from 'countries-and-timezones';

export interface CountryOption {
  code: Country;
  name: string;
  callingCode: string;
  timezone: string;
}

// countries-and-timezones lists a multi-timezone country's zones
// alphabetically, so the [0] entry is rarely the commonly-used one (e.g. US
// alphabetically starts at "America/Adak", not New York) — override those
// few with their conventional default zone.
const TIMEZONE_OVERRIDES: Partial<Record<Country, string>> = {
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  RU: 'Europe/Moscow',
  ID: 'Asia/Jakarta',
  CD: 'Africa/Kinshasa',
};

const LABELS: Record<string, string> = en;

// Every country react-phone-number-input/libphonenumber-js supports, with
// its calling code and a best-guess default timezone — used by the signup
// form's Country dropdown to drive both the phone field's flag/calling code
// and the timezone submitted with the account.
export const ALL_COUNTRIES: CountryOption[] = getCountries()
  .map(code => ({
    code,
    name: LABELS[code] ?? code,
    callingCode: getCountryCallingCode(code),
    timezone: TIMEZONE_OVERRIDES[code] ?? getTimezonesForCountry(code)?.[0]?.name ?? 'UTC',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
