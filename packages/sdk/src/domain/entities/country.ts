/**
 * ISO 3166-1 alpha-2 country code. Used by the router to select
 * the provider that covers the country (ADR-002). The union gives
 * autocomplete for the common values; `(string & {})` keeps room for
 * providers that cover other countries (runtime validation in the router).
 */
export type CountryCode =
  | "BR"
  | "MX"
  | "US"
  | "AR"
  | "CO"
  | "PE"
  | "CL"
  | "GB"
  | "KR"
  | "EU"
  | "EC"
  | (string & {});
