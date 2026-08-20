'use client';
import 'react-phone-number-input/style.css';
import ReactPhoneInput, { type Country } from 'react-phone-number-input';
import styles from './PhoneInput.module.css';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onCountryChange?: (country?: Country) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  name?: string;
  defaultCountry?: Country;
  className?: string;
}

// Shared phone input for every phone field in the app: country dropdown +
// per-country formatting/length enforcement (via react-phone-number-input,
// backed by libphonenumber-js), instead of each page hand-rolling a plain
// text `<input>`. Stores/emits the number in E.164 format (e.g.
// "+14155552671"), which is what the backend's ValidPhoneNumber rule expects.
// `onCountryChange` lets a caller (e.g. the signup form's own Country
// dropdown) stay in sync with whichever country is selected here.
export default function PhoneInput({
  value,
  onChange,
  onCountryChange,
  placeholder,
  required,
  id,
  name,
  defaultCountry = 'US',
  className,
}: PhoneInputProps) {
  return (
    <ReactPhoneInput
      international
      limitMaxLength
      defaultCountry={defaultCountry}
      value={value || undefined}
      onChange={v => onChange(v ?? '')}
      onCountryChange={onCountryChange}
      placeholder={placeholder}
      required={required}
      id={id}
      name={name}
      className={`${styles.phoneInput} ${className ?? ''}`}
    />
  );
}

export { isValidPhoneNumber } from 'react-phone-number-input';
