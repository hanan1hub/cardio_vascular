const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const withLeadingSlash = (value: string) => value.startsWith("/") ? value : `/${value}`;

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? (import.meta.env.PROD ? "" : "http://localhost:5000");

export const PPG_URL =
  import.meta.env.VITE_PPG_URL ?? (import.meta.env.PROD ? "/ppg" : "http://localhost:5003");

export const ECG_URL =
  import.meta.env.VITE_ECG_URL ?? (import.meta.env.PROD ? "/ecg" : "http://localhost:5005");

export function backendPath(path: string) {
  return `${trimTrailingSlash(BACKEND_URL)}${withLeadingSlash(path)}`;
}

export function ppgPath(path: string) {
  return `${trimTrailingSlash(PPG_URL)}${withLeadingSlash(path)}`;
}

export function ecgPath(path: string) {
  return `${trimTrailingSlash(ECG_URL)}${withLeadingSlash(path)}`;
}
