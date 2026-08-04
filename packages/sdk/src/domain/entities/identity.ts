import type { CountryCode } from "./country";
import type { FiatCode } from "./money";

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

  pubkey: string;
  providerId: string;
  customerId: string;

  bankAccounts: BankAccount[];
  createdAt: string;
}

export interface KycData {
  fullName?: string;
  country: CountryCode;

  taxId?: string;

  email?: string;
  documentImageUrl?: string;
}
