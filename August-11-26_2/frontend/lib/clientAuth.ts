import Cookies from 'js-cookie';

const TOKEN_KEY  = 'client_token';
const USER_KEY   = 'client_user';
const CLIENT_KEY = 'client_info';

export interface ClientUser {
  id: number;
  name: string;
  email: string;
}
export interface ClientInfo {
  id: number;
  name: string;
  company_name: string;
}

export const setClientAuth = (token: string, user: ClientUser, client: ClientInfo) => {
  Cookies.set(TOKEN_KEY,  token,                    { expires: 7 });
  Cookies.set(USER_KEY,   JSON.stringify(user),     { expires: 7 });
  Cookies.set(CLIENT_KEY, JSON.stringify(client),   { expires: 7 });
};

export const getClientToken  = (): string | null => Cookies.get(TOKEN_KEY) || null;
export const getClientUser   = (): ClientUser | null => {
  const v = Cookies.get(USER_KEY); return v ? JSON.parse(v) : null;
};
export const getClientInfo   = (): ClientInfo | null => {
  const v = Cookies.get(CLIENT_KEY); return v ? JSON.parse(v) : null;
};
export const isClientAuthenticated = (): boolean => !!Cookies.get(TOKEN_KEY);
export const clientLogout = () => {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
  Cookies.remove(CLIENT_KEY);
};
