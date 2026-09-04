import accountSchema from '../schemas/account.schema.json';
import featuredActionsSchema from '../schemas/featured-actions.schema.json';
import errorGuideSchema from '../schemas/error-guide.schema.json';
import prefillSchema from '../schemas/prefill.schema.json';
import statusObjectSchema from '../schemas/status-object.schema.json';

export type JsonSchema = Record<string, unknown>;

const { definitions: statusDefinitions, ...statusObjectBody } = statusObjectSchema;

export const schemas = {
  statusObject: statusObjectSchema as JsonSchema,
  account: accountSchema as JsonSchema,
  featuredActions: featuredActionsSchema as JsonSchema,
  errorGuide: errorGuideSchema as JsonSchema,
  prefill: prefillSchema as JsonSchema,
  callRequestList: {
    title: 'CallRequestList',
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: { items: { type: 'array', items: statusObjectBody } },
    definitions: statusDefinitions,
  } as JsonSchema,
} as const;

function payloadOrGuide(schema: JsonSchema): JsonSchema {
  const { definitions, ...body } = schema as { definitions?: Record<string, unknown> } & JsonSchema;
  return {
    type: 'object',
    anyOf: [body, errorGuideSchema],
    ...(definitions ? { definitions } : {}),
  };
}

export const outputSchemaByTool: Record<string, JsonSchema> = {
  check_account: payloadOrGuide(schemas.account),
  check_featured_actions: payloadOrGuide(schemas.featuredActions),
  trigger_featured_action: payloadOrGuide(schemas.featuredActions),
  request_welcome_call: payloadOrGuide(schemas.account),
  acknowledge_welcome_call: payloadOrGuide(schemas.account),
  create_call_request: payloadOrGuide(schemas.statusObject),
  answer_call_questions: payloadOrGuide(schemas.statusObject),
  check_call_request: payloadOrGuide(schemas.statusObject),
  wait_for_call_request: payloadOrGuide(schemas.statusObject),
  list_call_requests: payloadOrGuide(schemas.callRequestList),
  cancel_call_request: payloadOrGuide(schemas.statusObject),
  request_report_back_call: payloadOrGuide(schemas.statusObject),
  prefill_interview: payloadOrGuide(schemas.prefill),
  place_call_request: payloadOrGuide(schemas.statusObject),
  retry_call_request: payloadOrGuide(schemas.statusObject),
};
