// Only the two explicitly authorized owner logins may share the privately
// configured address. No domain-wide or role-based email sharing is allowed.
export function isSharedOwnerEmail(email: string, accounts: {id?:number;login?:string|null;username?:string|null}[]) {
  const configured=(process.env.CF_ACCESS_SHARED_OWNER_EMAIL || "").trim().toLowerCase();
  if(!configured || configured!==email.trim().toLowerCase() || accounts.length!==2)return false;
  const logins=accounts.map(account=>(account.login ?? account.username ?? "").trim().toLowerCase()).sort();
  return logins[0]==="admin" && logins[1]==="msrougi" && accounts[0].id!==accounts[1].id;
}
