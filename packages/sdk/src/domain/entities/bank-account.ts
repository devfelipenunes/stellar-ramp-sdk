
export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export const PIX_KEY_TYPES: readonly PixKeyType[] = [
  "CPF",
  "CNPJ",
  "EMAIL",
  "PHONE",
  "EVP",
];

export type BankAccountDetails =
  | {
      kind: "pix_personal";
      firstName: string;
      lastName: string;
      cpf: string;
      pixKey: string;
      pixKeyType: PixKeyType;
    }
  | {
      kind: "pix_business";
      name: string;
      cnpj: string;
      pixKey: string;
      pixKeyType: PixKeyType;
    }
  | {
      kind: "spei_personal";
      firstName: string;
      paternalLastName: string;
      maternalLastName: string;
      birthDate: string;
      birthCountryIsoCode: string;
      curp: string;
      rfc: string;
      clabe: string;
    };

export function validateBankAccountDetails(d: BankAccountDetails): string[] {
  const problems: string[] = [];
  const need = (v: unknown, label: string) => {
    if (typeof v !== "string" || v.trim() === "")
      problems.push(`${label} is required`);
  };
  const digitsOnly = (v: string) => v.replace(/\D/g, "");
  const lenDigits = (v: string, n: number, label: string) => {
    if (digitsOnly(v).length !== n)
      problems.push(`${label} must have ${n} digits`);
  };

  switch (d.kind) {
    case "pix_personal":
      need(d.firstName, "firstName");
      need(d.lastName, "lastName");
      lenDigits(d.cpf, 11, "cpf");
      need(d.pixKey, "pixKey");
      if (!PIX_KEY_TYPES.includes(d.pixKeyType))
        problems.push(`invalid pixKeyType: ${d.pixKeyType}`);
      break;
    case "pix_business":
      need(d.name, "name");
      lenDigits(d.cnpj, 14, "cnpj");
      need(d.pixKey, "pixKey");
      if (!PIX_KEY_TYPES.includes(d.pixKeyType))
        problems.push(`invalid pixKeyType: ${d.pixKeyType}`);
      break;
    case "spei_personal":
      need(d.firstName, "firstName");
      need(d.paternalLastName, "paternalLastName");
      need(d.maternalLastName, "maternalLastName");
      if (!/^\d{8}$/.test(d.birthDate))
        problems.push("birthDate must be YYYYMMDD (8 digits)");
      else {
        const month = Number(d.birthDate.slice(4, 6));
        const day = Number(d.birthDate.slice(6, 8));
        if (month < 1 || month > 12)
          problems.push("birthDate has an invalid month");
        if (day < 1 || day > 31) problems.push("birthDate has an invalid day");
      }
      if (!/^[A-Z]{2}$/.test(d.birthCountryIsoCode))
        problems.push(
          "birthCountryIsoCode must be ISO 3166-1 alpha-2 (e.g. MX)",
        );
      if (!/^[A-ZÑ0-9]{18}$/.test(d.curp))
        problems.push("curp must have 18 alphanumeric characters");
      if (!/^[A-ZÑ&0-9]{12,13}$/.test(d.rfc))
        problems.push("rfc must have 12–13 characters");
      lenDigits(d.clabe, 18, "clabe");
      break;
  }
  return problems;
}
