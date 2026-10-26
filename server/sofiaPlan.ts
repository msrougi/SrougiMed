import { z } from "zod";
import { resolveTokenGroups, type SofiaTokenMap } from "./sofiaPrivacy";

export const sofiaEntities=["patients","contacts"] as const;
export const sofiaFields=["name","record_number","cpf","address","district","city","state","email","mobile","phone","fax","category","occupation","referred_by","birth_date","registration_date","created_at"] as const;
export const sofiaOperators=["contains_any","equals","present","absent","this_month"] as const;

const rawFilterSchema=z.object({
  field:z.enum(sofiaFields),
  operator:z.enum(sofiaOperators),
  value_tokens:z.array(z.array(z.string()).max(6)).max(10),
}).strict();

export const rawSofiaPlanSchema=z.object({
  action:z.enum(["query","clarify","unsupported"]),
  entity:z.enum(sofiaEntities),
  filters:z.array(rawFilterSchema).max(12),
  sort:z.enum(["name_asc","name_desc","newest","oldest"]),
  output:z.enum(["list","count","count_and_list"]),
  limit:z.number().int().min(1).max(50),
  reason:z.enum(["none","ambiguous_entity","missing_filter","medical_advice","write_operation","scheduling","outside_scope"]),
}).strict();

export type SofiaFilter={field:typeof sofiaFields[number];operator:typeof sofiaOperators[number];values:string[]};
export type SofiaQueryPlan={entity:typeof sofiaEntities[number];filters:SofiaFilter[];sort:"name_asc"|"name_desc"|"newest"|"oldest";output:"list"|"count"|"count_and_list";limit:number};
export type RawSofiaPlan=z.infer<typeof rawSofiaPlanSchema>;

const allowed:Record<SofiaQueryPlan["entity"],Set<SofiaFilter["field"]>>={
  patients:new Set<SofiaFilter["field"]>(["name","record_number","cpf","address","district","city","state","email","mobile","phone","fax","occupation","referred_by","birth_date","registration_date"]),
  contacts:new Set<SofiaFilter["field"]>(["name","email","phone","category","occupation","created_at"]),
};

export function validateAndResolvePlan(raw:unknown,map:SofiaTokenMap):{action:RawSofiaPlan["action"];reason:RawSofiaPlan["reason"];plan:SofiaQueryPlan|null} {
  const parsed=rawSofiaPlanSchema.parse(raw);
  if(parsed.action!=="query")return {action:parsed.action,reason:parsed.reason,plan:null};
  const filters:SofiaFilter[]=parsed.filters.map(filter=>{
    if(!allowed[parsed.entity].has(filter.field))throw new Error("SOFIA_FIELD_NOT_ALLOWED");
    const needsValues=filter.operator==="contains_any" || filter.operator==="equals";
    if(needsValues!==Boolean(filter.value_tokens.length))throw new Error("SOFIA_INVALID_FILTER_VALUES");
    if(filter.operator==="this_month" && !["registration_date","created_at"].includes(filter.field))throw new Error("SOFIA_INVALID_DATE_FILTER");
    if(["present","absent"].includes(filter.operator) && ["registration_date","created_at"].includes(filter.field))throw new Error("SOFIA_INVALID_PRESENCE_FILTER");
    return {field:filter.field,operator:filter.operator,values:resolveTokenGroups(filter.value_tokens,map)};
  });
  return {action:"query",reason:"none",plan:{entity:parsed.entity,filters,sort:parsed.sort,output:parsed.output,limit:parsed.limit}};
}

export const sofiaPlanJsonSchema={
  type:"object",
  properties:{
    action:{type:"string",enum:["query","clarify","unsupported"]},
    entity:{type:"string",enum:[...sofiaEntities]},
    filters:{type:"array",items:{type:"object",properties:{
      field:{type:"string",enum:[...sofiaFields]},operator:{type:"string",enum:[...sofiaOperators]},
      value_tokens:{type:"array",items:{type:"array",items:{type:"string"}}},
    },required:["field","operator","value_tokens"]}},
    sort:{type:"string",enum:["name_asc","name_desc","newest","oldest"]},
    output:{type:"string",enum:["list","count","count_and_list"]},
    limit:{type:"integer"},
    reason:{type:"string",enum:["none","ambiguous_entity","missing_filter","medical_advice","write_operation","scheduling","outside_scope"]},
  },required:["action","entity","filters","sort","output","limit","reason"],
} as const;

