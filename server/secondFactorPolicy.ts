import type {NetworkUser} from "./networkAccess";
import {networkLogin} from "../shared/networkAccess";
export const passwordOnlyBiaId=()=>process.env.SECOND_FACTOR_BIA_USER_ID || (process.env.BIA_DEVICE_ACCESS_ENABLED==="true"?undefined:process.env.CF_ACCESS_BIA_USER_ID);
export function isSecondFactorPasswordOnly(user:NetworkUser) {
  return process.env.SECOND_FACTOR_ENABLED==="true" && String(user.id)===passwordOnlyBiaId() && networkLogin(user.username)==="bia" && user.role==="user";
}
