import type { CountryCode } from "./country";
import type { FiatCode } from "./money";

/**
 * Identidade de um usuário junto a um provider. Regra ADR-005:
 * `customerId`/`bankAccountId` são criados UMA vez por (pubkey, provider)
 * e reusados para sempre — recriar quebra com "Bank account not found".
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
  /** Chave pública Stellar do usuário — chave do mapeamento. */
  pubkey: string;
  providerId: string;
  customerId: string;
  bankAccountId: string;
  createdAt: string;
}

/** Dados de KYC aceitos pelo sandbox (fake auto-aprovado). */
export interface KycData {
  fullName?: string;
  country: CountryCode;
  /** México: RFC placeholder auto-aprova o banco (XEXX010101000). */
  taxId?: string;
  documentImageUrl?: string;
}
