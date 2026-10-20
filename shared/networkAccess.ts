export const OFFICE_ONLY_ERROR = "Esta conta só pode acessar o sistema pela rede do escritório.";
export const EMAIL_CODE_REQUIRED = "Confirme o acesso com o código enviado por e-mail.";
export const remoteCodeLogins = ["rose", "gislene", "rosani"];
export const networkLogin = (value?: string | null) => (value ?? "").trim().toLowerCase();
export const hasNetworkRule = (value?: string | null) => [...remoteCodeLogins,"bia"].includes(networkLogin(value));
