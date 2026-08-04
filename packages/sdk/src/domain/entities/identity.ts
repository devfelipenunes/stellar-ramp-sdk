import type { CountryCode } from "./country";
import type { FiatCode } from "./money";

/**
 * A user's identity with a provider. ADR-005 rule:
 * `customerId` is created ONCE per (pubkey, provider) and reused forever —
 * recreating it breaks with "Bank account not found".
 *
 * `customerId` is 1:1 with the user; bank accounts are 1:N per country
 * (ADR-013): the same customer can hold a PIX account (BR/BRL) and another
 * SPEI (MX/MXN). Etherfuse supports this — `POST /ramp/customer/{id}/bank-account`.
 */
export interface Customer {
  customerId: string;
  providerId: string;
}

export interface BankAccount {
  bankAccountId: string;
  providerId: string;
  country: CountryCode;
  fiat: FiatCode;
}

export interface Identity {
  /** User's Stellar public key — the mapping key. */
  pubkey: string;
  providerId: string;
  customerId: string;
  /** One bank account per user country (ADR-013). */
  bankAccounts: BankAccount[];
  createdAt: string;
}

/** KYC data accepted by the sandbox (fake auto-approved). */
export interface KycData {
  fullName?: string;
  country: CountryCode;
  /** Mexico: placeholder RFC auto-approves the bank (XEXX010101000). */
  taxId?: string;
  /** Etherfuse personal org requires email (userInfo.email). */
  email?: string;
  documentImageUrl?: string;
}
